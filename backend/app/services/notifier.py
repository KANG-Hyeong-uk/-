"""
Trust Backend - Notification Service
Sends scan result notifications via email (Resend), Slack webhook, and Web Push.
"""

import json

import httpx

from app.config import get_settings
from app.logging_config import get_logger

logger = get_logger(__name__)

# Frontend report URL base
REPORT_BASE_URL = "https://www.trust-scan.me/report"


async def send_notifications(schedule: dict, scan_result: dict) -> None:
    """Send all configured notifications for a completed scheduled scan."""
    email = schedule.get("notification_email")
    slack_url = schedule.get("slack_webhook_url")

    if email:
        await send_email_notification(email, scan_result)

    if slack_url:
        await send_slack_notification(slack_url, scan_result)


async def send_email_notification(email: str, scan_result: dict) -> None:
    """Send email notification via Resend API. Skips silently if RESEND_API_KEY is not set."""
    settings = get_settings()
    resend_key = getattr(settings, "resend_api_key", "")
    if not resend_key:
        logger.info("email_notification_skipped", reason="RESEND_API_KEY not configured")
        return

    scan_id = scan_result["scan_id"]
    target_url = scan_result["target_url"]
    score = scan_result.get("score", "N/A")
    grade = scan_result.get("grade", "N/A")
    summary = scan_result.get("summary", {})
    report_url = f"{REPORT_BASE_URL}/{scan_id}"

    subject = f"Trust Scan Report: {target_url} - Score {score}/100 (Grade {grade})"

    html_body = f"""
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1a1a2e;">Trust Security Scan Report</h2>
        <p><strong>Target:</strong> {target_url}</p>
        <p><strong>Score:</strong> {score}/100 (Grade: <strong>{grade}</strong>)</p>

        <table style="border-collapse: collapse; width: 100%; margin: 16px 0;">
            <tr style="background: #1a1a2e; color: white;">
                <th style="padding: 8px;">Critical</th>
                <th style="padding: 8px;">High</th>
                <th style="padding: 8px;">Medium</th>
                <th style="padding: 8px;">Low</th>
                <th style="padding: 8px;">Info</th>
            </tr>
            <tr style="text-align: center;">
                <td style="padding: 8px; color: #dc2626;">{summary.get('critical', 0)}</td>
                <td style="padding: 8px; color: #ea580c;">{summary.get('high', 0)}</td>
                <td style="padding: 8px; color: #d97706;">{summary.get('medium', 0)}</td>
                <td style="padding: 8px; color: #2563eb;">{summary.get('low', 0)}</td>
                <td style="padding: 8px; color: #6b7280;">{summary.get('info', 0)}</td>
            </tr>
        </table>

        <p><a href="{report_url}" style="display: inline-block; padding: 10px 20px; background: #1a1a2e; color: white; text-decoration: none; border-radius: 6px;">View Full Report</a></p>
        <p style="color: #666; font-size: 12px; margin-top: 24px;">This is an automated notification from Trust Security Scanner.</p>
    </div>
    """

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                "https://api.resend.com/emails",
                headers={
                    "Authorization": f"Bearer {resend_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "from": "Trust Scanner <noreply@trust-scanner.dev>",
                    "to": [email],
                    "subject": subject,
                    "html": html_body,
                },
            )
            if resp.status_code < 300:
                logger.info("email_sent", recipient=email)
            else:
                logger.warning("email_send_failed", status_code=resp.status_code, response=resp.text)
    except Exception as e:
        logger.error("email_notification_error", error=str(e))


