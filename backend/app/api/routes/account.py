"""
Trust Backend - Account Routes
User account management (profile, deletion)
"""

from fastapi import APIRouter, Depends, HTTPException
from app.api.auth import require_auth
from app.logging_config import get_logger
from app.services.supabase_client import get_supabase_service

router = APIRouter()
logger = get_logger(__name__)


@router.delete("/account")
async def delete_account(current_user=Depends(require_auth)):
    """
    Delete the authenticated user's account.
    - Blocked if the user has an active subscription (must cancel first).
    - Deletes auth.users row which cascades to public.users, subscriptions, etc.
    """
    user_id = str(current_user.get("sub") or current_user.get("id", ""))
    supabase = get_supabase_service()

    # Check for active subscription (allow if already set to cancel at period end)
    subscription = await supabase.get_subscription_by_user(user_id)
    if (
        subscription
        and subscription.get("status") == "active"
        and not subscription.get("cancel_at_period_end", False)
    ):
        raise HTTPException(
            status_code=400,
            detail="Cannot delete account with an active subscription. Please cancel your subscription first via Manage Billing.",
        )

    # Delete user — cascades to subscriptions, scans, etc. via ON DELETE CASCADE
    try:
        await supabase.delete_user(user_id)
    except Exception as e:
        logger.error("account_delete_failed", user_id=user_id, error=str(e))
        raise HTTPException(status_code=500, detail="Failed to delete account. Please contact support.")

    logger.info("account_deleted", user_id=user_id)
    return {"status": "deleted"}
