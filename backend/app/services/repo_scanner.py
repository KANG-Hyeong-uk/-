"""
Trust Backend Repo Scanner Service
Source code scanning: Secret Detection, SAST, SCA (dependency vulnerabilities)
"""

import asyncio
import base64
import json
import os
import re
import shutil
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Optional

import httpx

from app.config import get_settings
from app.logging_config import get_logger

logger = get_logger(__name__)

# ==================== CONFIGURATION ====================

SKIP_DIRS = {
    ".git", "node_modules", "vendor", "__pycache__", ".next",
    "dist", "build", ".venv", "venv", ".tox", ".mypy_cache",
    ".pytest_cache", "coverage", ".nyc_output", "target",
}

SAST_FILE_EXTENSIONS = {
    ".py", ".js", ".ts", ".jsx", ".tsx", ".java", ".go", ".rb", ".php",
}

MAX_FILE_SIZE = 1 * 1024 * 1024  # 1MB
MAX_FILES = 10_000

SECRET_REDUCED_SEVERITY_FILES = {
    ".env.example", ".env.sample", ".env.template",
    "README.md", "CONTRIBUTING.md", "SETUP.md",
}

# ==================== SECRET PATTERNS ====================

SECRET_PATTERNS = [
    {
        "id": "aws-access-key",
        "name": "AWS Access Key ID",
        "regex": r"(?:^|[^A-Za-z0-9/+=])(?:AKIA[0-9A-Z]{16})(?:[^A-Za-z0-9/+=]|$)",
        "severity": "critical",
        "description": "AWS Access Key ID detected. This could allow unauthorized access to AWS services.",
    },
    {
        "id": "aws-secret-key",
        "name": "AWS Secret Access Key",
        "regex": r"(?:aws_secret_access_key|aws_secret_key|secret_access_key)\s*[=:]\s*['\"]?([A-Za-z0-9/+=]{40})['\"]?",
        "severity": "critical",
        "description": "AWS Secret Access Key detected. Rotate immediately.",
    },
    {
        "id": "github-token",
        "name": "GitHub Token",
        "regex": r"(?:ghp_[A-Za-z0-9]{36}|gho_[A-Za-z0-9]{36}|ghu_[A-Za-z0-9]{36}|ghs_[A-Za-z0-9]{36}|ghr_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9]{22}_[A-Za-z0-9]{59})",
        "severity": "critical",
        "description": "GitHub personal access token detected.",
    },
    {
        "id": "openai-api-key",
        "name": "OpenAI API Key",
        "regex": r"sk-[A-Za-z0-9]{20}T3BlbkFJ[A-Za-z0-9]{20}",
        "severity": "high",
        "description": "OpenAI API key detected.",
    },
    {
        "id": "anthropic-api-key",
        "name": "Anthropic API Key",
        "regex": r"sk-ant-api03-[A-Za-z0-9\-_]{93}",
        "severity": "high",
        "description": "Anthropic API key detected.",
    },
    {
        "id": "stripe-secret-key",
        "name": "Stripe Secret Key",
        "regex": r"sk_live_[A-Za-z0-9]{24,}",
        "severity": "critical",
        "description": "Stripe live secret key detected. This could allow financial transactions.",
    },
    {
        "id": "stripe-publishable-key",
        "name": "Stripe Publishable Key (live)",
        "regex": r"pk_live_[A-Za-z0-9]{24,}",
        "severity": "medium",
        "description": "Stripe live publishable key detected.",
    },
    {
        "id": "slack-token",
        "name": "Slack Token",
        "regex": r"xox[baprs]-[A-Za-z0-9\-]{10,250}",
        "severity": "high",
        "description": "Slack API token detected.",
    },
    {
        "id": "discord-token",
        "name": "Discord Bot Token",
        "regex": r"[MN][A-Za-z0-9]{23,}\.[A-Za-z0-9\-_]{6}\.[A-Za-z0-9\-_]{27,}",
        "severity": "high",
        "description": "Discord bot token detected.",
    },
    {
        "id": "google-api-key",
        "name": "Google API Key",
        "regex": r"AIza[0-9A-Za-z\-_]{35}",
        "severity": "high",
        "description": "Google API key detected.",
    },
    {
        "id": "firebase-key",
        "name": "Firebase API Key",
        "regex": r"(?:firebase|FIREBASE).*[=:]\s*['\"]?(AIza[0-9A-Za-z\-_]{35})['\"]?",
        "severity": "high",
        "description": "Firebase API key detected.",
    },
    {
        "id": "supabase-service-role",
        "name": "Supabase Service Role Key",
        "regex": r"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[A-Za-z0-9_-]{50,}\.[A-Za-z0-9_-]{20,}",
        "severity": "critical",
        "description": "Supabase service role key (JWT) detected. This bypasses RLS.",
    },
    {
        "id": "jwt-secret",
        "name": "JWT Secret",
        "regex": r"(?:jwt_secret|JWT_SECRET|jwt_key|JWT_KEY)\s*[=:]\s*['\"]?([A-Za-z0-9\-_+/=]{16,})['\"]?",
        "severity": "high",
        "description": "JWT secret key detected.",
    },
    {
        "id": "private-key-rsa",
        "name": "RSA Private Key",
        "regex": r"-----BEGIN (?:RSA )?PRIVATE KEY-----",
        "severity": "critical",
        "description": "RSA private key detected in source code.",
    },
    {
        "id": "private-key-ssh",
        "name": "SSH Private Key",
        "regex": r"-----BEGIN OPENSSH PRIVATE KEY-----",
        "severity": "critical",
        "description": "SSH private key detected in source code.",
    },
    {
        "id": "database-url",
        "name": "Database Connection String",
        "regex": r"(?:postgres|mysql|mongodb|redis)(?:ql)?://[^\s'\"]{10,}",
        "severity": "critical",
        "description": "Database connection string with credentials detected.",
    },
    {
        "id": "generic-api-key",
        "name": "Generic API Key",
        "regex": r"(?:api_key|apikey|api_secret|apisecret|API_KEY|APIKEY)\s*[=:]\s*['\"]?([A-Za-z0-9\-_]{20,})['\"]?",
        "severity": "medium",
        "description": "Generic API key assignment detected.",
    },
    {
        "id": "generic-secret",
        "name": "Generic Secret",
        "regex": r"(?:secret|SECRET|password|PASSWORD|passwd|PASSWD)\s*[=:]\s*['\"]([^'\"]{8,})['\"]",
        "severity": "medium",
        "description": "Hardcoded secret or password detected.",
    },
    {
        "id": "sendgrid-api-key",
        "name": "SendGrid API Key",
        "regex": r"SG\.[A-Za-z0-9\-_]{22}\.[A-Za-z0-9\-_]{43}",
        "severity": "high",
        "description": "SendGrid API key detected.",
    },
    {
        "id": "twilio-api-key",
        "name": "Twilio API Key",
        "regex": r"SK[0-9a-fA-F]{32}",
        "severity": "high",
        "description": "Twilio API key detected.",
    },
    {
        "id": "heroku-api-key",
        "name": "Heroku API Key",
        "regex": r"(?:HEROKU|heroku).*[=:]\s*['\"]?([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})['\"]?",
        "severity": "medium",
        "description": "Heroku API key detected.",
    },
    {
        "id": "mailgun-api-key",
        "name": "Mailgun API Key",
        "regex": r"key-[0-9a-zA-Z]{32}",
        "severity": "high",
        "description": "Mailgun API key detected.",
    },
]