async def send_weekly_digest(email: str, user_id: str) -> None:
    """Send a weekly digest email summarizing the user's scan activity."""
    settings = get_settings()
    resend_key = getattr(settings, "resend_api_key", "")
    if not resend_key:
        logger.info("weekly_digest_skipped", reason="RESEND_API_KEY not configured")
        return

    from datetime import datetime, timedelta
    from app.services.supabase_client import get_pool

    pool = get_pool()
    seven_days_ago = datetime.utcnow() - timedelta(days=7)
    fourteen_days_ago = datetime.utcnow() - timedelta(days=14)

    rows = await pool.fetch(
        """SELECT id, target_url, score, grade, summary, completed_at
           FROM scans WHERE user_id = $1 AND status = 'completed' AND completed_at >= $2
           ORDER BY completed_at DESC""",
        user_id, seven_days_ago
    )
    scans = [dict(r) for r in rows]

    prev_rows = await pool.fetch(
        """SELECT score FROM scans
           WHERE user_id = $1 AND status = 'completed'
             AND completed_at >= $2 AND completed_at < $3""",
        user_id, fourteen_days_ago, seven_days_ago
    )
    prev_scans = [dict(r) for r in prev_rows]

    if not scans:
        logger.info("weekly_digest_no_scans", user_id=user_id)
        return

    # Calculate stats
    scores = [s["score"] for s in scans if s.get("score") is not None]
    avg_score = round(sum(scores) / len(scores)) if scores else 0
    prev_scores = [s["score"] for s in prev_scans if s.get("score") is not None]
    prev_avg = round(sum(prev_scores) / len(prev_scores)) if prev_scores else None

    if prev_avg is not None:
        diff = avg_score - prev_avg
        trend_arrow = "&#8593;" if diff > 0 else "&#8595;" if diff < 0 else "&#8594;"
        trend_color = "#22c55e" if diff > 0 else "#ef4444" if diff < 0 else "#6b7280"
        trend_text = f'<span style="color:{trend_color};font-size:18px;">{trend_arrow}</span> {abs(diff)} pts vs last week'
    else:
        trend_text = "First week of data"

    # Top vulnerability types
    vuln_counts: dict[str, int] = {}
    for s in scans:
        summary = s.get("summary") or {}
        for sev in ("critical", "high", "medium", "low"):
            count = summary.get(sev, 0)
            if count > 0:
                vuln_counts[sev] = vuln_counts.get(sev, 0) + count

    vuln_rows = ""
    for sev in ("critical", "high", "medium", "low"):
        count = vuln_counts.get(sev, 0)
        if count > 0:
            sev_colors = {"critical": "#dc2626", "high": "#ea580c", "medium": "#d97706", "low": "#2563eb"}
            vuln_rows += f'<tr><td style="padding:6px 12px;color:{sev_colors.get(sev, "#6b7280")};">{sev.capitalize()}</td><td style="padding:6px 12px;text-align:right;">{count}</td></tr>'

    # Scan list rows
    scan_rows = ""
    for s in scans[:5]:
        g = s.get("grade", "?")
        grade_colors = {"A": "#22c55e", "B": "#84cc16", "C": "#eab308", "D": "#f97316", "F": "#ef4444"}
        gc = grade_colors.get(str(g)[:1], "#6b7280")
        scan_rows += f'<tr><td style="padding:6px 12px;">{s["target_url"]}</td><td style="padding:6px 12px;text-align:center;">{s.get("score", "N/A")}</td><td style="padding:6px 12px;text-align:center;color:{gc};font-weight:bold;">{g}</td></tr>'

    subject = f"Trust Security Weekly Digest — Avg Score: {avg_score}/100"

    html_body = f"""
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#0d1117;color:#e6edf3;padding:24px;border-radius:12px;">
        <h2 style="color:#00f3ff;margin-top:0;">Weekly Security Digest</h2>
        <div style="display:flex;gap:24px;margin:16px 0;">
            <div style="background:#161b22;padding:16px 20px;border-radius:8px;flex:1;text-align:center;">
                <div style="font-size:28px;font-weight:bold;color:#00f3ff;">{avg_score}</div>
                <div style="font-size:12px;color:#8b949e;">Avg Score</div>
            </div>
            <div style="background:#161b22;padding:16px 20px;border-radius:8px;flex:1;text-align:center;">
                <div style="font-size:28px;font-weight:bold;color:#e6edf3;">{len(scans)}</div>
                <div style="font-size:12px;color:#8b949e;">Scans This Week</div>
            </div>
        </div>
        <p style="color:#8b949e;font-size:13px;">{trend_text}</p>

        {f'<h3 style="color:#e6edf3;font-size:14px;margin-top:20px;">Vulnerability Summary</h3><table style="width:100%;border-collapse:collapse;background:#161b22;border-radius:8px;">{vuln_rows}</table>' if vuln_rows else ''}

        <h3 style="color:#e6edf3;font-size:14px;margin-top:20px;">Recent Scans</h3>
        <table style="width:100%;border-collapse:collapse;background:#161b22;border-radius:8px;">
            <tr style="color:#8b949e;font-size:12px;"><th style="padding:8px 12px;text-align:left;">Target</th><th style="padding:8px 12px;">Score</th><th style="padding:8px 12px;">Grade</th></tr>
            {scan_rows}
        </table>

        <p style="margin-top:20px;"><a href="https://www.trust-scan.me" style="display:inline-block;padding:10px 20px;background:#00f3ff;color:#0d1117;text-decoration:none;border-radius:6px;font-weight:600;">View Dashboard</a></p>
        <p style="color:#484f58;font-size:11px;margin-top:24px;">You're receiving this because you enabled weekly digest. Manage settings on your dashboard.</p>
    </div>
    """

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                "https://api.resend.com/emails",
                headers={
                    "Authorization": f"Bearer {resend_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "from": "Trust Scanner <noreply@trust-scanner.dev>",
                    "to": [email],
                    "subject": subject,
                    "html": html_body,
                },
            )
            if resp.status_code < 300:
                logger.info("weekly_digest_sent", recipient=email, user_id=user_id)
            else:
                logger.warning("weekly_digest_failed", status_code=resp.status_code, response=resp.text)
    except Exception as e:
        logger.error("weekly_digest_error", error=str(e))


