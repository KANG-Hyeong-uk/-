"""
Tests for the SvelteKit route extractor.
"""

import pytest

from app.services.route_extractors.sveltekit import SvelteKitConverter


@pytest.fixture
def converter() -> SvelteKitConverter:
    return SvelteKitConverter()


class TestSvelteKitBasicRoutes:
    """The basic SvelteKit routing table."""

    def test_index(self, converter):
        routes = converter.convert(["src/routes/+page.svelte"])
        assert [r.pattern for r in routes] == ["/"]

    def test_static_page(self, converter):
        routes = converter.convert(["src/routes/about/+page.svelte"])
        assert [r.pattern for r in routes] == ["/about"]

    def test_dynamic_param(self, converter):
        routes = converter.convert(["src/routes/users/[id]/+page.svelte"])
        assert [r.pattern for r in routes] == ["/users/:id"]

    def test_rest_param(self, converter):
        routes = converter.convert(["src/routes/blog/[...slug]/+page.svelte"])
        assert [r.pattern for r in routes] == ["/blog/:slug"]

    def test_group_is_stripped(self, converter):
        routes = converter.convert(["src/routes/(auth)/login/+page.svelte"])
        assert [r.pattern for r in routes] == ["/login"]

    def test_server_endpoint(self, converter):
        routes = converter.convert(["src/routes/api/posts/+server.ts"])
        assert [r.pattern for r in routes] == ["/api/posts"]


class TestSvelteKitLoaderDedup:
    def test_page_plus_loader_emits_once(self, converter):
        files = [
            "src/routes/users/[id]/+page.svelte",
            "src/routes/users/[id]/+page.ts",
        ]
        routes = converter.convert(files)
        assert len(routes) == 1
        assert routes[0].pattern == "/users/:id"

    def test_orphan_loader_still_emits(self, converter):
        routes = converter.convert(["src/routes/data/+page.ts"])
        assert [r.pattern for r in routes] == ["/data"]


class TestSvelteKitAppliesTo:
    def test_positive(self, converter):
        assert converter.applies_to(["src/routes/+page.svelte"]) is True

    def test_negative_empty(self, converter):
        assert converter.applies_to([]) is False

    def test_negative_unrelated(self, converter):
        files = ["app/page.tsx", "pages/index.tsx", "src/pages/index.astro"]
        assert converter.applies_to(files) is False


class TestSvelteKitDedupe:
    def test_two_endpoints_same_pattern(self, converter):
        # Same route declared by both page and server handler — one URL.
        files = [
            "src/routes/api/posts/+page.svelte",
            "src/routes/api/posts/+server.ts",
        ]
        routes = converter.convert(files)
        assert len(routes) == 1
        assert routes[0].pattern == "/api/posts"


class TestSvelteKitEmpty:
    def test_empty_file_list(self, converter):
        assert converter.convert([]) == []

    def test_non_route_files_ignored(self, converter):
        files = [
            "src/routes/about/+layout.svelte",
            "src/routes/about/helpers.ts",
        ]
        assert converter.convert(files) == []
