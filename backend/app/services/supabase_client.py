"""
Trust Backend Database Client
PostgreSQL database operations using asyncpg connection pool
"""

import asyncio
import json
from datetime import datetime, timedelta, timezone
from typing import Optional
import asyncpg

from app.config import get_settings
from app.logging_config import get_logger
from app.models.schemas import (
    ScanCreate,
    VulnerabilityCreate,
    VulnerabilitySummary,
    ScanStatus,
    RepoScanCreate,
    RepoVulnerabilitySummary,
)

logger = get_logger(__name__)

# Module-level connection pool
_pool: Optional[asyncpg.Pool] = None


async def init_db_pool():
    """Initialize the asyncpg connection pool. Call once at startup."""
    global _pool
    settings = get_settings()
    # Strip sslmode from DSN — asyncpg uses the ssl= kwarg instead
    dsn = settings.database_url.split("?")[0]
    _pool = await asyncpg.create_pool(
        dsn=dsn,
        min_size=2,
        max_size=10,
        command_timeout=60,
        ssl=False,
    )
    logger.info("db_pool_initialized")


async def close_db_pool():
    """Close the connection pool. Call at shutdown."""
    global _pool
    if _pool:
        await _pool.close()
        _pool = None
        logger.info("db_pool_closed")


def get_pool() -> asyncpg.Pool:
    if _pool is None:
        raise RuntimeError("DB pool not initialized. Call init_db_pool() first.")
    return _pool


def _row_to_dict(row) -> dict:
    """Convert asyncpg Record to plain dict, serialising JSON fields."""
    if row is None:
        return None
    d = dict(row)
    for k, v in d.items():
        if isinstance(v, (dict, list)):
            pass  # already python object
        # asyncpg returns datetime objects; keep them as-is (FastAPI serialises)
    return d


def _rows_to_list(rows) -> list[dict]:
    return [_row_to_dict(r) for r in rows]


