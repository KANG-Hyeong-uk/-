"""
Trust Backend - Paddle Webhook Handler
"""

import asyncio
import hashlib
import hmac
import json
from datetime import datetime

from fastapi import APIRouter, HTTPException, Request
from app.config import get_settings
from app.logging_config import get_logger
from app.services.supabase_client import get_supabase_service

router = APIRouter()
logger = get_logger(__name__)


def _verify_paddle_signature(payload: bytes, signature_header: str, secret: str) -> bool:
    """
    Paddle Webhook 시그니처 검증 (HMAC-SHA256).
    Paddle-Signature 헤더 형식: ts=1234567890;h1=abcdef...
    서명 대상: "{ts}:{raw_body}"
    """
    try:
        parts = dict(part.split("=", 1) for part in signature_header.split(";"))
        ts = parts.get("ts", "")
        h1 = parts.get("h1", "")
        if not ts or not h1:
            return False

        signed_payload = f"{ts}:{payload.decode('utf-8')}"
        expected = hmac.new(
            secret.encode("utf-8"),
            signed_payload.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()
        return hmac.compare_digest(expected, h1)
    except Exception:
        return False


@router.post("/webhooks/paddle")
async def paddle_webhook(request: Request):
    """
    Paddle Webhook 처리.
    인증 없음 — HMAC-SHA256 시그니처로 검증.

    처리 이벤트:
    - subscription.activated  → users.plan = 'pro', subscriptions 생성
    - subscription.updated    → subscriptions 상태 동기화
    - subscription.canceled   → users.plan = 'free'
    - transaction.payment_failed → 로그 기록
    """
    settings = get_settings()
    payload = await request.body()
    sig_header = request.headers.get("Paddle-Signature", "")

    if not settings.paddle_webhook_secret:
        logger.warning("paddle_webhook_secret_not_set")
        return {"status": "ok"}

    if not _verify_paddle_signature(payload, sig_header, settings.paddle_webhook_secret):
        logger.warning("paddle_webhook_invalid_signature")
        raise HTTPException(status_code=400, detail="Invalid signature")

    try:
        event = json.loads(payload)
    except Exception as e:
        logger.error("paddle_webhook_parse_error", error=str(e))
        raise HTTPException(status_code=400, detail="Invalid payload")

    event_type = event.get("event_type", "")
    logger.info("paddle_webhook_received", event_type=event_type)

    supabase = get_supabase_service()

    try:
        data = event.get("data", {})

        if event_type == "subscription.activated":
            # 신규 구독 활성화
            subscription_id = data.get("id")
            customer_id = data.get("customer_id")
            custom_data = data.get("custom_data") or {}
            user_id = custom_data.get("user_id")

            # 플랜 종류 판별 (monthly / yearly)
            items = data.get("items", [])
            interval = (
                items[0].get("price", {}).get("billing_cycle", {}).get("interval", "month")
                if items else "month"
            )
            plan_type = "pro_yearly" if interval == "year" else "pro_monthly"

            current_period_end = data.get("current_billing_period", {}).get("ends_at")

            if user_id and subscription_id:
                await supabase.upsert_subscription({
                    "user_id": user_id,
                    "stripe_customer_id": customer_id,        # Paddle customer ID 저장
                    "stripe_subscription_id": subscription_id, # Paddle subscription ID 저장
                    "status": "active",
                    "plan": plan_type,
                    "current_period_end": current_period_end,
                    "cancel_at_period_end": False,
                })
                await supabase.update_user(user_id, {"plan": "pro", "plan_changed_at": datetime.utcnow().isoformat()})
                logger.info("subscription_activated", user_id=user_id, plan=plan_type)

        elif event_type == "subscription.updated":
            subscription_id = data.get("id")
            status = data.get("status", "active")
            current_period_end = data.get("current_billing_period", {}).get("ends_at")
            custom_data = data.get("custom_data") or {}

            # 취소 예정 여부: scheduled_change.action == "cancel"
            scheduled_change = data.get("scheduled_change") or {}
            cancel_at_period_end = scheduled_change.get("action") == "cancel"

            # Find user: try subscription lookup first, fallback to custom_data.user_id
            user_id = None
            existing_sub = await supabase.get_pool().fetchrow(
                "SELECT user_id FROM subscriptions WHERE stripe_subscription_id = $1",
                subscription_id
            )
            if existing_sub:
                user_id = existing_sub["user_id"]
            elif custom_data.get("user_id"):
                user_id = custom_data["user_id"]

            if user_id:
                await supabase.upsert_subscription({
                    "user_id": user_id,
                    "stripe_subscription_id": subscription_id,
                    "status": status,
                    "cancel_at_period_end": cancel_at_period_end,
                    "current_period_end": current_period_end,
                })

                # If status is canceled, downgrade user to free
                if status == "canceled":
                    await supabase.update_user(user_id, {"plan": "free", "plan_changed_at": datetime.utcnow().isoformat()})
                    logger.info("subscription_canceled_via_update", user_id=user_id)
                else:
                    logger.info("subscription_updated", user_id=user_id, status=status)

        elif event_type == "subscription.canceled":
            subscription_id = data.get("id")

            existing = await supabase.pool.fetchrow(
                "SELECT user_id FROM subscriptions WHERE stripe_subscription_id = $1",
                subscription_id
            )
            if existing:
                user_id = existing["user_id"]
                await supabase.upsert_subscription({
                    "user_id": user_id,
                    "stripe_subscription_id": subscription_id,
                    "status": "canceled",
                })
                await supabase.update_user(user_id, {"plan": "free", "plan_changed_at": datetime.utcnow().isoformat()})
                logger.info("subscription_canceled", user_id=user_id)

        elif event_type == "adjustment.updated":
            # 환불/chargeback 승인 시 plan 다운그레이드
            action = data.get("action")  # "refund" | "credit" | "chargeback"
            adj_status = data.get("status")  # "pending" | "approved" | "rejected"
            subscription_id = data.get("subscription_id")

            if action in ("refund", "chargeback") and adj_status == "approved":
                if subscription_id:
                    existing = await supabase.pool.fetchrow(
                        "SELECT user_id FROM subscriptions WHERE stripe_subscription_id = $1",
                        subscription_id
                    )
                    if existing:
                        user_id = existing["user_id"]
                        await supabase.upsert_subscription({
                            "user_id": user_id,
                            "stripe_subscription_id": subscription_id,
                            "status": "canceled",
                        })
                        await supabase.update_user(user_id, {"plan": "free", "plan_changed_at": datetime.utcnow().isoformat()})
                        logger.info("refund_processed", user_id=user_id, action=action)
                else:
                    logger.warning("refund_no_subscription_id", action=action, adj_status=adj_status)
            else:
                logger.info("adjustment_ignored", action=action, status=adj_status)

        elif event_type == "transaction.payment_failed":
            customer_id = data.get("customer_id")
            total = data.get("details", {}).get("totals", {}).get("total")
            logger.error("payment_failed", customer_id=customer_id, amount=total)

    except Exception as e:
        logger.error("paddle_webhook_handler_error", event_type=event_type, error=str(e))
        # Paddle은 2xx를 받아야 재시도하지 않음 — 에러를 삼키고 ok 반환

    return {"status": "ok"}
