"""Unit tests for the Next.js file-path → route converters."""

import pytest

from app.services.route_extractors.nextjs import (
    NextAppRouterConverter,
    NextPagesRouterConverter,
)


# --- App Router ------------------------------------------------------


class TestNextAppRouterConverter:
    def setup_method(self):
        self.c = NextAppRouterConverter()

    @pytest.mark.parametrize("source,expected", [
        ("app/page.tsx", "/"),
        ("app/users/page.tsx", "/users"),
        ("app/users/[id]/page.tsx", "/users/:id"),
        ("app/users/[id]/edit/page.tsx", "/users/:id/edit"),
        ("app/blog/[...slug]/page.tsx", "/blog/:slug"),
        ("app/shop/[[...segments]]/page.tsx", "/shop/:segments"),
        ("app/(marketing)/about/page.tsx", "/about"),
        ("app/(marketing)/(pricing)/plans/page.tsx", "/plans"),
        ("app/api/users/route.ts", "/api/users"),
        ("app/api/users/[id]/route.ts", "/api/users/:id"),
        ("src/app/page.tsx", "/"),                   # src/ variant
        ("src/app/dashboard/page.tsx", "/dashboard"),
    ])
    def test_single_route(self, source, expected):
        routes = self.c.convert([source])
        patterns = [r.pattern for r in routes]
        assert patterns == [expected], f"{source} → {patterns} (expected [{expected}])"

    def test_layout_and_loading_are_ignored(self):
        files = [
            "app/layout.tsx",
            "app/loading.tsx",
            "app/error.tsx",
            "app/not-found.tsx",
            "app/template.tsx",
            "app/users/layout.tsx",
        ]
        assert self.c.convert(files) == []

    def test_private_folder_is_skipped(self):
        # Next.js: _components/ inside app/ is NOT a route, even with page.tsx
        files = ["app/_components/button/page.tsx"]
        assert self.c.convert(files) == []

    def test_parallel_routes_slot_stripped(self):
        # app/@modal/login/page.tsx is a parallel route — URL is just /login
        routes = self.c.convert(["app/@modal/login/page.tsx"])
        assert [r.pattern for r in routes] == ["/login"]

    def test_applies_to_matches_app_dir(self):
        assert self.c.applies_to(["app/page.tsx"]) is True
        assert self.c.applies_to(["src/app/page.tsx"]) is True
        assert self.c.applies_to(["pages/index.tsx"]) is False
        assert self.c.applies_to(["README.md"]) is False

    def test_dedupe(self):
        # Same route pattern from two source files → one RoutePath
        files = ["app/users/page.tsx", "app/users/page.jsx"]
        routes = self.c.convert(files)
        assert len(routes) == 1
        assert routes[0].pattern == "/users"

    def test_empty_list(self):
        assert self.c.convert([]) == []

    def test_non_route_files_ignored(self):
        files = [
            "app/users/UserCard.tsx",         # component, not page
            "app/users/hooks.ts",
            "app/globals.css",
            "README.md",
        ]
        assert self.c.convert(files) == []


# --- Pages Router ----------------------------------------------------


class TestNextPagesRouterConverter:
    def setup_method(self):
        self.c = NextPagesRouterConverter()

    @pytest.mark.parametrize("source,expected", [
        ("pages/index.tsx", "/"),
        ("pages/about.tsx", "/about"),
        ("pages/users/index.tsx", "/users"),
        ("pages/users/[id].tsx", "/users/:id"),
        ("pages/users/[id]/edit.tsx", "/users/:id/edit"),
        ("pages/blog/[...slug].tsx", "/blog/:slug"),
        ("pages/api/users.ts", "/api/users"),
        ("pages/api/users/[id].ts", "/api/users/:id"),
        ("src/pages/index.tsx", "/"),
        ("src/pages/contact.tsx", "/contact"),
    ])
    def test_single_route(self, source, expected):
        routes = self.c.convert([source])
        patterns = [r.pattern for r in routes]
        assert patterns == [expected], f"{source} → {patterns}"

    def test_reserved_files_ignored(self):
        files = [
            "pages/_app.tsx",
            "pages/_document.tsx",
            "pages/_error.tsx",
            "pages/api/_middleware.ts",
        ]
        assert self.c.convert(files) == []

    def test_applies_to(self):
        assert self.c.applies_to(["pages/index.tsx"]) is True
        assert self.c.applies_to(["src/pages/index.tsx"]) is True
        assert self.c.applies_to(["app/page.tsx"]) is False

    def test_empty_list(self):
        assert self.c.convert([]) == []
