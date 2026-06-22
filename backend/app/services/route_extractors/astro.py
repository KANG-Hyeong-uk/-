"""Astro file-path → route conversion.

Routing reference (``src/pages/`` is always the root):
    src/pages/index.astro              → /
    src/pages/about.astro              → /about
    src/pages/blog/[slug].astro        → /blog/:slug
    src/pages/blog/[...path].astro     → /blog/:path       (rest/catch-all)
    src/pages/api/search.ts            → /api/search       (API endpoint)

Files starting with ``_`` are not routable.
"""

from __future__ import annotations

from pathlib import PurePosixPath

from .base import (
    Framework,
    FrameworkConverter,
    RoutePath,
    strip_ext,
)


ASTRO_EXTENSIONS: tuple[str, ...] = (".astro", ".md", ".mdx", ".ts", ".js")

ASTRO_ROOT = "src/pages/"


class AstroConverter:
    framework = Framework.ASTRO

    def applies_to(self, files: list[str]) -> bool:
        return any(f.startswith(ASTRO_ROOT) and f.endswith(ASTRO_EXTENSIONS) for f in files)

    def convert(self, files: list[str]) -> list[RoutePath]:
        routes: list[RoutePath] = []
        for f in files:
            if not f.startswith(ASTRO_ROOT):
                continue
            if not f.endswith(ASTRO_EXTENSIONS):
                continue

            rel = f[len(ASTRO_ROOT):]
            without_ext = strip_ext(rel)
            parts = PurePosixPath(without_ext).parts
            if not parts:
                continue

            # Any path component starting with `_` makes the file non-routable
            if any(p.startswith("_") for p in parts):
                continue

            # index → route is the parent directory
            if parts[-1] == "index":
                parts = parts[:-1]

            route_segments = [_convert_segment(p) for p in parts]
            pattern = "/" + "/".join(route_segments)
            pattern = pattern or "/"
            routes.append(RoutePath(pattern=pattern, source_file=f))

        return _dedupe(routes)


def _convert_segment(segment: str) -> str:
    """``[slug]`` → ``:slug``; ``[...rest]`` → ``:rest``."""
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


ASTRO_CONVERTERS: list[FrameworkConverter] = [AstroConverter()]