# Compile regex patterns once
_COMPILED_SECRET_PATTERNS = [
    {**p, "_compiled": re.compile(p["regex"])}
    for p in SECRET_PATTERNS
]

# ==================== SAST PATTERNS ====================

SAST_PATTERNS = [
    {
        "id": "sql-injection",
        "name": "Potential SQL Injection",
        "regex": r"""(?:f['\"]|\.format\().*(?:SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER)\s""",
        "severity": "critical",
        "description": "SQL query constructed with string interpolation. Use parameterized queries.",
        "fix_suggestion": "Use parameterized queries or an ORM instead of string formatting for SQL.",
        "file_types": {".py", ".js", ".ts", ".java", ".go", ".rb", ".php"},
    },
    {
        "id": "xss-innerhtml",
        "name": "Potential XSS (innerHTML)",
        "regex": r"\.innerHTML\s*=",
        "severity": "high",
        "description": "Direct innerHTML assignment may allow XSS attacks.",
        "fix_suggestion": "Use textContent or a DOM API that escapes user input.",
        "file_types": {".js", ".ts", ".jsx", ".tsx"},
    },
    {
        "id": "xss-dangerously-set",
        "name": "Potential XSS (dangerouslySetInnerHTML)",
        "regex": r"dangerouslySetInnerHTML",
        "severity": "high",
        "description": "dangerouslySetInnerHTML can lead to XSS if input is not sanitized.",
        "fix_suggestion": "Sanitize HTML with DOMPurify before using dangerouslySetInnerHTML.",
        "file_types": {".js", ".ts", ".jsx", ".tsx"},
    },
    {
        "id": "xss-v-html",
        "name": "Potential XSS (v-html)",
        "regex": r"v-html\s*=",
        "severity": "high",
        "description": "Vue v-html directive can lead to XSS.",
        "fix_suggestion": "Sanitize content before using v-html or use v-text instead.",
        "file_types": {".js", ".ts", ".vue"},
    },
    {
        "id": "xss-document-write",
        "name": "Potential XSS (document.write)",
        "regex": r"document\.write\s*\(",
        "severity": "high",
        "description": "document.write can lead to XSS attacks.",
        "fix_suggestion": "Use DOM APIs like createElement/appendChild instead.",
        "file_types": {".js", ".ts", ".jsx", ".tsx"},
    },
    {
        "id": "command-injection-os",
        "name": "Command Injection (os.system)",
        "regex": r"os\.system\s*\(",
        "severity": "critical",
        "description": "os.system executes shell commands and is vulnerable to injection.",
        "fix_suggestion": "Use subprocess.run with a list of arguments instead of os.system.",
        "file_types": {".py"},
    },
    {
        "id": "command-injection-subprocess",
        "name": "Command Injection (subprocess shell=True)",
        "regex": r"subprocess\.(?:run|call|Popen|check_output)\s*\(.*shell\s*=\s*True",
        "severity": "critical",
        "description": "subprocess with shell=True is vulnerable to command injection.",
        "fix_suggestion": "Use subprocess.run with a list of arguments and shell=False.",
        "file_types": {".py"},
    },
    {
        "id": "code-injection-eval",
        "name": "Code Injection (eval)",
        "regex": r"(?<!\w)eval\s*\(",
        "severity": "critical",
        "description": "eval() executes arbitrary code and is a security risk.",
        "fix_suggestion": "Avoid eval(). Use ast.literal_eval() for Python or JSON.parse() for JS.",
        "file_types": {".py", ".js", ".ts", ".jsx", ".tsx", ".php"},
    },
    {
        "id": "code-injection-exec",
        "name": "Code Injection (exec)",
        "regex": r"(?<!\w)exec\s*\(",
        "severity": "critical",
        "description": "exec() executes arbitrary code and is a security risk.",
        "fix_suggestion": "Avoid exec(). Find alternative approaches that don't execute dynamic code.",
        "file_types": {".py"},
    },
    {
        "id": "path-traversal",
        "name": "Path Traversal",
        "regex": r"""(?:open|read|write|Path)\s*\(.*\.\./""",
        "severity": "high",
        "description": "Path traversal pattern detected in file operation.",
        "fix_suggestion": "Validate and sanitize file paths. Use os.path.realpath() to resolve paths.",
        "file_types": {".py", ".js", ".ts", ".java", ".go", ".rb", ".php"},
    },
    {
        "id": "insecure-deserialization-pickle",
        "name": "Insecure Deserialization (pickle)",
        "regex": r"pickle\.loads?\s*\(",
        "severity": "critical",
        "description": "pickle.load can execute arbitrary code from untrusted data.",
        "fix_suggestion": "Use json or a safer serialization format instead of pickle.",
        "file_types": {".py"},
    },
    {
        "id": "insecure-deserialization-yaml",
        "name": "Insecure Deserialization (yaml.load)",
        "regex": r"yaml\.load\s*\([^)]*(?!Loader\s*=\s*yaml\.SafeLoader)[^)]*\)",
        "severity": "high",
        "description": "yaml.load without SafeLoader can execute arbitrary code.",
        "fix_suggestion": "Use yaml.safe_load() or yaml.load(data, Loader=yaml.SafeLoader).",
        "file_types": {".py"},
    },
    {
        "id": "hardcoded-password",
        "name": "Hardcoded Password",
        "regex": r"""(?:password|passwd|pwd)\s*=\s*['\"][^'\"]{4,}['\"]""",
        "severity": "medium",
        "description": "Hardcoded password found in source code.",
        "fix_suggestion": "Use environment variables or a secrets manager for passwords.",
        "file_types": {".py", ".js", ".ts", ".java", ".go", ".rb", ".php"},
    },
    {
        "id": "debug-mode-enabled",
        "name": "Debug Mode Enabled",
        "regex": r"(?:DEBUG|debug)\s*=\s*(?:True|true|1)",
        "severity": "medium",
        "description": "Debug mode is enabled, which may expose sensitive information.",
        "fix_suggestion": "Disable debug mode in production. Use environment variables to control it.",
        "file_types": {".py", ".js", ".ts", ".java", ".go", ".rb", ".php"},
    },
    {
        "id": "insecure-http",
        "name": "Insecure HTTP Usage",
        "regex": r"""(?:fetch|requests\.get|requests\.post|axios|http\.get|http\.post|urllib\.request)\s*\(\s*['\"]http://""",
        "severity": "medium",
        "description": "HTTP (not HTTPS) used for network request. Data may be intercepted.",
        "fix_suggestion": "Use HTTPS instead of HTTP for all network requests.",
        "file_types": {".py", ".js", ".ts", ".jsx", ".tsx", ".java", ".go"},
    },
    {
        "id": "weak-crypto-md5",
        "name": "Weak Cryptography (MD5)",
        "regex": r"(?:md5|MD5)\s*\(",
        "severity": "medium",
        "description": "MD5 is cryptographically broken. Do not use for security purposes.",
        "fix_suggestion": "Use SHA-256 or bcrypt for hashing.",
        "file_types": {".py", ".js", ".ts", ".java", ".go", ".rb", ".php"},
    },
    {
        "id": "weak-crypto-sha1",
        "name": "Weak Cryptography (SHA1)",
        "regex": r"(?:sha1|SHA1)\s*\(",
        "severity": "medium",
        "description": "SHA-1 is cryptographically weak. Do not use for security purposes.",
        "fix_suggestion": "Use SHA-256 or SHA-3 for hashing.",
        "file_types": {".py", ".js", ".ts", ".java", ".go", ".rb", ".php"},
    },
]

