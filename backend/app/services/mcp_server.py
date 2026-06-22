"""
Gwangju Security MCP Server
Exposes scan / repo-scan / code-analysis tools via the MCP protocol.

Mounted at /mcp inside the main FastAPI app (Streamable HTTP transport).
API-key authentication: callers pass  Authorization: Bearer tsec_...
"""

import asyncio
import hashlib
import json
import time
from typing import Any

import httpx
from mcp.server.fastmcp import FastMCP
from mcp import types as mcp_types

from app.logging_config import get_logger

logger = get_logger(__name__)

# ── Internal API base — points at ourselves ──────────────────────────────────
# In production, the MCP server and the scan API live in the same process,
# so we call localhost.  The port matches the FastAPI bind.
_INTERNAL_API = "http://localhost:8080/api/v1"

mcp = FastMCP(
    name="Gwangju Security Scanner",
    instructions=(
        "Security scanning tools for websites, GitHub repos, and code snippets. "
        "Pass your API key via the Authorization header (Bearer tsec_...). "
        "Use scan_and_wait / scan_repo_and_wait for the simplest experience — "
        "they block until results are ready and return the full report."
    ),
)


# ─── Auth helper ────────────────────────────────────────────────────────────

async def _validate_api_key(api_key: str) -> dict | None:
    """Return the DB row if the key is valid & not revoked, else None."""
    from app.services.supabase_client import get_supabase_service
    db = get_supabase_service()
    key_hash = hashlib.sha256(api_key.encode()).hexdigest()
    row = await db.pool.fetchrow(
        "SELECT * FROM api_keys WHERE key_hash = $1 AND revoked = false",
        key_hash,
    )
    if row:
        await db.pool.execute(
            "UPDATE api_keys SET last_used_at = NOW(), scans_used = scans_used + 1 WHERE id = $1",
            row["id"],
        )
    return dict(row) if row else None


# ─── HTTP helpers ────────────────────────────────────────────────────────────

async def _post(path: str, body: dict, api_key: str) -> dict:
    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.post(
            f"{_INTERNAL_API}{path}",
            json=body,
            headers={"X-MCP-Api-Key": api_key},
        )
        r.raise_for_status()
        return r.json()


async def _get(path: str, api_key: str) -> dict:
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.get(
            f"{_INTERNAL_API}{path}",
            headers={"X-MCP-Api-Key": api_key},
        )
        r.raise_for_status()
        return r.json()


