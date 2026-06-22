"""
Shared pytest fixtures for Trust Backend tests.
"""

import pytest


@pytest.fixture
def sample_vulnerability():
    """A single sample vulnerability dict as returned by NucleiScanner._parse_results."""
    return {
        "template_id": "xss-reflected",
        "name": "Reflected XSS",
        "severity": "high",
        "matched_at": "https://example.com/search?q=<script>",
        "matched_locations": ["https://example.com/search?q=<script>"],
        "extracted_results": ["<script>alert(1)</script>"],
        "host": "https://example.com",
        "type": "http",
        "matcher_name": "",
        "description": "Reflected cross-site scripting vulnerability",
        "reference": ["https://owasp.org/www-community/attacks/xss/"],
        "tags": ["xss", "injection"],
    }


@pytest.fixture
def sample_vulnerabilities():
    """A mixed list of vulnerabilities for score calculation tests."""
    return [
        {"severity": "critical", "template_id": "rce-command-injection"},
        {"severity": "critical", "template_id": "rce-deserialization"},
        {"severity": "critical", "template_id": "rce-ssti"},
        {"severity": "high", "template_id": "sqli-error-based"},
        {"severity": "high", "template_id": "sqli-blind"},
        {"severity": "high", "template_id": "ssrf-internal"},
        {"severity": "medium", "template_id": "open-redirect-host"},
        {"severity": "medium", "template_id": "cors-misconfiguration"},
        {"severity": "medium", "template_id": "directory-listing"},
        {"severity": "medium", "template_id": "clickjacking"},
        {"severity": "low", "template_id": "cookie-without-secure"},
        {"severity": "low", "template_id": "cookie-without-httponly"},
        {"severity": "low", "template_id": "x-powered-by"},
        {"severity": "low", "template_id": "server-header"},
        {"severity": "info", "template_id": "tech-detect-nginx"},
        {"severity": "info", "template_id": "waf-detect"},
    ]


@pytest.fixture
def sample_scan_result():
    """A sample scan DB record."""
    return {
        "id": "scan-uuid-1234",
        "target_url": "https://example.com",
        "scan_mode": "quick",
        "status": "completed",
        "score": 72,
        "grade": "B",
        "summary": {"critical": 0, "high": 1, "medium": 2, "low": 1, "info": 3},
        "created_at": "2026-01-15T10:00:00+00:00",
        "completed_at": "2026-01-15T10:05:00+00:00",
        "started_at": "2026-01-15T10:00:01+00:00",
        "error_message": None,
    }


@pytest.fixture
def sample_nuclei_jsonl_lines():
    """Sample JSONL lines as Nuclei would output."""
    return [
        '{"template-id":"xss-reflected","info":{"name":"Reflected XSS","severity":"high","description":"XSS vuln","reference":["https://owasp.org"],"tags":["xss"]},"matched-at":"https://example.com/q","host":"https://example.com","type":"http","matcher-name":"body","extracted-results":["<script>"]}',
        '{"template-id":"tech-detect","info":{"name":"Nginx Detection","severity":"info","description":"","reference":[],"tags":["tech"]},"matched-at":"https://example.com","host":"https://example.com","type":"http","matcher-name":"header","extracted-results":[]}',
        'this is not valid json',
        '',
        '{"template-id":"sqli-error","info":{"name":"SQL Injection","severity":"critical","description":"SQL injection found","reference":[],"tags":["sqli"]},"matched-at":"https://example.com/login","host":"https://example.com","type":"http","matcher-name":"body","extracted-results":["error in your SQL syntax"]}',
    ]


@pytest.fixture
def sample_claude_json_response():
    """A well-formed JSON response from Claude analysis."""
    return '''{
  "description": "This is a reflected XSS vulnerability where user input is rendered in HTML without sanitization.",
  "impact": "An attacker can inject malicious scripts to steal user sessions or perform actions on behalf of the victim.",
  "category": "exposure",
  "before_code": "<div>{user_input}</div>",
  "after_code": "<div>{escape(user_input)}</div>",
  "fix_steps": ["Apply input escaping/sanitization", "Set Content-Security-Policy header", "Re-scan to verify the fix"],
  "fix_complexity": "simple",
  "references": ["https://owasp.org/www-community/attacks/xss/"]
}'''