async def send_slack_notification(webhook_url: str, scan_result: dict) -> None:
    """Send Slack notification via incoming webhook."""
    scan_id = scan_result["scan_id"]
    target_url = scan_result["target_url"]
    score = scan_result.get("score", "N/A")
    grade = scan_result.get("grade", "N/A")
    summary = scan_result.get("summary", {})
    report_url = f"{REPORT_BASE_URL}/{scan_id}"

    # Choose color based on grade
    grade_colors = {"A": "#22c55e", "B": "#84cc16", "C": "#eab308", "D": "#f97316", "F": "#ef4444"}
    color = grade_colors.get(str(grade)[:1], "#6b7280")

    payload = {
        "attachments": [
            {
                "color": color,
                "blocks": [
                    {
                        "type": "header",
                        "text": {"type": "plain_text", "text": "Trust Security Scan Report"},
                    },
                    {
                        "type": "section",
                        "fields": [
                            {"type": "mrkdwn", "text": f"*Target:*\n{target_url}"},
                            {"type": "mrkdwn", "text": f"*Score:*\n{score}/100 (Grade: *{grade}*)"},
                        ],
                    },
                    {
                        "type": "section",
                        "fields": [
                            {"type": "mrkdwn", "text": f"*Critical:* {summary.get('critical', 0)}"},
                            {"type": "mrkdwn", "text": f"*High:* {summary.get('high', 0)}"},
                            {"type": "mrkdwn", "text": f"*Medium:* {summary.get('medium', 0)}"},
                            {"type": "mrkdwn", "text": f"*Low:* {summary.get('low', 0)}"},
                        ],
                    },
                    {
                        "type": "actions",
                        "elements": [
                            {
                                "type": "button",
                                "text": {"type": "plain_text", "text": "View Full Report"},
                                "url": report_url,
                                "style": "primary",
                            }
                        ],
                    },
                ],
            }
        ]
    }

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(webhook_url, json=payload)
            if resp.status_code == 200:
                logger.info("slack_notification_sent")
            else:
                logger.warning("slack_send_failed", status_code=resp.status_code, response=resp.text)
    except Exception as e:
        logger.error("slack_notification_error", error=str(e))


