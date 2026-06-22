"""Trust Backend Auth Utilities
JWT verification using PyJWT for optional/required authentication."""

from fastapi import Depends, HTTPException, Request
import jwt

from app.config import get_settings
from app.logging_config import get_logger

logger = get_logger(__name__)


async def get_current_user(request: Request) -> dict | None:
    """
    Authorization: Bearer {jwt_token} 헤더에서 사용자 정보 추출.
    토큰 없으면 None 반환 (선택적 인증 지원 — 비회원도 스캔 가능).
    """
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
