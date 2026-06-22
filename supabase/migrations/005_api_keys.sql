-- API Keys table for developer access
CREATE TABLE IF NOT EXISTS api_keys (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT NOT NULL DEFAULT 'My API Key',
    key_hash    TEXT NOT NULL UNIQUE,        -- SHA-256 of the raw key
    key_prefix  TEXT NOT NULL,               -- first 8 chars shown in UI (tsec_xxx)
    plan        TEXT NOT NULL DEFAULT 'free', -- 'free' | 'pro'
    scans_used  INTEGER NOT NULL DEFAULT 0,
    last_used_at TIMESTAMPTZ,
    revoked     BOOLEAN NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_user_id   ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash   ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_key_prefix ON api_keys(key_prefix);
