"""
Tests for ClaudeAnalyzer response parsing and helper methods.

These tests do NOT call the real Gemini API.
They test the parsing/normalization logic that runs after a response is received.
"""

import pytest
from unittest.mock import patch, MagicMock

# We need to mock external dependencies before importing ClaudeAnalyzer
# because the module imports get_settings and get_supabase_service at load time.


@pytest.fixture
def analyzer():
    """Create a ClaudeAnalyzer with mocked dependencies."""
    with patch("app.services.claude_analyzer.get_settings") as mock_settings, \
         patch("app.services.claude_analyzer.get_supabase_service") as mock_supabase, \
         patch("app.services.claude_analyzer.genai") as mock_genai:
        mock_settings.return_value = MagicMock(gemini_api_key="test-key")
        mock_supabase.return_value = MagicMock()
        from app.services.claude_analyzer import ClaudeAnalyzer
        instance = ClaudeAnalyzer()
        yield instance


class TestParseAnalysisResponse:
    """Test _parse_analysis_response with various inputs."""

    def test_valid_json(self, analyzer, sample_claude_json_response):
        result = analyzer._parse_analysis_response(sample_claude_json_response)
        assert result["description"] != ""
        assert result["category"] == "exposure"
        assert result["fix_complexity"] == "simple"
        assert isinstance(result["fix_steps"], list)
        assert len(result["fix_steps"]) == 3
        assert isinstance(result["references"], list)

    def test_json_with_markdown_code_block(self, analyzer):
        response = '```json\n{"description":"test","impact":"none","category":"misconfig","before_code":"a","after_code":"b","fix_steps":[],"fix_complexity":"complex","references":[]}\n```'
        result = analyzer._parse_analysis_response(response)
        assert result["description"] == "test"
        assert result["category"] == "misconfig"
        assert result["fix_complexity"] == "complex"

    def test_json_with_plain_code_block(self, analyzer):
        response = '```\n{"description":"test","impact":"ok","category":"api_leak","before_code":"","after_code":"","fix_steps":["step1"],"fix_complexity":"simple","references":[]}\n```'
        result = analyzer._parse_analysis_response(response)
        assert result["category"] == "api_leak"
        assert result["fix_steps"] == ["step1"]

    def test_malformed_json_returns_fallback(self, analyzer):
        response = "This is not JSON at all, just some text about vulnerabilities."
        result = analyzer._parse_analysis_response(response)
        assert result["description"] == response[:500]
        assert result["category"] == "exposure"
        assert result["fix_complexity"] == "moderate"
        assert result["fix_steps"] == []

    def test_empty_response(self, analyzer):
        result = analyzer._parse_analysis_response("")
        assert result["category"] == "exposure"
        assert result["fix_complexity"] == "moderate"

    def test_partial_json_fields(self, analyzer):
        """Missing fields should get defaults."""
        response = '{"description":"only desc"}'
        result = analyzer._parse_analysis_response(response)
        assert result["description"] == "only desc"
        assert result["impact"] == "Unknown"
        assert result["category"] == "exposure"
        assert result["before_code"] == ""
        assert result["after_code"] == ""
        assert result["fix_steps"] == []
        assert result["fix_complexity"] == "moderate"


class TestNormalizeCategory:
    """Test _normalize_category."""

    def test_valid_categories(self, analyzer):
        assert analyzer._normalize_category("api_leak") == "api_leak"
        assert analyzer._normalize_category("exposure") == "exposure"
        assert analyzer._normalize_category("misconfig") == "misconfig"
        assert analyzer._normalize_category("cve") == "cve"
        assert analyzer._normalize_category("privacy_risk") == "privacy_risk"

    def test_case_insensitive(self, analyzer):
        assert analyzer._normalize_category("API_LEAK") == "api_leak"
        assert analyzer._normalize_category("Misconfig") == "misconfig"

    def test_invalid_category_defaults_to_exposure(self, analyzer):
        assert analyzer._normalize_category("unknown") == "exposure"
        assert analyzer._normalize_category("") == "exposure"
        assert analyzer._normalize_category("something_else") == "exposure"


