"""
Trust Backend - FastAPI Application
AI-powered security vulnerability scanner
"""

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request, APIRouter
from fastapi.middleware.cors import CORSMiddleware
from app.config import get_settings
from app.logging_config import setup_logging, get_logger
from app.limiter import RateLimitMiddleware
from app.api.routes import scan, analyze, badge, repo_scan, billing, billing_webhook, github, github_webhook, notifications, push, mcp_tracking, account, vercel, api_keys
from app.api.error_handlers import register_error_handlers

logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan - startup and shutdown"""
    import subprocess
    import os

    # Startup
    settings = get_settings()

    # Initialize structured logging early
    setup_logging(settings.environment)

    errors = settings.validate()

    if errors:
        logger.warning("configuration_warnings", warnings=errors)

    logger.info("api_starting", environment=settings.environment)

    # Check Nuclei installation
    try:
        result = subprocess.run(["nuclei", "-version"], capture_output=True, text=True, timeout=10)
        logger.info("nuclei_check", version=result.stdout.strip())
        if result.stderr:
            logger.debug("nuclei_stderr", output=result.stderr.strip())
    except Exception as e:
        logger.warning("nuclei_check_failed", error=str(e))

    # Check templates directory
    templates_paths = [
        "/root/nuclei-templates",
        os.path.expanduser("~/nuclei-templates"),
        "/root/.nuclei-templates",
    ]
    for path in templates_paths:
        if os.path.exists(path):
            # Count actual yaml files
            import glob
            yaml_files = glob.glob(f"{path}/**/*.yaml", recursive=True)
            # List first level directories
            dirs = [d for d in os.listdir(path) if os.path.isdir(os.path.join(path, d))]
            logger.info("nuclei_templates_found", path=path, yaml_count=len(yaml_files), categories=dirs[:10])
            break
    else:
        logger.warning("nuclei_templates_not_found")

    # Initialize PostgreSQL connection pool
    try:
        from app.services.supabase_client import init_db_pool, get_supabase_service
        await init_db_pool()
        logger.info("db_pool_ready")
    except Exception as e:
        logger.error("db_pool_init_failed", error=str(e))
        raise

    # Cleanup expired AI cache entries on startup
    try:
        supabase = get_supabase_service()
        deleted = await supabase.cleanup_expired_cache(days=30)
        if deleted > 0:
            logger.info("ai_cache_cleanup", deleted_count=deleted)
    except Exception as e:
        logger.warning("ai_cache_cleanup_failed", error=str(e))

    # Recover stuck scans (left in "processing" state from previous crash).
    try:
        from app.models.schemas import ScanStatus
        stuck_scans = await supabase.get_scans_by_status("processing", older_than_minutes=25)
        for stuck in stuck_scans:
            await supabase.update_scan_status(
                stuck["id"],
                ScanStatus.FAILED,
                error_message="Server restarted during scan",
            )
        if stuck_scans:
            logger.info("stuck_scans_recovered", count=len(stuck_scans))
    except Exception as e:
        logger.warning("stuck_scan_recovery_failed", error=str(e))

    # Start background scheduler for scheduled scans
    scheduler_task = None
    try:
        from app.services.scheduler import scheduler_loop
        scheduler_task = asyncio.create_task(scheduler_loop())
        logger.info("scheduler_started")
    except Exception as e:
        logger.warning("scheduler_startup_failed", error=str(e))

    yield

    # Shutdown
    if scheduler_task:
        scheduler_task.cancel()
        try:
            await scheduler_task
        except asyncio.CancelledError:
            pass
    try:
        from app.services.supabase_client import close_db_pool
        await close_db_pool()
    except Exception:
        pass
    logger.info("api_shutting_down")


app = FastAPI(
    title="Trust API",
    description="AI-powered security vulnerability scanner for web applications",
    version="1.0.0",
    lifespan=lifespan,
)

# Rate limiting middleware
app.add_middleware(RateLimitMiddleware)

# CORS middleware
_settings = get_settings()
_default_origins = [
    "http://localhost:3000",
    "http://localhost:3001",
    "https://trust-scan.me",
    "https://www.trust-scan.me",
    "https://trust-security.vercel.app",
]

if _settings.environment == "production":
    # Production: use explicit allowed origins only (no wildcard regex)
    _cors_origins = _settings.allowed_origins if _settings.allowed_origins else _default_origins
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    # Development: allow localhost + explicit preview domains only
    _cors_origins = _default_origins + _settings.allowed_origins
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

# --- API Routers ---
# Route modules no longer carry a prefix; we mount them under /api and /api/v1.

# Legacy /api/* routes (backward-compatible, deprecated)
_legacy_router = APIRouter(prefix="/api")
_legacy_router.include_router(scan.router)
_legacy_router.include_router(analyze.router)
_legacy_router.include_router(badge.router)
_legacy_router.include_router(repo_scan.router)
_legacy_router.include_router(billing.router)
_legacy_router.include_router(github.router)
_legacy_router.include_router(notifications.router)
_legacy_router.include_router(push.router)
_legacy_router.include_router(mcp_tracking.router)
_legacy_router.include_router(account.router)
_legacy_router.include_router(vercel.router)
_legacy_router.include_router(api_keys.router)
app.include_router(_legacy_router)

# Canonical /api/v1/* routes
_v1_router = APIRouter(prefix="/api/v1")
_v1_router.include_router(scan.router)
_v1_router.include_router(analyze.router)
_v1_router.include_router(badge.router)
_v1_router.include_router(repo_scan.router)
_v1_router.include_router(billing.router)
_v1_router.include_router(github.router)
_v1_router.include_router(notifications.router)
_v1_router.include_router(push.router)
_v1_router.include_router(mcp_tracking.router)
_v1_router.include_router(account.router)
_v1_router.include_router(vercel.router)
_v1_router.include_router(api_keys.router)
app.include_router(_v1_router)

# Webhook routes (no /api prefix — Stripe sends to /webhooks/stripe)
_webhook_router = APIRouter()
_webhook_router.include_router(billing_webhook.router)
_webhook_router.include_router(github_webhook.router)
app.include_router(_webhook_router)

# RFC 7807 error handlers (replaces old global_exception_handler)
register_error_handlers(app)


@app.middleware("http")
async def deprecation_header_middleware(request: Request, call_next):
    """Add deprecation headers to legacy /api/* routes (not /api/v1/*)."""
    response = await call_next(request)
    path = request.url.path
    if path.startswith("/api/") and not path.startswith("/api/v1/"):
        response.headers["Deprecation"] = "true"
        response.headers["Sunset"] = "2026-06-01"
        response.headers["Link"] = f'</api/v1{path[4:]}>; rel="successor-version"'
    return response


@app.get("/")
async def root():
    """Root endpoint - health check"""
    return {
        "service": "Trust API",
        "version": "1.0.0",
        "status": "healthy"
    }


@app.get("/health")
async def health_check():
    """Health check endpoint for Cloud Run"""
    return {"status": "healthy"}


@app.post("/api/admin/set-plan")
async def admin_set_plan(request: Request):
    """
    Set a user's subscription plan. Protected by admin secret.
    Provide either 'user_id' or 'email' to identify the user.
    Usage: curl -X POST .../api/admin/set-plan \
           -H "X-Admin-Secret: YOUR_SECRET" \
           -H "Content-Type: application/json" \
           -d '{"user_id": "uuid-here", "plan": "pro"}'
    """
    settings = get_settings()

    admin_secret = request.headers.get("X-Admin-Secret", "")
    if not settings.admin_secret or admin_secret != settings.admin_secret:
        raise HTTPException(status_code=403, detail="Forbidden")

    body = await request.json()
    user_id = body.get("user_id")
    email = body.get("email")
    plan = body.get("plan", "pro")

    if not user_id and not email:
        raise HTTPException(status_code=400, detail="user_id or email is required")
    if plan not in ("free", "pro"):
        raise HTTPException(status_code=400, detail="plan must be 'free' or 'pro'")

    from app.services.supabase_client import get_supabase_service
    supabase = get_supabase_service()

    # If email provided, look up user_id from users table
    if not user_id and email:
        user_row = await supabase.get_user_by_email(email)
        if not user_row:
            raise HTTPException(status_code=404, detail=f"User not found: {email}")
        user_id = str(user_row["id"])

    try:
        await supabase.set_user_plan(user_id, plan)
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))

    logger.info("admin_set_plan", user_id=user_id, plan=plan)
    return {"status": "ok", "user_id": user_id, "plan": plan}


@app.get("/api/admin/list-users")
async def admin_list_users(request: Request):
    """List all users with their plan status. Protected by admin secret."""
    settings = get_settings()

    admin_secret = request.headers.get("X-Admin-Secret", "")
    if not settings.admin_secret or admin_secret != settings.admin_secret:
        raise HTTPException(status_code=403, detail="Forbidden")

    from app.services.supabase_client import get_supabase_service
    supabase = get_supabase_service()
    users = await supabase.list_users()
    return {"users": users}


@app.post("/api/cron/run-schedules")
async def cron_run_schedules(request: Request):
    """
    Trigger scheduled scan check. Can be called by Cloud Scheduler.
    Protected by admin secret in production.
    """
    settings = get_settings()

    if settings.environment == "production":
        admin_secret = request.headers.get("X-Admin-Secret", "")
        if not settings.admin_secret or admin_secret != settings.admin_secret:
            raise HTTPException(status_code=403, detail="Forbidden")

    from app.services.scheduler import check_and_run_due_scans
    triggered = await check_and_run_due_scans()
    return {"status": "ok", "triggered": triggered}


@app.post("/api/cron/send-weekly-reports")
async def cron_send_weekly_reports(request: Request):
    """
    Send weekly security report emails to users who have scheduled scans with email notifications.
    Protected by admin secret in production.
    """
    settings = get_settings()

    if settings.environment == "production":
        admin_secret = request.headers.get("X-Admin-Secret", "")
        if not settings.admin_secret or admin_secret != settings.admin_secret:
            raise HTTPException(status_code=403, detail="Forbidden")

    from datetime import datetime, timedelta
    from app.services.supabase_client import get_supabase_service
    from app.services.notifier import send_email_notification

    supabase = get_supabase_service()
    emails_sent = 0
    errors = 0

    try:
        rows = await supabase.get_scheduled_scans_with_email()

        email_targets: dict[str, list[str]] = {}
        for row in rows:
            email_targets.setdefault(row["notification_email"], []).append(row["target_url"])

        seven_days_ago = datetime.utcnow() - timedelta(days=7)

        for email, target_urls in email_targets.items():
            try:
                for target_url in target_urls:
                    scan = await supabase.get_recent_scan_for_url(target_url, seven_days_ago)
                    if scan:
                        scan_result = {
                            "scan_id": scan["id"],
                            "target_url": scan["target_url"],
                            "score": scan.get("score"),
                            "grade": scan.get("grade"),
                            "summary": scan.get("summary", {}),
                        }
                        await send_email_notification(email, scan_result)
                        emails_sent += 1
                        logger.info("weekly_report_sent", email=email, target_url=target_url)
            except Exception as e:
                errors += 1
                logger.error("weekly_report_email_failed", email=email, error=str(e))

    except Exception as e:
        logger.error("weekly_report_cron_failed", error=str(e))
        errors += 1

    logger.info("weekly_report_cron_completed", emails_sent=emails_sent, errors=errors)
    return {"status": "ok", "emails_sent": emails_sent, "errors": errors}


# ── Mount MCP server at /mcp (Streamable HTTP transport) ──────────────────
try:
    from app.services.mcp_server import mcp as _mcp_server
    app.mount("/mcp", _mcp_server.streamable_http_app())
    logger.info("mcp_server_mounted", path="/mcp")
except Exception as _mcp_err:
    logger.warning("mcp_server_mount_failed", error=str(_mcp_err))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
