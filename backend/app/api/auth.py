"""Trust Backend Auth Utilities
JWT verification using PyJWT for optional/required authentication.
Also supports API-key auth via the X-MCP-Api-Key header."""

import hashlib
from fastapi import Depends, HTTPException, Request
import jwt

from app.config import get_settings
from app.logging_config import get_logger

logger = get_logger(__name__)


async def _resolve_api_key(request: Request) -> dict | None:
    """
    X-MCP-Api-Key 헤더로 API 키 검증.
    유효하면 가상 user 딕셔너리 반환 (sub = user_id).
    """
    api_key = request.headers.get("X-MCP-Api-Key", "")
    if not api_key:
        return None
    try:
        from app.services.supabase_client import get_supabase_service
        db = get_supabase_service()
        key_hash = hashlib.sha256(api_key.encode()).hexdigest()
        row = await db.pool.fetchrow(
            "SELECT * FROM api_keys WHERE key_hash = $1 AND revoked = false",
            key_hash,
        )
        if row is None:
            return None
        await db.pool.execute(
            "UPDATE api_keys SET last_used_at = NOW(), scans_used = scans_used + 1 WHERE id = $1",
            row["id"],
        )
        return {"sub": str(row["user_id"]), "plan": row["plan"], "auth_method": "api_key"}
    except Exception as e:
        logger.debug("api_key_auth_failed", error=str(e))
        return None


async def get_current_user(request: Request) -> dict | None:
    """
    1순위: X-MCP-Api-Key 헤더 (API 키 인증)
    2순위: Authorization: Bearer {jwt} 헤더 (JWT 인증)
    둘 다 없으면 None (비회원 허용 엔드포인트용).
    """
    api_key_user = await _resolve_api_key(request)
    if api_key_user:
        return api_key_user

    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None
    token = auth_header.split(" ", 1)[1]
    if not token:
        return None
    try:
        settings = get_settings()
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=["HS256"],
        )
        return payload
    except jwt.ExpiredSignatureError:
        logger.debug("auth_token_expired")
        return None
    except Exception as e:
        logger.debug("auth_token_invalid", error=str(e))
        return None


async def require_auth(user=Depends(get_current_user)) -> dict:
    """인증 필수 엔드포인트용 의존성"""
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    return user
