"""
GitHub integration service for PR Auto-Fix.
Uses GitHub REST API to create branches, commit fixes, and open PRs.
"""

import base64
from typing import Optional

import httpx


class GitHubAPIError(Exception):
    """Error from GitHub API."""

    def __init__(self, message: str, status_code: int = 0):
        super().__init__(message)
        self.status_code = status_code


class GitHubService:
    """GitHub REST API client for a specific user's token."""

    def __init__(self, access_token: str):
        self.client = httpx.AsyncClient(
            base_url="https://api.github.com",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Accept": "application/vnd.github+v3+json",
                "X-GitHub-Api-Version": "2022-11-28",
            },
            timeout=30.0,
        )

    async def close(self):
        await self.client.aclose()

    async def _request(self, method: str, path: str, **kwargs) -> dict:
        resp = await self.client.request(method, path, **kwargs)
        if resp.status_code >= 400:
            detail = resp.text[:200]
            raise GitHubAPIError(
                f"GitHub API {method} {path} failed ({resp.status_code}): {detail}",
                status_code=resp.status_code,
            )
        if resp.status_code == 204:
            return {}
        return resp.json()

    async def get_user_info(self) -> dict:
        """Get authenticated user info (username, avatar)."""
        return await self._request("GET", "/user")

    async def has_push_access(self, repo: str) -> bool:
        """Check if the authenticated user has push (write) access to the repo."""
        try:
            data = await self._request("GET", f"/repos/{repo}")
            return data.get("permissions", {}).get("push", False)
        except GitHubAPIError:
            return False

    async def fork_repo(self, repo: str) -> str:
        """Fork a repo to the authenticated user's account.

        Returns the full_name of the fork (e.g. 'username/repo').
        If the fork already exists, GitHub returns it immediately.
        """
        import asyncio

        data = await self._request("POST", f"/repos/{repo}/forks", json={})
        fork_full_name = data.get("full_name", "")

        # GitHub forks are async — poll until ready (up to 30s)
        for _ in range(6):
            try:
                fork_data = await self._request("GET", f"/repos/{fork_full_name}")
                # A fork that isn't ready yet may still return 200 but no default_branch ref.
                # Try to access the default branch ref to confirm it's usable.
                default_branch = fork_data.get("default_branch", "main")
                await self._request("GET", f"/repos/{fork_full_name}/git/ref/heads/{default_branch}")
                return fork_full_name
            except GitHubAPIError:
                await asyncio.sleep(5)

        # Return anyway — caller will get a clear error if the fork isn't ready
        return fork_full_name

    async def sync_fork(self, fork_repo: str, branch: str) -> None:
        """Sync a fork's branch with its upstream to ensure it's up-to-date."""
        try:
            await self._request("POST", f"/repos/{fork_repo}/merge-upstream", json={
                "branch": branch,
            })
        except GitHubAPIError:
            pass  # Best-effort; if it fails the PR will still work

    async def create_branch(self, repo: str, base_branch: str, new_branch: str) -> bool:
        """Create a new branch from base_branch."""
        # Get base branch SHA
        ref_data = await self._request("GET", f"/repos/{repo}/git/ref/heads/{base_branch}")
        sha = ref_data["object"]["sha"]

        # Create new branch
        await self._request("POST", f"/repos/{repo}/git/refs", json={
            "ref": f"refs/heads/{new_branch}",
            "sha": sha,
        })
        return True

    async def get_file_content(self, repo: str, path: str, branch: str) -> tuple[str, str]:
        """Get file content and SHA. Returns (decoded_content, file_sha)."""
        data = await self._request("GET", f"/repos/{repo}/contents/{path}", params={"ref": branch})
        content = base64.b64decode(data["content"]).decode("utf-8")
        return content, data["sha"]

    async def update_file(
        self, repo: str, path: str, content: str, message: str, branch: str, sha: str
    ) -> bool:
        """Update (or create) a file on a branch."""
        encoded = base64.b64encode(content.encode("utf-8")).decode("ascii")
        await self._request("PUT", f"/repos/{repo}/contents/{path}", json={
            "message": message,
            "content": encoded,
            "branch": branch,
            "sha": sha,
        })
        return True

    async def ensure_repo_webhook(self, repo: str, webhook_url: str, secret: str = "") -> bool:
        """Register a webhook on the repo for pull_request events.

        Skips if a webhook with the same URL already exists.
        Returns True if created, False if already exists or failed.
        """
        # Check existing webhooks to avoid duplicates
        try:
            hooks = await self._request("GET", f"/repos/{repo}/hooks")
            for hook in hooks if isinstance(hooks, list) else []:
                if hook.get("config", {}).get("url") == webhook_url:
                    return False  # already registered
        except GitHubAPIError:
            pass  # Can't list hooks — try creating anyway

        config = {
            "url": webhook_url,
            "content_type": "json",
        }
        if secret:
            config["secret"] = secret

        try:
            await self._request("POST", f"/repos/{repo}/hooks", json={
                "config": config,
                "events": ["pull_request"],
                "active": True,
            })
            return True
        except GitHubAPIError as e:
            # Log the actual error for debugging
            import logging
            logging.getLogger(__name__).warning(
                f"Webhook creation failed for {repo}: {e} (status={e.status_code})"
            )
            return False  # Non-fatal — webhook is optional

    async def create_pull_request(
        self, repo: str, title: str, body: str, head: str, base: str
    ) -> dict:
        """Create a pull request. Returns PR data including html_url.

        For cross-repo PRs (from a fork), head should be 'username:branch'.
        """
        return await self._request("POST", f"/repos/{repo}/pulls", json={
            "title": title,
            "body": body,
            "head": head,
            "base": base,
        })
