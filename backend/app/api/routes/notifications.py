"""
Trust Backend - Notification Settings Routes
GET/PUT notification preferences (digest email, frequency).
"""

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from app.logging_config import get_logger
from app.services.supabase_client import get_supabase_service

logger = get_logger(__name__)

router = APIRouter(tags=["notifications"])


def _extract_user_id(request: Request) -> str:
    """Extract user_id from Authorization header (Supabase JWT)."""
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authorization required")

    token = auth.removeprefix("Bearer ")
    try:
        import jwt as pyjwt
        payload = pyjwt.decode(token, options={"verify_signature": False})
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
        return user_id
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")


class NotificationSettingsUpdate(BaseModel):
    digest_enabled: bool | None = None
    digest_email: str | None = None
    digest_frequency: str | None = None


@router.get("/notifications/settings")
async def get_notification_settings(request: Request):
    """Get user's notification preferences."""
    user_id = _extract_user_id(request)
    supabase = get_supabase_service()
    settings = await supabase.get_notification_settings(user_id)
    return settings


@router.put("/notifications/settings")
async def update_notification_settings(
    request: Request,
    body: NotificationSettingsUpdate,
):
    """Update user's notification preferences."""
    user_id = _extract_user_id(request)

    update_data = body.model_dump(exclude_none=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")

    if "digest_frequency" in update_data and update_data["digest_frequency"] not in ("weekly", "daily"):
        raise HTTPException(status_code=400, detail="digest_frequency must be 'weekly' or 'daily'")

    supabase = get_supabase_service()
    result = await supabase.update_notification_settings(user_id, update_data)
    return result
