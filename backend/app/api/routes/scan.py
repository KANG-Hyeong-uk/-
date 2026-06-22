"""
Trust Backend Scan API Routes
POST /api/scan - Start a new scan
GET /api/scan/{scan_id} - Get scan status and results
"""

import asyncio
import csv
import io
import ipaddress
import socket
from datetime import datetime
from typing import Optional
from urllib.parse import urlparse

from fastapi import APIRouter, HTTPException, BackgroundTasks, Depends, Request
from fastapi.responses import StreamingResponse

from app.logging_config import get_logger

logger = get_logger(__name__)

import base64

from app.models.schemas import (
    ScanRequest,
    ScanStartResponse,
    ScanStatusResponse,
    ScanStatus,
    ScanMode,
    ScanCreate,
    VulnerabilityBase,
    VulnerabilityWithAnalysis,
    VulnerabilityCategory,
    FixComplexity,
    VulnerabilitySummary,
    RecentScanItem,
    RecentScansResponse,
    BenchmarkResponse,
    ScoreDistributionBucket,
    ExportFormat,
    ScheduledScanCreate,
    ScheduledScanResponse,
    ScheduledScansListResponse,
    PaginatedResponse,
)
from app.config import get_settings
from app.services.supabase_client import get_supabase_service
from app.api.auth import get_current_user, require_auth
from app.services.nuclei_scanner import (
    NucleiScanner,
    calculate_score,
    diagnose_nuclei_environment,
    probe_target_reachability,
    TargetUnreachableError,
    INFO_SEVERITY_OVERRIDE,
)
from app.services.github_service import GitHubService
from app.services.route_extractors import GitHubRouteExtractor

# SSRF protection: blocked hostnames (cloud metadata endpoints)
BLOCKED_HOSTNAMES = {
    "metadata.google.internal",
    "metadata.goog",
    "169.254.169.254",
}

# Private/reserved IP networks that must not be scanned
PRIVATE_NETWORKS = [
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("169.254.0.0/16"),
    ipaddress.ip_network("::1/128"),
]


def validate_scan_target(url: str) -> None:
    """Validate that the scan target URL does not point to internal/private resources."""
    parsed = urlparse(url)
    hostname = parsed.hostname

    if not hostname:
        raise HTTPException(status_code=400, detail="Invalid URL: no hostname found")

    # Block known cloud metadata hostnames
    if hostname.lower() in BLOCKED_HOSTNAMES:
        raise HTTPException(status_code=400, detail="Scanning internal cloud metadata endpoints is not allowed")

    # Block localhost aliases
    if hostname.lower() in ("localhost", "0.0.0.0"):
        raise HTTPException(status_code=400, detail="Scanning localhost is not allowed")

    # Resolve DNS and check all resulting IPs
    try:
        addrinfos = socket.getaddrinfo(hostname, None)
    except socket.gaierror:
        raise HTTPException(status_code=400, detail=f"Could not resolve hostname: {hostname}")

    for family, _, _, _, sockaddr in addrinfos:
        ip_str = sockaddr[0]
        try:
            ip = ipaddress.ip_address(ip_str)
        except ValueError:
            continue
        for network in PRIVATE_NETWORKS:
            if ip in network:
                raise HTTPException(
                    status_code=400,
                    detail="Scanning private/internal IP addresses is not allowed",
                )


router = APIRouter(tags=["scan"])

# 모드별 예상 스캔 시간 (초) - 진행률 계산용
# 타임아웃보다 약간 짧게 설정하여 90%에서 멈추지 않도록
SCAN_EXPECTED_TIMES = {
    ScanMode.TECH: 100,
    ScanMode.QUICK: 270,   # 타임아웃 300초
    ScanMode.FULL: 540,    # 타임아웃 600초
    ScanMode.CRITICAL: 270,
}


