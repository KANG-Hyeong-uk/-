"""
Tests for NucleiScanner result parsing and command building.

These tests do NOT execute actual Nuclei processes.
"""

import json
import tempfile
from pathlib import Path

import pytest
from unittest.mock import patch, MagicMock

from app.models.schemas import ScanMode


@pytest.fixture
def scanner():
    """Create a NucleiScanner with mocked settings."""
    with patch("app.services.nuclei_scanner.get_settings") as mock_settings:
        settings = MagicMock()
        settings.scan_output_dir = tempfile.mkdtemp()
        settings.nuclei_templates_dir = "/root/nuclei-templates"
        settings.nuclei_rate_limit = 150
        settings.nuclei_concurrency = 25
        mock_settings.return_value = settings
        from app.services.nuclei_scanner import NucleiScanner
        instance = NucleiScanner("https://example.com", "test-scan-id")
        yield instance


class TestParseResults:
    """Test _parse_results method."""

    def test_parse_valid_jsonl(self, scanner, sample_nuclei_jsonl_lines):
        """Parse a file with valid lines, invalid lines, and empty lines."""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".jsonl", delete=False) as f:
            f.write("\n".join(sample_nuclei_jsonl_lines))
            f.flush()
            path = Path(f.name)

        findings = scanner._parse_results(path)
        path.unlink()

        # Should parse 3 valid lines (skipping invalid JSON and empty line)
        assert len(findings) == 3

        # Check first finding
        assert findings[0]["template_id"] == "xss-reflected"
        assert findings[0]["name"] == "Reflected XSS"
        assert findings[0]["severity"] == "high"
        assert findings[0]["matched_at"] == "https://example.com/q"
        assert findings[0]["extracted_results"] == ["<script>"]
        assert findings[0]["host"] == "https://example.com"
        assert findings[0]["matched_locations"] == ["https://example.com/q"]

        # Check third finding (SQL injection)
        assert findings[2]["template_id"] == "sqli-error"
        assert findings[2]["severity"] == "critical"

    def test_parse_empty_file(self, scanner):
        """Empty file should return empty list."""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".jsonl", delete=False) as f:
            f.write("")
            f.flush()
            path = Path(f.name)

        findings = scanner._parse_results(path)
        path.unlink()
        assert findings == []

    def test_parse_all_invalid_json(self, scanner):
        """File with only invalid JSON should return empty list."""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".jsonl", delete=False) as f:
            f.write("not json\nalso not json\n{broken\n")
            f.flush()
            path = Path(f.name)

        findings = scanner._parse_results(path)
        path.unlink()
        assert findings == []

    def test_parse_missing_fields_use_defaults(self, scanner):
        """Lines with missing fields should use defaults."""
        line = json.dumps({"template-id": "test-id"})
        with tempfile.NamedTemporaryFile(mode="w", suffix=".jsonl", delete=False) as f:
            f.write(line + "\n")
            f.flush()
            path = Path(f.name)

        findings = scanner._parse_results(path)
        path.unlink()
        assert len(findings) == 1
        assert findings[0]["template_id"] == "test-id"
        assert findings[0]["name"] == "unknown"
        assert findings[0]["severity"] == "unknown"
        assert findings[0]["matched_at"] == ""
        assert findings[0]["matched_locations"] == []
        assert findings[0]["extracted_results"] == []

    def test_parse_deduplicates_by_template_id(self, scanner):
        """Duplicate template_ids should be merged, matched_locations accumulated."""
        lines = [
            json.dumps({"template-id": "cookie-session", "info": {"name": "Cookie Session", "severity": "info"}, "matched-at": "https://example.com/", "host": "https://example.com", "type": "http"}),
            json.dumps({"template-id": "cookie-session", "info": {"name": "Cookie Session", "severity": "info"}, "matched-at": "https://example.com/api", "host": "https://example.com", "type": "http"}),
            json.dumps({"template-id": "cookie-session", "info": {"name": "Cookie Session", "severity": "info"}, "matched-at": "https://example.com/login", "host": "https://example.com", "type": "http"}),
            json.dumps({"template-id": "other-vuln", "info": {"name": "Other", "severity": "low"}, "matched-at": "https://example.com/x", "host": "https://example.com", "type": "http"}),
        ]
        with tempfile.NamedTemporaryFile(mode="w", suffix=".jsonl", delete=False) as f:
            f.write("\n".join(lines))
            f.flush()
            path = Path(f.name)

        findings = scanner._parse_results(path)
        path.unlink()

        assert len(findings) == 2
        # First finding should have all 3 locations merged
        assert findings[0]["template_id"] == "cookie-session"
        assert findings[0]["matched_at"] == "https://example.com/"  # first URL preserved
        assert findings[0]["matched_locations"] == [
            "https://example.com/",
            "https://example.com/api",
            "https://example.com/login",
        ]
        # Second finding has 1 location
        assert findings[1]["template_id"] == "other-vuln"
        assert findings[1]["matched_locations"] == ["https://example.com/x"]

    def test_parse_nonexistent_file(self, scanner):
        """Non-existent file should return empty list (caught by exception handler)."""
        findings = scanner._parse_results(Path("/nonexistent/file.jsonl"))
        assert findings == []


