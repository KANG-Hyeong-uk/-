"""
Vercel integration service.
Used to look up a project's production URL (custom domain preferred),
filling gaps where the GitHub repo `homepage` field is empty or stale.
"""

from typing import Optional

import httpx


class VercelAPIError(Exception):
    """Error from Vercel API."""

    def __init__(self, message: str, status_code: int = 0):
        super().__init__(message)
        self.status_code = status_code


class VercelService:
    """Vercel REST API client for a specific user's token."""

    def __init__(self, access_token: str, team_id: Optional[str] = None):
        self.team_id = team_id
        self.client = httpx.AsyncClient(
            base_url="https://api.vercel.com",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Accept": "application/json",
            },
            timeout=30.0,
        )
        self._projects_cache: Optional[list[dict]] = None

    async def close(self):
        await self.client.aclose()

    async def _request(self, method: str, path: str, params: Optional[dict] = None, **kwargs) -> dict:
        # WHY: Vercel requires teamId as a query param on EVERY request when the
        # token belongs to a team context; personal accounts omit it.
        merged_params = dict(params or {})
        if self.team_id:
            merged_params.setdefault("teamId", self.team_id)

        resp = await self.client.request(method, path, params=merged_params or None, **kwargs)
        if resp.status_code >= 400:
            detail = resp.text[:200]
            raise VercelAPIError(
                f"Vercel API {method} {path} failed ({resp.status_code}): {detail}",
                status_code=resp.status_code,
            )
        if resp.status_code == 204:
            return {}
        return resp.json()

    async def get_user_info(self) -> dict:
        """Get authenticated user info. Response shape: {"user": {...}}."""
        data = await self._request("GET", "/v2/user")
        # Vercel wraps the user in a "user" key; unwrap for callers.
        return data.get("user", data) if isinstance(data, dict) else {}

    async def list_projects(self) -> list[dict]:
        """List projects (cached per-instance)."""
        if self._projects_cache is not None:
            return self._projects_cache
        data = await self._request("GET", "/v9/projects", params={"limit": "100"})
        projects = data.get("projects", []) if isinstance(data, dict) else []
        self._projects_cache = projects
        return projects

    async def get_project_production_url(self, repo_full_name: str) -> Optional[str]:
        """Return the production URL (prefer custom domain) for the Vercel
        project linked to the given GitHub repo. None if no match / no deployment."""
        if "/" not in repo_full_name:
            return None
        owner, repo = repo_full_name.split("/", 1)

        try:
            projects = await self.list_projects()
        except VercelAPIError:
            return None

        matched = None
        for proj in projects:
            link = proj.get("link") or {}
            # WHY: Vercel stores repos as link.repo ("repo") + link.org ("owner").
            # Some older integrations store type=github with slug-style fields.
            if (link.get("repo") or "").lower() == repo.lower() and (
                (link.get("org") or link.get("orgId") or "").lower() == owner.lower()
                or (link.get("org") or "").lower() == owner.lower()
            ):
                matched = proj
                break
            # Fallback: match on link.repoId when org is stored as numeric id only
            if (link.get("repo") or "").lower() == repo.lower():
                matched = proj

        if not matched:
            return None

        project_id = matched.get("id")
        if not project_id:
            return None

        # WHY: ``GET /v13/deployments`` rejects our call with
        # ``{"code":"bad_request","message":"Invalid API version"}`` for this
        # integration type. ``GET /v9/projects/{id}`` already exposes
        # ``targets.production.alias`` — an ordered list where the first entry
        # is the user's primary production alias (custom domain when set).
        # This is exactly what we want and saves a second API hop.
        try:
            proj_detail = await self._request("GET", f"/v9/projects/{project_id}")
        except VercelAPIError:
            proj_detail = matched  # best-effort fallback to the list payload

        prod = ((proj_detail.get("targets") or {}).get("production") or {})
        aliases = prod.get("alias") or []
        if not isinstance(aliases, list) or not aliases:
            # Some older project payloads only expose the live URL directly.
            aliases = [prod.get("url")] if prod.get("url") else []

        aliases = [a for a in aliases if a]
        if not aliases:
            return None

        # Prefer first non-*.vercel.app alias (custom domain); else first alias.
        custom = next((a for a in aliases if "vercel.app" not in a), None)
        chosen = custom or aliases[0]

        if not chosen.startswith("http://") and not chosen.startswith("https://"):
            chosen = f"https://{chosen}"
        return chosen