@router.get("/scans/history")
async def get_scan_history(current_user=Depends(require_auth)):
    """Return the authenticated user's completed scans (URL + repo), newest first."""
    supabase = get_supabase_service()
    url_scans = await supabase.get_user_scans(current_user.id)
    repo_scans = await supabase.get_user_repo_scans(current_user.id)

    items = []
    for s in url_scans:
        items.append({
            "scan_id": s["id"],
            "type": "url",
            "target": s.get("target_url", ""),
            "score": s.get("score"),
            "grade": s.get("grade"),
            "created_at": s.get("created_at"),
            "completed_at": s.get("completed_at"),
        })
    for s in repo_scans:
        items.append({
            "scan_id": s["id"],
            "type": "repo",
            "target": s.get("repo_url") or s.get("repo_name", ""),
            "score": s.get("score"),
            "grade": s.get("grade"),
            "created_at": s.get("created_at"),
            "completed_at": s.get("completed_at"),
        })

    # Sort by created_at descending
    items.sort(key=lambda x: x.get("created_at") or "", reverse=True)
    return {"items": items}


@router.post("/scan", response_model=ScanStartResponse)
async def start_scan(
    request: ScanRequest,
    background_tasks: BackgroundTasks,
    current_user=Depends(get_current_user),
):
    """
    Start a new security scan

    - **target_url**: URL to scan
    - **scan_mode**: Scan mode (tech, quick, full, critical)
    """
    supabase = get_supabase_service()

    # Validate URL
    target_url = request.target_url.strip()
    if not target_url:
        raise HTTPException(status_code=400, detail="Target URL is required")

    # Normalize URL
    if not target_url.startswith(("http://", "https://")):
        target_url = f"https://{target_url}"

    # SSRF protection: block internal/private targets
    validate_scan_target(target_url)

    # Rate limiting — logged-in free users only
    if current_user:
        user_data = await supabase.get_user(current_user.id)
        user_plan = (user_data or {}).get("plan") or "free"
        if user_plan != "pro":
            count = await supabase.get_monthly_scan_count(current_user.id, "url", (user_data or {}).get("plan_changed_at"))
            if count >= 5:
                raise HTTPException(
                    status_code=429,
                    detail="Free plan limit: 5 URL scans per month. Upgrade to Pro for unlimited scans.",
                )
    # Anonymous users: no limit (gated at result page instead)

    # Create scan record
    scan_data = ScanCreate(
        target_url=target_url,
        scan_mode=request.scan_mode.value,
        status="pending"
    )

    user_id = current_user.id if current_user else None

    try:
        scan = await supabase.create_scan(scan_data, user_id=user_id)
    except Exception as e:
        logger.error("scan_create_failed", error=str(e), exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to create scan")

    # Start scan in background
    background_tasks.add_task(
        run_scan_background,
        scan["id"],
        target_url,
        request.scan_mode,
        user_id=user_id,
        repo_full_name=request.repo_full_name,
    )

    return ScanStartResponse(
        scan_id=scan["id"],
        status=ScanStatus.PROCESSING,
        target_url=target_url,
        created_at=datetime.fromisoformat(scan["created_at"].replace("Z", "+00:00"))
    )


@router.get("/scans/recent", response_model=PaginatedResponse[RecentScanItem])
async def get_recent_scans(cursor: Optional[str] = None, limit: int = 20):
    """
    Get recent completed scans with cursor-based pagination.

    - **cursor**: Opaque cursor for the next page (from previous response)
    - **limit**: Maximum number of scans to return (default 20, max 100)
    """
    limit = min(max(limit, 1), 100)
    supabase = get_supabase_service()

    # Decode cursor: "created_at|id" base64-encoded
    cursor_created_at = None
    cursor_id = None
    if cursor:
        try:
            decoded = base64.urlsafe_b64decode(cursor.encode()).decode()
            cursor_created_at, cursor_id = decoded.rsplit("|", 1)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid cursor")

    # Fetch one extra to determine has_more
    scans = await supabase.get_recent_scans(
        limit + 1,
        cursor_created_at=cursor_created_at,
        cursor_id=cursor_id,
    )

    has_more = len(scans) > limit
    scans = scans[:limit]

    items = []
    for s in scans:
        items.append(RecentScanItem(
            scan_id=s["id"],
            target_url=s["target_url"],
            score=s.get("score"),
            grade=s.get("grade"),
            summary=s.get("summary"),
            scan_mode=s.get("scan_mode"),
            created_at=datetime.fromisoformat(s["created_at"].replace("Z", "+00:00")),
            completed_at=datetime.fromisoformat(s["completed_at"].replace("Z", "+00:00")) if s.get("completed_at") else None,
        ))

    next_cursor = None
    if has_more and scans:
        last = scans[-1]
        raw = f"{last['created_at']}|{last['id']}"
        next_cursor = base64.urlsafe_b64encode(raw.encode()).decode()

    return PaginatedResponse(items=items, next_cursor=next_cursor, has_more=has_more)


@router.get("/stats/community")
async def get_community_stats():
    """Get aggregate community stats for the landing page."""
    supabase = get_supabase_service()
    stats = await supabase.get_community_stats()
    return stats


@router.get("/stats/benchmark", response_model=BenchmarkResponse)
async def get_benchmark(score: Optional[int] = None):
    """
    Get benchmark statistics for all completed scans.

    - **score**: Optional score to calculate percentile ranking
    """
    supabase = get_supabase_service()
    stats = await supabase.get_benchmark_stats()

    # Build score distribution histogram (0-10, 10-20, ..., 90-100)
    scores = stats["scores"]
    buckets = []
    for low in range(0, 100, 10):
        high = low + 10
        label = f"{low}-{high}"
        count = sum(1 for s in scores if low <= s < high) if high < 100 else sum(1 for s in scores if low <= s <= high)
        buckets.append(ScoreDistributionBucket(range=label, count=count))

    percentile = None
    if score is not None and scores:
        percentile = supabase.get_score_percentile(scores, score)

    return BenchmarkResponse(
        total_scans=stats["total_scans"],
        avg_score=stats["avg_score"],
        median_score=stats["median_score"],
        score_distribution=buckets,
        percentile=percentile,
    )


@router.get("/scan/{scan_id}/export")
async def export_scan(scan_id: str, format: ExportFormat = ExportFormat.CSV):
    """
    Export scan results as CSV or PDF.
    Supports both URL scans and repo scans.

    - **scan_id**: UUID of the scan
    - **format**: Export format (csv or pdf)
    """
    supabase = get_supabase_service()

    # Try URL scan first, then fall back to repo scan
    scan = await supabase.get_scan(scan_id)
    is_repo = False
    if not scan:
        scan = await supabase.get_repo_scan(scan_id)
        is_repo = True
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    if scan["status"] != "completed":
        raise HTTPException(status_code=400, detail="Scan is not completed yet")

    if is_repo:
        vulns = await supabase.get_repo_vulnerabilities_by_scan(scan_id)
        repo_name = scan.get("repo_name", scan.get("repo_url", ""))
        safe_name = repo_name.replace("/", "_").replace("https://github.com/", "")[:40]
    else:
        vulns = await supabase.get_vulnerabilities_by_scan(scan_id)
        target_url = scan["target_url"]
        safe_name = target_url.replace("https://", "").replace("http://", "").replace("/", "_")[:40]

    if format == ExportFormat.CSV:
        return _generate_csv(scan, vulns, safe_name, is_repo=is_repo)
    else:
        return _generate_pdf(scan, vulns, safe_name, is_repo=is_repo)


def _generate_csv(scan: dict, vulns: list[dict], safe_name: str, is_repo: bool = False) -> StreamingResponse:
    """Generate CSV export of scan vulnerabilities."""
    output = io.StringIO()
    writer = csv.writer(output)

    if is_repo:
        writer.writerow(["Name", "Severity", "Type", "File Path", "Line", "Description", "Fix Suggestion", "Is Fixed"])
        for v in vulns:
            writer.writerow([
                v.get("name", ""),
                v.get("severity", ""),
                v.get("vuln_type", ""),
                v.get("file_path", ""),
                v.get("line_number", ""),
                v.get("description", ""),
                v.get("fix_suggestion", ""),
                "Yes" if v.get("is_fixed") else "No",
            ])
    else:
        writer.writerow(["Name", "Severity", "Template ID", "Matched At", "Description", "Fix Steps", "Is Fixed"])
        for v in vulns:
            fix_steps = ""
            if v.get("fix_steps"):
                steps = v["fix_steps"]
                if isinstance(steps, list):
                    fix_steps = "; ".join(steps)
            writer.writerow([
                v.get("name", ""),
                v.get("severity", ""),
                v.get("template_id", ""),
                v.get("matched_at", ""),
                v.get("description", ""),
                fix_steps,
                "Yes" if v.get("is_fixed") else "No",
            ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="trust-report-{safe_name}.csv"'},
    )


def _generate_pdf(scan: dict, vulns: list[dict], safe_name: str, is_repo: bool = False) -> StreamingResponse:
    """Generate PDF report of scan results."""
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.lib.units import mm
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=20*mm, bottomMargin=20*mm)
    styles = getSampleStyleSheet()

    # Custom styles
    title_style = ParagraphStyle("TrustTitle", parent=styles["Title"], fontSize=24, textColor=colors.HexColor("#1a1a2e"))
    subtitle_style = ParagraphStyle("TrustSubtitle", parent=styles["Normal"], fontSize=12, textColor=colors.grey)

    elements = []

    # Header
    report_type = "Repository Security Report" if is_repo else "Trust Security Report"
    elements.append(Paragraph(report_type, title_style))
    elements.append(Spacer(1, 5*mm))

    if is_repo:
        elements.append(Paragraph(f"Repository: {scan.get('repo_name', scan.get('repo_url', 'N/A'))}", subtitle_style))
        elements.append(Paragraph(f"Branch: {scan.get('branch', 'N/A')}", subtitle_style))
    else:
        elements.append(Paragraph(f"Target: {scan['target_url']}", subtitle_style))

    scan_date = scan.get("completed_at", scan.get("created_at", ""))
    if scan_date:
        elements.append(Paragraph(f"Date: {str(scan_date)[:10]}", subtitle_style))

    score = scan.get("score", "N/A")
    grade = scan.get("grade", "N/A")
    elements.append(Paragraph(f"Score: {score}/100  |  Grade: {grade}", subtitle_style))
    elements.append(Spacer(1, 5*mm))

    # Summary
    summary = scan.get("summary", {})
    if summary:
        if is_repo:
            summary_text = (
                f"Secrets: {summary.get('secrets', 0)}  |  "
                f"SAST: {summary.get('sast', 0)}  |  "
                f"SCA: {summary.get('sca', 0)}"
            )
        else:
            summary_text = (
                f"Critical: {summary.get('critical', 0)}  |  "
                f"High: {summary.get('high', 0)}  |  "
                f"Medium: {summary.get('medium', 0)}  |  "
                f"Low: {summary.get('low', 0)}  |  "
                f"Info: {summary.get('info', 0)}"
            )
        elements.append(Paragraph(summary_text, styles["Normal"]))
        elements.append(Spacer(1, 8*mm))

    # Vulnerability table
    if vulns:
        cell_style = ParagraphStyle("Cell", parent=styles["Normal"], fontSize=8, leading=10)

        if is_repo:
            table_data = [["Severity", "Type", "Name", "File", "Fixed"]]
            for v in vulns:
                file_info = v.get("file_path", "")
                if v.get("line_number"):
                    file_info += f":{v['line_number']}"
                table_data.append([
                    v.get("severity", "").upper(),
                    v.get("vuln_type", "").upper(),
                    Paragraph(v.get("name", "")[:50], cell_style),
                    Paragraph(file_info[:40], cell_style),
                    "Yes" if v.get("is_fixed") else "No",
                ])
        else:
            table_data = [["Severity", "Name", "Matched At", "Fixed"]]
            for v in vulns:
                table_data.append([
                    v.get("severity", "").upper(),
                    Paragraph(v.get("name", "")[:60], cell_style),
                    Paragraph(v.get("matched_at", "")[:50], cell_style),
                    "Yes" if v.get("is_fixed") else "No",
                ])

        severity_colors = {
            "CRITICAL": colors.HexColor("#dc2626"),
            "HIGH": colors.HexColor("#ea580c"),
            "MEDIUM": colors.HexColor("#d97706"),
            "LOW": colors.HexColor("#2563eb"),
            "INFO": colors.HexColor("#6b7280"),
        }

        col_widths = [55, 45, 175, 140, 40] if is_repo else [55, 220, 150, 40]
        table = Table(table_data, colWidths=col_widths)
        style_commands = [
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1a1a2e")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTSIZE", (0, 0), (-1, 0), 9),
            ("FONTSIZE", (0, 1), (-1, -1), 8),
            ("ALIGN", (0, 0), (-1, -1), "LEFT"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.lightgrey),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8f9fa")]),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]

        # Color-code severity cells
        for i, row in enumerate(table_data[1:], start=1):
            sev = row[0] if isinstance(row[0], str) else ""
            color = severity_colors.get(sev, colors.grey)
            style_commands.append(("TEXTCOLOR", (0, i), (0, i), color))
            style_commands.append(("FONTNAME", (0, i), (0, i), "Helvetica-Bold"))

        table.setStyle(TableStyle(style_commands))
        elements.append(table)
    else:
        elements.append(Paragraph("No vulnerabilities found.", styles["Normal"]))

    # Footer
    elements.append(Spacer(1, 10*mm))
    footer_style = ParagraphStyle("Footer", parent=styles["Normal"], fontSize=9, textColor=colors.grey)
    elements.append(Paragraph("Generated by Trust - AI Security Scanner", footer_style))

    doc.build(elements)
    buffer.seek(0)

    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="trust-report-{safe_name}.pdf"'},
    )