# Safe patterns for dangerouslySetInnerHTML (static content, not user input)
SAFE_DANGEROUSLY_PATTERNS = [
    r"__html:\s*`[^$]*`",          # Template literal without variable interpolation
    r"__html:\s*['\"][^'\"]*['\"]", # Simple string literal
    r"GoogleAnalytics",             # GA initialization component
    r"JsonLd|json-ld|jsonld",       # JSON-LD structured data
    r"gtag|gtm|analytics",          # Analytics related
]

# Compile SAST patterns
_COMPILED_SAST_PATTERNS = [
    {**p, "_compiled": re.compile(p["regex"], re.IGNORECASE)}
    for p in SAST_PATTERNS
]

# ==================== SCA: DEPENDENCY FILE PARSERS ====================

DEPENDENCY_FILES = {
    "package.json",
    "requirements.txt",
    "Pipfile",
    "go.mod",
    "Gemfile",
    "pom.xml",
    "build.gradle",
    "Cargo.toml",
}


def _parse_package_json(content: str) -> list[dict]:
    """Parse package.json for dependencies."""
    try:
        data = json.loads(content)
    except json.JSONDecodeError:
        return []

    packages = []
    for section in ("dependencies", "devDependencies"):
        deps = data.get(section, {})
        for name, version in deps.items():
            clean_version = re.sub(r"[^0-9.]", "", version)
            if clean_version:
                packages.append({"name": name, "version": clean_version, "ecosystem": "npm"})
    return packages


def _parse_requirements_txt(content: str) -> list[dict]:
    """Parse requirements.txt for dependencies."""
    packages = []
    for line in content.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or line.startswith("-"):
            continue
        match = re.match(r"^([A-Za-z0-9_\-\.]+)\s*(?:==|>=|<=|~=|!=)\s*([0-9][0-9A-Za-z\.\-]*)", line)
        if match:
            packages.append({"name": match.group(1), "version": match.group(2), "ecosystem": "PyPI"})
    return packages


def _parse_go_mod(content: str) -> list[dict]:
    """Parse go.mod for dependencies."""
    packages = []
    in_require = False
    for line in content.splitlines():
        line = line.strip()
        if line.startswith("require ("):
            in_require = True
            continue
        if in_require and line == ")":
            in_require = False
            continue
        if in_require or line.startswith("require "):
            parts = line.replace("require ", "").strip().split()
            if len(parts) >= 2:
                name = parts[0]
                version = parts[1].lstrip("v")
                packages.append({"name": name, "version": version, "ecosystem": "Go"})
    return packages


def _parse_gemfile(content: str) -> list[dict]:
    """Parse Gemfile for dependencies."""
    packages = []
    for line in content.splitlines():
        match = re.match(r"""^\s*gem\s+['\"]([^'\"]+)['\"](?:\s*,\s*['\"]([^'\"]+)['\"])?""", line)
        if match:
            name = match.group(1)
            version = re.sub(r"[^0-9.]", "", match.group(2) or "")
            if version:
                packages.append({"name": name, "version": version, "ecosystem": "RubyGems"})
    return packages


def _parse_cargo_toml(content: str) -> list[dict]:
    """Parse Cargo.toml for dependencies."""
    packages = []
    in_deps = False
    for line in content.splitlines():
        line = line.strip()
        if re.match(r"^\[(?:dev-)?dependencies\]", line):
            in_deps = True
            continue
        if line.startswith("[") and in_deps:
            in_deps = False
            continue
        if in_deps:
            match = re.match(r'^([A-Za-z0-9_\-]+)\s*=\s*["\']([0-9][^"\']*)["\']', line)
            if match:
                packages.append({"name": match.group(1), "version": match.group(2), "ecosystem": "crates.io"})
    return packages


