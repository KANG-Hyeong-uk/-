"""Remix file-path → route conversion.

Supports both v2 flat-route convention and the legacy nested-directory
convention. ``app/routes/`` is the root in both.

v2 flat (dots are separators):
    app/routes/_index.tsx           → /
    app/routes/about.tsx            → /about
    app/routes/users.$id.tsx        → /users/:id
    app/routes/users.$id.edit.tsx   → /users/:id/edit
    app/routes/posts.$.tsx          → /posts/:splat
    app/routes/($lang).about.tsx    → /about         (optional → emit non-optional)
    app/routes/_auth.login.tsx      → /login         (pathless layout stripped)

Legacy nested (directory segments):
    app/routes/users/$id.tsx        → /users/:id
    app/routes/users/$id/edit.tsx   → /users/:id/edit
"""

from __future__ import annotations

from pathlib import PurePosixPath

from .base import (
    Framework,
    FrameworkConverter,
    RoutePath,
    strip_ext,
)


REMIX_ROOT = "app/routes/"
REMIX_EXTENSIONS: tuple[str, ...] = (".tsx", ".jsx", ".ts", ".js")


class RemixConverter:
    framework = Framework.REMIX

    def applies_to(self, files: list[str]) -> bool:
        return any(f.startswith(REMIX_ROOT) and f.endswith(REMIX_EXTENSIONS) for f in files)

    def convert(self, files: list[str]) -> list[RoutePath]:
        routes: list[RoutePath] = []
        for f in files:
            if not f.startswith(REMIX_ROOT):
                continue
            if not f.endswith(REMIX_EXTENSIONS):
                continue

            rel = f[len(REMIX_ROOT):]
            without_ext = strip_ext(rel)
            dir_parts = PurePosixPath(without_ext).parts
            if not dir_parts:
                continue

            # Flatten v2 dot-separated filename into segments, keeping
            # legacy directory segments intact.
            segments: list[str] = []
            for i, part in enumerate(dir_parts):
                if i == len(dir_parts) - 1:
                    segments.extend(part.split("."))
                else:
                    segments.append(part)

            route_segments: list[str] = []
            for seg in segments:
                converted = _convert_segment(seg)
                if converted is None:
                    continue
                route_segments.append(converted)

            pattern = "/" + "/".join(route_segments)
            pattern = pattern or "/"
            routes.append(RoutePath(pattern=pattern, source_file=f))

        return _dedupe(routes)


def _convert_segment(segment: str) -> str | None:
    """Translate a single Remix segment.

    Returns None when the segment should be dropped from the URL entirely
    (pathless layouts, optional segments, _index).
    """
    if segment == "_index" or segment == "index":
        return None
    # Pathless layout segment (e.g. _auth) — contributes nothing to URL.
    if segment.startswith("_"):
        return None
    # Optional segment `($lang)` — emit the non-optional form by dropping it.
    if segment.startswith("(") and segment.endswith(")"):
        return None
    if segment == "$":
        return ":splat"
    if segment.startswith("$"):
        return ":" + segment[1:]
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


REMIX_CONVERTERS: list[FrameworkConverter] = [RemixConverter()]
