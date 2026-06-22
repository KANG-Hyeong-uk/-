"""
Trust Backend GitHub Integration Routes
GET  /api/github/connection     - Check GitHub connection status
POST /api/github/connect        - Exchange OAuth code for access token
DELETE /api/github/connection    - Disconnect GitHub
POST /api/github/create-fix-pr  - Create a fix PR for repo scan vulnerabilities
"""

from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException, Depends

from app.logging_config import get_logger
from app.config import get_settings
from app.services.supabase_client import get_supabase_service
from app.services.github_service import GitHubService, GitHubAPIError
from app.api.auth import require_auth

logger = get_logger(__name__)
router = APIRouter(tags=["github"])


@router.get("/github/connection")
async def get_github_connection(current_user=Depends(require_auth)):
    """Check if user has a GitHub connection."""
    supabase = get_supabase_service()
    conn = await supabase.get_github_connection(current_user.id)
    if not conn:
        return {"connected": False}
    return {
        "connected": True,
        "github_username": conn.get("github_username"),
        "github_avatar_url": conn.get("github_avatar_url"),
    }


@router.get("/github/repos")
async def list_github_repos(current_user=Depends(require_auth)):
    """List repositories the authenticated user can access, for use as a
    source of route hints during URL scans. Results are trimmed to the
    fields the frontend selector needs."""
    supabase = get_supabase_service()
    token = await supabase.get_github_access_token(current_user.id)
    if not token:
        raise HTTPException(status_code=400, detail="GitHub is not connected")

    gh = GitHubService(token)
    try:
        repos = await gh._request(
            "GET",
            "/user/repos",
            params={"per_page": "100", "sort": "pushed", "affiliation": "owner,collaborator"},
        )
    except GitHubAPIError as e:
        if e.status_code == 401:
            # Stored token is stale (expired / revoked / app uninstalled). Drop
            # the row so the next /github/connection probe reports disconnected
            # and the frontend re-surfaces the Connect GitHub prompt.
            await supabase.delete_github_connection(current_user.id)
            logger.info("github_token_stale_cleared", user_id=current_user.id)
            raise HTTPException(
                status_code=401,
                detail="GitHub authorization expired — please reconnect",
            )
        logger.warning("list_github_repos_failed", user_id=current_user.id, error=str(e)[:200])
        raise HTTPException(status_code=502, detail="Failed to fetch repositories from GitHub")
    finally:
        await gh.close()

    items = [
        {
            "full_name": r.get("full_name"),
            "private": r.get("private"),
            "default_branch": r.get("default_branch"),
            "language": r.get("language"),
            "pushed_at": r.get("pushed_at"),
            "homepage": r.get("homepage"),
        }
        for r in (repos if isinstance(repos, list) else [])
        if r.get("full_name")
    ]
    return {"repos": items}


@router.post("/github/connect")
async def connect_github(body: dict, current_user=Depends(require_auth)):
    """Exchange GitHub OAuth code for access token and store connection."""
    code = body.get("code")
    if not code:
        raise HTTPException(status_code=400, detail="OAuth code is required")

    settings = get_settings()
    if not settings.github_app_client_id or not settings.github_app_client_secret:
        raise HTTPException(status_code=500, detail="GitHub OAuth not configured")

    # Exchange code for access token
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            "https://github.com/login/oauth/access_token",
            json={
                "client_id": settings.github_app_client_id,
                "client_secret": settings.github_app_client_secret,
                "code": code,
            },
            headers={"Accept": "application/json"},
        )

    if resp.status_code != 200:
        # Log GitHub's body so we can see bad_verification_code /
        # redirect_uri_mismatch / incorrect_client_credentials vs.
        # a generic 4xx without the real reason.
        logger.warning(
            "github_oauth_exchange_http_error",
            status=resp.status_code,
            body=resp.text[:300],
        )
        raise HTTPException(status_code=400, detail="Failed to exchange OAuth code")

    token_data = resp.json()
    access_token = token_data.get("access_token")
    if not access_token:
        error = token_data.get("error_description", token_data.get("error", "Unknown error"))
        # Even 200 responses can carry error payloads (e.g.
        # ``{"error":"bad_verification_code"}``), so log them too.
        logger.warning(
            "github_oauth_exchange_error_payload",
            error=token_data.get("error"),
            description=token_data.get("error_description"),
        )
        raise HTTPException(status_code=400, detail=f"GitHub OAuth error: {error}")

    scopes = token_data.get("scope", "")

    # Get user info from GitHub
    gh = GitHubService(access_token)
    try:
        user_info = await gh.get_user_info()
    finally:
        await gh.close()

    # Store connection
    supabase = get_supabase_service()
    await supabase.upsert_github_connection(
        user_id=current_user.id,
        access_token=access_token,
        username=user_info.get("login"),
        avatar_url=user_info.get("avatar_url"),
        scopes=scopes,
    )

    return {
        "connected": True,
        "github_username": user_info.get("login"),
        "github_avatar_url": user_info.get("avatar_url"),
    }