DEPENDENCY_PARSERS = {
    "package.json": _parse_package_json,
    "requirements.txt": _parse_requirements_txt,
    "go.mod": _parse_go_mod,
    "Gemfile": _parse_gemfile,
    "Cargo.toml": _parse_cargo_toml,
}


# ==================== SCORE CALCULATION ====================

REPO_SEVERITY_CONFIG = {
    "critical": {"base": 25, "cap": 50},
    "high":     {"base": 15, "cap": 30},
    "medium":   {"base": 5,  "cap": 15},
    "low":      {"base": 2,  "cap": 6},
}

INFO_PATTERN_DEDUCTIONS = {
    "debug-mode": 3,
    "insecure-http": 2,
}


def _location_weight(num_locations: int) -> float:
    """1 loc = 1.0x, +0.2x per additional location, max 2.0x"""
    return min(1.0 + 0.2 * (num_locations - 1), 2.0)


def calculate_repo_score(vulnerabilities: list[dict]) -> tuple[int, str, list[dict]]:
    """Calculate security score, grade, and score breakdown from vulnerabilities.

    Uses weighted deductions with location multiplier and per-severity caps,
    aligned with the URL Scan scoring in nuclei_scanner.py.
    """
    score = 100.0
    severity_totals: dict[str, float] = {s: 0.0 for s in REPO_SEVERITY_CONFIG}
    score_breakdown: list[dict] = []

    for vuln in vulnerabilities:
        severity = vuln.get("severity", "info").lower()
        pattern_id = vuln.get("pattern_id", "")
        location_count = vuln.get("location_count", 1)

        if severity == "info":
            deduction = float(INFO_PATTERN_DEDUCTIONS.get(pattern_id, 0))
            if deduction > 0:
                score -= deduction
                score_breakdown.append({
                    "name": vuln.get("name", ""),
                    "pattern_id": pattern_id,
                    "severity": severity,
                    "base_deduction": deduction,
                    "location_weight": 1.0,
                    "raw_deduction": deduction,
                    "capped_deduction": deduction,
                    "location_count": location_count,
                })
            continue

        config = REPO_SEVERITY_CONFIG.get(severity)
        if not config:
            continue

        weight = _location_weight(location_count)
        raw_deduction = config["base"] * weight
        cap = config["cap"]

        # Apply per-severity cap
        remaining_cap = cap - severity_totals[severity]
        if remaining_cap <= 0:
            capped_deduction = 0.0
        else:
            capped_deduction = min(raw_deduction, remaining_cap)

        severity_totals[severity] += capped_deduction
        score -= capped_deduction

        score_breakdown.append({
            "name": vuln.get("name", ""),
            "pattern_id": pattern_id,
            "severity": severity,
            "base_deduction": config["base"],
            "location_weight": round(weight, 2),
            "raw_deduction": round(raw_deduction, 2),
            "capped_deduction": round(capped_deduction, 2),
            "location_count": location_count,
        })

    score = max(0, int(round(score)))

    if score >= 90:
        grade = "A"
    elif score >= 80:
        grade = "B+"
    elif score >= 70:
        grade = "B"
    elif score >= 60:
        grade = "B-"
    elif score >= 50:
        grade = "C"
    elif score >= 40:
        grade = "D"
    else:
        grade = "F"

    return score, grade, score_breakdown


# ==================== UTILITY ====================

def _mask_secret(value: str) -> str:
    """Mask a secret value, showing only first/last 4 chars."""
    if len(value) <= 8:
        return "*" * len(value)
    return value[:4] + "*" * (len(value) - 8) + value[-4:]


def _get_code_snippet(lines: list[str], line_idx: int, context: int = 1) -> str:
    """Get code snippet around a line with context."""
    start = max(0, line_idx - context)
    end = min(len(lines), line_idx + context + 1)
    snippet_lines = []
    for i in range(start, end):
        prefix = ">>> " if i == line_idx else "    "
        snippet_lines.append(f"{prefix}{i + 1}: {lines[i]}")
    return "\n".join(snippet_lines)


def _classify_supabase_jwt(token: str) -> tuple[str, str, str]:
    """Classify a Supabase JWT by decoding payload to determine role."""
    try:
        parts = token.split(".")
        if len(parts) < 2:
            raise ValueError("Invalid JWT format")
        payload_b64 = parts[1]
        # Add padding for base64url decoding
        payload_b64 += "=" * (-len(payload_b64) % 4)
        payload_bytes = base64.urlsafe_b64decode(payload_b64)
        payload = json.loads(payload_bytes)
        role = payload.get("role", "")

        if role == "service_role":
            return (
                "Supabase Service Role Key",
                "critical",
                "Supabase service_role key detected. This bypasses ALL RLS policies.",
            )
        elif role == "anon":
            return (
                "Supabase Anon Key (Public)",
                "low",
                "Supabase anon key detected. This is a public client key (RLS still applies), but hardcoding keys is not recommended. Use environment variables.",
            )
        else:
            return (
                f"Supabase JWT Key (role: {role})",
                "high",
                f"Supabase JWT with role '{role}' detected.",
            )
    except Exception:
        return (
            "Supabase JWT Key",
            "high",
            "Supabase JWT detected but could not determine role.",
        )


def _should_reduce_secret_severity(file_path: str) -> bool:
    """Reduce severity for secrets found in documentation/example files."""
    filename = Path(file_path).name
    if filename in SECRET_REDUCED_SEVERITY_FILES:
        return True
    if ("docs/" in file_path or "/docs/" in file_path) and file_path.endswith(".md"):
        return True
    return False


def _is_safe_dangerously_set_inner_html(lines: list[str], line_idx: int) -> bool:
    """Check if dangerouslySetInnerHTML usage is a safe pattern (static content)."""
    start = max(0, line_idx - 5)
    end = min(len(lines), line_idx + 6)
    context = "\n".join(lines[start:end])

    for safe_pattern in SAFE_DANGEROUSLY_PATTERNS:
        if re.search(safe_pattern, context, re.IGNORECASE):
            return True

    current_line = lines[line_idx]
    # Dynamic variable usage → dangerous
    if re.search(r"__html:\s*(?:props\.|state\.|data\.|response|fetch|input|user)", current_line):
        return False
    # Template literal with interpolation → dangerous
    if re.search(r"__html:\s*`[^`]*\$\{", current_line):
        return False

    return False  # Default to dangerous (conservative)


