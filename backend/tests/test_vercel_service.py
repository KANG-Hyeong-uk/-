"""
Tests for VercelService.get_project_production_url.

These tests do NOT hit the real Vercel API — _request is mocked to return
synthetic project payloads.
"""

import pytest
from unittest.mock import AsyncMock, patch

from app.services.vercel_service import VercelService


@pytest.fixture
def fake_projects():
    """Synthetic Vercel /v9/projects response — two projects, one matching."""
    return [
        {
            "id": "prj_match",
            "name": "my-app",
            "link": {"type": "github", "repo": "my-app", "org": "owner"},
        },
        {
            "id": "prj_other",
            "name": "unrelated",
            "link": {"type": "github", "repo": "something-else", "org": "someone"},
        },
    ]


def _make_request_mock(projects, project_detail=None):
    """Build an async mock of _request that routes by path.

    ``project_detail`` is returned for GET /v9/projects/{id}. If None, the
    detail call raises 404 and the helper should fall back to the listing
    payload.
    """
    async def fake_request(method, path, params=None, **kwargs):
        if path == "/v9/projects":
            return {"projects": projects}
        if path.startswith("/v9/projects/"):
            if project_detail is None:
                # Simulate Vercel returning sparse data
                return {}
            return project_detail
        if path == "/v2/user":
            return {"user": {"uid": "u_123", "username": "jaden"}}
        return {}
    return fake_request


@pytest.mark.asyncio
async def test_production_url_match_custom_domain(fake_projects):
    """Project match + aliases containing a custom domain returns that domain."""
    project_detail = {
        "id": "prj_match",
        "targets": {
            "production": {
                "alias": ["app.example.com", "my-app-abc123.vercel.app"],
                "url": "my-app-abc123.vercel.app",
            }
        },
    }
    vc = VercelService("fake-token")
    with patch.object(vc, "_request", new=AsyncMock(side_effect=_make_request_mock(fake_projects, project_detail))):
        url = await vc.get_project_production_url("owner/my-app")
    await vc.close()
    assert url == "https://app.example.com"


@pytest.mark.asyncio
async def test_production_url_falls_back_to_vercel_alias(fake_projects):
    """If only .vercel.app aliases exist, first alias is used (with https:// prefix)."""
    project_detail = {
        "id": "prj_match",
        "targets": {
            "production": {
                "alias": ["my-app-abc123.vercel.app"],
                "url": "my-app-abc123.vercel.app",
            }
        },
    }
    vc = VercelService("fake-token")
    with patch.object(vc, "_request", new=AsyncMock(side_effect=_make_request_mock(fake_projects, project_detail))):
        url = await vc.get_project_production_url("owner/my-app")
    await vc.close()
    assert url == "https://my-app-abc123.vercel.app"


@pytest.mark.asyncio
async def test_no_matching_project_returns_none(fake_projects):
    """No project matches the repo → None."""
    vc = VercelService("fake-token")
    with patch.object(vc, "_request", new=AsyncMock(side_effect=_make_request_mock(fake_projects))):
        url = await vc.get_project_production_url("nobody/does-not-exist")
    await vc.close()
    assert url is None


@pytest.mark.asyncio
async def test_no_production_alias_returns_none(fake_projects):
    """Project matches but has no production alias set → None."""
    project_detail = {
        "id": "prj_match",
        "targets": {"production": {}},
    }
    vc = VercelService("fake-token")
    with patch.object(vc, "_request", new=AsyncMock(side_effect=_make_request_mock(fake_projects, project_detail))):
        url = await vc.get_project_production_url("owner/my-app")
    await vc.close()
    assert url is None