@router.delete("/github/connection")
async def disconnect_github(current_user=Depends(require_auth)):
    """Remove GitHub connection."""
    supabase = get_supabase_service()
    await supabase.delete_github_connection(current_user.id)
    return {"connected": False}


def _normalize_file_path(file_path: str) -> str:
    """Strip temp directory prefixes from file paths stored during scan."""
    import re as _re
    # Pattern: /tmp/trust_repo_XXXXX/actual/path or any /tmp/xxx/ prefix
    cleaned = _re.sub(r"^/tmp/[^/]+/", "", file_path)
    return cleaned.lstrip("/")


def _apply_package_json_fix(content: str, before_code: str, after_code: str, vuln: dict = None) -> tuple[str, str]:
    """Smart package.json version update. Returns (modified_content, strategy).

    Priority:
    1. Use scanner fields (package_name, installed_version, fixed_version) directly
    2. Fallback: parse AI's before_code/after_code JSON
    """
    import re as _re

    # ── Strategy 1: Use scanner fields directly (most reliable) ──
    if vuln:
        pkg_name = (vuln.get("package_name") or "")
        old_ver = (vuln.get("installed_version") or "")
        new_ver = (vuln.get("fixed_version") or "")
        if pkg_name and old_ver and new_ver:
            pattern = _re.compile(
                rf'("{_re.escape(pkg_name)}"\s*:\s*")([\^~>=<]*)({_re.escape(old_ver)})"'
            )
            def _ver_repl_direct(m):
                prefix = m.group(2)
                clean_new = _re.sub(r'^[\^~>=<]+', '', new_ver)
                return f'{m.group(1)}{prefix}{clean_new}"'
            new_modified = pattern.sub(_ver_repl_direct, content, count=1)
            if new_modified != content:
                return new_modified, "sca_direct"

    # ── Strategy 2: Parse AI's before/after JSON ──
    import json as _json
    try:
        before_obj = _json.loads(before_code)
        after_obj = _json.loads(after_code)
    except _json.JSONDecodeError:
        return content, "failed"

    modified = content
    matched = False
    for section in ("dependencies", "devDependencies", "peerDependencies", "optionalDependencies"):
        old_deps = before_obj.get(section, {})
        new_deps = after_obj.get(section, {})
        for pkg_name, old_ver in old_deps.items():
            new_ver = new_deps.get(pkg_name)
            if not new_ver or old_ver == new_ver:
                continue
            pattern = _re.compile(
                rf'("{_re.escape(pkg_name)}"\s*:\s*")([\^~>=<]*)({_re.escape(old_ver)})"'
            )
            def _ver_repl(m):
                prefix = m.group(2)
                clean_new = _re.sub(r'^[\^~>=<]+', '', new_ver)
                return f'{m.group(1)}{prefix}{clean_new}"'
            new_modified = pattern.sub(_ver_repl, modified, count=1)
            if new_modified != modified:
                matched = True
            modified = new_modified

    return modified, ("exact" if matched else "failed")