# ==================== MAIN SCANNER CLASS ====================

class RepoScanner:
    """GitHub repository security scanner."""

    def __init__(self, repo_url: str, branch: Optional[str] = None, scan_type: str = "full"):
        self.repo_url = repo_url
        self.branch = branch
        self.scan_type = scan_type
        self.settings = get_settings()
        self.temp_dir: Optional[str] = None
        self.vulnerabilities: list[dict] = []
        self.files_scanned = 0
        self.commit_hash: Optional[str] = None

    async def run(self) -> dict:
        """Run the full scan and return results."""
        self.temp_dir = tempfile.mkdtemp(prefix="trust_repo_")

        try:
            # Clone repository
            await self._clone_repo()

            # Get commit hash
            await self._get_commit_hash()

            # Collect scannable files
            files = self._collect_files()
            self.files_scanned = len(files)
            logger.info(f"Collected {self.files_scanned} files to scan in {self.repo_url}")

            # Run scans based on type
            if self.scan_type in ("full", "secrets"):
                await self._scan_secrets(files)

            if self.scan_type in ("full", "sast"):
                await self._scan_sast(files)

            if self.scan_type in ("full", "sca"):
                await self._scan_sca()

            # Deduplicate vulnerabilities
            self._deduplicate_vulnerabilities()

            # Enrich vulnerabilities with full file content for AI analysis
            self._enrich_with_file_content()

            # Calculate score
            score, grade, score_breakdown = calculate_repo_score(self.vulnerabilities)

            # Build summary
            summary = self._build_summary()

            return {
                "vulnerabilities": self.vulnerabilities,
                "score": score,
                "grade": grade,
                "score_breakdown": score_breakdown,
                "summary": summary,
                "files_scanned": self.files_scanned,
                "commit_hash": self.commit_hash,
                "branch": self.branch,
            }

        finally:
            # Always cleanup temp directory
            if self.temp_dir and os.path.exists(self.temp_dir):
                shutil.rmtree(self.temp_dir, ignore_errors=True)

    MAX_FILE_CONTENT_SIZE = 100 * 1024  # 100KB limit for file content enrichment

    def _enrich_with_file_content(self) -> None:
        """Read full file content for each vulnerability's file_path.

        Adds 'file_content' and 'file_language' keys to each vulnerability dict.
        Skips files larger than 100KB. Must be called while temp_dir still exists.
        """
        if not self.temp_dir:
            return

        # Cache already-read files to avoid duplicate reads
        file_cache: dict[str, tuple[str | None, str]] = {}

        for vuln in self.vulnerabilities:
            file_path = vuln.get("file_path")
            if not file_path:
                continue

            if file_path in file_cache:
                content, lang = file_cache[file_path]
            else:
                abs_path = os.path.join(self.temp_dir, file_path)
                content = None
                lang = self._detect_language(file_path)
                try:
                    size = os.path.getsize(abs_path)
                    if size <= self.MAX_FILE_CONTENT_SIZE:
                        with open(abs_path, "r", encoding="utf-8", errors="ignore") as f:
                            content = f.read()
                except (OSError, IOError):
                    pass
                file_cache[file_path] = (content, lang)

            if content is not None:
                vuln["file_content"] = content
                vuln["file_language"] = lang

        enriched = sum(1 for v in self.vulnerabilities if v.get("file_content"))
        logger.info(f"Enriched {enriched}/{len(self.vulnerabilities)} vulnerabilities with file content")

    @staticmethod
    def _detect_language(file_path: str) -> str:
        """Detect programming language from file extension."""
        ext_map = {
            ".py": "python", ".js": "javascript", ".ts": "typescript",
            ".jsx": "jsx", ".tsx": "tsx", ".java": "java", ".go": "go",
            ".rb": "ruby", ".php": "php", ".rs": "rust", ".c": "c",
            ".cpp": "cpp", ".cs": "csharp", ".swift": "swift",
            ".kt": "kotlin", ".json": "json", ".yaml": "yaml",
            ".yml": "yaml", ".toml": "toml", ".xml": "xml",
            ".html": "html", ".css": "css", ".sql": "sql",
            ".sh": "bash", ".md": "markdown",
        }
        ext = os.path.splitext(file_path)[1].lower()
        return ext_map.get(ext, "text")

    async def _clone_repo(self) -> None:
        """Clone the repository with depth 1.

        If branch is None, clones the repo's default branch (HEAD).
        After cloning, detects the actual branch name for record-keeping.
        """
        clone_url = self.repo_url
        if not clone_url.startswith("https://"):
            clone_url = f"https://github.com/{clone_url}"
        if not clone_url.endswith(".git"):
            clone_url = f"{clone_url}.git"

        # Build clone command — omit --branch when None to use repo default
        cmd = ["git", "clone", "--depth", "1"]
        if self.branch:
            cmd += ["--branch", self.branch]

        # Add token for private repos if available
        if self.settings.github_token:
            token_url = clone_url.replace("https://", f"https://x-access-token:{self.settings.github_token}@")
            cmd += [token_url, self.temp_dir]
        else:
            cmd += [clone_url, self.temp_dir]

        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(
            proc.communicate(),
            timeout=120,
        )

        if proc.returncode != 0:
            error_msg = stderr.decode("utf-8", errors="ignore").strip()
            raise Exception(f"Failed to clone repository: {error_msg}")

        # If no branch was specified, detect the actual default branch
        if not self.branch:
            branch_proc = await asyncio.create_subprocess_exec(
                "git", "rev-parse", "--abbrev-ref", "HEAD",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=self.temp_dir,
            )
            branch_stdout, _ = await branch_proc.communicate()
            if branch_proc.returncode == 0:
                self.branch = branch_stdout.decode("utf-8").strip()

    async def _get_commit_hash(self) -> None:
        """Get the HEAD commit hash."""
        proc = await asyncio.create_subprocess_exec(
            "git", "rev-parse", "HEAD",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=self.temp_dir,
        )
        stdout, _ = await proc.communicate()
        if proc.returncode == 0:
            self.commit_hash = stdout.decode("utf-8").strip()

    def _collect_files(self) -> list[Path]:
        """Collect all scannable files from the cloned repo."""
        files = []
        repo_path = Path(self.temp_dir)

        for root, dirs, filenames in os.walk(repo_path):
            # Skip directories
            dirs[:] = [d for d in dirs if d not in SKIP_DIRS]

            for filename in filenames:
                if len(files) >= MAX_FILES:
                    return files

                file_path = Path(root) / filename
                try:
                    if file_path.stat().st_size > MAX_FILE_SIZE:
                        continue
                except OSError:
                    continue

                files.append(file_path)

        return files

    async def _scan_secrets(self, files: list[Path]) -> None:
        """Scan files for hardcoded secrets. Uses Gitleaks if available, falls back to regex."""
        if shutil.which("gitleaks"):
            logger.info("Using Gitleaks engine for secret detection")
            await self._scan_secrets_gitleaks()
            return

        logger.info("Gitleaks not found, falling back to regex-based secret detection")
        await self._scan_secrets_regex(files)

    async def _scan_secrets_gitleaks(self) -> None:
        """Scan for secrets using Gitleaks CLI."""
        report_path = f"/tmp/trust_scans/{id(self)}_gitleaks.json"

        try:
            proc = await asyncio.create_subprocess_exec(
                "gitleaks", "dir", self.temp_dir,
                "--report-format", "json",
                "--report-path", report_path,
                "--no-banner",
                "--exit-code", "0",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=300)

            if proc.returncode not in (0, 1):
                logger.warning(f"Gitleaks exited with code {proc.returncode}: {stderr.decode('utf-8', errors='ignore')}")
                return

            # Parse report JSON
            report_file = Path(report_path)
            if not report_file.exists() or report_file.stat().st_size == 0:
                logger.info("Gitleaks found no secrets")
                return

            findings = json.loads(report_file.read_text(encoding="utf-8"))
            if not isinstance(findings, list):
                return

            logger.info(f"Gitleaks found {len(findings)} potential secrets")

            for finding in findings:
                rule_id = finding.get("RuleID", "unknown")
                description = finding.get("Description", rule_id)
                file_path = finding.get("File", "")
                line_number = finding.get("StartLine", 0)
                secret = finding.get("Secret", "")
                match_text = finding.get("Match", "")

                # Build relative path (gitleaks returns path relative to scanned dir)
                rel_path = file_path

                # Determine severity based on RuleID
                rule_lower = rule_id.lower()
                if "private-key" in rule_lower or "service-role" in rule_lower:
                    severity = "critical"
                else:
                    severity = "high"

                # Reduce severity for example/doc files
                if _should_reduce_secret_severity(rel_path):
                    severity = "info"
                    description += " (Found in documentation/example file - may be a placeholder.)"

                # Mask the secret in the snippet
                masked_secret = _mask_secret(secret) if secret else ""
                code_snippet = match_text.replace(secret, masked_secret) if secret and match_text else match_text

                self.vulnerabilities.append({
                    "vuln_type": "secret",
                    "name": description,
                    "severity": severity,
                    "file_path": rel_path,
                    "line_number": line_number,
                    "code_snippet": code_snippet,
                    "description": f"Secret detected by Gitleaks rule '{rule_id}'. {description}",
                    "fix_suggestion": "Remove the secret from source code and rotate the credential. Use environment variables or a secrets manager instead.",
                    "pattern_id": rule_id,
                    "package_name": None,
                    "installed_version": None,
                    "fixed_version": None,
                    "cve_id": None,
                })

        except asyncio.TimeoutError:
            logger.warning("Gitleaks scan timed out")
        except Exception as e:
            logger.warning(f"Gitleaks scan failed: {e}")
        finally:
            # Cleanup report file
            try:
                Path(report_path).unlink(missing_ok=True)
            except Exception:
                pass

    async def _scan_secrets_regex(self, files: list[Path]) -> None:
        """Scan files for hardcoded secrets using regex patterns (fallback)."""
        for file_path in files:
            try:
                content = file_path.read_text(encoding="utf-8", errors="ignore")
            except Exception:
                continue

            lines = content.splitlines()
            rel_path = str(file_path.relative_to(self.temp_dir))

            for pattern in _COMPILED_SECRET_PATTERNS:
                for line_idx, line in enumerate(lines):
                    match = pattern["_compiled"].search(line)
                    if match:
                        matched_text = match.group(0)
                        snippet = _get_code_snippet(lines, line_idx)
                        # Mask the secret in the snippet
                        masked_snippet = snippet.replace(matched_text, _mask_secret(matched_text))

                        # Classify Supabase JWT by decoding payload
                        name = pattern["name"]
                        severity = pattern["severity"]
                        description = pattern["description"]

                        if pattern["id"] == "supabase-service-role":
                            name, severity, description = _classify_supabase_jwt(matched_text)

                        if _should_reduce_secret_severity(rel_path):
                            severity = "info"
                            description += " (Found in documentation/example file - may be a placeholder.)"

                        self.vulnerabilities.append({
                            "vuln_type": "secret",
                            "name": name,
                            "severity": severity,
                            "file_path": rel_path,
                            "line_number": line_idx + 1,
                            "code_snippet": masked_snippet,
                            "description": description,
                            "pattern_id": pattern["id"],
                        })
                        # One match per pattern per file is enough
                        break

    async def _scan_sast(self, files: list[Path]) -> None:
        """Run SAST analysis. Uses Semgrep if available, falls back to regex patterns."""
        if shutil.which("semgrep"):
            logger.info("Semgrep found — using Semgrep engine for SAST analysis")
            try:
                await self._scan_sast_semgrep()
                return
            except Exception as e:
                logger.warning(f"Semgrep scan failed, falling back to regex patterns: {e}")
        else:
            logger.info("Semgrep not installed — using built-in regex patterns for SAST analysis")

        await self._scan_sast_regex(files)

    async def _scan_sast_semgrep(self) -> None:
        """Run SAST analysis using Semgrep CLI."""
        output_file = os.path.join(tempfile.gettempdir(), f"semgrep_{id(self)}.json")

        try:
            cmd = [
                "semgrep", "scan",
                "--config", "p/default",
                "--config", "p/owasp-top-ten",
                "--config", "p/javascript",
                "--config", "p/typescript",
                "--config", "p/python",
                "--json",
                "--output", output_file,
                "--no-git-ignore",
                "--timeout", "60",
                self.temp_dir,
            ]

            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await asyncio.wait_for(
                proc.communicate(),
                timeout=300,
            )

            # exit code 0 = no findings, 1 = findings found (not an error)
            if proc.returncode not in (0, 1):
                error_msg = stderr.decode("utf-8", errors="ignore").strip()
                raise RuntimeError(f"Semgrep exited with code {proc.returncode}: {error_msg}")

            # Parse JSON output
            if not os.path.exists(output_file):
                logger.warning("Semgrep output file not found, no results to parse")
                return

            with open(output_file, "r", encoding="utf-8") as f:
                semgrep_data = json.load(f)

            results = semgrep_data.get("results", [])
            logger.info(f"Semgrep found {len(results)} findings")

            for result in results:
                self._convert_semgrep_result(result)

        finally:
            if os.path.exists(output_file):
                os.remove(output_file)

    def _convert_semgrep_result(self, result: dict) -> None:
        """Convert a single Semgrep result to our vulnerability dict format."""
        extra = result.get("extra", {})
        metadata = extra.get("metadata", {})

        # Severity mapping
        semgrep_severity = extra.get("severity", "WARNING").upper()
        severity = self._map_semgrep_severity(semgrep_severity, metadata)

        # Extract CWE for the name
        cwe_list = metadata.get("cwe", [])
        if isinstance(cwe_list, str):
            cwe_list = [cwe_list]
        cwe_str = ""
        if cwe_list:
            first_cwe = cwe_list[0]
            cwe_match = re.match(r"(CWE-\d+)", first_cwe)
            if cwe_match:
                cwe_str = f" ({cwe_match.group(1)})"

        check_id = result.get("check_id", "unknown")
        # Derive a readable name from check_id
        name_parts = check_id.rsplit(".", 1)
        readable_name = name_parts[-1].replace("-", " ").replace("_", " ").title()
        name = f"{readable_name}{cwe_str}"

        # File path — make relative to repo root
        abs_path = result.get("path", "")
        if self.temp_dir and abs_path.startswith(self.temp_dir):
            rel_path = abs_path[len(self.temp_dir):].lstrip("/")
        else:
            rel_path = abs_path

        # Code snippet — Semgrep extra.lines may be empty or contain
        # placeholder text (e.g. "requires login") when rules need auth.
        # Fall back to reading the actual source file.
        code_snippet = extra.get("lines", "").strip()
        _suspicious = not code_snippet or code_snippet.lower() in (
            "requires login", "login required", "",
        ) or len(code_snippet) < 5

        if _suspicious and abs_path and os.path.isfile(abs_path):
            try:
                with open(abs_path, "r", encoding="utf-8", errors="ignore") as f:
                    file_lines = f.readlines()
                line_num = result.get("start", {}).get("line", 0)
                if 0 < line_num <= len(file_lines):
                    code_snippet = _get_code_snippet(
                        [l.rstrip("\n") for l in file_lines],
                        line_num - 1,
                        context=2,
                    )
            except Exception:
                pass  # keep original snippet

        # Fix suggestion
        fix = extra.get("fix", "")
        fix_suggestion = fix if fix else metadata.get("fix", "Review and remediate this finding.")

        self.vulnerabilities.append({
            "vuln_type": "sast",
            "name": name,
            "severity": severity,
            "file_path": rel_path,
            "line_number": result.get("start", {}).get("line", 0),
            "code_snippet": code_snippet,
            "description": extra.get("message", ""),
            "fix_suggestion": fix_suggestion,
            "pattern_id": check_id,
            "package_name": None,
            "installed_version": None,
            "fixed_version": None,
            "cve_id": None,
        })

    @staticmethod
    def _map_semgrep_severity(semgrep_severity: str, metadata: dict) -> str:
        """Map Semgrep severity to our severity levels."""
        impact = metadata.get("impact", "").upper()
        confidence = metadata.get("confidence", "").upper()
        cwe_list = metadata.get("cwe", [])
        if isinstance(cwe_list, str):
            cwe_list = [cwe_list]

        # Critical CWEs that warrant "critical" severity when high-impact + high-confidence
        critical_cwes = {"CWE-78", "CWE-89", "CWE-94", "CWE-502"}
        for cwe_entry in cwe_list:
            for critical_cwe in critical_cwes:
                if critical_cwe in cwe_entry:
                    if semgrep_severity == "ERROR" and impact == "HIGH" and confidence == "HIGH":
                        return "critical"

        severity_map = {
            "ERROR": "high",
            "WARNING": "medium",
            "INFO": "low",
        }
        return severity_map.get(semgrep_severity, "medium")

    async def _scan_sast_regex(self, files: list[Path]) -> None:
        """Run SAST analysis using built-in regex patterns (fallback)."""
        for file_path in files:
            ext = file_path.suffix.lower()
            if ext not in SAST_FILE_EXTENSIONS:
                continue

            try:
                content = file_path.read_text(encoding="utf-8", errors="ignore")
            except Exception:
                continue

            lines = content.splitlines()
            rel_path = str(file_path.relative_to(self.temp_dir))

            for pattern in _COMPILED_SAST_PATTERNS:
                # Only check patterns relevant to this file type
                if ext not in pattern.get("file_types", SAST_FILE_EXTENSIONS):
                    continue

                for line_idx, line in enumerate(lines):
                    match = pattern["_compiled"].search(line)
                    if match:
                        snippet = _get_code_snippet(lines, line_idx)

                        # Context analysis for dangerouslySetInnerHTML
                        sast_severity = pattern["severity"]
                        sast_description = pattern["description"]

                        if pattern["id"] == "xss-dangerously-set":
                            if _is_safe_dangerously_set_inner_html(lines, line_idx):
                                sast_severity = "info"
                                sast_description = (
                                    "dangerouslySetInnerHTML used with static content (likely safe). "
                                    "Verify no user input flows into this value."
                                )

                        self.vulnerabilities.append({
                            "vuln_type": "sast",
                            "name": pattern["name"],
                            "severity": sast_severity,
                            "file_path": rel_path,
                            "line_number": line_idx + 1,
                            "code_snippet": snippet,
                            "description": sast_description,
                            "fix_suggestion": pattern.get("fix_suggestion"),
                            "pattern_id": pattern["id"],
                        })
                        # One match per pattern per file
                        break

    async def _scan_sca(self) -> None:
        """Scan dependency files for known vulnerabilities using OSV.dev API."""
        repo_path = Path(self.temp_dir)

        for dep_file in DEPENDENCY_FILES:
            # Find all instances of the dependency file
            for found_path in repo_path.rglob(dep_file):
                # Skip files in skipped directories
                rel_parts = found_path.relative_to(repo_path).parts
                if any(part in SKIP_DIRS for part in rel_parts):
                    continue

                try:
                    content = found_path.read_text(encoding="utf-8", errors="ignore")
                except Exception:
                    continue

                parser = DEPENDENCY_PARSERS.get(dep_file)
                if not parser:
                    continue

                packages = parser(content)
                if not packages:
                    continue

                rel_path = str(found_path.relative_to(self.temp_dir))
                await self._check_osv(packages, rel_path)

    async def _check_osv(self, packages: list[dict], file_path: str) -> None:
        """Check packages against OSV.dev API for known vulnerabilities."""
        async with httpx.AsyncClient(timeout=30) as client:
            for pkg in packages:
                try:
                    payload = {
                        "version": pkg["version"],
                        "package": {
                            "name": pkg["name"],
                            "ecosystem": pkg["ecosystem"],
                        },
                    }
                    resp = await client.post(
                        "https://api.osv.dev/v1/query",
                        json=payload,
                    )
                    if resp.status_code != 200:
                        continue

                    data = resp.json()
                    vulns = data.get("vulns", [])

                    for osv_vuln in vulns:
                        # Determine severity from database_specific or severity field
                        severity = "medium"
                        if osv_vuln.get("database_specific", {}).get("severity"):
                            sev = osv_vuln["database_specific"]["severity"].lower()
                            if sev in ("critical", "high", "medium", "low"):
                                severity = sev
                        elif osv_vuln.get("severity"):
                            for s in osv_vuln["severity"]:
                                if s.get("type") == "CVSS_V3":
                                    cvss_score = float(s.get("score", "0").split("/")[0]) if "/" in str(s.get("score", "")) else 0
                                    if not cvss_score and isinstance(s.get("score"), str):
                                        # Try to parse CVSS vector
                                        pass
                                    if cvss_score >= 9.0:
                                        severity = "critical"
                                    elif cvss_score >= 7.0:
                                        severity = "high"
                                    elif cvss_score >= 4.0:
                                        severity = "medium"
                                    else:
                                        severity = "low"

                        # Extract CVE ID
                        cve_id = None
                        for alias in osv_vuln.get("aliases", []):
                            if alias.startswith("CVE-"):
                                cve_id = alias
                                break

                        # Extract fixed version
                        fixed_version = None
                        for affected in osv_vuln.get("affected", []):
                            for rng in affected.get("ranges", []):
                                for event in rng.get("events", []):
                                    if "fixed" in event:
                                        fixed_version = event["fixed"]

                        vuln_name = osv_vuln.get("summary", osv_vuln.get("id", "Unknown vulnerability"))

                        self.vulnerabilities.append({
                            "vuln_type": "sca",
                            "name": vuln_name,
                            "severity": severity,
                            "file_path": file_path,
                            "description": osv_vuln.get("details", "")[:500],
                            "package_name": pkg["name"],
                            "installed_version": pkg["version"],
                            "fixed_version": fixed_version,
                            "cve_id": cve_id,
                        })

                except httpx.TimeoutException:
                    logger.warning(f"OSV API timeout for {pkg['name']}")
                except Exception as e:
                    logger.warning(f"OSV API error for {pkg['name']}: {e}")

    def _deduplicate_vulnerabilities(self) -> None:
        """Deduplicate vulnerabilities by pattern_id (secret/sast) or cve_id/name (sca).

        Groups findings, keeps highest severity, aggregates file locations.
        """
        SEVERITY_ORDER = {"critical": 4, "high": 3, "medium": 2, "low": 1, "info": 0}
        groups: dict[str, list[dict]] = {}

        for vuln in self.vulnerabilities:
            vuln_type = vuln.get("vuln_type", "")
            if vuln_type in ("secret", "sast"):
                dedup_key = f"{vuln_type}:{vuln.get('pattern_id', '')}"
            elif vuln_type == "sca":
                cve_id = vuln.get("cve_id")
                dedup_key = f"sca:{cve_id}" if cve_id else f"sca:name:{vuln.get('name', '')}"
            else:
                dedup_key = f"other:{id(vuln)}"

            groups.setdefault(dedup_key, []).append(vuln)

        deduped: list[dict] = []
        for _key, vulns in groups.items():
            # Use first finding as base
            base = dict(vulns[0])

            # Keep highest severity
            best_severity = max(
                (v.get("severity", "info").lower() for v in vulns),
                key=lambda s: SEVERITY_ORDER.get(s, 0),
            )
            base["severity"] = best_severity

            # Aggregate locations
            locations: list[str] = []
            seen_locations: set[str] = set()
            for v in vulns:
                file_path = v.get("file_path", "")
                line_number = v.get("line_number", "")
                loc = f"{file_path}:{line_number}" if line_number else file_path
                if loc not in seen_locations:
                    seen_locations.add(loc)
                    locations.append(loc)

            base["matched_locations"] = locations
            base["location_count"] = len(locations)

            deduped.append(base)

        self.vulnerabilities = deduped

    def _build_summary(self) -> dict:
        """Build vulnerability summary counts."""
        summary = {
            "critical": 0, "high": 0, "medium": 0, "low": 0, "info": 0,
            "secrets": 0, "sast": 0, "sca": 0,
        }
        for vuln in self.vulnerabilities:
            severity = vuln.get("severity", "info").lower()
            if severity in summary:
                summary[severity] += 1
            vuln_type = vuln.get("vuln_type", "")
            if vuln_type == "secret":
                summary["secrets"] += 1
            elif vuln_type == "sast":
                summary["sast"] += 1
            elif vuln_type == "sca":
                summary["sca"] += 1
        return summary
