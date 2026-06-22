# Trust Database Schema Documentation

> Supabase Project: `sdqhirgvqplcdjmgbjxj`
> Region: `ap-south-1`
> Last Updated: 2026-01-29

---

## Overview

Trust uses 5 main tables to store security scan data, vulnerability analysis, AI cache, trust badges, and push notification subscriptions.

```
┌─────────────┐       ┌──────────────────┐
│   scans     │◄──────│  vulnerabilities │
└─────────────┘       └──────────────────┘
       │
       ▼
┌─────────────┐       ┌──────────────────┐
│trust_badges │       │    ai_cache      │
└─────────────┘       └──────────────────┘

┌──────────────────────┐
│ push_subscriptions   │──── auth.users (optional)
└──────────────────────┘
```

---

## Tables

### 1. `scans`

Security scan records. Each scan represents one URL analysis session.

| Column | Type | Default | Nullable | Description |
|--------|------|---------|----------|-------------|
| `id` | `UUID` | `gen_random_uuid()` | NO | Primary key |
| `target_url` | `TEXT` | - | NO | URL being scanned |
| `scan_mode` | `TEXT` | `'quick'` | YES | Scan mode: `tech`, `quick`, `full`, `critical` |
| `status` | `TEXT` | `'pending'` | YES | Status: `pending`, `processing`, `completed`, `failed` |
| `score` | `INTEGER` | - | YES | Security score (0-100) |
| `grade` | `TEXT` | - | YES | Grade: `A`, `B+`, `B`, `B-`, `C`, `D`, `F` |
| `summary` | `JSONB` | - | YES | Vulnerability count by severity |
| `error_message` | `TEXT` | - | YES | Error message if scan failed |
| `started_at` | `TIMESTAMPTZ` | - | YES | Scan start time |
| `completed_at` | `TIMESTAMPTZ` | - | YES | Scan completion time |
| `created_at` | `TIMESTAMPTZ` | `NOW()` | YES | Record creation time |

**Indexes:**
- `idx_scans_status` on `status`
- `idx_scans_created_at` on `created_at DESC`

**Summary JSONB Structure:**
```json
{
  "critical": 0,
  "high": 1,
  "medium": 3,
  "low": 5,
  "info": 12
}
```

---

### 2. `vulnerabilities`

Detected vulnerabilities from Nuclei scans. Links to `scans` table.

| Column | Type | Default | Nullable | Description |
|--------|------|---------|----------|-------------|
| `id` | `UUID` | `gen_random_uuid()` | NO | Primary key |
| `scan_id` | `UUID` | - | YES | Foreign key → `scans.id` |
| `template_id` | `TEXT` | - | NO | Nuclei template ID (e.g., `exposed-panels`) |
| `name` | `TEXT` | - | NO | Vulnerability name |
| `severity` | `TEXT` | - | NO | Severity: `critical`, `high`, `medium`, `low`, `info` |
| `matched_at` | `TEXT` | - | YES | URL where vulnerability was detected |
| `extracted_results` | `JSONB` | `'[]'` | YES | Extracted data from scan |
| `category` | `TEXT` | - | YES | AI category: `api_leak`, `exposure`, `misconfig`, `cve`, `privacy_risk` |
| `description` | `TEXT` | - | YES | AI-generated description (Korean) |
| `impact` | `TEXT` | - | YES | AI-generated impact analysis |
| `before_code` | `TEXT` | - | YES | Vulnerable code example |
| `after_code` | `TEXT` | - | YES | Fixed code example |
| `fix_steps` | `JSONB` | `'[]'` | YES | Step-by-step fix instructions |
| `fix_complexity` | `TEXT` | - | YES | Complexity: `simple`, `moderate`, `complex` |
| `reference_urls` | `JSONB` | `'[]'` | YES | Reference URLs for the vulnerability |
| `ai_analyzed` | `BOOLEAN` | `false` | YES | Whether AI analysis was performed |
| `created_at` | `TIMESTAMPTZ` | `NOW()` | YES | Record creation time |

**Indexes:**
- `idx_vulnerabilities_scan_id` on `scan_id`
- `idx_vulnerabilities_severity` on `severity`

**Foreign Key:**
- `vulnerabilities_scan_id_fkey`: `scan_id` → `scans.id` (ON DELETE CASCADE)

**Fix Steps JSONB Structure:**
```json
["1. 환경변수 파일을 생성하세요", "2. API 키를 환경변수로 이동하세요", "3. .gitignore에 .env를 추가하세요"]
```

---

### 3. `ai_cache`

Cache for Claude AI analysis results. Prevents redundant API calls for same vulnerability types.

| Column | Type | Default | Nullable | Description |
|--------|------|---------|----------|-------------|
| `template_id` | `TEXT` | - | NO | Primary key (Nuclei template ID) |
| `cached_response` | `JSONB` | - | NO | Cached AI analysis response |
| `usage_count` | `INTEGER` | `1` | YES | Number of times cache was used |
| `created_at` | `TIMESTAMPTZ` | `NOW()` | YES | Cache creation time |
| `last_used_at` | `TIMESTAMPTZ` | `NOW()` | YES | Last cache access time |

**Indexes:**
- `idx_ai_cache_last_used` on `last_used_at`

**Cached Response JSONB Structure:**
```json
{
  "description": "취약점 설명",
  "impact": "영향 범위",
  "category": "api_leak",
  "before_code": "// vulnerable code",
  "after_code": "// fixed code",
  "fix_steps": ["Step 1", "Step 2"],
  "fix_complexity": "simple",
  "references": ["https://example.com/doc"]
}
```

