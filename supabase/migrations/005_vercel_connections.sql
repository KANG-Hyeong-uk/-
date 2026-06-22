-- Vercel OAuth connections for production-URL lookup on URL scans
CREATE TABLE IF NOT EXISTS vercel_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vercel_access_token TEXT NOT NULL,
  vercel_user_id TEXT,
  vercel_username TEXT,
  vercel_team_id TEXT,
  scopes TEXT DEFAULT '',
  installation_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- RLS policies
ALTER TABLE vercel_connections ENABLE ROW LEVEL SECURITY;

-- Only service role can access (backend manages this table)
CREATE POLICY "Service role full access" ON vercel_connections
  FOR ALL USING (auth.role() = 'service_role');

-- Index for user lookup
CREATE INDEX idx_vercel_connections_user_id ON vercel_connections(user_id);
