"""SvelteKit file-path → route conversion.

Routing reference (``src/routes/`` is the root):
    src/routes/+page.svelte                → /
    src/routes/about/+page.svelte          → /about
    src/routes/users/[id]/+page.svelte     → /users/:id
    src/routes/blog/[...slug]/+page.svelte → /blog/:slug
    src/routes/(auth)/login/+page.svelte   → /login   (group stripped)
    src/routes/api/posts/+server.ts        → /api/posts

Only ``+page.svelte``, ``+page.md``, and ``+server.(ts|js)`` declare routes.
``+page.ts``/``+page.js`` are loaders; we skip them if a sibling ``+page.svelte``
exists (to avoid dupes) and emit them otherwise.
"""

from __future__ import annotations

from pathlib import PurePosixPath

from .base import (
    Framework,
    FrameworkConverter,
    RoutePath,
)


SVELTEKIT_ROOT = "src/routes/"

# Filenames that unambiguously declare a route.
PAGE_FILES: set[str] = {"+page.svelte", "+page.md"}
SERVER_FILES: set[str] = {"+server.ts", "+server.js"}
LOADER_FILES: set[str] = {"+page.ts", "+page.js"}


class SvelteKitConverter:
    framework = Framework.SVELTEKIT

    def applies_to(self, files: list[str]) -> bool:
        return any(f.startswith(SVELTEKIT_ROOT) for f in files)

    def convert(self, files: list[str]) -> list[RoutePath]:
        # Track directories that already have a +page.svelte/+page.md so
        # loaders (+page.ts) in the same dir don't emit a duplicate.
        page_dirs: set[str] = set()
        for f in files:
            if not f.startswith(SVELTEKIT_ROOT):
                continue
            p = PurePosixPath(f)
            if p.name in PAGE_FILES:
                page_dirs.add(str(p.parent))

        routes: list[RoutePath] = []
        for f in files:
            if not f.startswith(SVELTEKIT_ROOT):
                continue

            p = PurePosixPath(f)
            name = p.name
            if name in PAGE_FILES or name in SERVER_FILES:
                pass
            elif name in LOADER_FILES:
                if str(p.parent) in page_dirs:
                    continue
            else:
                continue

            rel = f[len(SVELTEKIT_ROOT):]
            parent = PurePosixPath(rel).parent
            segments = [s for s in parent.parts if s not in ("", ".")]

            route_segments: list[str] = []
            for seg in segments:
                if seg.startswith("(") and seg.endswith(")"):
                    continue
                route_segments.append(_convert_segment(seg))

            pattern = "/" + "/".join(route_segments)
            pattern = pattern or "/"
            routes.append(RoutePath(pattern=pattern, source_file=f))

        return _dedupe(routes)


def _convert_segment(segment: str) -> str:
    """``[id]`` → ``:id``; ``[...slug]`` → ``:slug``."""
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


SVELTEKIT_CONVERTERS: list[FrameworkConverter] = [SvelteKitConverter()]