---

### 4. `trust_badges`

Trust badges issued for completed scans.

| Column | Type | Default | Nullable | Description |
|--------|------|---------|----------|-------------|
| `id` | `UUID` | `gen_random_uuid()` | NO | Primary key |
| `scan_id` | `UUID` | - | YES | Foreign key → `scans.id` |
| `badge_url` | `TEXT` | - | YES | URL to badge image |
| `embed_code` | `TEXT` | - | YES | HTML embed code for badge |
| `issued_at` | `TIMESTAMPTZ` | `NOW()` | YES | Badge issue time |

**Indexes:**
- `idx_trust_badges_scan_id` on `scan_id`

**Foreign Key:**
- `trust_badges_scan_id_fkey`: `scan_id` → `scans.id` (ON DELETE CASCADE)

---

### 5. `push_subscriptions`

Web Push notification subscriptions for browser push. Supports both authenticated and anonymous users.

| Column | Type | Default | Nullable | Description |
|--------|------|---------|----------|-------------|
| `id` | `UUID` | `gen_random_uuid()` | NO | Primary key |
| `user_id` | `UUID` | - | YES | Foreign key -> `auth.users.id` (NULL for anonymous) |
| `endpoint` | `TEXT` | - | NO | Push service endpoint URL (unique) |
| `p256dh` | `TEXT` | - | NO | Client public key for encryption |
| `auth_key` | `TEXT` | - | NO | Client auth secret |
| `created_at` | `TIMESTAMPTZ` | `NOW()` | YES | Subscription creation time |
| `updated_at` | `TIMESTAMPTZ` | `NOW()` | YES | Last update time |

**Indexes:**
- `idx_push_subscriptions_user_id` on `user_id`
- `idx_push_subscriptions_endpoint` on `endpoint`

**Foreign Key:**
- `push_subscriptions_user_id_fkey`: `user_id` -> `auth.users.id` (ON DELETE CASCADE)

**RLS:**
- Row Level Security enabled. Service role has full access.

---

## Enums Reference

### Scan Status
| Value | Description |
|-------|-------------|
| `pending` | Scan created, waiting to start |
| `processing` | Scan in progress |
| `completed` | Scan finished successfully |
| `failed` | Scan failed with error |

### Scan Mode
| Value | Description |
|-------|-------------|
| `tech` | Technology detection only |
| `quick` | Fast scan with common templates |
| `full` | Comprehensive scan (all templates) |
| `critical` | High/Critical severity only |

### Severity (5 levels)
| Value | Score Deduction | Max Deduction |
|-------|-----------------|---------------|
| `critical` | -25 per issue | -50 |
| `high` | -15 per issue | -30 |
| `medium` | -5 per issue | -15 |
| `low` | -2 per issue | -6 |
| `info` | 0 | 0 |

### Grade
| Grade | Score Range |
|-------|-------------|
| `A` | 90-100 |
| `B+` | 80-89 |
| `B` | 70-79 |
| `B-` | 60-69 |
| `C` | 50-59 |
| `D` | 40-49 |
| `F` | 0-39 |

### Vulnerability Category
| Value | Description |
|-------|-------------|
| `api_leak` | Exposed API keys or secrets |
| `exposure` | Exposed sensitive information |
| `misconfig` | Security misconfiguration |
| `cve` | Known CVE vulnerability |
| `privacy_risk` | Privacy-related issues |

### Fix Complexity
| Value | Description |
|-------|-------------|
| `simple` | Quick fix, minimal code change |
| `moderate` | Requires some refactoring |
| `complex` | Significant architectural changes |

---

## API Usage Patterns

### Create a new scan
```sql
INSERT INTO scans (target_url, scan_mode, status)
VALUES ('https://example.com', 'quick', 'pending')
RETURNING id;
```

### Update scan status
```sql
UPDATE scans
SET status = 'processing', started_at = NOW()
WHERE id = 'scan-uuid';
```

### Insert vulnerabilities batch
```sql
INSERT INTO vulnerabilities (scan_id, template_id, name, severity, matched_at)
VALUES
  ('scan-uuid', 'exposed-panels', 'Admin Panel Exposed', 'high', 'https://example.com/admin'),
  ('scan-uuid', 'tech-detect', 'WordPress Detected', 'info', 'https://example.com');
```

### Get scan with vulnerabilities
```sql
SELECT s.*,
  json_agg(v.*) as vulnerabilities
FROM scans s
LEFT JOIN vulnerabilities v ON v.scan_id = s.id
WHERE s.id = 'scan-uuid'
GROUP BY s.id;
```

### Check AI cache
```sql
SELECT cached_response
FROM ai_cache
WHERE template_id = 'exposed-panels';

-- Update usage on cache hit
UPDATE ai_cache
SET usage_count = usage_count + 1, last_used_at = NOW()
WHERE template_id = 'exposed-panels';
```

---

## Notes for Developers

1. **Reserved Keywords**: Column `reference_urls` was named to avoid PostgreSQL reserved keyword `references`.

2. **Cascade Delete**: Deleting a scan will automatically delete related vulnerabilities and trust badges.

3. **AI Cache Key**: Uses `template_id` as primary key because same Nuclei template = same vulnerability type = same fix.

4. **JSONB Columns**: Use JSONB for flexible schema (summary, extracted_results, fix_steps, reference_urls).

5. **Timestamps**: All tables use `TIMESTAMPTZ` for timezone-aware timestamps.
