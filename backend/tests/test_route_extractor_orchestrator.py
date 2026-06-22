"""Integration test for GitHubRouteExtractor with a mocked GitHub tree."""

from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services.route_extractors import GitHubRouteExtractor
from app.services.route_extractors.base import RouteHint


NEXTJS_APP_TREE = [
    "package.json",
    "next.config.js",
    "app/layout.tsx",
    "app/page.tsx",
    "app/users/page.tsx",
    "app/users/[id]/page.tsx",
    "app/users/[id]/edit/page.tsx",
    "app/(marketing)/about/page.tsx",
    "app/api/users/route.ts",
    "app/api/users/[id]/route.ts",
    "components/Button.tsx",
    "README.md",
]


def _fake_gh_returning(tree_files: list[str]) -> MagicMock:
    """Build a MagicMock GitHubService that serves the expected sequence
    of calls used by ``github_tree.fetch_tree``."""
    gh = MagicMock()
    gh._request = AsyncMock()
    # 1. Repo info (default branch)
    # 2. Ref (commit sha)
    # 3. Tree
    gh._request.side_effect = [
        {"default_branch": "main"},
        {"object": {"sha": "abc123"}},
        {
            "tree": [{"type": "blob", "path": p} for p in tree_files],
            "truncated": False,
        },
    ]
    return gh


@pytest.mark.asyncio
async def test_extract_returns_nextjs_app_routes():
    gh = _fake_gh_returning(NEXTJS_APP_TREE)
    extractor = GitHubRouteExtractor(gh, "owner/repo", base_url="https://example.com")
    hints = await extractor.extract()

    assert len(hints) > 0
    assert all(isinstance(h, RouteHint) for h in hints)

    urls = {h.url for h in hints}
    # Static + dynamic + grouped + API routes all appear
    assert "https://example.com/?_=1" in urls
    assert "https://example.com/users?_=1" in urls
    assert any(u.startswith("https://example.com/users/1") for u in urls)
    assert any(u.startswith("https://example.com/users/1/edit") for u in urls)
    assert "https://example.com/about?_=1" in urls
    assert "https://example.com/api/users?_=1" in urls
    assert any(u.startswith("https://example.com/api/users/1") for u in urls)


@pytest.mark.asyncio
async def test_extract_returns_empty_for_non_web_repo():
    gh = _fake_gh_returning(["README.md", "src/main.py", "tests/test_main.py"])
    extractor = GitHubRouteExtractor(gh, "owner/python-pkg", base_url="https://example.com")
    hints = await extractor.extract()
    assert hints == []


@pytest.mark.asyncio
async def test_extract_handles_tree_fetch_failure():
    gh = MagicMock()
    gh._request = AsyncMock(side_effect=Exception("boom"))
    extractor = GitHubRouteExtractor(gh, "owner/repo", base_url="https://example.com")
    hints = await extractor.extract()
    assert hints == []


@pytest.mark.asyncio
async def test_extract_applies_route_cap():
    # Build > 30 routes to exercise the MAX_ROUTES_PER_REPO cap
    many_files = [f"app/page{i}/page.tsx" for i in range(50)]
    many_files.append("app/page.tsx")
    gh = _fake_gh_returning(many_files)
    extractor = GitHubRouteExtractor(gh, "owner/repo", base_url="https://example.com")
    hints = await extractor.extract()
    assert len(hints) <= 30


@pytest.mark.asyncio
async def test_extract_attaches_query_param_for_dast_filter():
    # DAST filter keeps only URLs containing "?", so every hint must.
    gh = _fake_gh_returning(NEXTJS_APP_TREE)
    extractor = GitHubRouteExtractor(gh, "owner/repo", base_url="https://example.com")
    hints = await extractor.extract()
    assert all("?" in h.url for h in hints)
