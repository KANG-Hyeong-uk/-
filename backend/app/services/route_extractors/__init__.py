"""Framework-aware route extraction from a GitHub repository tree.

Used by the URL scanner to seed Nuclei DAST with real parameter-bearing
routes when Katana alone finds zero. The public surface is
``GitHubRouteExtractor``; individual framework converters are internal.
"""

from .base import RouteHint, RoutePath, Framework, FrameworkConverter
from .extractor import GitHubRouteExtractor

__all__ = [
    "RouteHint",
    "RoutePath",
    "Framework",
    "FrameworkConverter",
    "GitHubRouteExtractor",
]
