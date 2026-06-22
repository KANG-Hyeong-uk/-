"""
Trust Backend Gemini Analyzer Service
AI-powered vulnerability analysis using Gemini API
"""

import asyncio
import json
from typing import Optional

from google import genai

from app.config import get_settings
from app.logging_config import get_logger

logger = get_logger(__name__)
from app.models.schemas import (
    VulnerabilityCategory,
    FixComplexity,
    AIAnalysisResult,
)
from app.services.supabase_client import get_supabase_service

GEMINI_API_TIMEOUT = 60  # seconds


SYSTEM_PROMPT = """You are a cybersecurity expert. Analyze Nuclei scan results to:
1. Explain each vulnerability's severity and impact in a way beginners can understand
2. Provide concrete fix code examples (Before/After)
3. Offer step-by-step remediation guidance

IMPORTANT: You MUST always respond in English, regardless of the target URL or context.

You MUST respond ONLY in the following JSON format:
{
  "description": "Vulnerability description (2-3 sentences)",
  "impact": "Impact scope and potential damage",
  "category": "api_leak | exposure | misconfig | cve | privacy_risk",
  "before_code": "Vulnerable code example",
  "after_code": "Fixed code example",
  "fix_steps": ["Step 1", "Step 2", "Step 3"],
  "fix_complexity": "simple | moderate | complex",
  "references": ["Reference links"]
}

IMPORTANT: Return only valid JSON. Do not include any other text. All text values MUST be in English."""

# Cache version — increment to invalidate all cached analyses (e.g. after prompt language change)
CACHE_VERSION = "v5"

REPO_SYSTEM_PROMPT = """You are a cybersecurity expert. Analyze source code security findings to:
1. Explain each vulnerability's severity and impact in a way beginners can understand
2. Provide concrete fix code examples (Before/After) based on the actual code
3. Offer step-by-step remediation guidance

CRITICAL RULES for before_code and after_code:
- NEVER generate example code. NEVER use comments like "// Example", "// VULNERABLE", "# VULNERABLE", or "// Example of vulnerable code pattern".
- NEVER paraphrase or summarize code. NEVER use "..." or ellipsis to abbreviate code.
- before_code MUST be copied character-for-character from the provided file content. It must be an exact substring (matching indentation, whitespace, and all characters precisely).
- If you cannot find the exact vulnerable code in the provided file content, set before_code to an empty string "".
- after_code must follow the same coding style, indentation, and conventions as the rest of the file.
- Only include the minimal code change needed — do not rewrite unrelated parts of the file.

IMPORTANT: You MUST always respond in English, regardless of the repository content.

You MUST respond ONLY in the following JSON format:
{
  "description": "Vulnerability description (2-3 sentences)",
  "impact": "Impact scope and potential damage",
  "category": "api_leak | exposure | misconfig | cve | privacy_risk",
  "before_code": "The vulnerable code (exact match from file)",
  "after_code": "Fixed version of the code",
  "fix_steps": ["Step 1", "Step 2", "Step 3"],
  "fix_complexity": "simple | moderate | complex",
  "references": ["Reference links"]
}

IMPORTANT: Return only valid JSON. Do not include any other text. All text values MUST be in English."""


