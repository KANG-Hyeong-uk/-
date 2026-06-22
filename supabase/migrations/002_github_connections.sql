-- GitHub OAuth connections for PR Auto-Fix feature
CREATE TABLE IF NOT EXISTS github_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  github_access_token TEXT NOT NULL,
  github_username TEXT,
  github_avatar_url TEXT,
  scopes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- RLS policies
ALTER TABLE github_connections ENABLE ROW LEVEL SECURITY;

-- Only service role can access (backend manages this table)
CREATE POLICY "Service role full access" ON github_connections
  FOR ALL USING (auth.role() = 'service_role');

-- Index for user lookup
CREATE INDEX idx_github_connections_user_id ON github_connections(user_id);
