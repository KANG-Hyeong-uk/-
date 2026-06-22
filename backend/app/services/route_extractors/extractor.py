"""Orchestrator that binds GitHub tree fetch, framework detection, and
file-path-to-route conversion into a single async entrypoint used by the
scanner.

Any failure inside the pipeline is swallowed and returned as an empty
list — the scanner must fall back to the normal Katana-only flow, not
crash.
"""

from __future__ import annotations

import re
from urllib.parse import urljoin

from app.logging_config import get_logger
from app.services.github_service import GitHubService

from .base import RouteHint, RoutePath
from .detector import pick_converters
from .github_tree import fetch_tree

logger = get_logger(__name__)


# Upper bound on the routes we hand to Nuclei. Matches MAX_DAST_URLS in
# the scanner's Katana path so the combined list stays within budget.
MAX_ROUTES_PER_REPO = 30


class GitHubRouteExtractor:
    """Extract route hints from a user's repository.

    ``extract()`` returns a list of ``RouteHint`` with concrete sample
    values substituted for dynamic segments. If anything fails — no
    connection, no framework detected, API error — the list is empty.
    """

    def __init__(
        self,
        gh: GitHubService,
        repo: str,
        base_url: str,
        branch: str | None = None,
    ):
        self.gh = gh
        self.repo = repo
        self.branch = branch
        # Used to produce absolute URLs matching the scan target.
        self.base_url = base_url.rstrip("/")

    async def extract(self) -> list[RouteHint]:
        tree = await fetch_tree(self.gh, self.repo, self.branch)
        if tree is None:
            return []

        converters = pick_converters(tree.files)
        if not converters:
            logger.info("framework_not_detected", repo=self.repo, file_count=len(tree.files))
            return []

        all_paths: list[RoutePath] = []
        frameworks_hit: list[str] = []
        for converter in converters:
            try:
                paths = converter.convert(tree.files)
            except Exception as e:  # pragma: no cover — defensive
                logger.warning(
                    "framework_convert_failed",
                    framework=getattr(converter.framework, "value", "unknown"),
                    repo=self.repo,
                    error=str(e)[:200],
                )
                continue
            if paths:
                all_paths.extend(paths)
                frameworks_hit.append(converter.framework.value)

        deduped = _dedupe_paths(all_paths)
        limited = deduped[:MAX_ROUTES_PER_REPO]

        hints = [self._parameterize(p) for p in limited]

        logger.info(
            "routes_extracted",
            repo=self.repo,
            frameworks=frameworks_hit,
            raw_count=len(all_paths),
            deduped=len(deduped),
            emitted=len(hints),
            sample=[h.url for h in hints[:5]],
        )
        return hints

    # --- helpers ----------------------------------------------------

    _DYNAMIC_RE = re.compile(r":([A-Za-z_][A-Za-z0-9_]*)")

    def _parameterize(self, path: RoutePath) -> RouteHint:
        """Replace :segments with sample values and attach a query param
        so the DAST URL filter (which requires ``?``) keeps the URL."""
        def _sample(m: re.Match) -> str:
            name = m.group(1).lower()
            if "id" in name or "num" in name:
                return "1"
            if "slug" in name or "path" in name or "splat" in name:
                return "test"
            return "1"

        concrete = self._DYNAMIC_RE.sub(_sample, path.pattern)
        # Anchor onto the target origin and attach a synthetic query
        # parameter — Katana's downstream filter only keeps URLs with
        # ``?``, and we want this route to survive that filter. Nuclei
        # fuzzers will still fuzz every path segment in DAST mode.
        url = urljoin(self.base_url + "/", concrete.lstrip("/"))
        if "?" not in url:
            url = f"{url}?_=1"

        framework = ""
        return RouteHint(
            url=url,
            method=path.method,
            framework=framework,
            source_file=path.source_file,
            pattern=path.pattern,
        )


def _dedupe_paths(paths: list[RoutePath]) -> list[RoutePath]:
    seen: set[tuple[str, str]] = set()
    out: list[RoutePath] = []
    for p in paths:
        key = (p.method, p.pattern)
        if key in seen:
            continue
        seen.add(key)
        out.append(p)
    return out
