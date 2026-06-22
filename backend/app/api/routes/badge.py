"""
Trust Backend Badge API Routes
POST /api/badge/{scan_id} - Generate a trust badge
GET /api/badge/{scan_id} - Get badge info
GET /api/badge/{scan_id}/image - Redirect to badge image
"""

from urllib.parse import quote
from fastapi import APIRouter, HTTPException
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from app.services.supabase_client import get_supabase_service

router = APIRouter(tags=["badge"])


# Grade to color mapping for shields.io
GRADE_COLORS = {
    "A": "brightgreen",
    "B+": "green",
    "B": "yellowgreen",
    "B-": "yellow",
    "C": "orange",
    "D": "red",
    "F": "critical",
}


class BadgeResponse(BaseModel):
    """Badge response model"""
    scan_id: str
    badge_url: str
    embed_code: str
    markdown: str
    html: str


class BadgeImageParams(BaseModel):
    """Badge image customization"""
    style: str = "flat"  # flat, flat-square, plastic, for-the-badge
    label: str = "Trust Score"


@router.post("/badge/{scan_id}", response_model=BadgeResponse)
async def generate_badge(scan_id: str):
    """
    Generate a trust badge for a completed scan

    - **scan_id**: UUID of the scan
    """
    supabase = get_supabase_service()

    # Get scan
    scan = await supabase.get_scan(scan_id)
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")

    if scan["status"] != "completed":
        raise HTTPException(status_code=400, detail="Scan is not completed yet")

    grade = scan.get("grade", "?")
    score = scan.get("score", 0)

    # Generate badge URL using shields.io
    color = GRADE_COLORS.get(grade, "lightgrey")
    label = quote("Trust Score")
    message = quote(f"{grade} ({score}/100)")

    badge_url = f"https://img.shields.io/badge/{label}-{message}-{color}?style=for-the-badge"

    # Generate embed codes
    target_url = scan.get("target_url", "")

    # HTML embed code
    html_embed = f'<a href="https://trust-security.app/scan/{scan_id}" target="_blank"><img src="{badge_url}" alt="Trust Security Score: {grade}"></a>'

    # Markdown embed
    md_embed = f"[![Trust Score]({badge_url})](https://trust-security.app/scan/{scan_id})"

    # Save badge to database
    try:
        await supabase.create_trust_badge(scan_id, badge_url, html_embed)
    except Exception:
        # Badge might already exist, that's okay
        pass

    return BadgeResponse(
        scan_id=scan_id,
        badge_url=badge_url,
        embed_code=html_embed,
        markdown=md_embed,
        html=html_embed
    )


@router.get("/badge/{scan_id}", response_model=BadgeResponse)
async def get_badge(scan_id: str):
    """
    Get existing badge for a scan

    - **scan_id**: UUID of the scan
    """
    supabase = get_supabase_service()

    # Check if badge exists
    badge = await supabase.get_trust_badge(scan_id)

    if badge:
        # Return existing badge
        scan = await supabase.get_scan(scan_id)
        grade = scan.get("grade", "?") if scan else "?"
        score = scan.get("score", 0) if scan else 0

        badge_url = badge.get("badge_url", "")
        html_embed = badge.get("embed_code", "")
        md_embed = f"[![Trust Score]({badge_url})](https://trust-security.app/scan/{scan_id})"

        return BadgeResponse(
            scan_id=scan_id,
            badge_url=badge_url,
            embed_code=html_embed,
            markdown=md_embed,
            html=html_embed
        )

    # Generate new badge if doesn't exist
    return await generate_badge(scan_id)


@router.get("/badge/{scan_id}/image")
async def get_badge_image(
    scan_id: str,
    style: str = "for-the-badge",
    label: str = "Trust Score"
):
    """
    Redirect to badge image (shields.io)

    - **scan_id**: UUID of the scan
    - **style**: Badge style (flat, flat-square, plastic, for-the-badge)
    - **label**: Custom label text
    """
    supabase = get_supabase_service()

    # Get scan
    scan = await supabase.get_scan(scan_id)
    if not scan:
        # Return a "not found" badge
        return RedirectResponse(
            url=f"https://img.shields.io/badge/{quote(label)}-Not%20Found-lightgrey?style={style}"
        )

    if scan["status"] != "completed":
        # Return a "pending" badge
        return RedirectResponse(
            url=f"https://img.shields.io/badge/{quote(label)}-Pending-lightgrey?style={style}"
        )

    grade = scan.get("grade", "?")
    score = scan.get("score", 0)
    color = GRADE_COLORS.get(grade, "lightgrey")

    message = quote(f"{grade} ({score}/100)")

    return RedirectResponse(
        url=f"https://img.shields.io/badge/{quote(label)}-{message}-{color}?style={style}"
    )
