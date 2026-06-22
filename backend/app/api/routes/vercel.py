"""
Trust Backend Vercel Integration Routes
GET    /api/vercel/connection   - Check Vercel connection status
POST   /api/vercel/connect      - Exchange OAuth code for access token
DELETE /api/vercel/connection   - Disconnect Vercel
GET    /api/vercel/project-url  - Look up production URL for a linked repo
"""

import httpx
from fastapi import APIRouter, HTTPException, Depends

from app.logging_config import get_logger
from app.config import get_settings
from app.services.supabase_client import get_supabase_service
from app.services.vercel_service import VercelService, VercelAPIError
from app.api.auth import require_auth

logger = get_logger(__name__)
router = APIRouter(tags=["vercel"])


@router.get("/vercel/connection")
async def get_vercel_connection(current_user=Depends(require_auth)):
    """Check if user has a Vercel connection."""
    supabase = get_supabase_service()
    conn = await supabase.get_vercel_connection(current_user.id)
    if not conn:
        return {"connected": False}
    return {
        "connected": True,
        "vercel_username": conn.get("vercel_username"),
        "vercel_team_id": conn.get("vercel_team_id"),
    }


@router.post("/vercel/connect")
async def connect_vercel(body: dict, current_user=Depends(require_auth)):
    """Exchange Vercel OAuth code for access token and store connection."""
    code = body.get("code")
    redirect_uri = body.get("redirect_uri")
    if not code:
        raise HTTPException(status_code=400, detail="OAuth code is required")
    if not redirect_uri:
        raise HTTPException(status_code=400, detail="redirect_uri is required")

    settings = get_settings()
    if not settings.vercel_oauth_client_id or not settings.vercel_oauth_client_secret:
        raise HTTPException(status_code=500, detail="Vercel OAuth not configured")

    # WHY: Vercel's token endpoint requires application/x-www-form-urlencoded, not JSON.
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            "https://api.vercel.com/v2/oauth/access_token",
            data={
                "client_id": settings.vercel_oauth_client_id,
                "client_secret": settings.vercel_oauth_client_secret,
                "code": code,
                "redirect_uri": redirect_uri,
            },
            headers={
                "Content-Type": "application/x-www-form-urlencoded",
                "Accept": "application/json",
            },
        )

    if resp.status_code != 200:
        logger.warning("vercel_oauth_exchange_failed", status=resp.status_code, body=resp.text[:200])
        raise HTTPException(status_code=400, detail="Failed to exchange OAuth code")

    token_data = resp.json()
    access_token = token_data.get("access_token")
    if not access_token:
        error = token_data.get("error_description", token_data.get("error", "Unknown error"))
        raise HTTPException(status_code=400, detail=f"Vercel OAuth error: {error}")

    team_id = token_data.get("team_id")
    installation_id = token_data.get("installation_id")
    vercel_user_id_from_token = token_data.get("user_id")

    # Fetch username via /v2/user
    vc = VercelService(access_token, team_id=team_id)
    try:
        user_info = await vc.get_user_info()
    except VercelAPIError as e:
        logger.warning("vercel_user_fetch_failed", error=str(e)[:200])
        user_info = {}
    finally:
        await vc.close()

    vercel_user_id = vercel_user_id_from_token or user_info.get("uid") or user_info.get("id")
    vercel_username = user_info.get("username") or user_info.get("name")

    supabase = get_supabase_service()
    await supabase.upsert_vercel_connection(
        user_id=current_user.id,
        access_token=access_token,
        vercel_user_id=vercel_user_id,
        vercel_username=vercel_username,
        team_id=team_id,
        scopes="",
        installation_id=installation_id,
    )

    return {
        "connected": True,
        "vercel_username": vercel_username,
        "vercel_team_id": team_id,
    }


@router.delete("/vercel/connection")
async def disconnect_vercel(current_user=Depends(require_auth)):
    """Remove Vercel connection."""
    supabase = get_supabase_service()
    await supabase.delete_vercel_connection(current_user.id)
    return {"connected": False}


@router.get("/vercel/project-url")
async def get_vercel_project_url(repo: str, current_user=Depends(require_auth)):
    """Look up the production URL for a Vercel project linked to `owner/repo`.

    Returns `{project_url: null, repo}` when the user has a Vercel connection
    but no matching project (likely they never deployed this repo)."""
    if not repo or "/" not in repo:
        raise HTTPException(status_code=400, detail="repo must be in 'owner/repo' format")

    supabase = get_supabase_service()
    token_row = await supabase.get_vercel_access_token(current_user.id)
    if not token_row:
        raise HTTPException(status_code=400, detail="Vercel is not connected")
    access_token, team_id = token_row

    vc = VercelService(access_token, team_id=team_id)
    try:
        url = await vc.get_project_production_url(repo)
    except VercelAPIError as e:
        logger.warning("vercel_project_url_failed", repo=repo, error=str(e)[:200])
        raise HTTPException(status_code=502, detail="Failed to fetch project from Vercel")
    finally:
        await vc.close()

    return {"project_url": url, "repo": repo}