async def _poll_until_done(get_path: str, api_key: str, timeout: int = 120) -> dict:
    """Poll a status endpoint every 3 s until status != pending/processing."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        data = await _get(get_path, api_key)
        status = data.get("status", "")
        if status not in ("pending", "processing"):
            return data
        await asyncio.sleep(3)
    raise TimeoutError(f"Scan did not complete within {timeout}s")


# ─── Code-level analysis (no external calls) ────────────────────────────────

_VULN_PATTERNS: list[tuple[str, str, str]] = [
    # (regex pattern, name, severity)
    (r"execute\s*\(\s*['\"].*?\+", "SQL Injection Risk", "high"),
    (r"innerHTML\s*=", "XSS via innerHTML", "high"),
    (r"eval\s*\(", "eval() usage", "high"),
    (r"document\.write\s*\(", "document.write() XSS", "medium"),
    (r"dangerouslySetInnerHTML", "React XSS Risk", "medium"),
    (r"pickle\.loads?\s*\(", "Insecure Deserialization (pickle)", "high"),
    (r"subprocess\.(call|run|Popen).*shell\s*=\s*True", "Shell Injection Risk", "critical"),
    (r"os\.system\s*\(", "OS Command Injection", "critical"),
    (r"md5\s*\(|hashlib\.md5", "Weak Hashing (MD5)", "medium"),
    (r"sha1\s*\(|hashlib\.sha1", "Weak Hashing (SHA1)", "low"),
    (r"random\.(random|randint|choice)\s*\(", "Insecure Random (use secrets module)", "low"),
    (r"verify\s*=\s*False", "SSL Verification Disabled", "high"),
    (r"DEBUG\s*=\s*True", "Debug Mode Enabled", "medium"),
    (r"SECRET_KEY\s*=\s*['\"][^'\"]{1,20}['\"]", "Weak/Hardcoded Secret Key", "high"),
    (r"password\s*=\s*['\"][^'\"]+['\"]", "Hardcoded Password", "critical"),
    (r"api_key\s*=\s*['\"][^'\"]+['\"]", "Hardcoded API Key", "critical"),
    (r"token\s*=\s*['\"][A-Za-z0-9_\-\.]{20,}['\"]", "Hardcoded Token", "high"),
    (r"ALLOW_ALL_ORIGINS\s*=\s*True|cors.*\*", "Overly Permissive CORS", "medium"),
    (r"http://(?!localhost|127)", "Insecure HTTP URL (use HTTPS)", "low"),
    (r"base64\.b64decode.*exec|exec.*base64", "Obfuscated Code Execution", "critical"),
]

_SECRET_PATTERNS: list[tuple[str, str]] = [
    (r"sk-[A-Za-z0-9]{32,}", "OpenAI API Key"),
    (r"AIza[A-Za-z0-9_\-]{35}", "Google API Key"),
    (r"ghp_[A-Za-z0-9]{36}", "GitHub Personal Access Token"),
    (r"ghs_[A-Za-z0-9]{36}", "GitHub App Token"),
    (r"xoxb-[0-9A-Z\-]{50,}", "Slack Bot Token"),
    (r"xoxp-[0-9A-Z\-]{50,}", "Slack User Token"),
    (r"AKIA[A-Z0-9]{16}", "AWS Access Key ID"),
    (r"[A-Za-z0-9+/]{40}(?=[^A-Za-z0-9+/]|$)", "Potential AWS Secret Key"),
    (r"-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----", "Private Key"),
    (r"eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+", "JWT Token"),
    (r"postgresql://[^'\"\s]+", "Database Connection String"),
    (r"mysql://[^'\"\s]+", "MySQL Connection String"),
    (r"mongodb(\+srv)?://[^'\"\s]+", "MongoDB Connection String"),
    (r"redis://[^'\"\s]+", "Redis Connection String"),
    (r"amqp://[^'\"\s]+", "AMQP/RabbitMQ Connection String"),
    (r"smtp://[^'\"\s]+|smtps://[^'\"\s]+", "SMTP Connection String"),
    (r"SG\.[A-Za-z0-9_\-]{22}\.[A-Za-z0-9_\-]{43}", "SendGrid API Key"),
    (r"key-[0-9a-zA-Z]{32}", "Mailgun API Key"),
    (r"AC[a-z0-9]{32}", "Twilio Account SID"),
    (r"stripe_(live|test)_[A-Za-z0-9]{24,}", "Stripe API Key"),
]


def _analyze_code(code: str) -> dict:
    import re
    findings: list[dict] = []
    for pattern, name, severity in _VULN_PATTERNS:
        for m in re.finditer(pattern, code, re.IGNORECASE | re.MULTILINE):
            line_num = code[: m.start()].count("\n") + 1
            findings.append({
                "name": name,
                "severity": severity,
                "line": line_num,
                "match": code[m.start(): m.start() + 80].strip(),
            })

    secrets_found: list[dict] = []
    for pattern, name in _SECRET_PATTERNS:
        for m in re.finditer(pattern, code, re.MULTILINE):
            line_num = code[: m.start()].count("\n") + 1
            raw = code[m.start(): m.start() + 60].strip()
            masked = raw[:8] + "..." + raw[-4:] if len(raw) > 16 else "***"
            secrets_found.append({"name": name, "line": line_num, "masked": masked})

    return {"vulnerabilities": findings, "secrets": secrets_found}


# ═══════════════════════════════════════════════════════════════════════════
# MCP TOOLS
# ═══════════════════════════════════════════════════════════════════════════

@mcp.tool()
async def scan_url(url: str, api_key: str) -> str:
    """
    Start a URL security scan (non-blocking).
    Returns a scan_id you can poll with get_scan_result.

    Args:
        url: The full URL to scan (e.g. https://example.com)
        api_key: Your Gwangju Security API key (tsec_...)
    """
    key_row = await _validate_api_key(api_key)
    if not key_row:
        return json.dumps({"error": "Invalid or revoked API key"})
    try:
        data = await _post("/scan", {"url": url, "scan_mode": "quick"}, api_key)
        return json.dumps({"scan_id": data["scan_id"], "status": "started"})
    except Exception as e:
        logger.warning("mcp_scan_url_error", error=str(e))
        return json.dumps({"error": str(e)})


@mcp.tool()
async def get_scan_result(scan_id: str, api_key: str) -> str:
    """
    Get the result of a URL scan by scan_id.

    Args:
        scan_id: The scan ID returned by scan_url
        api_key: Your Gwangju Security API key (tsec_...)
    """
    key_row = await _validate_api_key(api_key)
    if not key_row:
        return json.dumps({"error": "Invalid or revoked API key"})
    try:
        data = await _get(f"/scan/{scan_id}", api_key)
        return json.dumps(data)
    except Exception as e:
        return json.dumps({"error": str(e)})


@mcp.tool()
async def scan_and_wait(url: str, api_key: str, timeout_seconds: int = 120) -> str:
    """
    Scan a website and wait for results (blocking). Recommended for most use cases.
    Returns the full scan report including score, grade, and vulnerabilities.

    Args:
        url: The full URL to scan (e.g. https://example.com)
        api_key: Your Gwangju Security API key (tsec_...)
        timeout_seconds: Max seconds to wait (default 120)
    """
    key_row = await _validate_api_key(api_key)
    if not key_row:
        return json.dumps({"error": "Invalid or revoked API key"})
    try:
        start = await _post("/scan", {"url": url, "scan_mode": "quick"}, api_key)
        scan_id = start["scan_id"]
        result = await _poll_until_done(f"/scan/{scan_id}", api_key, timeout=timeout_seconds)
        return json.dumps(result)
    except TimeoutError as e:
        return json.dumps({"error": str(e)})
    except Exception as e:
        logger.warning("mcp_scan_and_wait_error", error=str(e))
        return json.dumps({"error": str(e)})


@mcp.tool()
async def scan_repo(repo_url: str, api_key: str) -> str:
    """
    Start a GitHub repository security scan (non-blocking).
    Returns a scan_id you can poll with get_repo_scan_result.

    Args:
        repo_url: Full GitHub URL or owner/repo (e.g. https://github.com/owner/repo)
        api_key: Your Gwangju Security API key (tsec_...)
    """
    key_row = await _validate_api_key(api_key)
    if not key_row:
        return json.dumps({"error": "Invalid or revoked API key"})
    try:
        data = await _post("/repo-scan", {"repo_url": repo_url}, api_key)
        return json.dumps({"scan_id": data["scan_id"], "status": "started"})
    except Exception as e:
        return json.dumps({"error": str(e)})


@mcp.tool()
async def get_repo_scan_result(scan_id: str, api_key: str) -> str:
    """
    Get the result of a repository scan by scan_id.

    Args:
        scan_id: The scan ID returned by scan_repo
        api_key: Your Gwangju Security API key (tsec_...)
    """
    key_row = await _validate_api_key(api_key)
    if not key_row:
        return json.dumps({"error": "Invalid or revoked API key"})
    try:
        data = await _get(f"/repo-scan/{scan_id}", api_key)
        return json.dumps(data)
    except Exception as e:
        return json.dumps({"error": str(e)})


@mcp.tool()
async def scan_repo_and_wait(repo_url: str, api_key: str, timeout_seconds: int = 180) -> str:
    """
    Scan a GitHub repository and wait for results (blocking). Recommended.
    Runs SAST (Semgrep), secret detection (Gitleaks), and SCA (npm audit).

    Args:
        repo_url: Full GitHub URL or owner/repo (e.g. https://github.com/owner/repo)
        api_key: Your Gwangju Security API key (tsec_...)
        timeout_seconds: Max seconds to wait (default 180)
    """
    key_row = await _validate_api_key(api_key)
    if not key_row:
        return json.dumps({"error": "Invalid or revoked API key"})
    try:
        start = await _post("/repo-scan", {"repo_url": repo_url}, api_key)
        scan_id = start["scan_id"]
        result = await _poll_until_done(f"/repo-scan/{scan_id}", api_key, timeout=timeout_seconds)
        return json.dumps(result)
    except TimeoutError as e:
        return json.dumps({"error": str(e)})
    except Exception as e:
        return json.dumps({"error": str(e)})


@mcp.tool()
async def analyze_code_security(code: str, language: str = "auto") -> str:
    """
    Analyze a code snippet for security vulnerabilities (37+ patterns, runs locally).
    No code is sent to external servers — analysis runs entirely inside this tool.

    Args:
        code: The code snippet to analyze (paste directly)
        language: Optional language hint (python, javascript, etc.) — auto-detected if omitted
    """
    result = _analyze_code(code)
    vulns = result["vulnerabilities"]
    if not vulns:
        return json.dumps({"status": "clean", "message": "No vulnerabilities detected", "checked_patterns": len(_VULN_PATTERNS)})
    return json.dumps({
        "status": "vulnerabilities_found",
        "count": len(vulns),
        "vulnerabilities": vulns,
    })


@mcp.tool()
async def check_secrets(code: str) -> str:
    """
    Scan a code snippet or config file for exposed secrets, API keys, and credentials (20+ patterns).
    Matches are masked in the output — no actual secret values are stored.

    Args:
        code: The code or config content to check
    """
    result = _analyze_code(code)
    secrets = result["secrets"]
    if not secrets:
        return json.dumps({"status": "clean", "message": "No secrets detected", "checked_patterns": len(_SECRET_PATTERNS)})
    return json.dumps({
        "status": "secrets_found",
        "count": len(secrets),
        "secrets": secrets,
    })


@mcp.tool()
async def get_fix_plan(scan_id: str, api_key: str, severity_filter: str = "all") -> str:
    """
    Get a structured fix plan with before/after code for vulnerabilities in a scan.

    Args:
        scan_id: The scan ID (URL or repo scan)
        api_key: Your Gwangju Security API key (tsec_...)
        severity_filter: 'critical', 'high', 'medium', 'low', or 'all' (default)
    """
    key_row = await _validate_api_key(api_key)
    if not key_row:
        return json.dumps({"error": "Invalid or revoked API key"})
    try:
        # Try URL scan first, then repo scan
        data: dict | None = None
        for path in (f"/scan/{scan_id}", f"/repo-scan/{scan_id}"):
            try:
                data = await _get(path, api_key)
                break
            except Exception:
                continue
        if data is None:
            return json.dumps({"error": f"Scan {scan_id} not found"})

        vulns: list[dict] = data.get("vulnerabilities", [])
        if severity_filter != "all":
            vulns = [v for v in vulns if v.get("severity", "").lower() == severity_filter.lower()]

        fix_items = []
        for v in vulns:
            item: dict[str, Any] = {
                "name": v.get("name"),
                "severity": v.get("severity"),
                "file": v.get("file_path") or v.get("matched_at"),
                "line": v.get("line_number"),
            }
            if v.get("before_code"):
                item["before_code"] = v["before_code"]
            if v.get("after_code"):
                item["after_code"] = v["after_code"]
            if v.get("fix_steps"):
                item["fix_steps"] = v["fix_steps"]
            fix_items.append(item)

        return json.dumps({
            "scan_id": scan_id,
            "total_vulnerabilities": len(fix_items),
            "severity_filter": severity_filter,
            "fix_plan": fix_items,
        })
    except Exception as e:
        return json.dumps({"error": str(e)})


# ═══════════════════════════════════════════════════════════════════════════
# MCP RESOURCES  (auto-context; no api_key required — anonymous summaries)
# ═══════════════════════════════════════════════════════════════════════════

@mcp.resource("trust://scans/latest")
async def resource_latest_scan() -> str:
    """Most recent completed scan — score, grade, and vulnerability count."""
    from app.services.supabase_client import get_supabase_service
    db = get_supabase_service()
    rows = await db.get_recent_scans(limit=1)
    if not rows:
        return json.dumps({"message": "No scans yet"})
    s = rows[0]
    return json.dumps({
        "scan_id": str(s["id"]),
        "target": s["target_url"],
        "score": s["score"],
        "grade": s["grade"],
        "completed_at": s["completed_at"].isoformat() if s.get("completed_at") else None,
        "summary": s.get("summary"),
    })


@mcp.resource("trust://scans/history")
async def resource_scan_history() -> str:
    """Last 10 completed scans with targets, scores, and dates."""
    from app.services.supabase_client import get_supabase_service
    db = get_supabase_service()
    rows = await db.get_recent_scans(limit=10)
    items = [
        {
            "scan_id": str(r["id"]),
            "target": r["target_url"],
            "score": r["score"],
            "grade": r["grade"],
            "completed_at": r["completed_at"].isoformat() if r.get("completed_at") else None,
        }
        for r in rows
    ]
    return json.dumps({"scans": items, "total": len(items)})


@mcp.resource("trust://security/posture")
async def resource_security_posture() -> str:
    """Aggregated security posture — average score, trend, and grade distribution."""
    from app.services.supabase_client import get_supabase_service
    from collections import Counter
    db = get_supabase_service()
    stats = await db.get_benchmark_stats()
    rows = await db.get_recent_scans(limit=20)
    grades = [r["grade"] for r in rows if r.get("grade")]
    grade_dist = dict(Counter(grades))
    scores = [r["score"] for r in rows if r.get("score") is not None]
    trend = "stable"
    if len(scores) >= 4:
        first_half = sum(scores[len(scores)//2:]) / max(1, len(scores) - len(scores)//2)
        second_half = sum(scores[: len(scores)//2]) / max(1, len(scores)//2)
        diff = second_half - first_half
        trend = "improving" if diff > 3 else ("declining" if diff < -3 else "stable")
    return json.dumps({
        "total_scans": stats["total_scans"],
        "avg_score": stats["avg_score"],
        "median_score": stats["median_score"],
        "trend": trend,
        "grade_distribution": grade_dist,
    })
