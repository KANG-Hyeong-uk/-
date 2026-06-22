"""
Tests for the Remix route extractor.
"""

import pytest

from app.services.route_extractors.remix import RemixConverter


@pytest.fixture
def converter() -> RemixConverter:
    return RemixConverter()


class TestRemixFlatRoutes:
    """v2 flat-route convention."""

    def test_index(self, converter):
        routes = converter.convert(["app/routes/_index.tsx"])
        assert [r.pattern for r in routes] == ["/"]

    def test_static(self, converter):
        routes = converter.convert(["app/routes/about.tsx"])
        assert [r.pattern for r in routes] == ["/about"]

    def test_dynamic_param(self, converter):
        routes = converter.convert(["app/routes/users.$id.tsx"])
        assert [r.pattern for r in routes] == ["/users/:id"]

    def test_nested_param(self, converter):
        routes = converter.convert(["app/routes/users.$id.edit.tsx"])
        assert [r.pattern for r in routes] == ["/users/:id/edit"]

    def test_splat(self, converter):
        routes = converter.convert(["app/routes/posts.$.tsx"])
        assert [r.pattern for r in routes] == ["/posts/:splat"]

    def test_optional_segment_drops(self, converter):
        routes = converter.convert(["app/routes/($lang).about.tsx"])
        assert [r.pattern for r in routes] == ["/about"]

    def test_pathless_layout_strips(self, converter):
        routes = converter.convert(["app/routes/_auth.login.tsx"])
        assert [r.pattern for r in routes] == ["/login"]


class TestRemixLegacyNested:
    def test_nested_param(self, converter):
        routes = converter.convert(["app/routes/users/$id.tsx"])
        assert [r.pattern for r in routes] == ["/users/:id"]

    def test_nested_deeper(self, converter):
        routes = converter.convert(["app/routes/users/$id/edit.tsx"])
        assert [r.pattern for r in routes] == ["/users/:id/edit"]


class TestRemixExtensions:
    def test_jsx(self, converter):
        routes = converter.convert(["app/routes/about.jsx"])
        assert [r.pattern for r in routes] == ["/about"]

    def test_ts(self, converter):
        routes = converter.convert(["app/routes/api.ping.ts"])
        assert [r.pattern for r in routes] == ["/api/ping"]


class TestRemixAppliesTo:
    def test_positive(self, converter):
        assert converter.applies_to(["app/routes/_index.tsx"]) is True

    def test_negative_empty(self, converter):
        assert converter.applies_to([]) is False

    def test_negative_unrelated(self, converter):
        files = ["app/page.tsx", "src/pages/index.astro", "src/routes/+page.svelte"]
        assert converter.applies_to(files) is False


class TestRemixDedupe:
    def test_flat_and_legacy_same_pattern(self, converter):
        # If a repo has migrated to v2 but left a legacy file, emit one.
        files = [
            "app/routes/users.$id.tsx",
            "app/routes/users/$id.tsx",
        ]
        routes = converter.convert(files)
        assert len(routes) == 1
        assert routes[0].pattern == "/users/:id"


class TestRemixEmpty:
    def test_empty_file_list(self, converter):
        assert converter.convert([]) == []

    def test_outside_routes_root(self, converter):
        assert converter.convert(["app/root.tsx", "app/entry.server.tsx"]) == []
