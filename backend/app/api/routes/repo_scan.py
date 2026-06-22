"""
Trust Backend Repo Scan API Routes
POST /api/repo-scan - Start a new repo scan
GET /api/repo-scan/{scan_id} - Get repo scan status and results
GET /api/repo-scans/recent - Get recent repo scans
PATCH /api/repo-vulnerability/{vuln_id}/fix - Mark repo vulnerability as fixed
"""

import base64
import re
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException, BackgroundTasks, Depends, Request

from app.logging_config import get_logger

logger = get_logger(__name__)

from app.models.schemas import (
    RepoScanRequest,
    RepoScanCreate,
    RepoScanStartResponse,
    RepoScanStatusResponse,
    RepoVulnerabilityBase,
    RepoVulnerabilitySummary,
    RecentRepoScanItem,
    RecentRepoScansResponse,
    ScanStatus,
    PaginatedResponse,
)
from app.services.supabase_client import get_supabase_service
from app.api.auth import get_current_user

router = APIRouter(tags=["repo-scan"])

# GitHub URL validation regex
_GITHUB_URL_PATTERNS = [
    re.compile(r"^https?://github\.com/([A-Za-z0-9_.\-]+/[A-Za-z0-9_.\-]+)(?:\.git)?/?$"),
    re.compile(r"^github\.com/([A-Za-z0-9_.\-]+/[A-Za-z0-9_.\-]+)(?:\.git)?/?$"),
    re.compile(r"^([A-Za-z0-9_.\-]+/[A-Za-z0-9_.\-]+)$"),
]


def validate_github_url(url: str) -> str:
    """Validate GitHub URL and return repo_name (owner/repo format).

    Accepts:
      - https://github.com/owner/repo
      - github.com/owner/repo
      - owner/repo

    Returns the repo_name in owner/repo format.
    Raises HTTPException on invalid format.
    """
    url = url.strip().rstrip("/")

    for pattern in _GITHUB_URL_PATTERNS:
        match = pattern.match(url)
        if match:
            return match.group(1).removesuffix(".git")

    raise HTTPException(
        status_code=400,
        detail="Invalid GitHub URL. Accepted formats: https://github.com/owner/repo, github.com/owner/repo, or owner/repo",
    )


def _normalize_repo_url(url: str) -> str:
    """Normalize repo URL to full https form."""
    url = url.strip().rstrip("/")
    if url.startswith("https://github.com/"):
        return url.removesuffix(".git")
    if url.startswith("github.com/"):
        return f"https://{url}".removesuffix(".git")
    # owner/repo shorthand
    return f"https://github.com/{url}"


