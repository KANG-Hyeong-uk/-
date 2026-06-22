"""
MCP Usage Tracking API
Fire-and-forget endpoint for logging MCP tool usage.
"""

from fastapi import APIRouter, BackgroundTasks
from pydantic import BaseModel
from typing import Optional

from app.logging_config import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/mcp", tags=["mcp-tracking"])


class MCPUsageEvent(BaseModel):
    tool_name: str
    client_hint: Optional[str] = None
    arguments: Optional[dict] = None
    duration_ms: Optional[int] = None
    success: bool = True
    error_message: Optional[str] = None


async def _save_usage(event: MCPUsageEvent):
    """Background task to save usage data to Supabase."""
    try:
        from app.services.supabase_client import get_supabase_service
        supabase = get_supabase_service()
        await supabase.log_mcp_usage(event.model_dump())
    except Exception as e:
        logger.warning("mcp_usage_save_failed", error=str(e))


@router.post("/track", status_code=202)
async def track_mcp_usage(event: MCPUsageEvent, background_tasks: BackgroundTasks):
    """Log MCP tool usage. Fire-and-forget — always returns 202."""
    background_tasks.add_task(_save_usage, event)
    return {"status": "accepted"}