# ==================== WEB PUSH ====================


async def send_push_notification(
    subscription_info: dict, title: str, body: str, url: str = ""
) -> bool:
    """
    Send a Web Push notification using pywebpush.

    Args:
        subscription_info: dict with endpoint, keys.p256dh, keys.auth
        title: Notification title
        body: Notification body text
        url: URL to open when notification is clicked

    Returns:
        True if sent successfully, False otherwise.
    """
    settings = get_settings()
    if not settings.vapid_private_key:
        logger.info("push_notification_skipped", reason="VAPID_PRIVATE_KEY not configured")
        return False

    try:
        from pywebpush import webpush, WebPushException

        payload = json.dumps({
            "title": title,
            "body": body,
            "url": url,
            "icon": "/icon.svg",
        })

        webpush(
            subscription_info=subscription_info,
            data=payload,
            vapid_private_key=settings.vapid_private_key,
            vapid_claims={"sub": settings.vapid_email},
        )
        logger.info("push_notification_sent", endpoint=subscription_info.get("endpoint", "")[:60])
        return True

    except Exception as e:
        error_str = str(e)
        # 410 Gone means subscription expired — caller should delete it
        if "410" in error_str or "Gone" in error_str:
            logger.info("push_subscription_expired", endpoint=subscription_info.get("endpoint", "")[:60])
            # Delete expired subscription
            try:
                from app.services.supabase_client import get_supabase_service
                supabase = get_supabase_service()
                await supabase.delete_push_subscription(
                    endpoint=subscription_info.get("endpoint", "")
                )
            except Exception as del_err:
                logger.warning("push_subscription_cleanup_failed", error=str(del_err))
            return False

        # 404 also means the subscription is no longer valid
        if "404" in error_str:
            logger.info("push_subscription_not_found", endpoint=subscription_info.get("endpoint", "")[:60])
            try:
                from app.services.supabase_client import get_supabase_service
                supabase = get_supabase_service()
                await supabase.delete_push_subscription(
                    endpoint=subscription_info.get("endpoint", "")
                )
            except Exception as del_err:
                logger.warning("push_subscription_cleanup_failed", error=str(del_err))
            return False

        logger.error("push_notification_error", error=error_str)
        return False


async def send_scan_complete_push(
    scan_id: str,
    target_url: str,
    score: int,
    grade: str,
    user_id: str = None,
) -> int:
    """
    Send Web Push notifications for a completed scan.

    Fetches all push subscriptions for the user (or anonymous ones)
    and sends a notification to each.

    Returns:
        Number of notifications successfully sent.
    """
    from app.services.supabase_client import get_supabase_service

    supabase = get_supabase_service()

    try:
        subscriptions = await supabase.get_push_subscriptions(user_id=user_id)
        # Also include anonymous (unlinked) subscriptions as fallback
        if user_id:
            anon_subs = await supabase.get_push_subscriptions(user_id=None)
            seen_endpoints = {s["endpoint"] for s in subscriptions}
            for s in anon_subs:
                if s["endpoint"] not in seen_endpoints:
                    subscriptions.append(s)
    except Exception as e:
        logger.error("push_subscriptions_fetch_failed", error=str(e), user_id=user_id)
        return 0

    if not subscriptions:
        return 0

    title = "Trust Security \u2014 Scan Complete"
    body = f"{target_url} \u2014 Score: {score} ({grade})"
    report_url = f"{REPORT_BASE_URL}/{scan_id}"

    sent_count = 0
    for sub in subscriptions:
        subscription_info = {
            "endpoint": sub["endpoint"],
            "keys": {
                "p256dh": sub["p256dh"],
                "auth": sub["auth_key"],
            },
        }
        success = await send_push_notification(subscription_info, title, body, url=report_url)
        if success:
            sent_count += 1

    if sent_count > 0:
        logger.info(
            "scan_complete_push_sent",
            scan_id=scan_id,
            user_id=user_id,
            sent=sent_count,
            total=len(subscriptions),
        )

    return sent_count
