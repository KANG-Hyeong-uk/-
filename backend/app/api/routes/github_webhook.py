"""
Trust Backend GitHub Webhook Routes
POST /webhooks/github - Handle GitHub webhook events (PR merge/close tracking)
"""

import hashlib
import hmac

from fastapi import APIRouter, HTTPException, Request

from app.logging_config import get_logger
from app.config import get_settings
from app.services.supabase_client import get_supabase_service

logger = get_logger(__name__)
router = APIRouter(tags=["webhooks"])


def _verify_signature(payload: bytes, signature: str, secret: str) -> bool:
    """Verify GitHub webhook X-Hub-Signature-256."""
    if not secret:
        raise ValueError("Webhook secret not configured")
    expected = "sha256=" + hmac.new(
        secret.encode(), payload, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature)


@router.post("/webhooks/github")
async def github_webhook(request: Request):
    """Handle GitHub webhook events for PR merge/close tracking."""
    settings = get_settings()
    body = await request.body()

    # Verify signature if secret is configured
    signature = request.headers.get("X-Hub-Signature-256", "")
    if settings.github_webhook_secret:
        if not _verify_signature(body, signature, settings.github_webhook_secret):
            raise HTTPException(status_code=403, detail="Invalid signature")

    event = request.headers.get("X-GitHub-Event", "")
    if event != "pull_request":
        return {"status": "ignored", "event": event}

    payload = await request.json()
    action = payload.get("action")
    if action not in ("closed",):
        return {"status": "ignored", "action": action}

    pr = payload.get("pull_request", {})
    head_ref = pr.get("head", {}).get("ref", "")

    # Only track our fix branches
    if not head_ref.startswith("trust-security/fix-"):
        return {"status": "ignored", "reason": "not a trust-security branch"}

    repo_full_name = payload.get("repository", {}).get("full_name", "")
    pr_number = pr.get("number")
    merged = pr.get("merged", False)

    if not repo_full_name or not pr_number:
        return {"status": "ignored", "reason": "missing repo or pr_number"}

    supabase = get_supabase_service()
    try:
        data = {
            "pr_merged": merged,
            "pr_closed_without_merge": not merged,
        }
        updated = await supabase.update_fix_quality_metric_by_pr(
            repo_full_name, pr_number, data
        )
        logger.info(
            "github_webhook_pr_tracked",
            repo=repo_full_name,
            pr_number=pr_number,
            merged=merged,
            updated_count=len(updated),
        )
    except Exception as e:
        logger.error("github_webhook_update_failed", error=str(e))

    return {"status": "ok", "merged": merged}
