"""
Tests for the Astro route extractor.
"""

import pytest

from app.services.route_extractors.astro import AstroConverter


@pytest.fixture
def converter() -> AstroConverter:
    return AstroConverter()


class TestAstroBasicRoutes:
    """The basic Astro routing table."""

    def test_index_page(self, converter):
        routes = converter.convert(["src/pages/index.astro"])
        assert [r.pattern for r in routes] == ["/"]

    def test_static_page(self, converter):
        routes = converter.convert(["src/pages/about.astro"])
        assert [r.pattern for r in routes] == ["/about"]

    def test_dynamic_param(self, converter):
        routes = converter.convert(["src/pages/blog/[slug].astro"])
        assert [r.pattern for r in routes] == ["/blog/:slug"]

    def test_rest_catch_all(self, converter):
        routes = converter.convert(["src/pages/blog/[...path].astro"])
        assert [r.pattern for r in routes] == ["/blog/:path"]

    def test_api_endpoint_ts(self, converter):
        routes = converter.convert(["src/pages/api/search.ts"])
        assert [r.pattern for r in routes] == ["/api/search"]


class TestAstroExtensions:
    def test_markdown_page(self, converter):
        routes = converter.convert(["src/pages/post.md"])
        assert [r.pattern for r in routes] == ["/post"]

    def test_mdx_page(self, converter):
        routes = converter.convert(["src/pages/post.mdx"])
        assert [r.pattern for r in routes] == ["/post"]

    def test_js_endpoint(self, converter):
        routes = converter.convert(["src/pages/api/ping.js"])
        assert [r.pattern for r in routes] == ["/api/ping"]


class TestAstroPrivateFiles:
    def test_underscore_file_is_skipped(self, converter):
        routes = converter.convert(["src/pages/_hidden.astro"])
        assert routes == []

    def test_underscore_directory_is_skipped(self, converter):
        routes = converter.convert(["src/pages/_utils/helper.astro"])
        assert routes == []

    def test_outside_pages_root_is_skipped(self, converter):
        routes = converter.convert(["pages/index.astro", "src/components/Foo.astro"])
        assert routes == []


class TestAstroAppliesTo:
    def test_positive(self, converter):
        assert converter.applies_to(["src/pages/index.astro"]) is True

    def test_negative_empty(self, converter):
        assert converter.applies_to([]) is False

    def test_negative_unrelated(self, converter):
        files = ["app/page.tsx", "pages/index.tsx", "README.md"]
        assert converter.applies_to(files) is False


class TestAstroDedupe:
    def test_two_sources_same_pattern_dedupe(self, converter):
        # Astro doesn't normally collide, but an .astro + .md at the same
        # path would — make sure the converter collapses them.
        files = [
            "src/pages/about.astro",
            "src/pages/about.md",
        ]
        routes = converter.convert(files)
        assert len(routes) == 1
        assert routes[0].pattern == "/about"


class TestAstroEmpty:
    def test_empty_file_list(self, converter):
        assert converter.convert([]) == []
