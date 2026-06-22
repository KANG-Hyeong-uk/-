"""Types and interface every framework converter implements.

A converter reads a flat list of repository file paths and emits a list of
``RoutePath`` objects describing the URL patterns that file layout implies.
The orchestrator then fills in sample values for dynamic segments to produce
``RouteHint`` values ready to hand to Nuclei DAST.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Callable, Protocol


class Framework(str, Enum):
    NEXTJS_APP = "nextjs_app"
    NEXTJS_PAGES = "nextjs_pages"
    ASTRO = "astro"
    SVELTEKIT = "sveltekit"
    REMIX = "remix"


@dataclass
class RoutePath:
    """A URL pattern derived from a single source file, with dynamic
    segments still in their source form (``:id``, ``[slug]``)."""
    pattern: str                    # "/users/:id"
    method: str = "GET"
    source_file: str = ""           # "app/users/[id]/page.tsx"


@dataclass
class RouteHint:
    """A fully-concrete URL ready to feed into the scanner. Dynamic
    segments have been replaced with a sample value and at least one
    query parameter is attached so the URL passes the DAST fuzz filter."""
    url: str                        # "/users/1?_=1" (relative path)
    method: str = "GET"
    framework: str = ""             # "nextjs_app" etc. (telemetry only)
    source_file: str = ""
    pattern: str = ""               # original, for debugging


class FrameworkConverter(Protocol):
    """A converter translates a list of relevant file paths into
    ``RoutePath`` objects for a single framework."""

    framework: Framework

    def applies_to(self, files: list[str]) -> bool:
        """True when the file tree shows this framework's signature."""
        ...

    def convert(self, files: list[str]) -> list[RoutePath]:
        """Emit one RoutePath per discovered route file. Must be pure
        (no I/O) so tests can feed synthetic file lists."""
        ...


# --- Helpers shared across converters ---------------------------------

# File basenames or prefixes that do not contribute routable paths.
IGNORED_BASENAMES: set[str] = {
    "_layout",
    "_app",
    "_document",
    "_error",
    "loading",
    "error",
    "not-found",
    "layout",      # Next.js app router layout
    "template",    # Next.js app router template
    "default",
    "head",
    "middleware",
    "global-error",
}

# File extensions worth considering as route-declaring sources.
ROUTE_EXTENSIONS: tuple[str, ...] = (
    ".tsx", ".jsx", ".ts", ".js",
    ".astro", ".svelte",
    ".md", ".mdx",
)


def strip_ext(path: str) -> str:
    """Return the path without its extension (if it matches a route ext)."""
    for ext in ROUTE_EXTENSIONS:
        if path.endswith(ext):
            return path[: -len(ext)]
    return path


def is_route_file(path: str) -> bool:
    """True if the file is a source file that could declare a route."""
    return path.endswith(ROUTE_EXTENSIONS)
