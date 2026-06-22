"""
Trust Backend Nuclei Scanner Service
Async wrapper for Nuclei security scanner
Based on vibe_security_scanner_fixed.py
"""

import asyncio
import json
import os
import ssl
from datetime import datetime
from pathlib import Path
from typing import Optional, Callable

import httpx

from app.config import get_settings
from app.logging_config import get_logger
from app.models.schemas import ScanMode, ScanStatus

logger = get_logger(__name__)


class TargetUnreachableError(Exception):
    """Raised when the pre-flight reachability probe fails.

    This prevents Nuclei from running against a dead/mistyped URL and returning
    0 findings, which the scoring logic would otherwise misinterpret as a
    perfect A-grade site.
    """


async def probe_target_reachability(target_url: str, timeout: float = 10.0) -> None:
    """Verify the target actually responds before running a scan.

    WHY: Nuclei happily runs against unreachable hosts and returns 0 findings.
    The scoring path then awards 100/A, telling the user their offline/mistyped
    site is "perfectly secure". We short-circuit that here by requiring at
    least one HTTP response (any status code, including 4xx/5xx — those prove
    the server exists) before accepting the scan.

    Raises TargetUnreachableError with a human-readable reason on failure.
    """
    # Two attempts: HEAD first (cheap), GET fallback (some servers 405 HEAD)
    last_error: str | None = None
    async with httpx.AsyncClient(
        follow_redirects=True,
        timeout=timeout,
        # Verify TLS — expired/invalid certs should count as unreachable
        # because they indicate a broken/abandoned deployment.
        verify=True,
    ) as client:
        for method in ("HEAD", "GET"):
            try:
                resp = await client.request(method, target_url)
                # Any HTTP response — even 4xx/5xx — proves the host is up.
                # Nuclei can still probe error pages for misconfig/exposure.
                logger.info(
                    "preflight_reachable",
                    target=target_url,
                    method=method,
                    status=resp.status_code,
                )
                return
            except httpx.ConnectError as e:
                last_error = f"Connection failed ({e.__class__.__name__})"
            except httpx.ConnectTimeout:
                last_error = "Connection timed out"
            except httpx.ReadTimeout:
                last_error = "Server did not respond in time"
            except ssl.SSLCertVerificationError as e:
                last_error = f"SSL certificate invalid ({e.reason or 'verify failed'})"
            except httpx.HTTPError as e:
                # Covers remaining transport errors (DNS, SSL handshake, etc.)
                msg = str(e).splitlines()[0][:120] if str(e) else e.__class__.__name__
                last_error = f"Request failed ({msg})"
            except Exception as e:
                last_error = f"Unexpected error ({e.__class__.__name__})"

    raise TargetUnreachableError(last_error or "Target did not respond")