@router.get("/scan/{scan_id}/fix-prompt")
async def get_scan_fix_prompt(
    scan_id: str,
    severity: Optional[str] = None,
    limit: Optional[int] = None,
    current_user=Depends(get_current_user),
):
    """
    Generate a structured markdown prompt for AI-assisted vulnerability fixing.

    - **scan_id**: UUID of the scan
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

    scan = await supabase.get_scan(scan_id)
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    if scan["status"] != "completed":
        raise HTTPException(status_code=400, detail="Scan is not completed yet")

    vulns = await supabase.get_vulnerabilities_by_scan(scan_id)

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

    prompt = _build_url_fix_prompt(scan, vulns)
    estimated_changes = len(vulns)

    return {
        "prompt": prompt,
        "vuln_count": len(vulns),
        "estimated_changes": estimated_changes,
        "total_count": total_count,
    }


def _build_url_fix_prompt(scan: dict, vulns: list[dict]) -> str:
    """Build a structured markdown prompt for URL scan vulnerability fixes."""
    target_url = scan.get("target_url", "unknown")
    score = scan.get("score", "N/A")
    grade = scan.get("grade", "N/A")
    vuln_count = len(vulns)

    lines = [
        "# Security Vulnerability Fix Request",
        "",
        f"## Target: {target_url}",
        f"## Scan Result: {score}/100 (Grade {grade}) - {vuln_count} vulnerabilities detected",
        "",
        "Please fix the following security vulnerabilities in order of severity.",
        "For each fix, apply the recommended changes to your application.",
        "",
    ]

    for idx, v in enumerate(vulns, 1):
        sev = (v.get("severity") or "info").upper()
        name = v.get("name", "Unknown vulnerability")
        template_id = v.get("template_id", "")
        matched_at = v.get("matched_at", "")
        description = v.get("description") or "No description available"
        impact = v.get("impact")
        before_code = v.get("before_code") or ""
        after_code = v.get("after_code") or ""
        fix_steps = v.get("fix_steps") or []

        # Clean up heavily masked content
        if before_code:
            non_mask = before_code.replace("*", "").replace("-", "").replace("\n", "").strip()
            if len(non_mask) < len(before_code.strip()) * 0.3:
                before_code = f"[Content masked for security. See: {matched_at}]"

        lines.append("---")
        lines.append("")
        lines.append(f"### {idx}. [{sev}] {name}")
        lines.append(f"- **Location**: `{matched_at}`" if matched_at else "- **Location**: N/A")
        if template_id:
            lines.append(f"- **Template**: `{template_id}`")
        lines.append(f"- **What's wrong**: {description}")

        if impact:
            lines.append(f"- **Impact**: {impact}")

        if before_code:
            lines.append("- **Detected Code**:")
            lines.append("```")
            lines.append(before_code)
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


@router.get("/scan/{scan_id}", response_model=ScanStatusResponse)
async def get_scan_status(scan_id: str):
    """
    Get scan status and results

    - **scan_id**: UUID of the scan
    """
    supabase = get_supabase_service()

    # Get scan record
    scan = await supabase.get_scan(scan_id)

    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")

    # Get vulnerabilities if scan is completed
    vulnerabilities = []
    summary = None

    if scan["status"] in ["completed", "processing"]:
        vuln_records = await supabase.get_vulnerabilities_by_scan(scan_id)

        # Reclassify info severities based on INFO_SEVERITY_OVERRIDE
        for v in vuln_records:
            if v.get("severity", "").lower() == "info":
                tid = v.get("template_id", "").lower()
                for pattern, deduction in INFO_SEVERITY_OVERRIDE.items():
                    if pattern in tid:
                        if deduction >= 5:
                            v["severity"] = "high"
                        elif deduction >= 3:
                            v["severity"] = "medium"
                        elif deduction >= 2:
                            v["severity"] = "low"
                        break

        # Sort by severity (critical first, info last)
        severity_order = {"critical": 0, "high": 1, "medium": 2, "low": 3, "info": 4}
        vuln_records.sort(key=lambda v: severity_order.get(v.get("severity", "info"), 5))

        vulnerabilities = []
        for v in vuln_records:
            raw_er = v.get("extracted_results", [])
            # Handle both old format (list) and new format (dict with data + matched_locations)
            if isinstance(raw_er, dict):
                er_data = raw_er.get("data", [])
                matched_locs = raw_er.get("matched_locations", [])
            else:
                er_data = raw_er if isinstance(raw_er, list) else []
                matched_locs = []
            vuln_obj = VulnerabilityWithAnalysis(
                id=v["id"],
                template_id=v["template_id"],
                name=v["name"],
                severity=v["severity"],
                matched_at=v["matched_at"],
                extracted_results=er_data,
                matched_locations=matched_locs,
                ai_analyzed=v.get("ai_analyzed", False),
                is_fixed=v.get("is_fixed", False),
                category=_safe_category(v.get("category")),
                description=v.get("description"),
                impact=v.get("impact"),
                before_code=v.get("before_code"),
                after_code=v.get("after_code"),
                fix_steps=v.get("fix_steps"),
                fix_complexity=_safe_complexity(v.get("fix_complexity")),
                reference_urls=v.get("reference_urls"),
            )
            vulnerabilities.append(vuln_obj)

        # Recalculate summary from reclassified severities
        summary = supabase.calculate_summary(vuln_records)

    # Calculate progress for processing scans
    progress = None
    current_stage = None

    if scan["status"] == "processing":
        # Estimate progress based on time elapsed and scan mode
        if scan.get("started_at"):
            started = datetime.fromisoformat(scan["started_at"].replace("Z", "+00:00"))
            elapsed = (datetime.utcnow().replace(tzinfo=started.tzinfo) - started).total_seconds()
            # 모드별 예상 시간 사용 (기본값 180초)
            scan_mode = ScanMode(scan.get("scan_mode", "quick"))
            expected_time = SCAN_EXPECTED_TIMES.get(scan_mode, 180)
            progress = min(int((elapsed / expected_time) * 99), 99)
        else:
            progress = 10
        current_stage = "scanning"

    elif scan["status"] == "completed":
        progress = 100
        current_stage = "complete"

    # Extract score_breakdown from stored summary JSONB
    score_breakdown = (scan.get("summary") or {}).get("score_breakdown")

    return ScanStatusResponse(
        scan_id=scan_id,
        status=ScanStatus(scan["status"]),
        target_url=scan["target_url"],
        progress=progress,
        current_stage=current_stage,
        score=scan.get("score"),
        grade=scan.get("grade"),
        summary=summary,
        vulnerabilities=vulnerabilities,
        score_breakdown=score_breakdown,
        error_message=scan.get("error_message"),
        started_at=datetime.fromisoformat(scan["started_at"].replace("Z", "+00:00")) if scan.get("started_at") else None,
        completed_at=datetime.fromisoformat(scan["completed_at"].replace("Z", "+00:00")) if scan.get("completed_at") else None
    )


async def _extract_repo_route_hints(
    *,
    scan_id: str,
    target_url: str,
    user_id: Optional[str],
    repo_full_name: Optional[str],
) -> list[str]:
    """Pull route hints from a connected GitHub repo. Never raises; on
    any failure returns an empty list so the scan falls back to Katana-only."""
    if not user_id or not repo_full_name:
        return []

    supabase = get_supabase_service()
    try:
        token = await supabase.get_github_access_token(user_id)
    except Exception as e:
        logger.warning("repo_hint_token_lookup_failed", scan_id=scan_id, error=str(e)[:120])
        return []
    if not token:
        logger.info("repo_hint_no_github_token", scan_id=scan_id, user_id=user_id)
        return []

    gh = GitHubService(token)
    try:
        extractor = GitHubRouteExtractor(gh, repo_full_name, base_url=target_url)
        hints = await extractor.extract()
    except Exception as e:
        logger.warning(
            "repo_hint_extraction_failed",
            scan_id=scan_id,
            repo=repo_full_name,
            error=str(e)[:200],
        )
        return []
    finally:
        await gh.close()

    return [h.url for h in hints]


async def run_scan_background(
    scan_id: str,
    target_url: str,
    scan_mode: ScanMode,
    user_id: str = None,
    repo_full_name: str = None,
):
    """Background task to run Nuclei scan"""
    supabase = get_supabase_service()

    try:
        # Update status to processing
        await supabase.update_scan_status(
            scan_id,
            ScanStatus.PROCESSING,
            started_at=datetime.utcnow().isoformat()
        )

        # Pre-flight reachability check — WHY: Nuclei returns 0 findings against
        # unreachable hosts (DNS fail, refused, expired SSL, timeout), and the
        # scoring path then awards 100/A to a dead site. Fail fast instead.
        try:
            await probe_target_reachability(target_url)
        except TargetUnreachableError as reach_err:
            logger.warning(
                "scan_target_unreachable",
                scan_id=scan_id,
                target=target_url,
                reason=str(reach_err),
            )
            await supabase.update_scan_status(
                scan_id,
                ScanStatus.FAILED,
                error_message=f"Target unreachable: {reach_err}",
                completed_at=datetime.utcnow().isoformat(),
            )
            return

        # Pull route hints from a GitHub-linked repo, if one was selected and
        # the user has a connection. Best-effort — never blocks the scan.
        extra_route_urls = await _extract_repo_route_hints(
            scan_id=scan_id,
            target_url=target_url,
            user_id=user_id,
            repo_full_name=repo_full_name,
        )

        # Run Nuclei scan
        scanner = NucleiScanner(target_url, scan_id, extra_route_urls=extra_route_urls)
        findings = await scanner.run_scan(mode=scan_mode)

        # Save vulnerabilities to database
        if findings:
            await supabase.create_vulnerabilities_batch(scan_id, findings)

        # Calculate score and summary
        score, grade, score_breakdown = calculate_score(findings)
        summary = supabase.calculate_summary(
            [{"severity": f.get("severity", "info")} for f in findings]
        )
        summary_data = summary.model_dump()
        summary_data["score_breakdown"] = score_breakdown

        # Update scan as completed
        await supabase.update_scan_status(
            scan_id,
            ScanStatus.COMPLETED,
            score=score,
            grade=grade,
            summary=summary_data,
            completed_at=datetime.utcnow().isoformat()
        )

        # Send Web Push notification
        try:
            from app.services.notifier import send_scan_complete_push
            await send_scan_complete_push(
                scan_id, target_url, score, grade,
                user_id=user_id,
            )
        except Exception as push_err:
            logger.warning("push_notification_failed", scan_id=scan_id, error=str(push_err))

    except Exception as e:
        # Update scan as failed
        logger.error("scan_failed", scan_id=scan_id, error=str(e), exc_info=True)
        await supabase.update_scan_status(
            scan_id,
            ScanStatus.FAILED,
            error_message="Scan failed due to an internal error",
            completed_at=datetime.utcnow().isoformat()
        )


@router.get("/diagnose")
async def diagnose(request: Request):
    """
    Diagnose Nuclei environment
    Use this endpoint to troubleshoot Cloud Run issues.
    Protected by admin secret in production.
    """
    settings = get_settings()

    if settings.environment == "production":
        admin_secret = request.headers.get("X-Admin-Secret", "")
        if not settings.admin_secret or admin_secret != settings.admin_secret:
            raise HTTPException(status_code=403, detail="Forbidden")

    try:
        diagnostics = await diagnose_nuclei_environment()
        return {
            "status": "ok",
            "diagnostics": diagnostics
        }
    except Exception as e:
        logger.error("diagnose_failed", error=str(e), exc_info=True)
        return {
            "status": "error",
            "error": "Diagnostics failed"
        }


@router.patch("/vulnerability/{vuln_id}/fix")
async def mark_vulnerability_fixed(vuln_id: str):
    """
    Mark a vulnerability as fixed

    - **vuln_id**: UUID of the vulnerability
    """
    supabase = get_supabase_service()

    # Verify vulnerability exists
    vulns = await supabase.get_vulnerabilities_by_ids([vuln_id])
    if not vulns:
        raise HTTPException(status_code=404, detail="Vulnerability not found")

    try:
        result = await supabase.mark_vulnerability_fixed(vuln_id)
        return {"status": "ok", "vulnerability_id": vuln_id, "is_fixed": True}
    except Exception as e:
        logger.error("vulnerability_fix_failed", vuln_id=vuln_id, error=str(e), exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to mark as fixed")


# ==================== SCHEDULED SCANS ====================


def _compute_next_run(cron_expression: str) -> str:
    """Compute next run time from cron expression. Returns ISO format string."""
    from croniter import croniter
    now = datetime.utcnow()
    cron = croniter(cron_expression, now)
    return cron.get_next(datetime).isoformat()


@router.post("/scheduled-scans", response_model=ScheduledScanResponse, status_code=201)
async def create_scheduled_scan(body: ScheduledScanCreate):
    """
    Create a new scheduled scan.

    - **target_url**: URL to scan on schedule
    - **cron_expression**: Cron expression for schedule (default: every hour)
    - **notification_email**: Optional email for notifications
    - **slack_webhook_url**: Optional Slack webhook for notifications
    """
    # Validate URL (reuse SSRF protection)
    target_url = body.target_url.strip()
    if not target_url.startswith(("http://", "https://")):
        target_url = f"https://{target_url}"
    validate_scan_target(target_url)

    # Validate cron expression
    try:
        from croniter import croniter
        if not croniter.is_valid(body.cron_expression):
            raise ValueError()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid cron expression")

    next_run = _compute_next_run(body.cron_expression)

    supabase = get_supabase_service()
    try:
        record = await supabase.create_scheduled_scan({
            "target_url": target_url,
            "cron_expression": body.cron_expression,
            "notification_email": body.notification_email,
            "slack_webhook_url": body.slack_webhook_url,
            "next_run_at": next_run,
        })
    except Exception as e:
        logger.error("schedule_create_failed", error=str(e), exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to create schedule")

    return _schedule_to_response(record)


@router.get("/scheduled-scans", response_model=ScheduledScansListResponse)
async def list_scheduled_scans():
    """Get all scheduled scans."""
    supabase = get_supabase_service()
    records = await supabase.get_scheduled_scans()
    return ScheduledScansListResponse(
        schedules=[_schedule_to_response(r) for r in records]
    )


@router.delete("/scheduled-scans/{schedule_id}")
async def delete_scheduled_scan(schedule_id: str):
    """
    Delete a scheduled scan.

    - **schedule_id**: UUID of the schedule to delete
    """
    supabase = get_supabase_service()
    deleted = await supabase.delete_scheduled_scan(schedule_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Scheduled scan not found")
    return {"status": "ok", "deleted_id": schedule_id}


def _schedule_to_response(record: dict) -> ScheduledScanResponse:
    """Convert a DB record to ScheduledScanResponse."""
    return ScheduledScanResponse(
        id=record["id"],
        target_url=record["target_url"],
        cron_expression=record.get("cron_expression", "0 * * * *"),
        notification_email=record.get("notification_email"),
        slack_webhook_url=record.get("slack_webhook_url"),
        last_run_at=datetime.fromisoformat(record["last_run_at"].replace("Z", "+00:00")) if record.get("last_run_at") else None,
        next_run_at=datetime.fromisoformat(record["next_run_at"].replace("Z", "+00:00")) if record.get("next_run_at") else None,
        enabled=record.get("enabled", True),
        created_at=datetime.fromisoformat(record["created_at"].replace("Z", "+00:00")),
    )


def _safe_category(value: str | None) -> VulnerabilityCategory | None:
    if not value:
        return None
    try:
        return VulnerabilityCategory(value)
    except ValueError:
        return VulnerabilityCategory.EXPOSURE


def _safe_complexity(value: str | None) -> FixComplexity | None:
    if not value:
        return None
    try:
        return FixComplexity(value)
    except ValueError:
        return FixComplexity.MODERATE
