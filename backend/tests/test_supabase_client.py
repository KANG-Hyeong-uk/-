"""
Tests for SupabaseService utility methods and calculate_summary.

Database-calling async methods are tested by mocking the Supabase client.
"""

import pytest
from unittest.mock import patch, MagicMock, AsyncMock

from app.models.schemas import VulnerabilitySummary, ScanCreate, ScanStatus


@pytest.fixture
def service():
    """Create a SupabaseService with a mocked Supabase client."""
    with patch("app.services.supabase_client.get_settings") as mock_settings, \
         patch("app.services.supabase_client.create_client") as mock_create:
        mock_settings.return_value = MagicMock(
            supabase_url="https://fake.supabase.co",
            supabase_service_role_key="fake-key"
        )
        mock_client = MagicMock()
        mock_create.return_value = mock_client
        from app.services.supabase_client import SupabaseService
        instance = SupabaseService()
        yield instance


class TestCalculateSummary:
    """Test the synchronous calculate_summary method."""

    def test_empty_vulnerabilities(self, service):
        summary = service.calculate_summary([])
        assert summary.critical == 0
        assert summary.high == 0
        assert summary.medium == 0
        assert summary.low == 0
        assert summary.info == 0

    def test_all_severities(self, service):
        vulns = [
            {"severity": "critical"},
            {"severity": "critical"},
            {"severity": "high"},
            {"severity": "medium"},
            {"severity": "medium"},
            {"severity": "medium"},
            {"severity": "low"},
            {"severity": "info"},
            {"severity": "info"},
        ]
        summary = service.calculate_summary(vulns)
        assert summary.critical == 2
        assert summary.high == 1
        assert summary.medium == 3
        assert summary.low == 1
        assert summary.info == 2

    def test_unknown_severity_counted_as_info(self, service):
        vulns = [
            {"severity": "unknown"},
            {"severity": ""},
        ]
        summary = service.calculate_summary(vulns)
        assert summary.info == 2

    def test_missing_severity_counted_as_info(self, service):
        vulns = [{"name": "no severity key"}]
        summary = service.calculate_summary(vulns)
        assert summary.info == 1

    def test_returns_vulnerability_summary_model(self, service):
        summary = service.calculate_summary([])
        assert isinstance(summary, VulnerabilitySummary)


class TestGetScorePercentile:
    """Test the synchronous get_score_percentile method."""

    def test_empty_scores(self, service):
        result = service.get_score_percentile([], 50)
        assert result == 0.0

    def test_all_below(self, service):
        scores = [10, 20, 30, 40]
        result = service.get_score_percentile(scores, 100)
        assert result == 100.0

    def test_none_below(self, service):
        scores = [50, 60, 70, 80]
        result = service.get_score_percentile(scores, 10)
        assert result == 0.0

    def test_50th_percentile(self, service):
        scores = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
        result = service.get_score_percentile(scores, 50)
        # 4 scores below 50 out of 10 = 40%
        assert result == 40.0

    def test_exact_match_not_counted(self, service):
        """Score equal to target should NOT be counted as below."""
        scores = [50, 50, 50]
        result = service.get_score_percentile(scores, 50)
        assert result == 0.0

    def test_single_score(self, service):
        scores = [75]
        result = service.get_score_percentile(scores, 80)
        assert result == 100.0


@pytest.mark.asyncio
class TestCreateScan:
    """Test create_scan with mocked DB."""

    async def test_create_scan_success(self, service):
        mock_result = MagicMock()
        mock_result.data = [{"id": "new-scan-id", "target_url": "https://example.com", "status": "pending"}]
        service.client.table.return_value.insert.return_value.execute.return_value = mock_result

        scan_data = ScanCreate(target_url="https://example.com", scan_mode="quick", status="pending")
        result = await service.create_scan(scan_data)
        assert result["id"] == "new-scan-id"

    async def test_create_scan_failure(self, service):
        mock_result = MagicMock()
        mock_result.data = []
        service.client.table.return_value.insert.return_value.execute.return_value = mock_result

        scan_data = ScanCreate(target_url="https://example.com")
        with pytest.raises(Exception, match="Failed to create scan"):
            await service.create_scan(scan_data)


@pytest.mark.asyncio
class TestGetScan:
    """Test get_scan with mocked DB."""

    async def test_get_scan_found(self, service):
        mock_result = MagicMock()
        mock_result.data = [{"id": "scan-1", "status": "completed"}]
        service.client.table.return_value.select.return_value.eq.return_value.execute.return_value = mock_result

        result = await service.get_scan("scan-1")
        assert result["id"] == "scan-1"

    async def test_get_scan_not_found(self, service):
        mock_result = MagicMock()
        mock_result.data = []
        service.client.table.return_value.select.return_value.eq.return_value.execute.return_value = mock_result

        result = await service.get_scan("nonexistent")
        assert result is None


@pytest.mark.asyncio
class TestUpdateScanStatus:
    """Test update_scan_status with mocked DB."""

    async def test_update_success(self, service):
        mock_result = MagicMock()
        mock_result.data = [{"id": "scan-1", "status": "completed", "score": 85}]
        service.client.table.return_value.update.return_value.eq.return_value.execute.return_value = mock_result

        result = await service.update_scan_status("scan-1", ScanStatus.COMPLETED, score=85, grade="B+")
        assert result["score"] == 85

    async def test_update_failure(self, service):
        mock_result = MagicMock()
        mock_result.data = []
        service.client.table.return_value.update.return_value.eq.return_value.execute.return_value = mock_result

        with pytest.raises(Exception, match="Failed to update scan"):
            await service.update_scan_status("bad-id", ScanStatus.FAILED)


@pytest.mark.asyncio
class TestCreateVulnerabilitiesBatch:
    """Test batch vulnerability creation."""

    async def test_empty_list_returns_empty(self, service):
        result = await service.create_vulnerabilities_batch("scan-1", [])
        assert result == []

    async def test_batch_insert(self, service):
        mock_result = MagicMock()
        mock_result.data = [
            {"id": "v1", "template_id": "xss"},
            {"id": "v2", "template_id": "sqli"},
        ]
        service.client.table.return_value.insert.return_value.execute.return_value = mock_result

        vulns = [
            {"template_id": "xss", "name": "XSS", "severity": "high"},
            {"template_id": "sqli", "name": "SQLi", "severity": "critical"},
        ]
        result = await service.create_vulnerabilities_batch("scan-1", vulns)
        assert len(result) == 2