class TestNormalizeComplexity:
    """Test _normalize_complexity."""

    def test_valid_complexities(self, analyzer):
        assert analyzer._normalize_complexity("simple") == "simple"
        assert analyzer._normalize_complexity("moderate") == "moderate"
        assert analyzer._normalize_complexity("complex") == "complex"

    def test_case_insensitive(self, analyzer):
        assert analyzer._normalize_complexity("SIMPLE") == "simple"
        assert analyzer._normalize_complexity("Complex") == "complex"

    def test_invalid_complexity_defaults_to_moderate(self, analyzer):
        assert analyzer._normalize_complexity("unknown") == "moderate"
        assert analyzer._normalize_complexity("") == "moderate"


class TestGetDefaultAnalysis:
    """Test _get_default_analysis fallback."""

    def test_default_for_api_key_vuln(self, analyzer):
        vuln = {"name": "API Key Exposure", "severity": "high", "template_id": "api-key"}
        result = analyzer._get_default_analysis(vuln)
        assert result["category"] == "api_leak"

    def test_default_for_config_vuln(self, analyzer):
        vuln = {"name": "Config File Exposed", "severity": "medium", "template_id": "config-file"}
        result = analyzer._get_default_analysis(vuln)
        assert result["category"] == "misconfig"

    def test_default_for_cve_vuln(self, analyzer):
        vuln = {"name": "Some vulnerability", "severity": "critical", "template_id": "cve-2024-1234"}
        result = analyzer._get_default_analysis(vuln)
        assert result["category"] == "cve"

    def test_default_for_generic_vuln(self, analyzer):
        vuln = {"name": "XSS Reflected", "severity": "high", "template_id": "xss-reflected"}
        result = analyzer._get_default_analysis(vuln)
        assert result["category"] == "exposure"
        # XSS template should have real before/after code
        assert "VULNERABLE" in result["before_code"]
        assert "FIXED" in result["after_code"]

    def test_default_includes_error(self, analyzer):
        vuln = {"name": "test", "severity": "info", "template_id": "test"}
        result = analyzer._get_default_analysis(vuln, error="API timeout")
        assert result["_error"] == "API timeout"

    def test_default_fix_steps_present(self, analyzer):
        vuln = {"name": "test", "severity": "info", "template_id": "test"}
        result = analyzer._get_default_analysis(vuln)
        assert isinstance(result["fix_steps"], list)
        assert len(result["fix_steps"]) >= 3

    def test_sqli_template_has_code_examples(self, analyzer):
        vuln = {"name": "Error based SQL Injection", "severity": "critical", "template_id": "sqli-error-based"}
        result = analyzer._get_default_analysis(vuln)
        assert result["category"] == "cve"
        assert "parameterized" in result["after_code"].lower()
        assert len(result["fix_steps"]) >= 3

    def test_header_template_has_code_examples(self, analyzer):
        vuln = {"name": "HTTP Missing Security Headers", "severity": "medium", "template_id": "http-missing-security-headers"}
        result = analyzer._get_default_analysis(vuln)
        assert result["category"] == "misconfig"
        assert "X-Frame-Options" in result["after_code"]

    def test_detect_template_is_informational(self, analyzer):
        vuln = {"name": "PHP Detect", "severity": "info", "template_id": "php-detect"}
        result = analyzer._get_default_analysis(vuln)
        assert result["fix_complexity"] == "simple"
        assert "server_tokens" in result["after_code"]


class TestBuildAnalysisPrompt:
    """Test _build_analysis_prompt output."""

    def test_basic_prompt(self, analyzer, sample_vulnerability):
        prompt = analyzer._build_analysis_prompt(sample_vulnerability)
        assert "xss-reflected" in prompt
        assert "Reflected XSS" in prompt
        assert "high" in prompt

    def test_prompt_includes_extracted_results(self, analyzer, sample_vulnerability):
        prompt = analyzer._build_analysis_prompt(sample_vulnerability)
        assert "<script>" in prompt

    def test_prompt_includes_tags(self, analyzer, sample_vulnerability):
        prompt = analyzer._build_analysis_prompt(sample_vulnerability)
        assert "xss" in prompt

    def test_prompt_without_optional_fields(self, analyzer):
        vuln = {"template_id": "test", "name": "Test", "severity": "info"}
        prompt = analyzer._build_analysis_prompt(vuln)
        assert "test" in prompt
        assert "Test" in prompt
