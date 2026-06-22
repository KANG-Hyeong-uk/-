"""
Trust Backend - Web Push Subscription Routes
POST /api/push/subscribe   - Save push subscription
DELETE /api/push/subscribe - Remove push subscription
GET /api/push/vapid-key    - Return VAPID public key
"""

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from app.config import get_settings
from app.logging_config import get_logger
from app.services.supabase_client import get_supabase_service

logger = get_logger(__name__)

router = APIRouter(tags=["push"])


def _extract_user_id_optional(request: Request) -> str | None:
    """Extract user_id from Authorization header if present. Returns None for anonymous users."""
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None

    token = auth.removeprefix("Bearer ")
    try:
        import jwt as pyjwt
        payload = pyjwt.decode(token, options={"verify_signature": False})
        return payload.get("sub")
    except Exception:
        return None


class PushSubscriptionRequest(BaseModel):
    endpoint: str
    keys: dict  # {"p256dh": "...", "auth": "..."}


@router.get("/push/vapid-key")
async def get_vapid_key():
    """Return the VAPID public key for push subscription (no auth required)."""
    settings = get_settings()
    if not settings.vapid_public_key:
        raise HTTPException(status_code=503, detail="Web Push not configured")
    return {"vapid_public_key": settings.vapid_public_key}


@router.post("/push/subscribe")
async def subscribe_push(body: PushSubscriptionRequest, request: Request):
    """
    Save a push subscription. Works with or without authentication.
    If authenticated, the subscription is linked to the user.
    Upserts: if the same endpoint exists, updates the keys.
    """
    if not body.endpoint:
        raise HTTPException(status_code=400, detail="endpoint is required")
    if not body.keys.get("p256dh") or not body.keys.get("auth"):
        raise HTTPException(status_code=400, detail="keys.p256dh and keys.auth are required")

    user_id = _extract_user_id_optional(request)
    supabase = get_supabase_service()

    try:
        await supabase.save_push_subscription(
            endpoint=body.endpoint,
            p256dh=body.keys["p256dh"],
            auth_key=body.keys["auth"],
            user_id=user_id,
        )
        logger.info("push_subscription_saved", user_id=user_id, endpoint=body.endpoint[:60])
        return {"status": "ok"}
    except Exception as e:
        logger.error("push_subscription_save_failed", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to save push subscription")


@router.delete("/push/subscribe")
async def unsubscribe_push(body: PushSubscriptionRequest, request: Request):
    """Remove a push subscription by endpoint."""
    if not body.endpoint:
        raise HTTPException(status_code=400, detail="endpoint is required")

    supabase = get_supabase_service()

    try:
        await supabase.delete_push_subscription(endpoint=body.endpoint)
        logger.info("push_subscription_removed", endpoint=body.endpoint[:60])
        return {"status": "ok"}
    except Exception as e:
        logger.error("push_subscription_delete_failed", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to remove push subscription")