async def diagnose_nuclei_environment() -> dict:
    """
    Diagnose Nuclei environment - call this for troubleshooting
    Returns diagnostic information about Nuclei setup
    """
    diagnostics = {
        "nuclei_version": None,
        "templates_count": 0,
        "templates_dir_exists": False,
        "network_test": False,
        "errors": []
    }

    env = os.environ.copy()
    env.update({"HOME": "/root", "NUCLEI_NO_COLOR": "1"})

    try:
        # Check Nuclei version
        proc = await asyncio.create_subprocess_exec(
            "nuclei", "-version",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env
        )
        stdout, stderr = await proc.communicate()
        version_output = (stdout or stderr).decode('utf-8', errors='ignore').strip()
        diagnostics["nuclei_version"] = version_output
        logger.info("diagnostics_nuclei_version", version=version_output)

        # Check templates count
        proc = await asyncio.create_subprocess_exec(
            "nuclei", "-tl",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env
        )
        stdout, stderr = await proc.communicate()
        templates = stdout.decode('utf-8', errors='ignore').strip().split('\n')
        diagnostics["templates_count"] = len([t for t in templates if t.strip()])
        logger.info("diagnostics_templates_count", count=diagnostics["templates_count"])

        # Check templates directory
        templates_dir = Path("/root/nuclei-templates")
        diagnostics["templates_dir_exists"] = templates_dir.exists()
        if templates_dir.exists():
            subdirs = [d.name for d in templates_dir.iterdir() if d.is_dir()][:10]
            logger.info("diagnostics_templates_subdirs", subdirs=subdirs)

        # Network test with curl
        proc = await asyncio.create_subprocess_exec(
            "wget", "-q", "--spider", "--timeout=5", "http://testphp.vulnweb.com",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        await proc.communicate()
        diagnostics["network_test"] = proc.returncode == 0
        logger.info("diagnostics_network_test", success=diagnostics["network_test"])

    except Exception as e:
        diagnostics["errors"].append(str(e))
        logger.error("diagnostics_error", error=str(e))

    return diagnostics


class NucleiScanner:
    """Async Nuclei security scanner service - Optimized for Vibe Coders"""

    # Severity levels
    ALL_SEVERITIES = ["info", "low", "medium", "high", "critical"]

    # =================================================================
    # VIBE CODER 최적화 템플릿 태그 (4GB 메모리 제한 고려)
    # - 바이브코더가 자주 실수하는 보안 이슈에 집중
    # - CVE 태그 제외 (수천 개 → 메모리 폭발 주범)
    # - HTTP + DAST 템플릿으로 실제 취약점 탐지
    # =================================================================

    # HTTP template subdirectories to scan (under http/)
    # Excludes http/cves/ (thousands of product-specific CVEs, irrelevant for vibe coders)
    # Optimized HTTP template dirs — 83% reduction from full (9,495 → 1,568)
    # CVE flood removed; DAST Phase 1/2 handles actual vuln detection
    HTTP_TEMPLATE_DIRS = [
        "exposures",         # env files, config files, secrets, git, swagger
        "misconfiguration",  # CORS, headers, cookies, open redirect
    ]

    # Scan mode configurations - HTTP + DAST 템플릿 사용 (4GB 메모리 여유)
    # 타임아웃을 넉넉히 설정하여 XSS/LFI/SQLi 모두 충분히 탐지
    SCAN_CONFIGS = {
        ScanMode.TECH: {
            # 기술 스택 탐지만
            "severity": ["info", "low", "medium", "high", "critical"],
            "tags": ["tech"],
            "timeout": 120,
            "use_dast": False,
        },
        ScanMode.QUICK: {
            # HTTP + DAST 모두 사용 → 충분한 시간으로 SQLi/XSS/LFI 탐지
            "severity": ["info", "low", "medium", "high", "critical"],
            # T3: HTTP subdirs replace tags (no CVE flood)
            "tags": None,
            "timeout": 600,
            "use_dast": True,
        },
        ScanMode.FULL: {
            # HTTP + DAST 템플릿 전체 사용
            "severity": ["info", "low", "medium", "high", "critical"],
            "tags": None,
            "timeout": 900,  # 15분
            "use_dast": True,
        },
        ScanMode.CRITICAL: {
            # 심각한 취약점만 (DAST 포함)
            "severity": ["high", "critical"],
            "tags": None,
            "timeout": 600,  # 10분
            "use_dast": True,
        },
    }

    def __init__(
        self,
        target_url: str,
        scan_id: str,
        extra_route_urls: Optional[list[str]] = None,
    ):
        self.target_url = target_url
        self.scan_id = scan_id
        # Route hints from a GitHub-linked repo (if any). Unioned with
        # Katana output before DAST so Phase 1 runs even when Katana
        # finds zero parameterised URLs.
        self.extra_route_urls: list[str] = list(extra_route_urls or [])
        self.settings = get_settings()
        self.output_dir = Path(self.settings.scan_output_dir)
        self.output_dir.mkdir(exist_ok=True)
        self.timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        self._progress = 0
        self._current_stage = "initializing"
        self._findings: list[dict] = []

    @property
    def progress(self) -> int:
        return self._progress

    @property
    def current_stage(self) -> str:
        return self._current_stage

    @property
    def findings(self) -> list[dict]:
        return self._findings

    async def _run_nuclei_pass(
        self,
        cmd: list[str],
        output_file: Path,
        timeout: int,
        pass_name: str,
    ) -> list[dict]:
        """Run a single Nuclei pass and return parsed findings."""
        logger.info("nuclei_executing", scan_id=self.scan_id, pass_name=pass_name, command=" ".join(cmd))

        env = os.environ.copy()
        env.update({
            "NUCLEI_NO_COLOR": "1",
            "NO_COLOR": "1",
            "HOME": "/root",
            "TERM": "dumb",
        })

        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env,
        )

        timed_out = False
        try:
            stdout_data, stderr_data = await asyncio.wait_for(
                process.communicate(),
                timeout=timeout
            )
        except asyncio.TimeoutError:
            logger.warning("nuclei_timeout", scan_id=self.scan_id, pass_name=pass_name, timeout_seconds=timeout)
            process.kill()
            stdout_data, stderr_data = await process.communicate()
            timed_out = True

        if stdout_data:
            logger.info("nuclei_stdout", scan_id=self.scan_id, pass_name=pass_name, output=stdout_data.decode('utf-8', errors='ignore')[:2000])
        if stderr_data:
            logger.warning("nuclei_stderr", scan_id=self.scan_id, pass_name=pass_name, output=stderr_data.decode('utf-8', errors='ignore')[:2000])

        logger.info("nuclei_process_exit", scan_id=self.scan_id, pass_name=pass_name, return_code=process.returncode)

        findings = []
        if output_file.exists():
            file_size = output_file.stat().st_size
            logger.info("nuclei_output_file", scan_id=self.scan_id, pass_name=pass_name, size_bytes=file_size)
            if file_size > 0:
                findings = self._parse_results(output_file)
                logger.info("nuclei_findings_parsed", scan_id=self.scan_id, pass_name=pass_name, count=len(findings))
            output_file.unlink(missing_ok=True)
        else:
            logger.warning("nuclei_output_missing", scan_id=self.scan_id, pass_name=pass_name)

        return findings

    async def run_scan(
        self,
        mode: ScanMode = ScanMode.QUICK,
        on_progress: Optional[Callable[[int, str], None]] = None
    ) -> list[dict]:
        """
        Run Nuclei scan asynchronously.
        Uses 2-pass approach when DAST is enabled:
          Pass 1: HTTP templates (info gathering + passive detection)
          Pass 2: DAST templates with -dast flag (active fuzzing: SQLi, XSS, LFI, etc.)
        """
        config = self.SCAN_CONFIGS[mode]
        use_dast = config.get("use_dast", False)

        self._current_stage = "scanning"
        self._progress = 5
        if on_progress:
            on_progress(self._progress, self._current_stage)

        try:
            # === Pass 1: HTTP templates (always) ===
            output_file_http = self.output_dir / f"scan_{self.scan_id}_{self.timestamp}_http.jsonl"
            cmd_http = self._build_command(
                severity=config["severity"],
                tags=config["tags"],
                output_file=str(output_file_http),
                use_dast=False,
            )

            # HTTP pass is fast (passive checks), give it 1/3; DAST gets 2/3 minus crawl time
            timeout_http = config["timeout"] // 3 if use_dast else config["timeout"]
            http_findings = await self._run_nuclei_pass(
                cmd_http, output_file_http, timeout_http, "http"
            )

            self._progress = 50 if use_dast else 92
            if on_progress:
                on_progress(self._progress, self._current_stage)

            # === Pass 2: Crawl + DAST templates (if enabled) ===
            dast_findings = []
            if use_dast:
                # Step 2a: Crawl target with Katana to discover URLs with parameters
                self._current_stage = "crawling"
                crawl_file = self.output_dir / f"crawl_{self.scan_id}_{self.timestamp}.txt"
                crawled_urls = await self._crawl_target(crawl_file, timeout=120)
                # Merge any repo-derived route hints. These are pre-parameterised
                # URLs that already pass the `?` filter, so we append to the same
                # crawl file and bump the count to unblock the DAST phases below.
                if self.extra_route_urls:
                    crawled_urls += self._merge_extra_routes(crawl_file)

                self._progress = 60
                if on_progress:
                    on_progress(self._progress, self._current_stage)

                if crawled_urls > 0:
                    # Total DAST time budget (subtract HTTP + crawl allocation)
                    timeout_dast_total = config["timeout"] - timeout_http - 120
                    timeout_dast_total = max(timeout_dast_total, 120)

                    # --- Phase 1: Critical (SQLi + XSS) — 60% of DAST budget ---
                    self._current_stage = "dast_critical"
                    timeout_p1 = max(int(timeout_dast_total * 0.6), 60)
                    output_p1 = self.output_dir / f"scan_{self.scan_id}_{self.timestamp}_dast_p1.jsonl"
                    cmd_p1 = self._build_dast_command(
                        severity=config["severity"],
                        crawl_file=str(crawl_file),
                        output_file=str(output_p1),
                        vuln_dirs=self.DAST_PHASE1_DIRS,
                    )
                    phase1_findings = await self._run_nuclei_pass(
                        cmd_p1, output_p1, timeout_p1, "dast_phase1_sqli_xss"
                    )
                    dast_findings.extend(phase1_findings)
                    logger.info("dast_phase1_done", scan_id=self.scan_id,
                                findings=len(phase1_findings), timeout=timeout_p1)

                    self._progress = 80
                    if on_progress:
                        on_progress(self._progress, self._current_stage)

                    # --- Phase 2: Other vulns (LFI, CMDI, SSRF, SSTI, redirect) — 40% ---
                    self._current_stage = "dast_scanning"
                    timeout_p2 = max(timeout_dast_total - timeout_p1, 60)
                    output_p2 = self.output_dir / f"scan_{self.scan_id}_{self.timestamp}_dast_p2.jsonl"
                    cmd_p2 = self._build_dast_command(
                        severity=config["severity"],
                        crawl_file=str(crawl_file),
                        output_file=str(output_p2),
                        vuln_dirs=self.DAST_PHASE2_DIRS,
                    )
                    phase2_findings = await self._run_nuclei_pass(
                        cmd_p2, output_p2, timeout_p2, "dast_phase2_other"
                    )
                    dast_findings.extend(phase2_findings)
                    logger.info("dast_phase2_done", scan_id=self.scan_id,
                                findings=len(phase2_findings), timeout=timeout_p2)
                else:
                    logger.warning("katana_no_urls", scan_id=self.scan_id)

                # Cleanup crawl file
                crawl_file.unlink(missing_ok=True)

                self._progress = 92
                if on_progress:
                    on_progress(self._progress, self._current_stage)

            # === Merge results (deduplicate by template_id) ===
            self._current_stage = "parsing"
            seen = {}
            for f in http_findings:
                seen[f["template_id"]] = f
            for f in dast_findings:
                tid = f["template_id"]
                if tid in seen:
                    # Merge matched_locations
                    for loc in f.get("matched_locations", []):
                        if loc not in seen[tid]["matched_locations"]:
                            seen[tid]["matched_locations"].append(loc)
                else:
                    seen[tid] = f

            self._findings = list(seen.values())
            logger.info("nuclei_total_findings", scan_id=self.scan_id,
                        http_count=len(http_findings), dast_count=len(dast_findings),
                        merged_count=len(self._findings))

            self._current_stage = "complete"
            self._progress = 100
            if on_progress:
                on_progress(self._progress, self._current_stage)

            return self._findings

        except FileNotFoundError:
            raise Exception("Nuclei is not installed. Please install nuclei first.")
        except Exception as e:
            raise Exception(f"Scan failed: {str(e)}")

    def _merge_extra_routes(self, crawl_file: Path) -> int:
        """Append repo-derived route URLs to the crawl file. Returns the
        number of additional URLs merged after de-duplication against
        the existing crawl output."""
        existing: set[str] = set()
        if crawl_file.exists():
            with open(crawl_file) as f:
                existing = {line.strip() for line in f if line.strip()}

        new_urls = [u for u in self.extra_route_urls if u not in existing]
        if not new_urls:
            return 0

        # Respect the overall DAST URL cap applied in _crawl_target.
        MAX_DAST_URLS = 30
        room = max(0, MAX_DAST_URLS - len(existing))
        new_urls = new_urls[:room]

        with open(crawl_file, "a") as f:
            for u in new_urls:
                f.write(u + "\n")

        logger.info(
            "github_routes_merged",
            scan_id=self.scan_id,
            added=len(new_urls),
            existing=len(existing),
        )
        return len(new_urls)

    async def _crawl_target(self, output_file: Path, timeout: int = 120) -> int:
        """Crawl target URL with Katana, discovering GET params and POST forms.

        Uses JSONL output to capture HTTP method and body from form submissions.
        POST body params are converted to query params so Nuclei DAST can fuzz them.
        """
        jsonl_file = self.output_dir / f"crawl_{self.scan_id}_{self.timestamp}_raw.jsonl"
        cmd = [
            "katana",
            "-u", self.target_url,
            "-d", "5",              # depth 5 for deeper page discovery
            "-jc",                  # crawl JavaScript
            "-kf", "all",           # known-files: robots.txt, sitemap.xml, etc.
            "-aff",                 # auto-fill and submit forms (login, search, etc.)
            "-ef", "css,js,png,jpg,jpeg,gif,svg,ico,woff,woff2,ttf,eot,mp4,mp3,pdf",
            "-silent",
            "-jsonl",               # JSONL output with request method/body
            "-o", str(jsonl_file),
        ]

        logger.info("katana_crawling", scan_id=self.scan_id, command=" ".join(cmd))

        env = os.environ.copy()
        env.update({"HOME": "/root", "NO_COLOR": "1"})

        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env,
        )

        try:
            stdout_data, stderr_data = await asyncio.wait_for(
                process.communicate(), timeout=timeout
            )
        except asyncio.TimeoutError:
            logger.warning("katana_timeout", scan_id=self.scan_id)
            process.kill()
            await process.communicate()

        url_count = 0
        get_urls: list[str] = []
        post_urls: list[str] = []
        seen: set[str] = set()

        if jsonl_file.exists():
            with open(jsonl_file) as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    url_count += 1
                    try:
                        data = json.loads(line)
                        req = data.get("request", {})
                        method = (req.get("method", "") or "GET").upper()
                        endpoint = req.get("endpoint", "") or data.get("url", "")

                        if not endpoint:
                            continue
                        canonical = endpoint.split("#")[0]

                        if method == "POST" and canonical not in seen:
                            body = req.get("body", "")
                            if not body:
                                raw = req.get("raw", "")
                                body = self._extract_post_body(raw)
                            if body and "=" in body:
                                sep = "&" if "?" in canonical else "?"
                                post_urls.append(f"{canonical}{sep}{body}")
                                seen.add(canonical)
                        elif "?" in canonical and canonical not in seen:
                            get_urls.append(canonical)
                            seen.add(canonical)
                    except json.JSONDecodeError:
                        # Fallback: plain URL line
                        canonical = line.split("#")[0]
                        if "?" in canonical and canonical not in seen:
                            get_urls.append(canonical)
                            seen.add(canonical)

            jsonl_file.unlink(missing_ok=True)

        # POST forms first (more likely to have SQLi), then GET params
        combined = post_urls + get_urls

        MAX_DAST_URLS = 30
        if len(combined) > MAX_DAST_URLS:
            logger.info("dast_url_cap", scan_id=self.scan_id,
                        before=len(combined), after=MAX_DAST_URLS)
            combined = combined[:MAX_DAST_URLS]

        filtered_count = len(combined)

        with open(output_file, "w") as f:
            f.write("\n".join(combined) + "\n" if combined else "")

        logger.info("katana_complete", scan_id=self.scan_id,
                    urls_found=url_count, get_params=len(get_urls),
                    post_forms=len(post_urls), urls_for_dast=filtered_count)
        return filtered_count

    @staticmethod
    def _extract_post_body(raw_request: str) -> str:
        """Extract body from raw HTTP request string."""
        for sep in ("\r\n\r\n", "\n\n"):
            parts = raw_request.split(sep, 1)
            if len(parts) == 2:
                body = parts[1].strip()
                # Only return form-urlencoded bodies (not JSON/multipart)
                if body and "=" in body and not body.startswith("{"):
                    return body
        return ""

    # DAST vulnerability subdirectories (under dast/vulnerabilities/)
    # Phase 1 = critical vulns (SQLi/XSS) run first to guarantee detection
    # Phase 2 = other vulns run with remaining time budget
    DAST_PHASE1_DIRS = ["sqli", "xss"]
    DAST_PHASE2_DIRS = ["lfi", "cmdi", "ssrf", "ssti", "redirect"]

    def _build_dast_command(
        self,
        severity: list[str],
        crawl_file: str,
        output_file: str,
        vuln_dirs: list[str] | None = None,
    ) -> list[str]:
        """Build Nuclei DAST command using crawled URL list with specific vuln dirs."""
        templates_dir = self.settings.nuclei_templates_dir or "/root/nuclei-templates"
        dirs = vuln_dirs or (self.DAST_PHASE1_DIRS + self.DAST_PHASE2_DIRS)

        # Build -t flags for each vulnerability subdirectory
        cmd = ["nuclei", "-l", crawl_file, "-dast"]
        for vuln_dir in dirs:
            cmd.extend(["-t", f"{templates_dir}/dast/vulnerabilities/{vuln_dir}"])

        cmd.extend([
            "-severity", ",".join(severity),
            "-jsonl",
            "-o", output_file,
            "-timeout", "15",
            # Lower rate/concurrency to prevent host from becoming unresponsive
            # (testphp.vulnweb.com was skipped after 36 errors at higher rates)
            "-rl", "100",
            "-bs", "15",
            "-c", "15",
            "-mhe", "100",  # max-host-error: allow more errors before skipping host
            "-nc",
            "-stats",
        ])

        return cmd

    def _build_command(
        self,
        severity: list[str],
        tags: Optional[list[str]],
        output_file: str,
        use_dast: bool = False,
    ) -> list[str]:
        """Build Nuclei command line arguments - 2-pass: HTTP or DAST (4GB 메모리)"""
        templates_dir = self.settings.nuclei_templates_dir or "/root/nuclei-templates"
        http_templates = f"{templates_dir}/http"
        dast_templates = f"{templates_dir}/dast"

        if use_dast:
            # Pass 2: DAST 전용 — -dast 플래그로 fuzz 모드 활성화
            cmd = [
                "nuclei",
                "-u", self.target_url,
                "-t", dast_templates,
                "-dast",
            ]
        else:
            # Pass 1: HTTP 템플릿 — specific subdirs only (no CVE flood)
            cmd = ["nuclei", "-u", self.target_url]
            for subdir in self.HTTP_TEMPLATE_DIRS:
                cmd.extend(["-t", f"{http_templates}/{subdir}"])

        cmd.extend([
            "-severity", ",".join(severity),
            "-jsonl",
            "-o", output_file,
            "-timeout", "15",  # 10 → 15초 (blind injection 대응)
            "-rl", str(self.settings.nuclei_rate_limit),
            "-bs", "25",
            "-c", str(self.settings.nuclei_concurrency),
            "-nc",
            "-stats",
        ])

        # 태그 필터링 (선택사항 - 더 빠른 스캔 원하면 사용)
        if tags:
            cmd.extend(["-tags", ",".join(tags)])

        return cmd

    def _parse_results(self, output_file: Path) -> list[dict]:
        """Parse JSONL results from Nuclei with deduplication by template_id"""
        findings = []
        seen: dict[str, int] = {}  # template_id -> index in findings list

        try:
            with open(output_file, "r") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue

                    try:
                        data = json.loads(line)
                        template_id = data.get("template-id", "unknown")
                        matched_at = data.get("matched-at", "")

                        if template_id in seen:
                            # Deduplicate: append matched_at to existing finding
                            idx = seen[template_id]
                            if matched_at and matched_at not in findings[idx]["matched_locations"]:
                                findings[idx]["matched_locations"].append(matched_at)
                        else:
                            finding = {
                                "template_id": template_id,
                                "name": data.get("info", {}).get("name", "unknown"),
                                "severity": data.get("info", {}).get("severity", "unknown"),
                                "matched_at": matched_at,
                                "matched_locations": [matched_at] if matched_at else [],
                                "extracted_results": data.get("extracted-results", []),
                                # Additional fields from Nuclei output
                                "host": data.get("host", ""),
                                "type": data.get("type", ""),
                                "matcher_name": data.get("matcher-name", ""),
                                "description": data.get("info", {}).get("description", ""),
                                "reference": data.get("info", {}).get("reference", []),
                                "tags": data.get("info", {}).get("tags", []),
                            }
                            seen[template_id] = len(findings)
                            findings.append(finding)
                    except json.JSONDecodeError:
                        continue

        except Exception as e:
            logger.error("nuclei_parse_error", error=str(e))

        return findings


