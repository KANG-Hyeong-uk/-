-- Trust Security Scanner — PostgreSQL Schema
-- Run once on a fresh database: psql $DATABASE_URL -f schema.sql

CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- gen_random_uuid()

-- ==================== USERS ====================
CREATE TABLE IF NOT EXISTS users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           TEXT UNIQUE,
    plan            TEXT NOT NULL DEFAULT 'free',   -- 'free' | 'pro'
    first_scan_used BOOLEAN NOT NULL DEFAULT false,
    plan_changed_at TIMESTAMPTZ,
    digest_enabled  BOOLEAN NOT NULL DEFAULT false,
    digest_email    TEXT,
    digest_frequency TEXT NOT NULL DEFAULT 'weekly',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==================== SUBSCRIPTIONS ====================
CREATE TABLE IF NOT EXISTS subscriptions (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stripe_customer_id      TEXT UNIQUE,
    stripe_subscription_id  TEXT UNIQUE,
    status                  TEXT NOT NULL DEFAULT 'active',
    plan                    TEXT,
    current_period_end      TIMESTAMPTZ,
    cancel_at_period_end    BOOLEAN NOT NULL DEFAULT false,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);

-- ==================== SCANS ====================
CREATE TABLE IF NOT EXISTS scans (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target_url    TEXT NOT NULL,
    scan_mode     TEXT NOT NULL DEFAULT 'quick',
    status        TEXT NOT NULL DEFAULT 'pending',
    user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
    score         INTEGER,
    grade         TEXT,
    summary       JSONB,
    error_message TEXT,
    started_at    TIMESTAMPTZ,
    completed_at  TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_scans_user_id ON scans(user_id);
CREATE INDEX IF NOT EXISTS idx_scans_status ON scans(status);
CREATE INDEX IF NOT EXISTS idx_scans_created_at ON scans(created_at DESC);

-- ==================== VULNERABILITIES ====================
CREATE TABLE IF NOT EXISTS vulnerabilities (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scan_id           UUID NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
    template_id       TEXT NOT NULL,
    name              TEXT NOT NULL,
    severity          TEXT NOT NULL DEFAULT 'info',
    matched_at        TEXT,
    extracted_results JSONB,
    ai_analyzed       BOOLEAN NOT NULL DEFAULT false,
    is_fixed          BOOLEAN NOT NULL DEFAULT false,
    category          TEXT,
    description       TEXT,
    impact            TEXT,
    before_code       TEXT,
    after_code        TEXT,
    fix_steps         JSONB,
    fix_complexity    TEXT,
    reference_urls    JSONB,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vulnerabilities_scan_id ON vulnerabilities(scan_id);

-- ==================== AI CACHE ====================
CREATE TABLE IF NOT EXISTS ai_cache (
    template_id      TEXT PRIMARY KEY,
    cached_response  JSONB NOT NULL,
    usage_count      INTEGER NOT NULL DEFAULT 1,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==================== TRUST BADGES ====================
CREATE TABLE IF NOT EXISTS trust_badges (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scan_id     UUID NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
    badge_url   TEXT,
    embed_code  TEXT,
    issued_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_trust_badges_scan_id ON trust_badges(scan_id);

-- ==================== SCHEDULED SCANS ====================
CREATE TABLE IF NOT EXISTS scheduled_scans (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID REFERENCES users(id) ON DELETE CASCADE,
    target_url          TEXT NOT NULL,
    cron_expression     TEXT NOT NULL DEFAULT '0 * * * *',
    notification_email  TEXT,
    slack_webhook_url   TEXT,
    next_run_at         TIMESTAMPTZ,
    enabled             BOOLEAN NOT NULL DEFAULT true,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_scheduled_scans_next_run ON scheduled_scans(next_run_at) WHERE enabled = true;

-- ==================== REPO SCANS ====================
CREATE TABLE IF NOT EXISTS repo_scans (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    repo_url        TEXT NOT NULL,
    repo_name       TEXT,
    branch          TEXT,
    scan_type       TEXT NOT NULL DEFAULT 'full',
    status          TEXT NOT NULL DEFAULT 'pending',
    user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
    score           INTEGER,
    grade           TEXT,
    summary         JSONB,
    score_breakdown JSONB,
    files_scanned   INTEGER,
    commit_hash     TEXT,
    error_message   TEXT,
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_repo_scans_user_id ON repo_scans(user_id);
CREATE INDEX IF NOT EXISTS idx_repo_scans_status ON repo_scans(status);
CREATE INDEX IF NOT EXISTS idx_repo_scans_created_at ON repo_scans(created_at DESC);

-- ==================== REPO VULNERABILITIES ====================
CREATE TABLE IF NOT EXISTS repo_vulnerabilities (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    repo_scan_id      UUID NOT NULL REFERENCES repo_scans(id) ON DELETE CASCADE,
    vuln_type         TEXT NOT NULL DEFAULT 'sast',
    name              TEXT NOT NULL,
    severity          TEXT NOT NULL DEFAULT 'info',
    file_path         TEXT,
    line_number       INTEGER,
    code_snippet      TEXT,
    description       TEXT,
    fix_suggestion    TEXT,
    package_name      TEXT,
    installed_version TEXT,
    fixed_version     TEXT,
    cve_id            TEXT,
    pattern_id        TEXT,
    matched_locations JSONB,
    location_count    INTEGER NOT NULL DEFAULT 1,
    ai_analyzed       BOOLEAN NOT NULL DEFAULT false,
    is_fixed          BOOLEAN NOT NULL DEFAULT false,
    before_code       TEXT,
    after_code        TEXT,
    fix_steps         JSONB,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_repo_vulns_scan_id ON repo_vulnerabilities(repo_scan_id);

-- ==================== GITHUB CONNECTIONS ====================
CREATE TABLE IF NOT EXISTS github_connections (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    github_access_token TEXT NOT NULL,
    github_username     TEXT,
    github_avatar_url   TEXT,
    scopes              TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==================== VERCEL CONNECTIONS ====================
CREATE TABLE IF NOT EXISTS vercel_connections (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    vercel_access_token TEXT NOT NULL,
    vercel_user_id      TEXT,
    vercel_username     TEXT,
    vercel_team_id      TEXT,
    scopes              TEXT,
    installation_id     TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==================== PUSH SUBSCRIPTIONS ====================
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    endpoint    TEXT NOT NULL UNIQUE,
    p256dh      TEXT NOT NULL,
    auth_key    TEXT NOT NULL,
    user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions(user_id);

-- ==================== FIX QUALITY METRICS ====================
CREATE TABLE IF NOT EXISTS fix_quality_metrics (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scan_id         UUID REFERENCES scans(id) ON DELETE SET NULL,
    pr_repo         TEXT,
    pr_number       INTEGER,
    vuln_id         UUID,
    user_feedback   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fqm_pr ON fix_quality_metrics(pr_repo, pr_number);

-- ==================== MCP USAGE ====================
CREATE TABLE IF NOT EXISTS mcp_usage (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tool_name     TEXT NOT NULL,
    client_hint   TEXT,
    arguments     JSONB,
    duration_ms   INTEGER,
    success       BOOLEAN NOT NULL DEFAULT true,
    error_message TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==================== updated_at triggers ====================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DO $$ BEGIN
    CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN
    CREATE TRIGGER trg_vulnerabilities_updated_at BEFORE UPDATE ON vulnerabilities
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN
    CREATE TRIGGER trg_repo_vulns_updated_at BEFORE UPDATE ON repo_vulnerabilities
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;