class SupabaseService:
    """Database service using asyncpg — drop-in replacement for the old Supabase client."""

    def __init__(self):
        pass  # pool is module-level; accessed via get_pool()

    @property
    def pool(self) -> asyncpg.Pool:
        return get_pool()

    # ==================== USERS ====================

    async def get_user(self, user_id: str) -> Optional[dict]:
        row = await self.pool.fetchrow(
            "SELECT * FROM users WHERE id = $1", user_id
        )
        return _row_to_dict(row)

    async def update_user(self, user_id: str, data: dict) -> dict:
        cols = list(data.keys())
        vals = list(data.values())
        set_clause = ", ".join(f"{c} = ${i+2}" for i, c in enumerate(cols))
        row = await self.pool.fetchrow(
            f"UPDATE users SET {set_clause} WHERE id = $1 RETURNING *",
            user_id, *vals
        )
        if row is None:
            raise Exception(f"Failed to update user {user_id}")
        return _row_to_dict(row)

    # ==================== SUBSCRIPTIONS ====================

    async def get_subscription_by_user(self, user_id: str) -> Optional[dict]:
        row = await self.pool.fetchrow(
            "SELECT * FROM subscriptions WHERE user_id = $1", user_id
        )
        return _row_to_dict(row)

    async def upsert_subscription(self, data: dict) -> dict:
        data["updated_at"] = datetime.utcnow().isoformat()
        conflict_col = "stripe_customer_id" if data.get("stripe_customer_id") else "stripe_subscription_id"
        cols = list(data.keys())
        vals = list(data.values())
        placeholders = ", ".join(f"${i+1}" for i in range(len(vals)))
        update_clause = ", ".join(
            f"{c} = EXCLUDED.{c}" for c in cols if c != conflict_col
        )
        row = await self.pool.fetchrow(
            f"""INSERT INTO subscriptions ({', '.join(cols)}) VALUES ({placeholders})
                ON CONFLICT ({conflict_col}) DO UPDATE SET {update_clause}
                RETURNING *""",
            *vals
        )
        if row is None:
            raise Exception("Failed to upsert subscription")
        return _row_to_dict(row)

    # ==================== SCANS ====================

    async def create_scan(self, scan_data: ScanCreate, user_id: str | None = None) -> dict:
        row = await self.pool.fetchrow(
            """INSERT INTO scans (target_url, scan_mode, status, user_id, created_at)
               VALUES ($1, $2, $3, $4, $5) RETURNING *""",
            scan_data.target_url,
            scan_data.scan_mode,
            scan_data.status,
            user_id,
            datetime.utcnow(),
        )
        if row is None:
            raise Exception("Failed to create scan")
        return _row_to_dict(row)

    async def get_scan(self, scan_id: str) -> Optional[dict]:
        row = await self.pool.fetchrow(
            "SELECT * FROM scans WHERE id = $1", scan_id
        )
        return _row_to_dict(row)

    async def get_user_scans(self, user_id: str, limit: int = 50) -> list[dict]:
        rows = await self.pool.fetch(
            """SELECT id, target_url, score, grade, status, created_at, completed_at, started_at
               FROM scans
               WHERE user_id = $1 AND status = 'completed'
               ORDER BY created_at DESC LIMIT $2""",
            user_id, limit
        )
        return _rows_to_list(rows)

    async def update_scan_status(self, scan_id: str, status: ScanStatus, **kwargs) -> dict:
        fields = {"status": status.value}
        for f in ("score", "grade", "summary", "started_at", "completed_at", "error_message"):
            if f in kwargs:
                fields[f] = kwargs[f]
        cols = list(fields.keys())
        vals = list(fields.values())
        set_clause = ", ".join(f"{c} = ${i+2}" for i, c in enumerate(cols))
        row = await self.pool.fetchrow(
            f"UPDATE scans SET {set_clause} WHERE id = $1 RETURNING *",
            scan_id, *vals
        )
        if row is None:
            raise Exception(f"Failed to update scan {scan_id}")
        return _row_to_dict(row)

    async def get_recent_scans(
        self,
        limit: int = 20,
        cursor_created_at: str | None = None,
        cursor_id: str | None = None,
    ) -> list[dict]:
        if cursor_created_at and cursor_id:
            rows = await self.pool.fetch(
                """SELECT id, target_url, score, grade, summary, scan_mode, created_at, completed_at
                   FROM scans
                   WHERE status = 'completed'
                     AND (created_at < $1 OR (created_at = $1 AND id < $2))
                   ORDER BY created_at DESC, id DESC LIMIT $3""",
                cursor_created_at, cursor_id, limit
            )
        else:
            rows = await self.pool.fetch(
                """SELECT id, target_url, score, grade, summary, scan_mode, created_at, completed_at
                   FROM scans
                   WHERE status = 'completed'
                   ORDER BY created_at DESC, id DESC LIMIT $1""",
                limit
            )
        return _rows_to_list(rows)

    async def get_scans_by_status(self, status: str, older_than_minutes: int = 0) -> list[dict]:
        if older_than_minutes > 0:
            cutoff = datetime.now(timezone.utc) - timedelta(minutes=older_than_minutes)
            rows = await self.pool.fetch(
                "SELECT * FROM scans WHERE status = $1 AND created_at < $2",
                status, cutoff
            )
        else:
            rows = await self.pool.fetch(
                "SELECT * FROM scans WHERE status = $1", status
            )
        return _rows_to_list(rows)

    # ==================== VULNERABILITIES ====================

    async def create_vulnerability(self, vuln_data: VulnerabilityCreate) -> dict:
        row = await self.pool.fetchrow(
            """INSERT INTO vulnerabilities
               (scan_id, template_id, name, severity, matched_at, extracted_results, ai_analyzed, created_at)
               VALUES ($1,$2,$3,$4,$5,$6,false,$7) RETURNING *""",
            vuln_data.scan_id,
            vuln_data.template_id,
            vuln_data.name,
            vuln_data.severity,
            vuln_data.matched_at,
            json.dumps(vuln_data.extracted_results),
            datetime.utcnow(),
        )
        if row is None:
            raise Exception("Failed to create vulnerability")
        return _row_to_dict(row)

    async def create_vulnerabilities_batch(self, scan_id: str, vulnerabilities: list[dict]) -> list[dict]:
        if not vulnerabilities:
            return []
        now = datetime.utcnow()
        records = [
            (
                scan_id,
                v.get("template_id", "unknown"),
                v.get("name", "unknown"),
                v.get("severity", "info"),
                v.get("matched_at", ""),
                json.dumps({
                    "data": v.get("extracted_results", []),
                    "matched_locations": v.get("matched_locations", []),
                }),
                False,
                now,
            )
            for v in vulnerabilities
        ]
        rows = await self.pool.fetch(
            """INSERT INTO vulnerabilities
               (scan_id, template_id, name, severity, matched_at, extracted_results, ai_analyzed, created_at)
               SELECT * FROM UNNEST($1::uuid[], $2::text[], $3::text[], $4::text[], $5::text[], $6::jsonb[], $7::bool[], $8::timestamptz[])
               RETURNING *""",
            [r[0] for r in records],
            [r[1] for r in records],
            [r[2] for r in records],
            [r[3] for r in records],
            [r[4] for r in records],
            [r[5] for r in records],
            [r[6] for r in records],
            [r[7] for r in records],
        )
        return _rows_to_list(rows)

    async def get_vulnerabilities_by_scan(self, scan_id: str) -> list[dict]:
        rows = await self.pool.fetch(
            """SELECT * FROM vulnerabilities WHERE scan_id = $1
               ORDER BY CASE severity
                 WHEN 'critical' THEN 1 WHEN 'high' THEN 2
                 WHEN 'medium' THEN 3 WHEN 'low' THEN 4 ELSE 5 END""",
            scan_id
        )
        return _rows_to_list(rows)

    async def get_vulnerabilities_by_ids(self, vuln_ids: list[str]) -> list[dict]:
        rows = await self.pool.fetch(
            "SELECT * FROM vulnerabilities WHERE id = ANY($1::uuid[])", vuln_ids
        )
        return _rows_to_list(rows)

    async def update_vulnerability_analysis(self, vuln_id: str, analysis: dict) -> dict:
        row = await self.pool.fetchrow(
            """UPDATE vulnerabilities SET
               ai_analyzed = true,
               category = $2,
               description = $3,
               impact = $4,
               before_code = $5,
               after_code = $6,
               fix_steps = $7,
               fix_complexity = $8,
               reference_urls = $9
               WHERE id = $1 RETURNING *""",
            vuln_id,
            analysis.get("category"),
            analysis.get("description"),
            analysis.get("impact"),
            analysis.get("before_code"),
            analysis.get("after_code"),
            json.dumps(analysis.get("fix_steps", [])),
            analysis.get("fix_complexity"),
            json.dumps(analysis.get("references", [])),
        )
        if row is None:
            raise Exception(f"Failed to update vulnerability {vuln_id}")
        return _row_to_dict(row)

    async def mark_vulnerability_fixed(self, vuln_id: str, is_fixed: bool = True) -> dict:
        row = await self.pool.fetchrow(
            "UPDATE vulnerabilities SET is_fixed = $2 WHERE id = $1 RETURNING *",
            vuln_id, is_fixed
        )
        if row is None:
            raise Exception(f"Failed to update vulnerability {vuln_id}")
        return _row_to_dict(row)

    # ==================== AI CACHE ====================

    async def get_cached_analysis(self, template_id: str) -> Optional[dict]:
        row = await self.pool.fetchrow(
            "SELECT * FROM ai_cache WHERE template_id = $1", template_id
        )
        if row:
            await self.pool.execute(
                """UPDATE ai_cache SET usage_count = usage_count + 1, last_used_at = $2
                   WHERE template_id = $1""",
                template_id, datetime.utcnow()
            )
            cached = dict(row).get("cached_response")
            if isinstance(cached, str):
                return json.loads(cached)
            return cached
        return None

    async def save_cached_analysis(self, template_id: str, analysis: dict) -> dict:
        now = datetime.utcnow()
        row = await self.pool.fetchrow(
            """INSERT INTO ai_cache (template_id, cached_response, usage_count, created_at, last_used_at)
               VALUES ($1, $2, 1, $3, $3)
               ON CONFLICT (template_id) DO UPDATE
               SET cached_response = EXCLUDED.cached_response, last_used_at = EXCLUDED.last_used_at
               RETURNING *""",
            template_id, json.dumps(analysis), now
        )
        if row is None:
            raise Exception(f"Failed to cache analysis for {template_id}")
        return _row_to_dict(row)

    async def cleanup_expired_cache(self, days: int = 30) -> int:
        cutoff = datetime.utcnow() - timedelta(days=days)
        result = await self.pool.execute(
            "DELETE FROM ai_cache WHERE last_used_at < $1", cutoff
        )
        # result is like "DELETE 5"
        try:
            return int(result.split()[-1])
        except Exception:
            return 0

    # ==================== TRUST BADGES ====================

    async def create_trust_badge(self, scan_id: str, badge_url: str, embed_code: str) -> dict:
        row = await self.pool.fetchrow(
            """INSERT INTO trust_badges (scan_id, badge_url, embed_code, issued_at)
               VALUES ($1,$2,$3,$4) RETURNING *""",
            scan_id, badge_url, embed_code, datetime.utcnow()
        )
        if row is None:
            raise Exception("Failed to create trust badge")
        return _row_to_dict(row)

    async def get_trust_badge(self, scan_id: str) -> Optional[dict]:
        row = await self.pool.fetchrow(
            "SELECT * FROM trust_badges WHERE scan_id = $1", scan_id
        )
        return _row_to_dict(row)

    # ==================== SCHEDULED SCANS ====================

    async def create_scheduled_scan(self, data: dict) -> dict:
        row = await self.pool.fetchrow(
            """INSERT INTO scheduled_scans
               (target_url, cron_expression, notification_email, slack_webhook_url, next_run_at, enabled, created_at)
               VALUES ($1,$2,$3,$4,$5,true,$6) RETURNING *""",
            data["target_url"],
            data.get("cron_expression", "0 * * * *"),
            data.get("notification_email"),
            data.get("slack_webhook_url"),
            data.get("next_run_at"),
            datetime.utcnow(),
        )
        if row is None:
            raise Exception("Failed to create scheduled scan")
        return _row_to_dict(row)

    async def get_scheduled_scans(self) -> list[dict]:
        rows = await self.pool.fetch(
            "SELECT * FROM scheduled_scans ORDER BY created_at DESC"
        )
        return _rows_to_list(rows)

    async def delete_scheduled_scan(self, schedule_id: str) -> bool:
        result = await self.pool.execute(
            "DELETE FROM scheduled_scans WHERE id = $1", schedule_id
        )
        return result == "DELETE 1"

    async def get_due_schedules(self) -> list[dict]:
        now = datetime.utcnow()
        rows = await self.pool.fetch(
            "SELECT * FROM scheduled_scans WHERE enabled = true AND next_run_at <= $1",
            now
        )
        return _rows_to_list(rows)

    async def update_scheduled_scan(self, schedule_id: str, data: dict) -> dict:
        cols = list(data.keys())
        vals = list(data.values())
        set_clause = ", ".join(f"{c} = ${i+2}" for i, c in enumerate(cols))
        row = await self.pool.fetchrow(
            f"UPDATE scheduled_scans SET {set_clause} WHERE id = $1 RETURNING *",
            schedule_id, *vals
        )
        if row is None:
            raise Exception(f"Failed to update scheduled scan {schedule_id}")
        return _row_to_dict(row)

    # ==================== BENCHMARK ====================

    async def get_benchmark_stats(self) -> dict:
        rows = await self.pool.fetch(
            "SELECT score FROM scans WHERE status = 'completed' AND score IS NOT NULL"
        )
        scores = [r["score"] for r in rows if r["score"] is not None]
        if not scores:
            return {"total_scans": 0, "avg_score": 0.0, "median_score": 0.0, "scores": []}
        scores.sort()
        total = len(scores)
        avg_score = sum(scores) / total
        median_score = (
            scores[total // 2] if total % 2 == 1
            else (scores[total // 2 - 1] + scores[total // 2]) / 2
        )
        return {
            "total_scans": total,
            "avg_score": round(avg_score, 1),
            "median_score": round(median_score, 1),
            "scores": scores,
        }

    def get_score_percentile(self, scores: list[int], target_score: int) -> float:
        if not scores:
            return 0.0
        count_below = sum(1 for s in scores if s < target_score)
        return round((count_below / len(scores)) * 100, 1)

    async def get_community_stats(self) -> dict:
        url_row = await self.pool.fetchrow(
            "SELECT COUNT(*) AS cnt FROM scans WHERE status = 'completed'"
        )
        repo_row = await self.pool.fetchrow(
            "SELECT COUNT(*) AS cnt FROM repo_scans WHERE status = 'completed'"
        )
        grade_rows = await self.pool.fetch(
            "SELECT grade FROM scans WHERE status = 'completed' AND grade IS NOT NULL"
        )
        total_url = url_row["cnt"] if url_row else 0
        total_repo = repo_row["cnt"] if repo_row else 0
        grades = [r["grade"] for r in grade_rows if r.get("grade")]
        avg_grade = None
        if grades:
            from collections import Counter
            avg_grade = Counter(grades).most_common(1)[0][0]
        return {
            "total_url_scans": total_url,
            "total_repo_scans": total_repo,
            "total_scans": total_url + total_repo,
            "avg_grade": avg_grade,
        }

    # ==================== REPO SCANS ====================

    async def create_repo_scan(self, scan_data: RepoScanCreate, user_id: str | None = None) -> dict:
        row = await self.pool.fetchrow(
            """INSERT INTO repo_scans (repo_url, repo_name, branch, scan_type, status, user_id, created_at)
               VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *""",
            scan_data.repo_url,
            scan_data.repo_name,
            scan_data.branch,
            scan_data.scan_type,
            scan_data.status,
            user_id,
            datetime.utcnow(),
        )
        if row is None:
            raise Exception("Failed to create repo scan")
        return _row_to_dict(row)

    async def get_repo_scan(self, scan_id: str) -> Optional[dict]:
        row = await self.pool.fetchrow("SELECT * FROM repo_scans WHERE id = $1", scan_id)
        return _row_to_dict(row)

    async def get_user_repo_scans(self, user_id: str, limit: int = 50) -> list[dict]:
        rows = await self.pool.fetch(
            """SELECT id, repo_url, repo_name, branch, score, grade, status, created_at, completed_at, started_at
               FROM repo_scans WHERE user_id = $1 AND status = 'completed'
               ORDER BY created_at DESC LIMIT $2""",
            user_id, limit
        )
        return _rows_to_list(rows)

    async def update_repo_scan_status(self, scan_id: str, status: ScanStatus, **kwargs) -> dict:
        fields = {"status": status.value}
        for f in ("score", "grade", "summary", "started_at", "completed_at",
                  "error_message", "files_scanned", "commit_hash", "branch", "score_breakdown"):
            if f in kwargs:
                fields[f] = kwargs[f]
        cols = list(fields.keys())
        vals = list(fields.values())
        set_clause = ", ".join(f"{c} = ${i+2}" for i, c in enumerate(cols))
        row = await self.pool.fetchrow(
            f"UPDATE repo_scans SET {set_clause} WHERE id = $1 RETURNING *",
            scan_id, *vals
        )
        if row is None:
            raise Exception(f"Failed to update repo scan {scan_id}")
        return _row_to_dict(row)

    async def create_repo_vulnerabilities_batch(self, repo_scan_id: str, vulnerabilities: list[dict]) -> list[dict]:
        if not vulnerabilities:
            return []
        now = datetime.utcnow()
        rows_out = []
        async with self.pool.acquire() as conn:
            async with conn.transaction():
                for v in vulnerabilities:
                    row = await conn.fetchrow(
                        """INSERT INTO repo_vulnerabilities
                           (repo_scan_id, vuln_type, name, severity, file_path, line_number,
                            code_snippet, description, fix_suggestion, package_name,
                            installed_version, fixed_version, cve_id, pattern_id,
                            matched_locations, location_count, ai_analyzed, is_fixed, created_at)
                           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,false,false,$17)
                           RETURNING *""",
                        repo_scan_id,
                        v.get("vuln_type", "sast"),
                        v.get("name", "unknown"),
                        v.get("severity", "info"),
                        v.get("file_path"),
                        v.get("line_number"),
                        v.get("code_snippet"),
                        v.get("description"),
                        v.get("fix_suggestion"),
                        v.get("package_name"),
                        v.get("installed_version"),
                        v.get("fixed_version"),
                        v.get("cve_id"),
                        v.get("pattern_id"),
                        json.dumps(v.get("matched_locations")) if v.get("matched_locations") else None,
                        v.get("location_count", 1),
                        now,
                    )
                    if row:
                        rows_out.append(_row_to_dict(row))
        return rows_out

    async def get_repo_vulnerabilities_by_ids(self, vuln_ids: list[str]) -> list[dict]:
        rows = await self.pool.fetch(
            "SELECT * FROM repo_vulnerabilities WHERE id = ANY($1::uuid[])", vuln_ids
        )
        return _rows_to_list(rows)

    async def get_repo_vulnerabilities_by_scan(self, repo_scan_id: str) -> list[dict]:
        rows = await self.pool.fetch(
            """SELECT * FROM repo_vulnerabilities WHERE repo_scan_id = $1
               ORDER BY CASE severity
                 WHEN 'critical' THEN 1 WHEN 'high' THEN 2
                 WHEN 'medium' THEN 3 WHEN 'low' THEN 4 ELSE 5 END""",
            repo_scan_id
        )
        return _rows_to_list(rows)

    async def update_repo_vulnerability_analysis(self, vuln_id: str, analysis: dict) -> dict:
        desc_parts = []
        if analysis.get("description"):
            desc_parts.append(analysis["description"])
        if analysis.get("impact"):
            desc_parts.append(f"Impact: {analysis['impact']}")
        enhanced_description = " ".join(desc_parts) if desc_parts else None

        fix_summary = analysis.get("fix_suggestion", "")
        if not fix_summary and analysis.get("fix_steps"):
            fix_summary = "; ".join(analysis["fix_steps"][:3])

        row = await self.pool.fetchrow(
            """UPDATE repo_vulnerabilities SET
               ai_analyzed = true,
               description = $2,
               fix_suggestion = $3,
               before_code = $4,
               after_code = $5,
               fix_steps = $6
               WHERE id = $1 RETURNING *""",
            vuln_id,
            enhanced_description,
            fix_summary,
            analysis.get("before_code"),
            analysis.get("after_code"),
            json.dumps(analysis.get("fix_steps")),
        )
        if row is None:
            raise Exception(f"Failed to update repo vulnerability {vuln_id}")
        return _row_to_dict(row)

    async def mark_repo_vulnerability_fixed(self, vuln_id: str, is_fixed: bool = True) -> dict:
        row = await self.pool.fetchrow(
            "UPDATE repo_vulnerabilities SET is_fixed = $2 WHERE id = $1 RETURNING *",
            vuln_id, is_fixed
        )
        if row is None:
            raise Exception(f"Failed to update repo vulnerability {vuln_id}")
        return _row_to_dict(row)

    async def get_recent_repo_scans(
        self,
        limit: int = 20,
        cursor_created_at: str | None = None,
        cursor_id: str | None = None,
    ) -> list[dict]:
        if cursor_created_at and cursor_id:
            rows = await self.pool.fetch(
                """SELECT id, repo_url, repo_name, score, grade, summary, scan_type, created_at, completed_at
                   FROM repo_scans WHERE status = 'completed'
                     AND (created_at < $1 OR (created_at = $1 AND id < $2))
                   ORDER BY created_at DESC, id DESC LIMIT $3""",
                cursor_created_at, cursor_id, limit
            )
        else:
            rows = await self.pool.fetch(
                """SELECT id, repo_url, repo_name, score, grade, summary, scan_type, created_at, completed_at
                   FROM repo_scans WHERE status = 'completed'
                   ORDER BY created_at DESC, id DESC LIMIT $1""",
                limit
            )
        return _rows_to_list(rows)

    # ==================== GITHUB CONNECTIONS ====================

    async def get_github_connection(self, user_id: str) -> Optional[dict]:
        row = await self.pool.fetchrow(
            """SELECT id, github_username, github_avatar_url, scopes, created_at
               FROM github_connections WHERE user_id = $1""",
            user_id
        )
        return _row_to_dict(row)

    async def upsert_github_connection(
        self, user_id: str, access_token: str,
        username: str = None, avatar_url: str = None, scopes: str = ""
    ) -> dict:
        row = await self.pool.fetchrow(
            """INSERT INTO github_connections (user_id, github_access_token, github_username, github_avatar_url, scopes, updated_at)
               VALUES ($1,$2,$3,$4,$5,now())
               ON CONFLICT (user_id) DO UPDATE SET
                 github_access_token = EXCLUDED.github_access_token,
                 github_username = EXCLUDED.github_username,
                 github_avatar_url = EXCLUDED.github_avatar_url,
                 scopes = EXCLUDED.scopes,
                 updated_at = now()
               RETURNING *""",
            user_id, access_token, username, avatar_url, scopes
        )
        return _row_to_dict(row) or {}

    async def get_github_access_token(self, user_id: str) -> Optional[str]:
        row = await self.pool.fetchrow(
            "SELECT github_access_token FROM github_connections WHERE user_id = $1", user_id
        )
        return row["github_access_token"] if row else None

    async def delete_github_connection(self, user_id: str) -> bool:
        await self.pool.execute(
            "DELETE FROM github_connections WHERE user_id = $1", user_id
        )
        return True

    # ==================== VERCEL CONNECTIONS ====================

    async def get_vercel_connection(self, user_id: str) -> Optional[dict]:
        row = await self.pool.fetchrow(
            """SELECT id, vercel_user_id, vercel_username, vercel_team_id, scopes, installation_id, created_at
               FROM vercel_connections WHERE user_id = $1""",
            user_id
        )
        return _row_to_dict(row)

    async def upsert_vercel_connection(
        self, user_id: str, access_token: str,
        vercel_user_id: str = None, vercel_username: str = None,
        team_id: str = None, scopes: str = "", installation_id: str = None,
    ) -> dict:
        row = await self.pool.fetchrow(
            """INSERT INTO vercel_connections
               (user_id, vercel_access_token, vercel_user_id, vercel_username, vercel_team_id, scopes, installation_id, updated_at)
               VALUES ($1,$2,$3,$4,$5,$6,$7,now())
               ON CONFLICT (user_id) DO UPDATE SET
                 vercel_access_token = EXCLUDED.vercel_access_token,
                 vercel_user_id = EXCLUDED.vercel_user_id,
                 vercel_username = EXCLUDED.vercel_username,
                 vercel_team_id = EXCLUDED.vercel_team_id,
                 scopes = EXCLUDED.scopes,
                 installation_id = EXCLUDED.installation_id,
                 updated_at = now()
               RETURNING *""",
            user_id, access_token, vercel_user_id, vercel_username, team_id, scopes, installation_id
        )
        return _row_to_dict(row) or {}

    async def get_vercel_access_token(self, user_id: str) -> Optional[tuple[str, Optional[str]]]:
        row = await self.pool.fetchrow(
            "SELECT vercel_access_token, vercel_team_id FROM vercel_connections WHERE user_id = $1",
            user_id
        )
        if row:
            return row["vercel_access_token"], row.get("vercel_team_id")
        return None

    async def delete_vercel_connection(self, user_id: str) -> bool:
        await self.pool.execute(
            "DELETE FROM vercel_connections WHERE user_id = $1", user_id
        )
        return True

    # ==================== NOTIFICATION SETTINGS ====================

    async def get_notification_settings(self, user_id: str) -> dict:
        row = await self.pool.fetchrow(
            "SELECT digest_enabled, digest_email, digest_frequency FROM users WHERE id = $1",
            user_id
        )
        if row:
            return dict(row)
        return {"digest_enabled": False, "digest_email": None, "digest_frequency": "weekly"}

    async def update_notification_settings(self, user_id: str, settings: dict) -> dict:
        allowed = {"digest_enabled", "digest_email", "digest_frequency"}
        update_data = {k: v for k, v in settings.items() if k in allowed}
        update_data["updated_at"] = datetime.utcnow()
        cols = list(update_data.keys())
        vals = list(update_data.values())
        set_clause = ", ".join(f"{c} = ${i+2}" for i, c in enumerate(cols))
        row = await self.pool.fetchrow(
            f"UPDATE users SET {set_clause} WHERE id = $1 RETURNING *",
            user_id, *vals
        )
        if row is None:
            raise Exception(f"Failed to update notification settings for {user_id}")
        return _row_to_dict(row)

    async def get_digest_enabled_users(self) -> list[dict]:
        rows = await self.pool.fetch(
            "SELECT id, digest_email, digest_frequency FROM users WHERE digest_enabled = true AND digest_email IS NOT NULL"
        )
        return _rows_to_list(rows)

    # ==================== PUSH SUBSCRIPTIONS ====================

    async def save_push_subscription(
        self, user_id: str | None, endpoint: str, p256dh: str, auth_key: str
    ) -> dict:
        row = await self.pool.fetchrow(
            """INSERT INTO push_subscriptions (endpoint, p256dh, auth_key, user_id, updated_at)
               VALUES ($1,$2,$3,$4,now())
               ON CONFLICT (endpoint) DO UPDATE SET
                 p256dh = EXCLUDED.p256dh,
                 auth_key = EXCLUDED.auth_key,
                 user_id = EXCLUDED.user_id,
                 updated_at = now()
               RETURNING *""",
            endpoint, p256dh, auth_key, user_id
        )
        if row is None:
            raise Exception("Failed to save push subscription")
        return _row_to_dict(row)

    async def delete_push_subscription(self, endpoint: str) -> bool:
        result = await self.pool.execute(
            "DELETE FROM push_subscriptions WHERE endpoint = $1", endpoint
        )
        return result == "DELETE 1"

    async def get_push_subscriptions(self, user_id: str | None) -> list[dict]:
        if user_id:
            rows = await self.pool.fetch(
                "SELECT endpoint, p256dh, auth_key FROM push_subscriptions WHERE user_id = $1",
                user_id
            )
        else:
            rows = await self.pool.fetch(
                "SELECT endpoint, p256dh, auth_key FROM push_subscriptions WHERE user_id IS NULL"
            )
        return _rows_to_list(rows)

    async def get_push_subscription_by_endpoint(self, endpoint: str) -> dict | None:
        row = await self.pool.fetchrow(
            "SELECT endpoint, p256dh, auth_key, user_id FROM push_subscriptions WHERE endpoint = $1",
            endpoint
        )
        return _row_to_dict(row)

    # ==================== FIX QUALITY METRICS ====================

    async def create_fix_quality_metrics_batch(self, metrics: list[dict]) -> list[dict]:
        if not metrics:
            return []
        rows_out = []
        async with self.pool.acquire() as conn:
            async with conn.transaction():
                for m in metrics:
                    cols = list(m.keys())
                    vals = list(m.values())
                    placeholders = ", ".join(f"${i+1}" for i in range(len(vals)))
                    row = await conn.fetchrow(
                        f"INSERT INTO fix_quality_metrics ({', '.join(cols)}) VALUES ({placeholders}) RETURNING *",
                        *vals
                    )
                    if row:
                        rows_out.append(_row_to_dict(row))
        return rows_out

    async def update_fix_quality_metric_by_pr(self, pr_repo: str, pr_number: int, data: dict) -> list[dict]:
        cols = list(data.keys())
        vals = list(data.values())
        set_clause = ", ".join(f"{c} = ${i+3}" for i, c in enumerate(cols))
        rows = await self.pool.fetch(
            f"UPDATE fix_quality_metrics SET {set_clause} WHERE pr_repo = $1 AND pr_number = $2 RETURNING *",
            pr_repo, pr_number, *vals
        )
        return _rows_to_list(rows)

    async def update_fix_quality_feedback(self, scan_id: str, feedback: str) -> list[dict]:
        rows = await self.pool.fetch(
            "UPDATE fix_quality_metrics SET user_feedback = $2 WHERE scan_id = $1 RETURNING *",
            scan_id, feedback
        )
        return _rows_to_list(rows)

    # ==================== SCAN LIMITS ====================

    async def get_monthly_scan_count(self, user_id: str, scan_type: str, plan_changed_at: str | None = None) -> int:
        first_of_month = (
            datetime.now(timezone.utc)
            .replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        )
        since = first_of_month
        if plan_changed_at:
            try:
                pc = datetime.fromisoformat(plan_changed_at.replace("Z", "+00:00"))
                if pc > first_of_month:
                    since = pc
            except Exception:
                pass

        table = "scans" if scan_type == "url" else "repo_scans"
        row = await self.pool.fetchrow(
            f"SELECT COUNT(*) AS cnt FROM {table} WHERE user_id = $1 AND created_at >= $2",
            user_id, since
        )
        return row["cnt"] if row else 0

    # ==================== AI ANALYSIS LIMITS ====================

    async def get_monthly_ai_analysis_count(self, user_id: str) -> int:
        first_of_month = datetime.now(timezone.utc).replace(
            day=1, hour=0, minute=0, second=0, microsecond=0
        )
        row = await self.pool.fetchrow(
            """SELECT COUNT(*) AS cnt FROM repo_vulnerabilities rv
               JOIN repo_scans rs ON rv.repo_scan_id = rs.id
               WHERE rs.user_id = $1 AND rv.ai_analyzed = true AND rv.updated_at >= $2""",
            user_id, first_of_month
        )
        return row["cnt"] if row else 0

    # ==================== MCP USAGE ====================

    async def log_mcp_usage(self, data: dict) -> dict:
        row = await self.pool.fetchrow(
            """INSERT INTO mcp_usage (tool_name, client_hint, arguments, duration_ms, success, error_message)
               VALUES ($1,$2,$3,$4,$5,$6) RETURNING *""",
            data["tool_name"],
            data.get("client_hint"),
            json.dumps(data.get("arguments")) if data.get("arguments") else None,
            data.get("duration_ms"),
            data.get("success", True),
            data.get("error_message"),
        )
        if row is None:
            raise Exception("Failed to log MCP usage")
        return _row_to_dict(row)

    # ==================== USERS ADMIN ====================

    async def list_users(self) -> list[dict]:
        rows = await self.pool.fetch(
            "SELECT id, plan, first_scan_used, created_at, email FROM users"
        )
        return _rows_to_list(rows)

    async def get_user_by_email(self, email: str) -> Optional[dict]:
        row = await self.pool.fetchrow("SELECT * FROM users WHERE email = $1", email)
        return _row_to_dict(row)

    async def set_user_plan(self, user_id: str, plan: str) -> dict:
        row = await self.pool.fetchrow(
            "UPDATE users SET plan = $2 WHERE id = $1 RETURNING *",
            user_id, plan
        )
        if row is None:
            raise Exception(f"User not found: {user_id}")
        return _row_to_dict(row)

    async def delete_user(self, user_id: str) -> bool:
        await self.pool.execute("DELETE FROM users WHERE id = $1", user_id)
        return True

    # ==================== SCHEDULED SCAN WEEKLY REPORT ====================

    async def get_scheduled_scans_with_email(self) -> list[dict]:
        rows = await self.pool.fetch(
            "SELECT target_url, notification_email FROM scheduled_scans WHERE notification_email IS NOT NULL AND enabled = true"
        )
        return _rows_to_list(rows)

    async def get_recent_scan_for_url(self, target_url: str, since: datetime) -> Optional[dict]:
        row = await self.pool.fetchrow(
            """SELECT id, target_url, score, grade, summary, completed_at
               FROM scans WHERE target_url = $1 AND status = 'completed' AND completed_at >= $2
               ORDER BY completed_at DESC LIMIT 1""",
            target_url, since
        )
        return _row_to_dict(row)

    # ==================== UTILITY ====================

    def calculate_summary(self, vulnerabilities: list[dict]) -> VulnerabilitySummary:
        summary = VulnerabilitySummary()
        for vuln in vulnerabilities:
            severity = vuln.get("severity", "info").lower()
            if severity == "critical":
                summary.critical += 1
            elif severity == "high":
                summary.high += 1
            elif severity == "medium":
                summary.medium += 1
            elif severity == "low":
                summary.low += 1
            else:
                summary.info += 1
        return summary


# Singleton instance
_supabase_service: Optional[SupabaseService] = None


def get_supabase_service() -> SupabaseService:
    """Get or create database service instance"""
    global _supabase_service
    if _supabase_service is None:
        _supabase_service = SupabaseService()
    return _supabase_service