# Info templates severity override
# Nuclei marks these as "info" but they carry real security risk
# Points = deduction per finding (0 = ignore, like regular info)
INFO_SEVERITY_OVERRIDE = {
    # === Sensitive data exposure (-5 each, high실질적 해킹 위험) ===
    "env-file": 5,
    "htaccess-config": 5,
    "docker-compose-config": 5,
    "kubernetes-config": 5,
    "phpinfo": 5,
    "git-config": 5,
    "git-config-exposure": 5,
    "ds-store-file": 5,
    "server-status": 5,
    "server-info": 5,

    # === Missing security headers (-3 each, medium급) ===
    "http-missing-security-headers": 3,
    "strict-transport-security": 3,
    "content-security-policy": 3,
    "x-frame-options": 3,
    "x-content-type-options": 3,
    "x-xss-protection": 3,
    "permissions-policy": 3,

    # === Access control issues (-3 each, medium급) ===
    "xff-403-bypass": 3,
    "open-redirect": 3,
    "cors-misconfig": 3,

    # === Cookie/session issues (-3 each, medium급) ===
    "cookies-without-secure": 3,
    "cookies-without-httponly": 3,
    "cookie-without-secure": 3,
    "cookie-without-httponly": 3,

    # === API/info exposure (-3 each, medium급) ===
    "swagger-api": 3,
    "openapi": 3,
    "graphql": 3,

    # === EOL versions (-2 each, low급) ===
    "php-eol": 2,
    "nginx-eol": 2,
    "apache-eol": 2,
    "nodejs-eol": 2,
    "python-eol": 2,
    "mysql-eol": 2,
    "postgresql-eol": 2,
    "mongodb-eol": 2,
    "redis-eol": 2,
    "windows-eol": 2,
    "ubuntu-eol": 2,
    "centos-eol": 2,
    "debian-eol": 2,

    # === Folder/file exposure (-2 each, low급) ===
    "idea-folder-exposure": 2,

    # 여기 없는 info template은 0점 (tech-detect, waf-detect, whois 등)
}