class ClaudeAnalyzer:
    """Service for AI-powered vulnerability analysis using Gemini"""

    def __init__(self):
        settings = get_settings()
        self.client = genai.Client(api_key=settings.gemini_api_key)
        self.supabase = get_supabase_service()
        self.model = "gemini-2.5-flash"

    async def analyze_vulnerability(
        self,
        vulnerability: dict,
        use_cache: bool = True
    ) -> dict:
        """
        Analyze a single vulnerability with Claude

        Args:
            vulnerability: Vulnerability data from Nuclei
            use_cache: Whether to use cached results

        Returns:
            Analysis result with description, fix, etc.
        """
        template_id = vulnerability.get("template_id", "unknown")
        cache_key = f"{CACHE_VERSION}:{template_id}"

        # Check cache first
        if use_cache:
            cached = await self.supabase.get_cached_analysis(cache_key)
            if cached:
                logger.info("cache_hit", template_id=template_id, cache_key=cache_key)
                return cached

        # Build prompt for Claude
        user_prompt = self._build_analysis_prompt(vulnerability)

        try:
            # Call Gemini API with timeout
            message = await asyncio.wait_for(
                asyncio.to_thread(
                    lambda: self.client.models.generate_content(
                        model=self.model,
                        contents=user_prompt,
                        config=genai.types.GenerateContentConfig(
                            system_instruction=SYSTEM_PROMPT,
                            max_output_tokens=1500,
                            temperature=1,
                        ),
                    )
                ),
                timeout=GEMINI_API_TIMEOUT,
            )

            # Parse response
            response_text = message.text
            logger.info("gemini_api_success", template_id=template_id, response_length=len(response_text))
            analysis = self._parse_analysis_response(response_text)

            # Cache the result
            if use_cache and analysis:
                await self.supabase.save_cached_analysis(cache_key, analysis)

            return analysis

        except asyncio.TimeoutError:
            logger.error("gemini_api_timeout", template_id=template_id, timeout=GEMINI_API_TIMEOUT)
            return self._get_default_analysis(vulnerability, f"AI analysis timed out after {GEMINI_API_TIMEOUT}s")

        except Exception as e:
            logger.error("gemini_api_failed",
                         template_id=template_id,
                         error=str(e),
                         error_type=type(e).__name__)
            return self._get_default_analysis(vulnerability, str(e))

    async def analyze_batch(
        self,
        vulnerabilities: list[dict],
        use_cache: bool = True
    ) -> list[dict]:
        """
        Analyze multiple vulnerabilities concurrently

        Args:
            vulnerabilities: List of vulnerability data
            use_cache: Whether to use cached results

        Returns:
            List of analysis results (order matches input)
        """
        semaphore = asyncio.Semaphore(5)

        async def _analyze_one(vuln: dict) -> dict:
            async with semaphore:
                try:
                    analysis = await self.analyze_vulnerability(vuln, use_cache)
                except Exception as e:
                    analysis = self._get_default_analysis(vuln, str(e))
                analysis["vulnerability_id"] = vuln.get("id")
                return analysis

        results = await asyncio.gather(*[
            _analyze_one(vuln) for vuln in vulnerabilities
        ])
        return list(results)

    def _build_analysis_prompt(self, vulnerability: dict) -> str:
        """Build the analysis prompt for Claude"""
        prompt_parts = [
            "Analyze the following security vulnerability:",
            "",
            f"**Template ID**: {vulnerability.get('template_id', 'unknown')}",
            f"**Vulnerability Name**: {vulnerability.get('name', 'unknown')}",
            f"**Severity**: {vulnerability.get('severity', 'unknown')}",
            f"**Matched At**: {vulnerability.get('matched_at', 'N/A')}",
        ]

        # Add extracted results if available
        extracted = vulnerability.get("extracted_results", [])
        if extracted:
            prompt_parts.append(f"**Extracted Data**: {', '.join(str(e) for e in extracted)}")

        # Add description if available
        description = vulnerability.get("description", "")
        if description:
            prompt_parts.append(f"**Nuclei Description**: {description}")

        # Add tags if available
        tags = vulnerability.get("tags", [])
        if tags:
            prompt_parts.append(f"**Tags**: {', '.join(tags)}")

        prompt_parts.extend([
            "",
            "Provide the analysis result for the above vulnerability in JSON format.",
        ])

        return "\n".join(prompt_parts)

    def _parse_analysis_response(self, response_text: str) -> dict:
        """Parse Claude's response into structured data"""
        try:
            # Try to parse as JSON directly
            # Handle potential markdown code blocks
            text = response_text.strip()
            if text.startswith("```json"):
                text = text[7:]
            if text.startswith("```"):
                text = text[3:]
            if text.endswith("```"):
                text = text[:-3]

            data = json.loads(text.strip())

            # Validate and normalize fields
            return {
                "description": data.get("description", "Analysis failed"),
                "impact": data.get("impact", "Unknown"),
                "category": self._normalize_category(data.get("category", "exposure")),
                "before_code": data.get("before_code", ""),
                "after_code": data.get("after_code", ""),
                "fix_steps": data.get("fix_steps", []),
                "fix_complexity": self._normalize_complexity(data.get("fix_complexity", "moderate")),
                "references": data.get("references", []),
            }

        except json.JSONDecodeError:
            # Fallback parsing
            return {
                "description": response_text[:500],
                "impact": "Failed to parse analysis result.",
                "category": "exposure",
                "before_code": "",
                "after_code": "",
                "fix_steps": [],
                "fix_complexity": "moderate",
                "references": [],
            }

    def _normalize_category(self, category: str) -> str:
        """Normalize category to valid enum value"""
        valid_categories = ["api_leak", "exposure", "misconfig", "cve", "privacy_risk"]
        category_lower = category.lower().replace(" ", "_")

        if category_lower in valid_categories:
            return category_lower
        return "exposure"  # Default

    def _normalize_complexity(self, complexity: str) -> str:
        """Normalize complexity to valid enum value"""
        valid_complexities = ["simple", "moderate", "complex"]
        complexity_lower = complexity.lower()

        if complexity_lower in valid_complexities:
            return complexity_lower
        return "moderate"  # Default

    def _get_default_analysis(self, vulnerability: dict, error: str = "") -> dict:
        """Return template-specific fallback analysis when Claude API is unavailable"""
        severity = vulnerability.get("severity", "info").lower()
        name = vulnerability.get("name", "unknown")
        template_id = vulnerability.get("template_id", "").lower()
        name_lower = name.lower()
        tags = [t.lower() for t in vulnerability.get("tags", [])]

        # Determine category
        if "api" in name_lower or "key" in name_lower:
            category = "api_leak"
        elif "config" in name_lower:
            category = "misconfig"
        elif "cve" in template_id:
            category = "cve"
        else:
            category = "exposure"

        # Look up template-specific knowledge
        info = self._get_template_info(template_id, name_lower, tags, name=name, severity=severity)

        return {
            "description": info.get("description", f"A {name} vulnerability was detected. Severity: {severity}."),
            "impact": info.get("impact", "An attacker could potentially exploit this vulnerability to compromise the application."),
            "category": info.get("category", category),
            "before_code": info.get("before_code", ""),
            "after_code": info.get("after_code", ""),
            "fix_steps": info.get("fix_steps", [
                "Identify the affected component",
                "Apply the recommended fix from the code example",
                "Re-scan after applying the fix to confirm remediation"
            ]),
            "fix_complexity": info.get("fix_complexity", "moderate"),
            "references": info.get("references", []),
            "_error": error,
        }

    def _get_template_info(self, template_id: str, name_lower: str, tags: list[str], name: str = "", severity: str = "") -> dict:
        """Return curated analysis for well-known vulnerability templates"""

        # SQL Injection
        if "sqli" in template_id or "sql" in name_lower:
            return {
                "description": "SQL Injection allows an attacker to inject malicious SQL queries through user input. This can lead to unauthorized data access, data modification, or even full database compromise.",
                "impact": "An attacker can read, modify, or delete any data in the database, bypass authentication, or execute administrative operations on the database server.",
                "category": "cve",
                "before_code": "# VULNERABLE: User input directly in SQL query\nquery = \"SELECT * FROM users WHERE id = '\" + user_input + \"'\"\ncursor.execute(query)",
                "after_code": "# FIXED: Use parameterized queries\nquery = \"SELECT * FROM users WHERE id = %s\"\ncursor.execute(query, (user_input,))",
                "fix_steps": [
                    "Replace all string-concatenated SQL queries with parameterized queries (prepared statements)",
                    "Use an ORM (e.g., SQLAlchemy, Django ORM) to abstract database queries",
                    "Apply input validation and whitelist allowed characters",
                    "Set database user permissions to minimum required (principle of least privilege)"
                ],
                "fix_complexity": "moderate",
                "references": ["https://owasp.org/www-community/attacks/SQL_Injection", "https://cheatsheetseries.owasp.org/cheatsheets/Query_Parameterization_Cheat_Sheet.html"],
            }

        # XSS
        if "xss" in template_id or "xss" in name_lower or "cross-site scripting" in name_lower:
            return {
                "description": "Cross-Site Scripting (XSS) allows attackers to inject malicious scripts into web pages viewed by other users. The reflected variant means the payload is included in the HTTP request and reflected in the response.",
                "impact": "An attacker can steal session cookies, redirect users to malicious sites, deface the website, or perform actions on behalf of the victim.",
                "category": "exposure",
                "before_code": "<!-- VULNERABLE: Unescaped user input in HTML -->\n<div>Search results for: {{ user_input }}</div>\n<script>document.write(location.search)</script>",
                "after_code": "<!-- FIXED: Escape all user input + add CSP header -->\n<div>Search results for: {{ user_input | escape }}</div>\n\n# Add Content-Security-Policy header\nContent-Security-Policy: default-src 'self'",
                "fix_steps": [
                    "Escape all user-supplied data before rendering in HTML (use template auto-escaping)",
                    "Implement Content-Security-Policy (CSP) headers to prevent inline script execution",
                    "Use HTTPOnly flag on session cookies to prevent JavaScript access",
                    "Validate and sanitize input on the server side"
                ],
                "fix_complexity": "moderate",
                "references": ["https://owasp.org/www-community/attacks/xss/", "https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html"],
            }

        # Missing security headers
        if "header" in template_id or "security-headers" in name_lower or "missing" in name_lower:
            return {
                "description": "The web server is missing important HTTP security headers that protect against common attacks like clickjacking, MIME-type sniffing, and cross-site scripting.",
                "impact": "Without security headers, the application is vulnerable to clickjacking attacks, MIME-type confusion attacks, and has a weaker defense against XSS.",
                "category": "misconfig",
                "before_code": "# Server response without security headers\nHTTP/1.1 200 OK\nContent-Type: text/html\n\n# No security headers present",
                "after_code": "# Server response WITH security headers\nHTTP/1.1 200 OK\nContent-Type: text/html\nX-Frame-Options: DENY\nX-Content-Type-Options: nosniff\nStrict-Transport-Security: max-age=31536000; includeSubDomains\nContent-Security-Policy: default-src 'self'\nReferrer-Policy: strict-origin-when-cross-origin\nPermissions-Policy: camera=(), microphone=(), geolocation=()",
                "fix_steps": [
                    "Add X-Frame-Options: DENY to prevent clickjacking",
                    "Add X-Content-Type-Options: nosniff to prevent MIME-sniffing",
                    "Add Strict-Transport-Security header to enforce HTTPS",
                    "Add Content-Security-Policy header to control resource loading"
                ],
                "fix_complexity": "simple",
                "references": ["https://owasp.org/www-project-secure-headers/", "https://securityheaders.com/"],
            }

        # CORS misconfiguration
        if "cors" in template_id or "cors" in name_lower:
            return {
                "description": "The server has a misconfigured Cross-Origin Resource Sharing (CORS) policy that allows unauthorized domains to make cross-origin requests, potentially exposing sensitive data.",
                "impact": "An attacker can craft a malicious website that makes authenticated requests to your API, stealing user data or performing unauthorized actions.",
                "category": "misconfig",
                "before_code": "# VULNERABLE: Overly permissive CORS\nAccess-Control-Allow-Origin: *\nAccess-Control-Allow-Credentials: true",
                "after_code": "# FIXED: Restrict CORS to trusted origins\nAccess-Control-Allow-Origin: https://yourdomain.com\nAccess-Control-Allow-Credentials: true\nAccess-Control-Allow-Methods: GET, POST\nAccess-Control-Max-Age: 3600",
                "fix_steps": [
                    "Replace wildcard (*) origin with a whitelist of trusted domains",
                    "Only allow necessary HTTP methods in Access-Control-Allow-Methods",
                    "Validate the Origin header against a server-side whitelist",
                    "Never combine Access-Control-Allow-Origin: * with Allow-Credentials: true"
                ],
                "fix_complexity": "simple",
                "references": ["https://owasp.org/www-community/attacks/CORS_OriginHeaderScrutiny"],
            }

        # Directory listing
        if "directory" in template_id or "listing" in name_lower or "directory" in name_lower:
            return {
                "description": "Directory listing is enabled on the web server, allowing anyone to browse the file structure and potentially discover sensitive files, backups, or configuration files.",
                "impact": "An attacker can enumerate server files to find sensitive data, source code, backup files, or configuration files containing credentials.",
                "category": "misconfig",
                "before_code": "# Nginx - VULNERABLE: autoindex enabled\nserver {\n    location / {\n        autoindex on;\n    }\n}",
                "after_code": "# Nginx - FIXED: disable autoindex\nserver {\n    location / {\n        autoindex off;\n    }\n}\n\n# Apache - add to .htaccess:\n# Options -Indexes",
                "fix_steps": [
                    "Disable directory listing in your web server configuration",
                    "For Nginx: set autoindex off",
                    "For Apache: add 'Options -Indexes' to .htaccess or httpd.conf",
                    "Remove unnecessary files from the web root"
                ],
                "fix_complexity": "simple",
                "references": ["https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/02-Configuration_and_Deployment_Management_Testing/04-Review_Old_Backup_and_Unreferenced_Files_for_Sensitive_Information"],
            }

        # API key exposure
        if "api" in name_lower or "key" in name_lower or "token" in name_lower or "secret" in name_lower:
            return {
                "description": "An API key, token, or secret was found exposed in a publicly accessible location. This credential could grant unauthorized access to external services or internal APIs.",
                "impact": "An attacker can use the exposed credentials to access third-party services, incur charges, exfiltrate data, or escalate privileges.",
                "category": "api_leak",
                "before_code": "# VULNERABLE: API key hardcoded in source\nAPI_KEY = \"sk-live-abc123xyz789\"\nresponse = requests.get(url, headers={\"Authorization\": f\"Bearer {API_KEY}\"})",
                "after_code": "# FIXED: Use environment variables\nimport os\nAPI_KEY = os.environ.get(\"API_KEY\")\nif not API_KEY:\n    raise ValueError(\"API_KEY not configured\")\nresponse = requests.get(url, headers={\"Authorization\": f\"Bearer {API_KEY}\"})",
                "fix_steps": [
                    "Immediately rotate (revoke and regenerate) the exposed credential",
                    "Move all secrets to environment variables or a secrets manager (e.g., AWS Secrets Manager, HashiCorp Vault)",
                    "Add secret patterns to .gitignore and use git-secrets or pre-commit hooks",
                    "Audit access logs for any unauthorized usage of the exposed credential"
                ],
                "fix_complexity": "moderate",
                "references": ["https://owasp.org/www-community/vulnerabilities/Use_of_hard-coded_password"],
            }

        # Technology detection (info-level)
        if "detect" in template_id or "tech" in template_id or "fingerprint" in name_lower:
            return {
                "description": f"The server reveals technology stack information ({name}). While informational, this helps attackers identify specific software versions and target known vulnerabilities.",
                "impact": "Attackers can use version information to search for known CVEs and exploits targeting the specific software version in use.",
                "category": "exposure",
                "before_code": "# Server exposes version information\nHTTP/1.1 200 OK\nServer: nginx/1.19.0\nX-Powered-By: PHP/7.4.3",
                "after_code": "# Hide version information\n# Nginx: add to nginx.conf\nserver_tokens off;\n\n# PHP: set in php.ini\nexpose_php = Off\n\n# Express.js:\napp.disable('x-powered-by');",
                "fix_steps": [
                    "Configure the web server to suppress version headers (e.g., server_tokens off in Nginx)",
                    "Remove X-Powered-By header in application config",
                    "Remove unnecessary default pages that reveal technology info",
                ],
                "fix_complexity": "simple",
                "references": ["https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/01-Information_Gathering/02-Fingerprint_Web_Server"],
            }

        # WAF detection
        if "waf" in template_id or "waf" in name_lower:
            return {
                "description": "A Web Application Firewall (WAF) was detected protecting the application. This is informational — WAF presence is generally positive for security posture.",
                "impact": "Low impact. WAF detection helps map the security infrastructure but the WAF itself provides protection.",
                "category": "exposure",
                "before_code": "",
                "after_code": "",
                "fix_steps": [
                    "Ensure WAF rules are kept up to date",
                    "Monitor WAF logs for blocked attack attempts",
                    "Consider hiding WAF fingerprints if stealth is desired"
                ],
                "fix_complexity": "simple",
                "references": [],
            }

        # Clickjacking
        if "clickjack" in template_id or "clickjack" in name_lower:
            return {
                "description": "The application is vulnerable to clickjacking, where an attacker can embed your site in an invisible iframe and trick users into clicking hidden elements.",
                "impact": "Attackers can trick authenticated users into performing unintended actions like changing settings, transferring funds, or granting permissions.",
                "category": "misconfig",
                "before_code": "# No frame protection headers\nHTTP/1.1 200 OK\nContent-Type: text/html",
                "after_code": "# Add frame protection headers\nHTTP/1.1 200 OK\nContent-Type: text/html\nX-Frame-Options: DENY\nContent-Security-Policy: frame-ancestors 'none'",
                "fix_steps": [
                    "Add X-Frame-Options: DENY header to all responses",
                    "Add Content-Security-Policy: frame-ancestors 'none' for modern browsers",
                    "If framing is needed, restrict to trusted domains with frame-ancestors"
                ],
                "fix_complexity": "simple",
                "references": ["https://owasp.org/www-community/attacks/Clickjacking"],
            }

        # Open redirect
        if "redirect" in template_id or "redirect" in name_lower:
            return {
                "description": "An open redirect vulnerability allows attackers to redirect users from your trusted domain to a malicious website, often used in phishing attacks.",
                "impact": "Attackers can craft URLs on your domain that redirect to phishing pages, exploiting user trust in your domain name.",
                "category": "exposure",
                "before_code": "# VULNERABLE: Unvalidated redirect\n@app.get(\"/redirect\")\ndef redirect(url: str):\n    return RedirectResponse(url)",
                "after_code": "# FIXED: Validate redirect target\nALLOWED_HOSTS = [\"yourdomain.com\", \"app.yourdomain.com\"]\n\n@app.get(\"/redirect\")\ndef redirect(url: str):\n    parsed = urllib.parse.urlparse(url)\n    if parsed.netloc and parsed.netloc not in ALLOWED_HOSTS:\n        raise HTTPException(400, \"Invalid redirect target\")\n    return RedirectResponse(url)",
                "fix_steps": [
                    "Validate redirect URLs against a whitelist of allowed domains",
                    "Use relative paths instead of absolute URLs for internal redirects",
                    "Reject URLs pointing to external domains unless explicitly allowed"
                ],
                "fix_complexity": "simple",
                "references": ["https://cheatsheetseries.owasp.org/cheatsheets/Unvalidated_Redirects_and_Forwards_Cheat_Sheet.html"],
            }

        # Cookie issues
        if "cookie" in template_id or "cookie" in name_lower:
            return {
                "description": "Session cookies are missing important security flags. Without these flags, cookies are vulnerable to interception or theft via XSS attacks.",
                "impact": "An attacker can steal session cookies through XSS (without HttpOnly) or network interception (without Secure flag), leading to session hijacking.",
                "category": "misconfig",
                "before_code": "# VULNERABLE: Cookie without security flags\nSet-Cookie: session=abc123; Path=/",
                "after_code": "# FIXED: Cookie with all security flags\nSet-Cookie: session=abc123; Path=/; HttpOnly; Secure; SameSite=Strict",
                "fix_steps": [
                    "Add HttpOnly flag to prevent JavaScript access to cookies",
                    "Add Secure flag to ensure cookies are only sent over HTTPS",
                    "Add SameSite=Strict or SameSite=Lax to prevent CSRF attacks",
                    "Set appropriate expiration times for session cookies"
                ],
                "fix_complexity": "simple",
                "references": ["https://owasp.org/www-community/controls/SecureCookieAttribute"],
            }

        # SSRF
        if "ssrf" in template_id or "ssrf" in name_lower:
            return {
                "description": "Server-Side Request Forgery (SSRF) allows an attacker to make the server send requests to internal resources, potentially accessing internal services, metadata endpoints, or private networks.",
                "impact": "An attacker can access internal services (databases, admin panels), cloud metadata endpoints (AWS/GCP credentials), or scan internal networks.",
                "category": "cve",
                "before_code": "# VULNERABLE: User-controlled URL fetch\n@app.post(\"/fetch\")\ndef fetch_url(url: str):\n    response = requests.get(url)\n    return response.text",
                "after_code": "# FIXED: Validate and restrict URLs\nimport ipaddress\nBLOCKED_RANGES = [\"10.0.0.0/8\", \"172.16.0.0/12\", \"192.168.0.0/16\", \"169.254.0.0/16\"]\n\n@app.post(\"/fetch\")\ndef fetch_url(url: str):\n    parsed = urllib.parse.urlparse(url)\n    ip = socket.gethostbyname(parsed.hostname)\n    for blocked in BLOCKED_RANGES:\n        if ipaddress.ip_address(ip) in ipaddress.ip_network(blocked):\n            raise HTTPException(403, \"Internal URLs not allowed\")\n    response = requests.get(url, allow_redirects=False)\n    return response.text",
                "fix_steps": [
                    "Validate and sanitize all user-supplied URLs",
                    "Block requests to internal/private IP ranges (10.x, 172.16.x, 192.168.x, 169.254.x)",
                    "Use an allowlist of permitted domains where possible",
                    "Disable HTTP redirects to prevent SSRF bypass via redirect chains"
                ],
                "fix_complexity": "moderate",
                "references": ["https://owasp.org/www-community/attacks/Server_Side_Request_Forgery"],
            }

        # Crossdomain / clientaccesspolicy
        if "crossdomain" in template_id or "clientaccess" in template_id or "cross-domain" in name_lower:
            return {
                "description": "A permissive cross-domain policy file (crossdomain.xml or clientaccesspolicy.xml) was found. This may allow unauthorized Flash/Silverlight applications to make cross-origin requests.",
                "impact": "A permissive policy allows any external domain to make authenticated requests to your server via Flash or Silverlight, potentially leaking sensitive data.",
                "category": "misconfig",
                "before_code": "<!-- VULNERABLE: Allows all domains -->\n<cross-domain-policy>\n  <allow-access-from domain=\"*\" />\n</cross-domain-policy>",
                "after_code": "<!-- FIXED: Restrict to specific trusted domains -->\n<cross-domain-policy>\n  <allow-access-from domain=\"yourdomain.com\" />\n  <allow-access-from domain=\"cdn.yourdomain.com\" />\n</cross-domain-policy>\n\n<!-- Or remove the file entirely if Flash/Silverlight is not used -->",
                "fix_steps": [
                    "If Flash/Silverlight is not used, remove crossdomain.xml and clientaccesspolicy.xml entirely",
                    "If needed, restrict allowed domains to only trusted origins",
                    "Never use domain=\"*\" in production environments"
                ],
                "fix_complexity": "simple",
                "references": ["https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/02-Configuration_and_Deployment_Management_Testing/07-Test_HTTP_Strict_Transport_Security"],
            }

        # Robots.txt / sitemap
        if "robots" in template_id or "sitemap" in template_id:
            return {
                "description": f"The {name} file was found publicly accessible. While this is standard, it may reveal internal paths or sensitive URL patterns.",
                "impact": "Attackers can discover hidden or sensitive URL paths listed in these files, which may lead to further exploitation.",
                "category": "exposure",
                "before_code": "# robots.txt exposing sensitive paths\nUser-agent: *\nDisallow: /admin/\nDisallow: /api/internal/\nDisallow: /backup/",
                "after_code": "# robots.txt - keep minimal\nUser-agent: *\nDisallow: /api/\n\n# Protect sensitive paths via authentication,\n# not by hiding them in robots.txt",
                "fix_steps": [
                    "Do not rely on robots.txt to hide sensitive paths — use proper authentication and authorization",
                    "Review robots.txt for any accidentally exposed internal URLs",
                    "Protect admin panels and internal APIs with authentication, not just obscurity"
                ],
                "fix_complexity": "simple",
                "references": [],
            }

        # Generic fallback for unrecognized templates
        # NOTE: category is omitted so _get_default_analysis uses its own keyword-based logic
        return {
            "description": f"A {name or 'unknown'} vulnerability was detected (severity: {severity or 'unknown'}). This finding indicates a potential security weakness that should be investigated and remediated.",
            "impact": "An attacker could potentially exploit this vulnerability to compromise application security, access sensitive data, or disrupt service availability.",
            "before_code": "",
            "after_code": "",
            "fix_steps": [
                "Review the vulnerability details and matched location",
                "Research the specific vulnerability type for remediation guidance",
                "Apply the appropriate fix and re-scan to verify remediation"
            ],
            "fix_complexity": "moderate",
            "references": [],
        }


    async def analyze_repo_vulnerability(
        self,
        vulnerability: dict,
        use_cache: bool = True,
    ) -> dict:
        """
        Analyze a single repo vulnerability with Claude.

        Args:
            vulnerability: Repo vulnerability data (vuln_type, name, severity,
                           file_path, line_number, code_snippet, description, etc.)
            use_cache: Whether to use cached results

        Returns:
            Analysis result with description, impact, before_code, after_code, etc.
        """
        # Build cache key — include file content hash when available for uniqueness
        cache_id = vulnerability.get("pattern_id") or vulnerability.get("name", "unknown")
        repo_scan_id = vulnerability.get("repo_scan_id", "")
        file_content = vulnerability.get("file_content")
        if file_content:
            import hashlib
            file_hash = hashlib.md5(file_content.encode()).hexdigest()[:8]
            cache_key = f"repo:{CACHE_VERSION}:{repo_scan_id}:{cache_id}:{file_hash}"
        else:
            cache_key = f"repo:{CACHE_VERSION}:{cache_id}"

        # Check cache first
        if use_cache:
            cached = await self.supabase.get_cached_analysis(cache_key)
            if cached:
                logger.info("repo_cache_hit", cache_key=cache_key)
                return cached

        # Build prompt
        user_prompt = self._build_repo_analysis_prompt(vulnerability)

        try:
            message = await asyncio.wait_for(
                asyncio.to_thread(
                    lambda: self.client.models.generate_content(
                        model=self.model,
                        contents=user_prompt,
                        config=genai.types.GenerateContentConfig(
                            system_instruction=REPO_SYSTEM_PROMPT,
                            max_output_tokens=2000,
                            temperature=0,
                        ),
                    )
                ),
                timeout=GEMINI_API_TIMEOUT,
            )

            response_text = message.text
            logger.info(
                "repo_gemini_api_success",
                name=vulnerability.get("name"),
                response_length=len(response_text),
            )
            analysis = self._parse_analysis_response(response_text)

            # Cache the result
            if use_cache and analysis:
                await self.supabase.save_cached_analysis(cache_key, analysis)

            return analysis

        except asyncio.TimeoutError:
            logger.error("repo_gemini_api_timeout", name=vulnerability.get("name"), timeout=GEMINI_API_TIMEOUT)
            return self._get_default_repo_analysis(vulnerability, f"AI analysis timed out after {GEMINI_API_TIMEOUT}s")

        except Exception as e:
            logger.error(
                "repo_gemini_api_failed",
                name=vulnerability.get("name"),
                error=str(e),
                error_type=type(e).__name__,
            )
            return self._get_default_repo_analysis(vulnerability, str(e))

    async def analyze_repo_batch(
        self,
        vulnerabilities: list[dict],
        use_cache: bool = True,
    ) -> list[dict]:
        """
        Analyze multiple repo vulnerabilities concurrently.

        Args:
            vulnerabilities: List of repo vulnerability dicts
            use_cache: Whether to use cached results

        Returns:
            List of analysis results (order matches input)
        """
        semaphore = asyncio.Semaphore(3)  # Reduced from 5 due to larger prompts with file content

        async def _analyze_one(vuln: dict) -> dict:
            async with semaphore:
                try:
                    analysis = await self.analyze_repo_vulnerability(vuln, use_cache)
                except Exception as e:
                    analysis = self._get_default_repo_analysis(vuln, str(e))
                analysis["vulnerability_id"] = vuln.get("id")
                return analysis

        results = await asyncio.gather(*[_analyze_one(v) for v in vulnerabilities])
        return list(results)

    def _build_repo_analysis_prompt(self, vulnerability: dict) -> str:
        """Build the analysis prompt for a repo vulnerability.

        When file_content is available (Phase 1), includes the full file so AI
        can produce before_code that exactly matches the source.
        """
        parts = [
            "Analyze the following source code security finding:",
            "",
            f"**Vulnerability Type**: {vulnerability.get('vuln_type', 'unknown')}",
            f"**Name**: {vulnerability.get('name', 'unknown')}",
            f"**Severity**: {vulnerability.get('severity', 'unknown')}",
        ]

        file_path = vulnerability.get("file_path")
        if file_path:
            parts.append(f"**File**: {file_path}")

        line_number = vulnerability.get("line_number")
        if line_number:
            parts.append(f"**Line**: {line_number}")

        # Phase 1: Include full file content when available
        file_content = vulnerability.get("file_content")
        file_language = vulnerability.get("file_language", "")
        if file_content:
            parts.append(
                f"\n**Full File Content** ({file_language}):\n"
                f"```{file_language}\n{file_content}\n```\n"
                f"IMPORTANT: Your before_code MUST be an exact substring copied from this file "
                f"(preserving indentation and whitespace). Your after_code must follow the "
                f"same coding style."
            )
        else:
            # Fallback: snippet only
            code_snippet = vulnerability.get("code_snippet")
            if code_snippet:
                parts.append(f"**Code Snippet**:\n```\n{code_snippet}\n```")

        description = vulnerability.get("description")
        if description:
            parts.append(f"**Scanner Description**: {description}")

        # SCA-specific fields
        package_name = vulnerability.get("package_name")
        if package_name:
            parts.append(f"**Package**: {package_name}")
        installed_version = vulnerability.get("installed_version")
        if installed_version:
            parts.append(f"**Installed Version**: {installed_version}")
        fixed_version = vulnerability.get("fixed_version")
        if fixed_version:
            parts.append(f"**Fixed Version**: {fixed_version}")
        cve_id = vulnerability.get("cve_id")
        if cve_id:
            parts.append(f"**CVE**: {cve_id}")

        fix_suggestion = vulnerability.get("fix_suggestion")
        if fix_suggestion:
            parts.append(f"**Existing Fix Suggestion**: {fix_suggestion}")

        # Vuln-type-specific instructions
        vuln_type = (vulnerability.get("vuln_type") or "").lower()
        if vuln_type == "sca":
            parts.append(
                '\n**SCA RULE**: For dependency vulnerabilities, before_code MUST be exactly '
                '`"package_name": "installed_version"` and after_code MUST be exactly '
                '`"package_name": "fixed_version"`. Do NOT wrap in a JSON object. '
                'Do NOT include section names like "dependencies".'
            )
        elif vuln_type == "secret":
            parts.append(
                "\n**SECRET RULE**: before_code must be the exact line containing the exposed secret, "
                "copied character-for-character from the file. after_code should replace the secret "
                "with an environment variable reference."
            )

        parts.extend([
            "",
            "Provide the analysis result for the above finding in JSON format.",
        ])

        return "\n".join(parts)

    def _get_default_repo_analysis(self, vulnerability: dict, error: str = "") -> dict:
        """Return fallback analysis for a repo vulnerability when Claude API is unavailable."""
        severity = vulnerability.get("severity", "info").lower()
        name = vulnerability.get("name", "unknown")
        vuln_type = vulnerability.get("vuln_type", "sast")
        code_snippet = vulnerability.get("code_snippet", "")

        # Determine category
        name_lower = name.lower()
        if "api" in name_lower or "key" in name_lower or "secret" in name_lower or "token" in name_lower:
            category = "api_leak"
        elif "config" in name_lower or "misconfig" in name_lower:
            category = "misconfig"
        elif vulnerability.get("cve_id"):
            category = "cve"
        elif "privacy" in name_lower or "pii" in name_lower:
            category = "privacy_risk"
        else:
            category = "exposure"

        return {
            "description": vulnerability.get("description") or f"A {name} vulnerability was detected in the source code. Severity: {severity}.",
            "impact": "An attacker could potentially exploit this vulnerability to compromise application security.",
            "category": category,
            "before_code": code_snippet or "",
            "after_code": vulnerability.get("fix_suggestion", ""),
            "fix_steps": [
                "Review the flagged code in the identified file",
                "Apply the recommended fix from the code example",
                "Re-scan the repository to confirm remediation",
            ],
            "fix_complexity": "moderate",
            "references": [],
            "_error": error,
        }


# Singleton instance
_claude_analyzer: Optional[ClaudeAnalyzer] = None


def get_claude_analyzer() -> ClaudeAnalyzer:
    """Get or create Claude analyzer instance"""
    global _claude_analyzer
    if _claude_analyzer is None:
        _claude_analyzer = ClaudeAnalyzer()
    return _claude_analyzer
