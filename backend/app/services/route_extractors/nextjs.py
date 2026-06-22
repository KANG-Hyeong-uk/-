"""Next.js App Router and Pages Router file-path → route conversion.

App Router (``app/``):
    app/page.tsx                    → /
    app/users/page.tsx              → /users
    app/users/[id]/page.tsx         → /users/:id
    app/users/[...slug]/page.tsx    → /users/:slug
    app/(marketing)/about/page.tsx  → /about       (groups stripped)
    app/api/users/route.ts          → /api/users   (API route)

Pages Router (``pages/``):
    pages/index.tsx                 → /
    pages/users.tsx                 → /users
    pages/users/[id].tsx            → /users/:id
    pages/api/users.ts              → /api/users

App Router can live at ``app/`` or ``src/app/``; same for Pages Router.
"""

from __future__ import annotations

import re
from pathlib import PurePosixPath

from .base import (
    Framework,
    FrameworkConverter,
    IGNORED_BASENAMES,
    RoutePath,
    is_route_file,
    strip_ext,
)


# Only these basenames declare a route in App Router; everything else is
# scaffolding (layout, loading, error, etc.)
APP_ROUTE_BASENAMES: set[str] = {"page", "route"}

# Next.js's own reserved directories under pages/ that aren't routes.
PAGES_RESERVED: set[str] = {"_app", "_document", "_error", "api/_middleware"}


class NextAppRouterConverter:
    framework = Framework.NEXTJS_APP

    def applies_to(self, files: list[str]) -> bool:
        return any(_is_under(f, "app/") or _is_under(f, "src/app/") for f in files)

    def convert(self, files: list[str]) -> list[RoutePath]:
        routes: list[RoutePath] = []
        for f in files:
            if not is_route_file(f):
                continue
            rel = _strip_app_root(f)
            if rel is None:
                continue

            p = PurePosixPath(rel)
            basename = p.stem  # "page" from "page.tsx"
            if basename not in APP_ROUTE_BASENAMES:
                continue

            # Parent directory chain becomes the URL path
            segments = list(p.parent.parts)
            method = "GET"
            route_segments: list[str] = []
            for seg in segments:
                # Skip private folders _foo and grouped (marketing)
                if seg.startswith("_"):
                    # Private folder — not routable. But we don't hard-skip
                    # since Next allows _components inside a routed subtree;
                    # treat as non-routable segment = skip entire file.
                    route_segments = []
                    break
                if seg.startswith("(") and seg.endswith(")"):
                    continue  # grouped route, not part of URL
                if seg.startswith("@"):
                    continue  # parallel route slot, not part of URL
                route_segments.append(_convert_dynamic_segment(seg))

            # If the `break` set route_segments to [] but we still entered
            # the loop, distinguish "no segments (root)" from "skipped".
            if segments and not route_segments:
                # Check: did we break or was the path genuinely empty?
                if any(s.startswith("_") for s in segments):
                    continue

            pattern = "/" + "/".join(s for s in route_segments if s)
            pattern = pattern or "/"

            # route.ts (API) is typically POST-able too, but GET is the
            # lowest-friction fuzz target; DAST will cover it.
            routes.append(RoutePath(pattern=pattern, method=method, source_file=f))

        return _dedupe(routes)


class NextPagesRouterConverter:
    framework = Framework.NEXTJS_PAGES

    def applies_to(self, files: list[str]) -> bool:
        # Some repos have both pages/ (legacy) and app/ (new). We still
        # emit routes from pages/ — Next serves both.
        return any(_is_under(f, "pages/") or _is_under(f, "src/pages/") for f in files)

    def convert(self, files: list[str]) -> list[RoutePath]:
        routes: list[RoutePath] = []
        for f in files:
            if not is_route_file(f):
                continue
            rel = _strip_pages_root(f)
            if rel is None:
                continue

            without_ext = strip_ext(rel)
            parts = PurePosixPath(without_ext).parts
            if not parts:
                continue

            # Reserved files like _app, _document → skip
            if any(p.startswith("_") for p in parts):
                continue
            if parts[-1] in IGNORED_BASENAMES:
                continue

            # index.tsx → route is the parent dir ("" means "/")
            if parts[-1] == "index":
                parts = parts[:-1]

            route_segments = [_convert_dynamic_segment(p) for p in parts]
            pattern = "/" + "/".join(route_segments)
            pattern = pattern or "/"
            routes.append(RoutePath(pattern=pattern, source_file=f))

        return _dedupe(routes)


# --- helpers ---------------------------------------------------------

_GROUP_RE = re.compile(r"^\([^)]+\)$")


def _is_under(path: str, prefix: str) -> bool:
    return path == prefix.rstrip("/") or path.startswith(prefix)


def _strip_app_root(path: str) -> str | None:
    """Return the path relative to the app/ directory, or None."""
    for root in ("src/app/", "app/"):
        if path.startswith(root):
            return path[len(root):]
    return None


def _strip_pages_root(path: str) -> str | None:
    for root in ("src/pages/", "pages/"):
        if path.startswith(root):
            return path[len(root):]
    return None


def _convert_dynamic_segment(segment: str) -> str:
    """Translate Next.js dynamic syntax to a generic ``:name`` form.

    ``[id]``          → ``:id``
    ``[...slug]``     → ``:slug``    (catch-all; treat as single segment)
    ``[[...slug]]``   → ``:slug``    (optional catch-all; same)
    non-dynamic       → unchanged
    """
    if segment.startswith("[[...") and segment.endswith("]]"):
        return ":" + segment[5:-2]
    if segment.startswith("[...") and segment.endswith("]"):
        return ":" + segment[4:-1]
    if segment.startswith("[") and segment.endswith("]"):
        return ":" + segment[1:-1]
    return segment


def _dedupe(routes: list[RoutePath]) -> list[RoutePath]:
    seen: set[tuple[str, str]] = set()
    out: list[RoutePath] = []
    for r in routes:
        key = (r.method, r.pattern)
        if key in seen:
            continue
        seen.add(key)
        out.append(r)
    return out


# Exported so the orchestrator/detector can iterate
NEXT_CONVERTERS: list[FrameworkConverter] = [
    NextAppRouterConverter(),
    NextPagesRouterConverter(),
]
