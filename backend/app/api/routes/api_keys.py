"""
API Key management routes.
POST   /api/v1/developer/keys/free     — issue a free key instantly (no auth)
POST   /api/v1/developer/keys          — issue a new key (auth required)
GET    /api/v1/developer/keys          — list caller's keys
DELETE /api/v1/developer/keys/{key_id} — revoke a key
"""

import hashlib
import secrets
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from app.api.auth import require_auth
from app.logging_config import get_logger
from app.services.supabase_client import get_supabase_service

logger = get_logger(__name__)

router = APIRouter(prefix="/developer", tags=["developer"])

KEY_PREFIX = "tsec_"
KEY_BYTES = 32  # 256-bit random key → ~43 base64url chars

# 비회원 무료 발급: IP당 하루 최대 3개
FREE_KEY_LIMIT_PER_IP = 3


def _generate_key() -> tuple[str, str, str]:
    """Return (raw_key, key_hash, key_prefix)."""
    raw = KEY_PREFIX + secrets.token_urlsafe(KEY_BYTES)
    key_hash = hashlib.sha256(raw.encode()).hexdigest()
    key_prefix = raw[:12]  # "tsec_XXXXXXX"
    return raw, key_hash, key_prefix


def _hash_key(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


# ─── schemas ──────────────────────────────────────────────

class KeyCreateRequest(BaseModel):
    name: Optional[str] = "My API Key"


class KeyCreateResponse(BaseModel):
    id: str
    name: str
    key: str          # shown ONCE — never stored in plaintext
    key_prefix: str
    plan: str
    created_at: str


class KeyListItem(BaseModel):
    id: str
    name: str
    key_prefix: str
    plan: str
    scans_used: int
    last_used_at: Optional[str]
    revoked: bool
    created_at: str


class FreeKeyResponse(BaseModel):
    key: str        # 한 번만 표시
    key_prefix: str
    plan: str = "free"
    message: str = "무료 API 키가 발급됐습니다. 지금 바로 복사해 두세요 — 다시 표시되지 않습니다."


# ─── helpers ──────────────────────────────────────────────

async def _get_user_keys(user_id: str) -> list[dict]:
    pool = get_supabase_service().pool
    rows = await pool.fetch(
        """SELECT id, name, key_prefix, plan, scans_used, last_used_at, revoked, created_at
           FROM api_keys WHERE user_id = $1 ORDER BY created_at DESC""",
        user_id,
    )
    return [dict(r) for r in rows]


async def _count_active_keys(user_id: str) -> int:
    pool = get_supabase_service().pool
    row = await pool.fetchrow(
        "SELECT COUNT(*) AS cnt FROM api_keys WHERE user_id = $1 AND revoked = false",
        user_id,
    )
    return row["cnt"] if row else 0


async def _count_keys_by_ip_today(ip: str) -> int:
    from datetime import date
    pool = get_supabase_service().pool
    row = await pool.fetchrow(
        """SELECT COUNT(*) AS cnt FROM api_keys
           WHERE issuer_ip = $1 AND created_at >= $2""",
        ip,
        datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0),
    )
    return row["cnt"] if row else 0


def _get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


# ─── routes ───────────────────────────────────────────────

@router.post("/keys/free", response_model=FreeKeyResponse, status_code=201)
async def create_free_key(request: Request):
    """
    로그인 없이 무료 API 키 즉시 발급.
    IP당 하루 최대 3개 제한.
    """
    ip = _get_client_ip(request)
    today_count = await _count_keys_by_ip_today(ip)
    if today_count >= FREE_KEY_LIMIT_PER_IP:
        raise HTTPException(
            status_code=429,
            detail=f"같은 IP에서 하루 최대 {FREE_KEY_LIMIT_PER_IP}개까지 무료 발급 가능합니다. 내일 다시 시도하거나 로그인 후 발급하세요.",
        )

    raw_key, key_hash, key_prefix = _generate_key()

    pool = get_supabase_service().pool
    row = await pool.fetchrow(
        """INSERT INTO api_keys (name, key_hash, key_prefix, plan, issuer_ip, created_at)
           VALUES ($1, $2, $3, 'free', $4, $5) RETURNING *""",
        "Free Key",
        key_hash,
        key_prefix,
        ip,
        datetime.utcnow(),
    )
    if row is None:
        raise HTTPException(status_code=500, detail="키 생성에 실패했습니다")

    logger.info("free_api_key_issued", ip=ip, key_prefix=key_prefix)

    return FreeKeyResponse(key=raw_key, key_prefix=key_prefix)


@router.post("/keys", response_model=KeyCreateResponse, status_code=201)
async def create_key(body: KeyCreateRequest, user: dict = Depends(require_auth)):
    user_id: str = user["sub"]

    active = await _count_active_keys(user_id)
    if active >= 5:
        raise HTTPException(status_code=400, detail="Maximum 5 active API keys allowed")

    raw_key, key_hash, key_prefix = _generate_key()

    db = get_supabase_service()
    db_user = await db.get_user(user_id)
    plan = db_user.get("plan", "free") if db_user else "free"

    row = await db.pool.fetchrow(
        """INSERT INTO api_keys (user_id, name, key_hash, key_prefix, plan, created_at)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING *""",
        user_id,
        body.name or "My API Key",
        key_hash,
        key_prefix,
        plan,
        datetime.utcnow(),
    )
    if row is None:
        raise HTTPException(status_code=500, detail="Failed to create API key")

    logger.info("api_key_created", user_id=user_id, key_prefix=key_prefix)

    return KeyCreateResponse(
        id=str(row["id"]),
        name=row["name"],
        key=raw_key,
        key_prefix=row["key_prefix"],
        plan=row["plan"],
        created_at=row["created_at"].isoformat(),
    )


@router.get("/keys", response_model=list[KeyListItem])
async def list_keys(user: dict = Depends(require_auth)):
    user_id: str = user["sub"]
    rows = await _get_user_keys(user_id)
    return [
        KeyListItem(
            id=str(r["id"]),
            name=r["name"],
            key_prefix=r["key_prefix"],
            plan=r["plan"],
            scans_used=r["scans_used"],
            last_used_at=r["last_used_at"].isoformat() if r["last_used_at"] else None,
            revoked=r["revoked"],
            created_at=r["created_at"].isoformat(),
        )
        for r in rows
    ]


@router.delete("/keys/{key_id}", status_code=204)
async def revoke_key(key_id: str, user: dict = Depends(require_auth)):
    user_id: str = user["sub"]
    pool = get_supabase_service().pool

    row = await pool.fetchrow(
        "SELECT id, user_id FROM api_keys WHERE id = $1", key_id
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Key not found")
    if str(row["user_id"]) != user_id:
        raise HTTPException(status_code=403, detail="Forbidden")

    await pool.execute(
        "UPDATE api_keys SET revoked = true WHERE id = $1", key_id
    )
    logger.info("api_key_revoked", user_id=user_id, key_id=key_id)
