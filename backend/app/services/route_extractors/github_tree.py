"""Fetch a repository's file tree via the GitHub API.

One call: ``GET /repos/{repo}/git/trees/{branch}?recursive=1``. We only
need paths — blob content is read per-converter if needed.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.logging_config import get_logger
from app.services.github_service import GitHubAPIError, GitHubService

logger = get_logger(__name__)


@dataclass
class RepoTree:
    files: list[str]
    branch: str
    sha: str
    truncated: bool    # GitHub caps very large repos — flag when set


async def fetch_tree(gh: GitHubService, repo: str, branch: str | None = None) -> RepoTree | None:
    """Return the tree for ``repo``. If ``branch`` is None the repo's
    default branch is resolved first. Returns None on any error so callers
    can fall back to the regular crawl path without raising."""
    try:
        if not branch:
            repo_info = await gh._request("GET", f"/repos/{repo}")
            branch = repo_info.get("default_branch") or "main"

        # Resolve branch → commit SHA (needed for /git/trees call)
        ref = await gh._request("GET", f"/repos/{repo}/git/ref/heads/{branch}")
        commit_sha = ref["object"]["sha"]

        tree = await gh._request(
            "GET",
            f"/repos/{repo}/git/trees/{commit_sha}",
            params={"recursive": "1"},
        )
    except GitHubAPIError as e:
        logger.warning("github_tree_fetch_failed", repo=repo, status=e.status_code, error=str(e)[:200])
        return None
    except Exception as e:
        logger.warning("github_tree_fetch_error", repo=repo, error=str(e)[:200])
        return None

    entries = tree.get("tree") or []
    files = [
        e["path"] for e in entries
        if e.get("type") == "blob" and isinstance(e.get("path"), str)
    ]

    truncated = bool(tree.get("truncated"))
    if truncated:
        logger.warning("github_tree_truncated", repo=repo, file_count=len(files))

    logger.info(
        "github_tree_fetched",
        repo=repo,
        branch=branch,
        file_count=len(files),
        truncated=truncated,
    )
    return RepoTree(files=files, branch=branch, sha=commit_sha, truncated=truncated)