@router.post("/repo-scan", response_model=RepoScanStartResponse)
async def start_repo_scan(
    request: RepoScanRequest,
    background_tasks: BackgroundTasks,
    current_user=Depends(get_current_user),
):
    """
    Start a new GitHub repository security scan

    - **repo_url**: GitHub repository URL (e.g. https://github.com/owner/repo)
    - **branch**: Branch to scan (default: main)
    - **scan_type**: Scan type (full/secrets/sast/sca)
    """
    supabase = get_supabase_service()

    # Validate and extract repo name
    repo_name = validate_github_url(request.repo_url)
    repo_url = _normalize_repo_url(request.repo_url)

    # Repo scan requires login
    if not current_user:
        raise HTTPException(status_code=401, detail="Login required for repository scanning")

    # Free scan limit: 3 repo scans/month
    user_data = await supabase.get_user(current_user.id)
    user_plan = (user_data or {}).get("plan") or "free"
    if user_plan != "pro":
        count = await supabase.get_monthly_scan_count(current_user.id, "repo", (user_data or {}).get("plan_changed_at"))
        if count >= 3:
            raise HTTPException(
                status_code=429,
                detail="Free plan limit: 3 repo scans per month. Upgrade to Pro for unlimited scans.",
            )

    # Create scan record
    scan_data = RepoScanCreate(
        repo_url=repo_url,
        repo_name=repo_name,
        branch=request.branch,
        scan_type=request.scan_type.value,
        status="pending",
    )

    user_id = current_user.id if current_user else None

    try:
        scan = await supabase.create_repo_scan(scan_data, user_id=user_id)
    except Exception as e:
        logger.error("repo_scan_create_failed", error=str(e), exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to create repo scan")

    # Start scan in background
    background_tasks.add_task(
        run_repo_scan_background,
        scan["id"],
        repo_url,
        request.branch,
        request.scan_type.value,
        user_id,
    )

    return RepoScanStartResponse(
        scan_id=scan["id"],
        status=ScanStatus.PROCESSING,
        repo_url=repo_url,
        repo_name=repo_name,
        branch=request.branch,
        created_at=datetime.fromisoformat(scan["created_at"].replace("Z", "+00:00")),
    )


@router.get("/repo-scans/recent", response_model=PaginatedResponse[RecentRepoScanItem])
async def get_recent_repo_scans(cursor: Optional[str] = None, limit: int = 20):
    """
    Get recent completed repo scans with cursor-based pagination.

    - **cursor**: Opaque cursor for the next page (from previous response)
    - **limit**: Maximum number of scans to return (default 20, max 100)
    """
    limit = min(max(limit, 1), 100)
    supabase = get_supabase_service()

    cursor_created_at = None
    cursor_id = None
    if cursor:
        try:
            decoded = base64.urlsafe_b64decode(cursor.encode()).decode()
            cursor_created_at, cursor_id = decoded.rsplit("|", 1)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid cursor")

    scans = await supabase.get_recent_repo_scans(
        limit + 1,
        cursor_created_at=cursor_created_at,
        cursor_id=cursor_id,
    )

    has_more = len(scans) > limit
    scans = scans[:limit]

    items = []
    for s in scans:
        items.append(RecentRepoScanItem(
            scan_id=s["id"],
            repo_url=s["repo_url"],
            repo_name=s["repo_name"],
            score=s.get("score"),
            grade=s.get("grade"),
            summary=s.get("summary"),
            scan_type=s.get("scan_type"),
            created_at=datetime.fromisoformat(s["created_at"].replace("Z", "+00:00")),
            completed_at=datetime.fromisoformat(s["completed_at"].replace("Z", "+00:00")) if s.get("completed_at") else None,
        ))

    next_cursor = None
    if has_more and scans:
        last = scans[-1]
        raw = f"{last['created_at']}|{last['id']}"
        next_cursor = base64.urlsafe_b64encode(raw.encode()).decode()

    return PaginatedResponse(items=items, next_cursor=next_cursor, has_more=has_more)


@router.get("/repo-scan/{scan_id}", response_model=RepoScanStatusResponse)
async def get_repo_scan_status(scan_id: str):
    """
    Get repo scan status and results

    - **scan_id**: UUID of the repo scan
    """
    supabase = get_supabase_service()

    scan = await supabase.get_repo_scan(scan_id)
    if not scan:
        raise HTTPException(status_code=404, detail="Repo scan not found")

    # Get vulnerabilities if scan is completed
    vulnerabilities = []
    summary = None

    if scan["status"] in ("completed", "processing"):
        vuln_records = await supabase.get_repo_vulnerabilities_by_scan(scan_id)

        # Sort by severity
        severity_order = {"critical": 0, "high": 1, "medium": 2, "low": 3, "info": 4}
        vuln_records.sort(key=lambda v: severity_order.get(v.get("severity", "info"), 5))

        vulnerabilities = [
            RepoVulnerabilityBase(
                id=v["id"],
                vuln_type=v["vuln_type"],
                name=v["name"],
                severity=v["severity"],
                file_path=v.get("file_path"),
                line_number=v.get("line_number"),
                code_snippet=v.get("code_snippet"),
                description=v.get("description"),
                fix_suggestion=v.get("fix_suggestion"),
                package_name=v.get("package_name"),
                installed_version=v.get("installed_version"),
                fixed_version=v.get("fixed_version"),
                cve_id=v.get("cve_id"),
                pattern_id=v.get("pattern_id"),
                ai_analyzed=v.get("ai_analyzed", False),
                before_code=v.get("before_code"),
                after_code=v.get("after_code"),
                fix_steps=v.get("fix_steps"),
                matched_locations=v.get("matched_locations"),
                location_count=v.get("location_count"),
                is_fixed=v.get("is_fixed", False),
            )
            for v in vuln_records
        ]

        # Use summary from DB if available, otherwise build from records
        if scan.get("summary"):
            summary = RepoVulnerabilitySummary(**scan["summary"])

    # Calculate progress for processing scans
    progress = None
    current_stage = None

    if scan["status"] == "processing":
        if scan.get("started_at"):
            started = datetime.fromisoformat(scan["started_at"].replace("Z", "+00:00"))
            elapsed = (datetime.utcnow().replace(tzinfo=started.tzinfo) - started).total_seconds()
            progress = min(int((elapsed / 300) * 99), 99)
        else:
            progress = 10
        current_stage = "scanning"
    elif scan["status"] == "completed":
        progress = 100
        current_stage = "complete"

    # Extract score_breakdown from scan record
    score_breakdown = scan.get("score_breakdown")
    return RepoScanStatusResponse(
        scan_id=scan_id,
        status=ScanStatus(scan["status"]),
        repo_url=scan["repo_url"],
        repo_name=scan["repo_name"],
        branch=scan.get("branch", "main"),
        commit_hash=scan.get("commit_hash"),
        progress=progress,
        current_stage=current_stage,
        scan_type=scan.get("scan_type", "full"),
        score=scan.get("score"),
        grade=scan.get("grade"),
        score_breakdown=score_breakdown,
        summary=summary,
        vulnerabilities=vulnerabilities,
        files_scanned=scan.get("files_scanned", 0),
        error_message=scan.get("error_message"),
        started_at=datetime.fromisoformat(scan["started_at"].replace("Z", "+00:00")) if scan.get("started_at") else None,
        completed_at=datetime.fromisoformat(scan["completed_at"].replace("Z", "+00:00")) if scan.get("completed_at") else None,
    )


@router.post("/repo-scan/{scan_id}/analyze")
async def analyze_repo_vulnerabilities(
    scan_id: str,
    request: Request,
    current_user=Depends(get_current_user),
):
    """
    Analyze repo vulnerabilities with Claude AI.
    Free users: max 2 analyses per scan. Pro users: unlimited.
    """
    supabase = get_supabase_service()

    scan = await supabase.get_repo_scan(scan_id)
    if not scan:
        raise HTTPException(status_code=404, detail="Repo scan not found")
    if scan["status"] != "completed":
        raise HTTPException(status_code=400, detail="Scan is not completed yet")

    # Parse request body
    body = {}
    try:
        body = await request.json()
    except Exception:
        pass
    vulnerability_ids = body.get("vulnerability_ids")

    # Get vulnerabilities to analyze
    if vulnerability_ids:
        vulns = await supabase.get_repo_vulnerabilities_by_ids(vulnerability_ids)
    else:
        vulns = await supabase.get_repo_vulnerabilities_by_scan(scan_id)

    if not vulns:
        return {"analyzed_count": 0, "vulnerabilities": [], "scan_id": scan_id}

    # Filter out already analyzed (unless specific IDs requested)
    if not vulnerability_ids:
        vulns = [v for v in vulns if not v.get("ai_analyzed", False)]

    if not vulns:
        all_vulns = await supabase.get_repo_vulnerabilities_by_scan(scan_id)
        return {
            "analyzed_count": 0,
            "vulnerabilities": [v for v in all_vulns if v.get("ai_analyzed", False)],
            "scan_id": scan_id,
        }

    # Check user plan for limit
    user_plan = "free"
    if current_user:
        user_data = await supabase.get_user(current_user.id)
        user_plan = (user_data or {}).get("plan", "free")

    FREE_AI_MONTHLY_LIMIT = 20  # 월 20회 (10스캔 × 2회)

    if user_plan != "pro":
        # Check monthly AI analysis limit for logged-in users
        if current_user:
            ai_count = await supabase.get_monthly_ai_analysis_count(current_user.id)
            if ai_count >= FREE_AI_MONTHLY_LIMIT:
                raise HTTPException(
                    status_code=429,
                    detail=f"Free plan limit: {FREE_AI_MONTHLY_LIMIT} AI analyses per month. Upgrade to Pro for unlimited.",
                )

        # Free/anonymous: limit to 2 per call
        severity_order = {"critical": 0, "high": 1, "medium": 2, "low": 3, "info": 4}
        vulns.sort(key=lambda v: severity_order.get(v.get("severity", "info"), 5))
        vulns = vulns[:2]

    # Analyze with Claude
    from app.services.claude_analyzer import get_claude_analyzer
    analyzer = get_claude_analyzer()

    try:
        analyses = await analyzer.analyze_repo_batch(vulns)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI analysis failed: {str(e)}")

    # Update DB and build response
    updated = []
    for analysis in analyses:
        vuln_id = analysis.get("vulnerability_id")
        if vuln_id:
            try:
                await supabase.update_repo_vulnerability_analysis(vuln_id, analysis)
                # Find the original vuln to merge
                orig = next((v for v in vulns if v["id"] == vuln_id), {})
                updated.append({
                    "id": vuln_id,
                    "name": orig.get("name", ""),
                    "severity": orig.get("severity", "info"),
                    "ai_analyzed": True,
                    "description": analysis.get("description", ""),
                    "before_code": analysis.get("before_code"),
                    "after_code": analysis.get("after_code"),
                    "fix_steps": analysis.get("fix_steps", []),
                })
            except Exception as e:
                logger.error("repo_vuln_analysis_update_failed", vuln_id=vuln_id, error=str(e))

    return {
        "analyzed_count": len(updated),
        "vulnerabilities": updated,
        "scan_id": scan_id,
    }


@router.get("/repo-scan/{scan_id}/fix-prompt")
async def get_repo_fix_prompt(
    scan_id: str,
    severity: Optional[str] = None,
    limit: Optional[int] = None,
    current_user=Depends(get_current_user),
):
    """
    Generate a structured markdown prompt for AI-assisted vulnerability fixing.

    - **scan_id**: UUID of the repo scan
    - **severity**: Optional comma-separated severity filter (e.g. "critical,high")
    - **limit**: Optional max number of vulnerabilities to include in the prompt
    """
    # Pro-only feature
    if not current_user:
        raise HTTPException(status_code=401, detail="Authentication required")
    supabase_svc = get_supabase_service()
    user_data = await supabase_svc.get_user(current_user.id)
    if (user_data or {}).get("plan", "free") != "pro":
        raise HTTPException(status_code=403, detail="Pro subscription required")

    supabase = supabase_svc

    scan = await supabase.get_repo_scan(scan_id)
    if not scan:
        raise HTTPException(status_code=404, detail="Repo scan not found")
    if scan["status"] != "completed":
        raise HTTPException(status_code=400, detail="Scan is not completed yet")

    vulns = await supabase.get_repo_vulnerabilities_by_scan(scan_id)

    # Filter by severity if provided
    if severity:
        allowed = {s.strip().lower() for s in severity.split(",")}
        vulns = [v for v in vulns if v.get("severity", "info").lower() in allowed]

    # Sort by severity order
    severity_order = {"critical": 0, "high": 1, "medium": 2, "low": 3, "info": 4}
    vulns.sort(key=lambda v: severity_order.get(v.get("severity", "info"), 5))

    # Track total before limit
    total_count = len(vulns)

    # Apply limit if provided
    if limit and limit > 0:
        vulns = vulns[:limit]

    prompt = _build_repo_fix_prompt(scan, vulns)
    estimated_changes = sum(1 for v in vulns if v.get("file_path"))

    return {
        "prompt": prompt,
        "vuln_count": len(vulns),
        "estimated_changes": estimated_changes,
        "total_count": total_count,
    }


def _build_repo_fix_prompt(scan: dict, vulns: list[dict]) -> str:
    """Build a structured markdown prompt for repo vulnerability fixes."""
    repo_name = scan.get("repo_name", scan.get("repo_url", "unknown"))
    branch = scan.get("branch", "main")
    score = scan.get("score", "N/A")
    grade = scan.get("grade", "N/A")
    vuln_count = len(vulns)

    lines = [
        "# Security Vulnerability Fix Request",
        "",
        f"## Repository: {repo_name} (branch: {branch})",
        f"## Scan Result: {score}/100 (Grade {grade}) - {vuln_count} vulnerabilities detected",
        "",
        "Please fix the following security vulnerabilities in order of severity.",
        "For each fix, modify the file at the specified path and line number.",
        "",
    ]

    for idx, v in enumerate(vulns, 1):
        sev = (v.get("severity") or "info").upper()
        name = v.get("name", "Unknown vulnerability")
        file_path = v.get("file_path", "")
        line_number = v.get("line_number")
        vuln_type = (v.get("vuln_type") or "unknown").upper()
        description = v.get("description") or v.get("fix_suggestion") or "No description available"
        code_snippet = v.get("before_code") or v.get("code_snippet") or ""
        after_code = v.get("after_code") or ""

        # For secrets, if code is mostly asterisks (masked by scanner), replace with a cleaner note
        if vuln_type == "SECRET" and code_snippet:
            non_mask = code_snippet.replace("*", "").replace("-", "").replace("\n", "").strip()
            if len(non_mask) < len(code_snippet.strip()) * 0.3:
                # More than 70% masked - show a summary instead
                code_snippet = f"[Secret content detected - masked for security. See file: {file_path}]"
        fix_steps = v.get("fix_steps") or []
        package_name = v.get("package_name")
        installed_version = v.get("installed_version")
        fixed_version = v.get("fixed_version")
        cve_id = v.get("cve_id")

        location = f"`{file_path}:{line_number}`" if file_path and line_number else f"`{file_path}`" if file_path else "N/A"

        lines.append("---")
        lines.append("")
        lines.append(f"### {idx}. [{sev}] {name}")
        lines.append(f"- **File**: {location}")
        lines.append(f"- **Type**: {vuln_type}")

        # SCA-specific info
        if vuln_type == "SCA" and package_name:
            ver_info = f"`{package_name}` {installed_version or 'unknown'}"
            if fixed_version:
                ver_info += f" → {fixed_version}"
            lines.append(f"- **Package**: {ver_info}")
            if cve_id:
                lines.append(f"- **CVE**: {cve_id}")

        lines.append(f"- **What's wrong**: {description}")

        if code_snippet:
            lines.append("- **Detected Code**:")
            lines.append("```")
            lines.append(code_snippet)
            lines.append("```")

        if after_code:
            lines.append("- **Fixed Code**:")
            lines.append("```")
            lines.append(after_code)
            lines.append("```")

        if fix_steps:
            lines.append("- **Steps**:")
            for step_idx, step in enumerate(fix_steps, 1):
                lines.append(f"  {step_idx}. {step}")

        lines.append("")

    return "\n".join(lines)


@router.patch("/repo-vulnerability/{vuln_id}/fix")
async def mark_repo_vulnerability_fixed(vuln_id: str):
    """
    Mark a repo vulnerability as fixed

    - **vuln_id**: UUID of the repo vulnerability
    """
    supabase = get_supabase_service()

    try:
        result = await supabase.mark_repo_vulnerability_fixed(vuln_id)
        return {"status": "ok", "vulnerability_id": vuln_id, "is_fixed": True}
    except Exception as e:
        logger.error("repo_vulnerability_fix_failed", vuln_id=vuln_id, error=str(e), exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to mark as fixed")


async def run_repo_scan_background(
    scan_id: str,
    repo_url: str,
    branch: Optional[str],
    scan_type: str,
    user_id: Optional[str] = None,
):
    """Background task to run repo security scan"""
    from app.services.repo_scanner import RepoScanner

    supabase = get_supabase_service()

    try:
        # Update status to processing
        await supabase.update_repo_scan_status(
            scan_id,
            ScanStatus.PROCESSING,
            started_at=datetime.utcnow().isoformat(),
        )

        # Run scan
        scanner = RepoScanner(repo_url, branch=branch, scan_type=scan_type)
        results = await scanner.run()

        # Save vulnerabilities to database (file_content is excluded by supabase_client)
        db_vulns = []
        if results["vulnerabilities"]:
            db_vulns = await supabase.create_repo_vulnerabilities_batch(scan_id, results["vulnerabilities"])

        # Update scan as completed (include detected branch if it was auto-resolved)
        await supabase.update_repo_scan_status(
            scan_id,
            ScanStatus.COMPLETED,
            score=results["score"],
            grade=results["grade"],
            summary=results["summary"],
            score_breakdown=results.get("score_breakdown"),
            files_scanned=results["files_scanned"],
            commit_hash=results.get("commit_hash"),
            branch=results.get("branch"),
            completed_at=datetime.utcnow().isoformat(),
        )

        # Send Web Push notification
        try:
            from app.services.notifier import send_scan_complete_push
            await send_scan_complete_push(
                scan_id, repo_url, results["score"], results["grade"],
                user_id=user_id,
            )
        except Exception as push_err:
            logger.warning("push_notification_failed", scan_id=scan_id, error=str(push_err))

        # Phase 1: Run AI analysis while file_content is still in memory (Pro only)
        is_pro = False
        if user_id:
            user_data = await supabase.get_user(user_id)
            is_pro = (user_data or {}).get("plan", "free") == "pro"

        if is_pro and db_vulns and results["vulnerabilities"]:
            try:
                # Build a lookup from (name, file_path) → file_content from scan results
                content_lookup: dict[tuple[str, str], dict] = {}
                for scan_v in results["vulnerabilities"]:
                    key = (scan_v.get("name", ""), scan_v.get("file_path", ""))
                    if scan_v.get("file_content") and key not in content_lookup:
                        content_lookup[key] = {
                            "file_content": scan_v["file_content"],
                            "file_language": scan_v.get("file_language", ""),
                        }

                vulns_with_content = []
                for db_v in db_vulns:
                    enriched = dict(db_v)
                    key = (db_v.get("name", ""), db_v.get("file_path", ""))
                    if key in content_lookup:
                        enriched.update(content_lookup[key])
                    vulns_with_content.append(enriched)

                from app.services.claude_analyzer import get_claude_analyzer
                analyzer = get_claude_analyzer()
                analyses = await analyzer.analyze_repo_batch(vulns_with_content)

                for analysis in analyses:
                    vuln_id = analysis.get("vulnerability_id")
                    if vuln_id:
                        try:
                            await supabase.update_repo_vulnerability_analysis(vuln_id, analysis)
                        except Exception as update_err:
                            logger.warning(
                                "bg_ai_analysis_update_failed",
                                vuln_id=vuln_id,
                                error=str(update_err),
                            )

                logger.info(
                    "bg_ai_analysis_completed",
                    scan_id=scan_id,
                    analyzed=len(analyses),
                )
            except Exception as ai_err:
                # AI analysis failure is non-fatal — scan is already completed
                logger.warning(
                    "bg_ai_analysis_failed",
                    scan_id=scan_id,
                    error=str(ai_err),
                )

    except Exception as e:
        # Update scan as failed
        logger.error("repo_scan_failed", scan_id=scan_id, error=str(e), exc_info=True)
        await supabase.update_repo_scan_status(
            scan_id,
            ScanStatus.FAILED,
            error_message="Repo scan failed due to an internal error",
            completed_at=datetime.utcnow().isoformat(),
        )