def _apply_code_fix(content: str, before_code: str, after_code: str) -> tuple[str, str]:
    """Apply code fix with flexible matching. Returns (modified_content, strategy).

    Strategy:
    1. Exact match (stripped)
    2. Whitespace-normalized match
    3. Line-by-line core pattern match
    4. Fuzzy matching (difflib.SequenceMatcher, ratio >= 0.7)
    """
    before = before_code.strip()
    after = after_code.strip()

    # 1) Exact match
    if before in content:
        return content.replace(before, after, 1), "exact"

    # 2) Try matching with normalized whitespace (collapse multiple spaces/tabs)
    import re as _re

    def normalize_ws(s: str) -> str:
        return _re.sub(r'[ \t]+', ' ', s)

    norm_before = normalize_ws(before)
    norm_content = normalize_ws(content)
    if norm_before in norm_content:
        # Find position in normalized content, then map back
        idx = norm_content.index(norm_before)
        # Count characters to find start in original
        orig_pos = 0
        norm_pos = 0
        while norm_pos < idx and orig_pos < len(content):
            if content[orig_pos] in ' \t' and (orig_pos + 1 < len(content)) and content[orig_pos + 1] in ' \t':
                # Skip extra whitespace in original
                while orig_pos < len(content) and content[orig_pos] in ' \t':
                    orig_pos += 1
                norm_pos += 1
            else:
                orig_pos += 1
                norm_pos += 1
        # Find end position
        end_orig = orig_pos
        end_norm = norm_pos
        while end_norm < norm_pos + len(norm_before) and end_orig < len(content):
            if content[end_orig] in ' \t' and (end_orig + 1 < len(content)) and content[end_orig + 1] in ' \t':
                while end_orig < len(content) and content[end_orig] in ' \t':
                    end_orig += 1
                end_norm += 1
            else:
                end_orig += 1
                end_norm += 1
        return content[:orig_pos] + after + content[end_orig:], "whitespace"

    # 3) Line-by-line: find the first distinctive line of before_code in content
    before_lines = [l.strip() for l in before.splitlines() if l.strip()]
    if before_lines:
        # Find the most distinctive line (longest non-trivial line)
        key_line = max(before_lines, key=lambda l: len(l) if len(l) > 5 else 0)
        if key_line and len(key_line) > 10:
            content_lines = content.splitlines(keepends=True)
            for i, cl in enumerate(content_lines):
                if key_line in cl.strip():
                    # Found a matching line — replace the surrounding block
                    # Determine indent from the matched line
                    indent = cl[: len(cl) - len(cl.lstrip())]
                    after_indented = "\n".join(
                        (indent + al if al.strip() else al)
                        for al in after.splitlines()
                    )
                    # Replace from this line, spanning len(before_lines) lines
                    end_i = min(i + len(before_lines), len(content_lines))
                    return "".join(content_lines[:i]) + after_indented + "\n" + "".join(content_lines[end_i:]), "line_by_line"

    # 4) Fuzzy matching: find the most similar block using SequenceMatcher
    if before and len(before) > 10:
        import difflib
        before_len = len(before)
        best_ratio = 0.0
        best_start = 0
        best_end = 0
        # Slide a window of approximately before_len over content
        window_sizes = [before_len, int(before_len * 0.8), int(before_len * 1.2)]
        for win_size in window_sizes:
            if win_size <= 0:
                continue
            for start in range(0, max(1, len(content) - win_size + 1), max(1, win_size // 4)):
                end = min(start + win_size, len(content))
                candidate = content[start:end]
                ratio = difflib.SequenceMatcher(None, before, candidate).ratio()
                if ratio > best_ratio:
                    best_ratio = ratio
                    best_start = start
                    best_end = end
        if best_ratio >= 0.7:
            return content[:best_start] + after + content[best_end:], "fuzzy"

    return content, "failed"  # no match found


@router.post("/github/create-fix-pr")
async def create_fix_pr(body: dict, current_user=Depends(require_auth)):
    """
    Create a GitHub PR with vulnerability fixes.

    Body:
    - scan_id: UUID of the repo scan
    - vulnerability_ids: list of vulnerability UUIDs to fix (optional, defaults to all)
    - target_branch: base branch for PR (optional, defaults to scan's branch)
    """
    import re

    # Pro-only feature
    supabase = get_supabase_service()
    user_data = await supabase.get_user(current_user.id)
    if (user_data or {}).get("plan", "free") != "pro":
        raise HTTPException(status_code=403, detail="Pro subscription required")

    scan_id = body.get("scan_id")
    if not scan_id:
        raise HTTPException(status_code=400, detail="scan_id is required")

    vulnerability_ids = body.get("vulnerability_ids")
    target_branch = body.get("target_branch")

    # Get GitHub token
    gh_token = await supabase.get_github_access_token(current_user.id)
    if not gh_token:
        raise HTTPException(status_code=400, detail="GitHub not connected. Please connect GitHub first.")

    # Get scan data
    scan = await supabase.get_repo_scan(scan_id)
    if not scan:
        raise HTTPException(status_code=404, detail="Repo scan not found")
    if scan["status"] != "completed":
        raise HTTPException(status_code=400, detail="Scan is not completed yet")

    base_branch = target_branch or scan.get("branch", "main")
    repo_url = scan.get("repo_url", "")

    # Extract owner/repo from URL
    match = re.search(r"github\.com/([A-Za-z0-9_.\-]+/[A-Za-z0-9_.\-]+)", repo_url)
    if not match:
        raise HTTPException(status_code=400, detail="Could not extract repo from scan URL")
    repo = match.group(1).rstrip("/").removesuffix(".git")

    # Get vulnerabilities to fix
    vulns = await supabase.get_repo_vulnerabilities_by_scan(scan_id)

    if vulnerability_ids:
        id_set = set(vulnerability_ids)
        vulns = [v for v in vulns if v["id"] in id_set]

    # Only fix vulns that have before_code and after_code
    fixable = [v for v in vulns if v.get("before_code") and v.get("after_code") and v.get("file_path")]
    if not fixable:
        raise HTTPException(status_code=400, detail="No fixable vulnerabilities found (need AI analysis with before/after code)")

    # Normalize file paths — strip temp dir prefixes
    for v in fixable:
        v["file_path"] = _normalize_file_path(v["file_path"])

    # Skip vulns pointing to build artifacts / cache
    fixable = [v for v in fixable if not any(
        seg in v["file_path"] for seg in (".next/", "node_modules/", ".cache/", "dist/", "build/")
    )]
    if not fixable:
        raise HTTPException(status_code=400, detail="No fixable vulnerabilities in source files (all are in build artifacts)")

    # Create fix PR
    gh = GitHubService(gh_token)
    try:
        short_id = scan_id[:8]
        fix_branch = f"trust-security/fix-{short_id}"

        # Check if user has push access to the repo
        has_push = await gh.has_push_access(repo)

        if has_push:
            # User owns or has write access → work directly on the repo
            work_repo = repo
            pr_head = fix_branch
            logger.info(f"User has push access to {repo}, creating branch directly")
        else:
            # No write access → fork first, then create cross-repo PR
            logger.info(f"User lacks push access to {repo}, forking...")
            user_info = await gh.get_user_info()
            username = user_info["login"]
            work_repo = await gh.fork_repo(repo)
            pr_head = f"{username}:{fix_branch}"
            logger.info(f"Forked to {work_repo}, will create PR with head={pr_head}")

            # Sync fork's base branch with upstream to avoid conflicts
            await gh.sync_fork(work_repo, base_branch)

        # Create branch on the work repo (original or fork)
        try:
            await gh.create_branch(work_repo, base_branch, fix_branch)
        except GitHubAPIError as e:
            if e.status_code == 422:
                pass  # Branch already exists
            else:
                raise

        # Group fixes by file path to batch file updates
        files_to_fix: dict[str, list[dict]] = {}
        for v in fixable:
            fp = v["file_path"]
            files_to_fix.setdefault(fp, []).append(v)

        vuln_strategies: dict[str, str] = {}  # vuln_id → strategy

        # ── SCA dedup: merge duplicate packages, keep highest fixed_version ──
        for fp, fv_list in files_to_fix.items():
            if not fp.endswith("package.json"):
                continue
            # Group SCA vulns by package_name
            pkg_groups: dict[str, list[dict]] = {}
            non_sca: list[dict] = []
            for v in fv_list:
                pkg = v.get("package_name") or ""
                if pkg and (v.get("vuln_type") or "").lower() == "sca":
                    pkg_groups.setdefault(pkg, []).append(v)
                else:
                    non_sca.append(v)
            deduped: list[dict] = list(non_sca)
            for pkg_name, group in pkg_groups.items():
                if len(group) <= 1:
                    deduped.extend(group)
                    continue
                # Pick the vuln with the highest fixed_version
                def _ver_tuple(ver_str):
                    """Parse version string to tuple for comparison."""
                    clean = re.sub(r'^[\^~>=<]+', '', ver_str or "")
                    parts = []
                    for p in clean.split("."):
                        # Extract leading digits
                        digits = re.match(r'(\d+)', p)
                        parts.append(int(digits.group(1)) if digits else 0)
                    return tuple(parts) if parts else (0,)

                valid = [v for v in group if v.get("fixed_version")]
                if not valid:
                    # No fixed_version at all — keep first, skip rest
                    deduped.append(group[0])
                    for v in group[1:]:
                        vuln_strategies[v["id"]] = "sca_dedup_skipped"
                    continue
                best = max(valid, key=lambda v: _ver_tuple(v.get("fixed_version") or ""))
                deduped.append(best)
                for v in group:
                    if v["id"] != best["id"]:
                        vuln_strategies[v["id"]] = "sca_dedup_skipped"
            files_to_fix[fp] = deduped
            if len(fv_list) != len(deduped):
                logger.info(f"SCA dedup: {fp} reduced {len(fv_list)} → {len(deduped)} vulns")

        files_changed = 0
        skipped_files = []
        for file_path, file_vulns in files_to_fix.items():
            try:
                content, sha = await gh.get_file_content(work_repo, file_path, fix_branch)
            except GitHubAPIError:
                logger.warning(f"Could not read {file_path} from {work_repo}, skipping")
                skipped_files.append(file_path)
                for v in file_vulns:
                    vuln_strategies[v["id"]] = "failed"
                continue

            modified = content
            is_package_json = file_path.endswith("package.json")

            for v in file_vulns:
                before = v["before_code"]
                after = v["after_code"]
                if is_package_json:
                    modified, strategy = _apply_package_json_fix(modified, before, after, vuln=v)
                else:
                    modified, strategy = _apply_code_fix(modified, before, after)
                vuln_strategies[v["id"]] = strategy

            if modified != content:
                vuln_names = ", ".join(v["name"][:60] for v in file_vulns)
                await gh.update_file(
                    work_repo, file_path, modified,
                    f"fix: {vuln_names}",
                    fix_branch, sha,
                )
                files_changed += 1

        if files_changed == 0:
            detail = "No files were modified. The before_code may not match the current source."
            if skipped_files:
                detail += f" Skipped files (not found): {', '.join(skipped_files)}"
            raise HTTPException(status_code=400, detail=detail)

        # Create PR (always on the ORIGINAL repo, head differs for forks)
        vuln_lines = []
        for v in fixable:
            sev = (v.get("severity") or "info").upper()
            vuln_lines.append(f"- [{sev}] {v['name']} (`{v.get('file_path', 'N/A')}`)")

        pr_body = (
            f"## Security Fixes by Trust Security\n\n"
            f"Scan ID: `{scan_id}`\n"
            f"Score: {scan.get('score', 'N/A')}/100 (Grade {scan.get('grade', 'N/A')})\n\n"
            f"### Fixed Vulnerabilities ({len(fixable)})\n"
            + "\n".join(vuln_lines)
            + "\n\n---\n"
            + "Generated by [Trust Security](https://www.trust-scan.me)"
        )

        pr = await gh.create_pull_request(
            repo,  # PR is always created on the ORIGINAL repo
            title=f"fix: security vulnerabilities (Trust scan {short_id})",
            body=pr_body,
            head=pr_head,  # 'branch' for direct, 'username:branch' for fork
            base=base_branch,
        )

        pr_number = pr.get("number", 0)
        pr_url = pr.get("html_url", "")

        # Register webhook on the repo for PR merge/close tracking
        try:
            from app.config import get_settings
            _settings = get_settings()
            webhook_url = "https://trust-backend-knnd76vaqq-du.a.run.app/webhooks/github"
            created = await gh.ensure_repo_webhook(repo, webhook_url, _settings.github_webhook_secret)
            if created:
                logger.info("webhook_registered", repo=repo)
        except Exception as wh_err:
            logger.warning("webhook_registration_failed", repo=repo, error=str(wh_err))

        # Record fix quality metrics
        try:
            metrics = [
                {
                    "scan_id": scan_id,
                    "vulnerability_id": v["id"],
                    "code_match_strategy": vuln_strategies.get(v["id"], "failed"),
                    "code_match_success": vuln_strategies.get(v["id"], "failed") not in ("failed",),
                    "pr_number": pr_number,
                    "pr_repo": repo,
                    "context_level": "file",
                }
                for v in fixable
            ]
            await supabase.create_fix_quality_metrics_batch(metrics)
        except Exception as metrics_err:
            logger.warning("fix_quality_metrics_save_failed", error=str(metrics_err))

        return {
            "pr_url": pr_url,
            "pr_number": pr_number,
            "branch": fix_branch,
            "files_changed": files_changed,
            "vulnerabilities_fixed": len(fixable),
        }

    except GitHubAPIError as e:
        logger.error(f"GitHub API error creating fix PR: {e}")
        raise HTTPException(status_code=502, detail=f"GitHub API error: {e}")
    finally:
        await gh.close()


@router.post("/github/fix-feedback")
async def submit_fix_feedback(body: dict, current_user=Depends(require_auth)):
    """Submit user feedback on a fix PR quality."""
    scan_id = body.get("scan_id")
    feedback = body.get("feedback")
    if not scan_id or feedback not in ("positive", "negative"):
        raise HTTPException(status_code=400, detail="scan_id and feedback ('positive'/'negative') required")

    supabase = get_supabase_service()
    try:
        await supabase.update_fix_quality_feedback(scan_id, feedback)
    except Exception as e:
        logger.error("fix_feedback_save_failed", scan_id=scan_id, error=str(e))
        raise HTTPException(status_code=500, detail="Failed to save feedback")
    return {"status": "ok"}
