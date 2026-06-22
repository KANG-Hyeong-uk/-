"""
Trust Backend - Scheduled Scan Scheduler
Checks for due scans and triggers them, reusing existing scan logic.
"""

import asyncio
from datetime import datetime

from croniter import croniter

from app.logging_config import get_logger
from app.services.supabase_client import get_supabase_service

logger = get_logger(__name__)
from app.services.nuclei_scanner import (
    NucleiScanner,
    calculate_score,
    probe_target_reachability,
    TargetUnreachableError,
)
from app.models.schemas import ScanStatus, ScanMode, ScanCreate


async def update_next_run(schedule_id: str, cron_expression: str) -> None:
    """Calculate and persist the next run time for a schedule."""
    supabase = get_supabase_service()
    now = datetime.utcnow()
    cron = croniter(cron_expression, now)
    next_run = cron.get_next(datetime).isoformat()
    await supabase.update_scheduled_scan(schedule_id, {
        "last_run_at": now.isoformat(),
        "next_run_at": next_run,
    })


async def run_scheduled_scan(schedule: dict) -> dict | None:
    """Run a single scheduled scan and return the scan result dict (or None on failure)."""
    supabase = get_supabase_service()
    target_url = schedule["target_url"]

    # Create a new scan record
    scan_data = ScanCreate(
        target_url=target_url,
        scan_mode="quick",
        status="pending",
    )
    try:
        scan = await supabase.create_scan(scan_data)
    except Exception as e:
        logger.error("scheduler_scan_create_failed", target_url=target_url, error=str(e))
        return None

    scan_id = scan["id"]

    try:
        # Mark as processing
        await supabase.update_scan_status(
            scan_id,
            ScanStatus.PROCESSING,
            started_at=datetime.utcnow().isoformat(),
        )

        # Pre-flight reachability check — see run_scan_background in scan.py.
        # If the target is offline, don't run Nuclei (it would return 0 findings
        # and we'd score a dead site as 100/A).
        try:
            await probe_target_reachability(target_url)
        except TargetUnreachableError as reach_err:
            logger.warning(
                "scheduler_target_unreachable",
                target_url=target_url,
                reason=str(reach_err),
            )
            await supabase.update_scan_status(
                scan_id,
                ScanStatus.FAILED,
                error_message=f"Target unreachable: {reach_err}",
                completed_at=datetime.utcnow().isoformat(),
            )
            return None

        # Run scan
        scanner = NucleiScanner(target_url, scan_id)
        findings = await scanner.run_scan(mode=ScanMode.QUICK)

        # Save vulnerabilities
        if findings:
            await supabase.create_vulnerabilities_batch(scan_id, findings)

        # Calculate score
        score, grade, score_breakdown = calculate_score(findings)
        summary = supabase.calculate_summary(
            [{"severity": f.get("severity", "info")} for f in findings]
        )
        summary_data = summary.model_dump()
        summary_data["score_breakdown"] = score_breakdown

        # Mark completed
        await supabase.update_scan_status(
            scan_id,
            ScanStatus.COMPLETED,
            score=score,
            grade=grade,
            summary=summary_data,
            completed_at=datetime.utcnow().isoformat(),
        )

        return {
            "scan_id": scan_id,
            "target_url": target_url,
            "score": score,
            "grade": grade,
            "summary": summary.model_dump(),
        }

    except Exception as e:
        logger.error("scheduler_scan_failed", target_url=target_url, error=str(e))
        await supabase.update_scan_status(
            scan_id,
            ScanStatus.FAILED,
            error_message=str(e),
            completed_at=datetime.utcnow().isoformat(),
        )
        return None


async def check_and_run_due_scans() -> int:
    """
    Check for due scheduled scans and run them.
    Returns the number of scans triggered.
    """
    from app.services.notifier import send_notifications

    supabase = get_supabase_service()
    due_schedules = await supabase.get_due_schedules()

    if not due_schedules:
        return 0

    count = 0
    for schedule in due_schedules:
        logger.info("scheduler_running_scan", target_url=schedule["target_url"])

        # Update next_run immediately to prevent double-execution
        await update_next_run(schedule["id"], schedule.get("cron_expression", "0 * * * *"))

        result = await run_scheduled_scan(schedule)
        count += 1

        # Send notifications if scan completed
        if result:
            await send_notifications(schedule, result)

    return count


async def check_and_send_digests() -> int:
    """Send weekly digests to users who have digest enabled. Should run Monday ~9 AM UTC."""
    from app.services.notifier import send_weekly_digest

    supabase = get_supabase_service()
    users = await supabase.get_digest_enabled_users()

    if not users:
        return 0

    count = 0
    for user in users:
        try:
            await send_weekly_digest(user["digest_email"], user["id"])
            count += 1
        except Exception as e:
            logger.error("digest_send_failed", user_id=user["id"], error=str(e))

    return count


async def scheduler_loop() -> None:
    """Background loop that checks for due scans every 60 seconds."""
    logger.info("scheduler_loop_started")
    _last_digest_date: str | None = None
    while True:
        try:
            triggered = await check_and_run_due_scans()
            if triggered > 0:
                logger.info("scheduler_triggered", count=triggered)

            # Weekly digest: Monday between 9:00-9:01 UTC
            now = datetime.utcnow()
            today_str = now.strftime("%Y-%m-%d")
            if now.weekday() == 0 and now.hour == 9 and now.minute == 0 and _last_digest_date != today_str:
                _last_digest_date = today_str
                sent = await check_and_send_digests()
                if sent > 0:
                    logger.info("weekly_digests_sent", count=sent)

        except Exception as e:
            logger.error("scheduler_loop_error", error=str(e))
        await asyncio.sleep(60)