def _location_weight(num_locations: int) -> float:
    """1 loc = 1.0x, +0.2x per additional location, max 2.0x"""
    return min(1.0 + 0.2 * (num_locations - 1), 2.0)


def calculate_score(vulnerabilities: list[dict]) -> tuple[int, str, list[dict]]:
    """
    Calculate security score based on vulnerabilities with diminishing penalty.

    Each vulnerability's base deduction is multiplied by a location weight
    (more locations = higher weight, capped at 2.0x).

    Returns (score, grade, score_breakdown).
    """
    score = 100
    score_breakdown: list[dict] = []

    # Base deductions and caps per severity
    # Calibrated so intentionally-vulnerable sites score below 80
    SEVERITY_CONFIG = {
        "critical": {"base": 30, "cap": 60},
        "high": {"base": 20, "cap": 40},
        "medium": {"base": 10, "cap": 25},
        "low": {"base": 3, "cap": 10},
    }

    # Accumulate weighted deductions per severity for cap enforcement
    severity_totals: dict[str, float] = {s: 0.0 for s in SEVERITY_CONFIG}

    for vuln in vulnerabilities:
        severity = vuln.get("severity", "info").lower()
        template_id = vuln.get("template_id", "")
        name = vuln.get("name", "unknown")
        num_locations = len(vuln.get("matched_locations", [])) or 1
        weight = _location_weight(num_locations)

        if severity in SEVERITY_CONFIG:
            base = SEVERITY_CONFIG[severity]["base"]
            weighted = round(base * weight)
            severity_totals[severity] += weighted
            score_breakdown.append({
                "template_id": template_id,
                "name": name,
                "severity": severity,
                "locations": num_locations,
                "base_deduction": base,
                "weight": weight,
                "actual_deduction": weighted,  # may be adjusted by cap later
            })
        elif severity == "info":
            # Info templates: look up per-template deduction
            base = 0
            for pattern, deduction in INFO_SEVERITY_OVERRIDE.items():
                if pattern in template_id.lower():
                    base = deduction
                    break
            if base > 0:
                weighted = round(base * weight)
                score_breakdown.append({
                    "template_id": template_id,
                    "name": name,
                    "severity": "info",
                    "locations": num_locations,
                    "base_deduction": base,
                    "weight": weight,
                    "actual_deduction": weighted,
                })
                score -= weighted

    # Apply severity caps and deduct from score
    for sev, config in SEVERITY_CONFIG.items():
        raw_total = severity_totals[sev]
        cap = config["cap"]
        if raw_total <= 0:
            continue
        capped_total = min(raw_total, cap)
        score -= int(capped_total)

        # If cap was hit, scale down individual breakdown items proportionally
        if raw_total > cap:
            ratio = cap / raw_total
            for item in score_breakdown:
                if item["severity"] == sev:
                    item["actual_deduction"] = round(item["actual_deduction"] * ratio)
            # Add cap info item
            score_breakdown.append({
                "template_id": f"_cap_{sev}",
                "name": f"{sev.title()} severity cap applied",
                "severity": sev,
                "locations": 0,
                "base_deduction": 0,
                "weight": 0.0,
                "actual_deduction": -round(raw_total - cap),  # negative = reduction
            })

    # Ensure score doesn't go below 0
    score = max(score, 0)

    # Calculate grade
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