class TestBuildCommand:
    """Test _build_command method."""

    def test_basic_command_without_tags(self, scanner):
        cmd = scanner._build_command(
            severity=["info", "low", "medium", "high", "critical"],
            tags=None,
            output_file="/tmp/output.jsonl"
        )
        assert cmd[0] == "nuclei"
        assert "-u" in cmd
        assert "https://example.com" in cmd
        assert "-severity" in cmd
        assert "-jsonl" in cmd
        assert "-o" in cmd
        assert "/tmp/output.jsonl" in cmd
        # No tags flag when tags is None
        assert "-tags" not in cmd

    def test_command_with_tags(self, scanner):
        cmd = scanner._build_command(
            severity=["high", "critical"],
            tags=["sqli", "xss"],
            output_file="/tmp/output.jsonl"
        )
        assert "-tags" in cmd
        tags_idx = cmd.index("-tags")
        assert cmd[tags_idx + 1] == "sqli,xss"

    def test_command_severity_format(self, scanner):
        cmd = scanner._build_command(
            severity=["high", "critical"],
            tags=None,
            output_file="/tmp/out.jsonl"
        )
        severity_idx = cmd.index("-severity")
        assert cmd[severity_idx + 1] == "high,critical"

    def test_command_uses_http_templates(self, scanner):
        # Current HTTP_TEMPLATE_DIRS = ["exposures", "misconfiguration"] —
        # the T4 optimisation dropped http/cves to avoid the CVE flood.
        # One -t flag is emitted per subdir.
        cmd = scanner._build_command(
            severity=["info"],
            tags=None,
            output_file="/tmp/out.jsonl",
        )
        template_args = [cmd[i + 1] for i, v in enumerate(cmd) if v == "-t"]
        assert "/root/nuclei-templates/http/exposures" in template_args
        assert "/root/nuclei-templates/http/misconfiguration" in template_args


class TestScanConfigs:
    """Test SCAN_CONFIGS are properly defined."""

    def test_all_modes_have_configs(self):
        from app.services.nuclei_scanner import NucleiScanner
        for mode in ScanMode:
            assert mode in NucleiScanner.SCAN_CONFIGS

    def test_tech_mode_config(self):
        from app.services.nuclei_scanner import NucleiScanner
        config = NucleiScanner.SCAN_CONFIGS[ScanMode.TECH]
        assert config["tags"] == ["tech"]
        assert config["timeout"] == 120

    def test_quick_mode_config(self):
        from app.services.nuclei_scanner import NucleiScanner
        config = NucleiScanner.SCAN_CONFIGS[ScanMode.QUICK]
        assert config["tags"] is None
        # Bumped to 600s so DAST Phase 1+2 have room for blind-injection checks
        assert config["timeout"] == 600

    def test_critical_mode_only_high_critical(self):
        from app.services.nuclei_scanner import NucleiScanner
        config = NucleiScanner.SCAN_CONFIGS[ScanMode.CRITICAL]
        assert "high" in config["severity"]
        assert "critical" in config["severity"]
        assert "low" not in config["severity"]
        assert "info" not in config["severity"]


class TestScannerInitialization:
    """Test scanner instance state."""

    def test_initial_state(self, scanner):
        assert scanner.target_url == "https://example.com"
        assert scanner.scan_id == "test-scan-id"
        assert scanner.progress == 0
        assert scanner.current_stage == "initializing"
        assert scanner.findings == []


class TestReachabilityProbe:
    """Test the pre-flight reachability probe that guards against scoring
    unreachable targets as 100/A (the original bug)."""

    @pytest.mark.asyncio
    async def test_reachable_target_returns_normally(self):
        """A host that responds (even 404) counts as reachable."""
        import httpx
        from app.services.nuclei_scanner import probe_target_reachability

        async def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(404, text="nope")

        transport = httpx.MockTransport(handler)
        # Patch httpx.AsyncClient to use the mock transport
        orig_init = httpx.AsyncClient.__init__

        def patched_init(self, *args, **kwargs):
            kwargs["transport"] = transport
            orig_init(self, *args, **kwargs)

        with patch.object(httpx.AsyncClient, "__init__", patched_init):
            # Should NOT raise
            await probe_target_reachability("https://example.com")

    @pytest.mark.asyncio
    async def test_connect_error_raises_unreachable(self):
        """DNS/connection failures become TargetUnreachableError."""
        import httpx
        from app.services.nuclei_scanner import (
            probe_target_reachability,
            TargetUnreachableError,
        )

        async def handler(request: httpx.Request) -> httpx.Response:
            raise httpx.ConnectError("Name or service not known")

        transport = httpx.MockTransport(handler)
        orig_init = httpx.AsyncClient.__init__

        def patched_init(self, *args, **kwargs):
            kwargs["transport"] = transport
            orig_init(self, *args, **kwargs)

        with patch.object(httpx.AsyncClient, "__init__", patched_init):
            with pytest.raises(TargetUnreachableError) as exc_info:
                await probe_target_reachability("https://does-not-exist.invalid")
            assert "Connection" in str(exc_info.value) or "failed" in str(exc_info.value).lower()

    @pytest.mark.asyncio
    async def test_timeout_raises_unreachable(self):
        """Timeouts also count as unreachable."""
        import httpx
        from app.services.nuclei_scanner import (
            probe_target_reachability,
            TargetUnreachableError,
        )

        async def handler(request: httpx.Request) -> httpx.Response:
            raise httpx.ConnectTimeout("timed out")

        transport = httpx.MockTransport(handler)
        orig_init = httpx.AsyncClient.__init__

        def patched_init(self, *args, **kwargs):
            kwargs["transport"] = transport
            orig_init(self, *args, **kwargs)

        with patch.object(httpx.AsyncClient, "__init__", patched_init):
            with pytest.raises(TargetUnreachableError):
                await probe_target_reachability("https://slow.example.com", timeout=1.0)
