"""
Trust Backend - Billing Routes
Paddle payment integration for Pro subscriptions
"""

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from app.api.auth import require_auth
from app.config import get_settings
from app.logging_config import get_logger
from app.services.supabase_client import get_supabase_service

router = APIRouter()
logger = get_logger(__name__)

PADDLE_API_BASE = "https://api.paddle.com"
PADDLE_SANDBOX_API_BASE = "https://sandbox-api.paddle.com"
PADDLE_CHECKOUT_BASE = "https://checkout.paddle.com"
PADDLE_SANDBOX_CHECKOUT_BASE = "https://sandbox-checkout.paddle.com"


@router.post("/billing/create-checkout")
async def create_checkout_session(
    request: Request,
    current_user=Depends(require_auth),
):
    """
    Paddle 트랜잭션 생성 → Checkout URL 반환.
    - plan: "monthly" | "yearly"
    - 오픈 이벤트 기간: paddle_discount_id 설정 시 monthly 플랜에 자동 적용.
    """
    settings = get_settings()

    if not settings.paddle_api_key:
        raise HTTPException(status_code=503, detail="Payment configuration not ready")

    is_sandbox = settings.paddle_api_key.startswith("pdl_sdbx_")
    api_base = PADDLE_SANDBOX_API_BASE if is_sandbox else PADDLE_API_BASE
    checkout_base = PADDLE_SANDBOX_CHECKOUT_BASE if is_sandbox else PADDLE_CHECKOUT_BASE

    body = await request.json()
    plan = body.get("plan", "monthly")
    if plan not in ("monthly", "yearly"):
        raise HTTPException(status_code=400, detail="plan must be 'monthly' or 'yearly'")

    price_id = (
        settings.paddle_price_monthly if plan == "monthly"
        else settings.paddle_price_yearly
    )

    if not price_id:
        raise HTTPException(status_code=503, detail="Payment configuration not ready")

    payload: dict = {
        "items": [{"price_id": price_id, "quantity": 1}],
        "customer": {"email": current_user.email},
        "custom_data": {"user_id": str(current_user.id)},
        "checkout": {
            "url": "https://www.trust-scan.me/?checkout=success",
        },
    }

    # 오픈 이벤트 할인 (monthly 플랜에만, discount ID가 설정된 경우)
    if plan == "monthly" and settings.paddle_discount_id:
        payload["discount_id"] = settings.paddle_discount_id

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                f"{api_base}/transactions",
                headers={
                    "Authorization": f"Bearer {settings.paddle_api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            response.raise_for_status()
            data = response.json()
    except httpx.HTTPStatusError as e:
        logger.error("paddle_checkout_failed", status=e.response.status_code,
                     body=e.response.text, user_id=str(current_user.id))
        raise HTTPException(status_code=502, detail="Payment service error")
    except httpx.RequestError as e:
        logger.error("paddle_checkout_request_error", error=str(e))
        raise HTTPException(status_code=502, detail="Payment service unavailable")

    # Build checkout URL from transaction ID
    txn_id = data.get("data", {}).get("id")
    if not txn_id:
        logger.error("paddle_checkout_no_txn_id", response=str(data))
        raise HTTPException(status_code=502, detail="Payment service error")

    checkout_url = f"{checkout_base}/{txn_id}"

    logger.info("checkout_session_created", user_id=str(current_user.id), plan=plan,
                txn_id=txn_id, sandbox=is_sandbox)
    return {"checkout_url": checkout_url}


@router.post("/billing/customer-portal")
async def create_customer_portal(current_user=Depends(require_auth)):
    """Paddle Customer Portal 세션 생성 (구독 관리 페이지)"""
    settings = get_settings()

    if not settings.paddle_api_key:
        raise HTTPException(status_code=503, detail="Payment configuration not ready")

    is_sandbox = settings.paddle_api_key.startswith("pdl_sdbx_")
    api_base = PADDLE_SANDBOX_API_BASE if is_sandbox else PADDLE_API_BASE

    supabase = get_supabase_service()
    subscription = await supabase.get_subscription_by_user(str(current_user.id))

    if not subscription or not subscription.get("stripe_customer_id"):
        raise HTTPException(status_code=404, detail="No subscription found")

    # stripe_customer_id 컬럼에 Paddle customer ID 저장
    paddle_customer_id = subscription["stripe_customer_id"]

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                f"{api_base}/customers/{paddle_customer_id}/portal-sessions",
                headers={
                    "Authorization": f"Bearer {settings.paddle_api_key}",
                    "Content-Type": "application/json",
                },
                json={},
            )
            response.raise_for_status()
            data = response.json()
    except httpx.HTTPStatusError as e:
        logger.error("paddle_portal_failed", status=e.response.status_code,
                     user_id=str(current_user.id))
        raise HTTPException(status_code=502, detail="Payment service error")
    except httpx.RequestError as e:
        logger.error("paddle_portal_request_error", error=str(e))
        raise HTTPException(status_code=502, detail="Payment service unavailable")

    portal_url = data.get("data", {}).get("urls", {}).get("general", {}).get("overview")
    if not portal_url:
        logger.error("paddle_portal_no_url", response=str(data))
        raise HTTPException(status_code=502, detail="Payment service error")

    logger.info("customer_portal_created", user_id=str(current_user.id))
    return {"portal_url": portal_url}
