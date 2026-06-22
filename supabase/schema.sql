-- Trust Backend Database Schema
-- Run this SQL in the Supabase SQL Editor

-- Enable UUID extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==================== SCANS TABLE ====================
CREATE TABLE IF NOT EXISTS scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_url TEXT NOT NULL,
  scan_mode TEXT DEFAULT 'quick',
  status TEXT DEFAULT 'pending',
  score INTEGER,
  grade TEXT,
  summary JSONB,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for status queries
CREATE INDEX IF NOT EXISTS idx_scans_status ON scans(status);
CREATE INDEX IF NOT EXISTS idx_scans_created_at ON scans(created_at DESC);

-- ==================== VULNERABILITIES TABLE ====================
CREATE TABLE IF NOT EXISTS vulnerabilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id UUID REFERENCES scans(id) ON DELETE CASCADE,
  template_id TEXT NOT NULL,
  name TEXT NOT NULL,
  severity TEXT NOT NULL,
  matched_at TEXT,
  extracted_results JSONB DEFAULT '[]'::jsonb,
  category TEXT,
  description TEXT,
  impact TEXT,
  before_code TEXT,
  after_code TEXT,
  fix_steps JSONB DEFAULT '[]'::jsonb,
  fix_complexity TEXT,
  reference_urls JSONB DEFAULT '[]'::jsonb,
  ai_analyzed BOOLEAN DEFAULT FALSE,
  is_fixed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for scan lookup
CREATE INDEX IF NOT EXISTS idx_vulnerabilities_scan_id ON vulnerabilities(scan_id);
CREATE INDEX IF NOT EXISTS idx_vulnerabilities_severity ON vulnerabilities(severity);

-- ==================== AI CACHE TABLE ====================
CREATE TABLE IF NOT EXISTS ai_cache (
  template_id TEXT PRIMARY KEY,
  cached_response JSONB NOT NULL,
  usage_count INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for cache cleanup (expired entries)
CREATE INDEX IF NOT EXISTS idx_ai_cache_last_used ON ai_cache(last_used_at);

-- ==================== TRUST BADGES TABLE ====================
CREATE TABLE IF NOT EXISTS trust_badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id UUID REFERENCES scans(id) ON DELETE CASCADE,
  badge_url TEXT,
  embed_code TEXT,
  issued_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for badge lookup
CREATE INDEX IF NOT EXISTS idx_trust_badges_scan_id ON trust_badges(scan_id);

-- ==================== SCHEDULED SCANS TABLE ====================
CREATE TABLE IF NOT EXISTS scheduled_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_url TEXT NOT NULL,
  cron_expression TEXT DEFAULT '0 * * * *',
  notification_email TEXT,
  slack_webhook_url TEXT,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for scheduler lookups
CREATE INDEX IF NOT EXISTS idx_scheduled_scans_enabled ON scheduled_scans(enabled);
CREATE INDEX IF NOT EXISTS idx_scheduled_scans_next_run ON scheduled_scans(next_run_at);

-- ==================== REPO SCANS TABLE ====================
CREATE TABLE IF NOT EXISTS repo_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_url TEXT NOT NULL,
  repo_name TEXT NOT NULL,
  branch TEXT DEFAULT 'main',
  commit_hash TEXT,
  scan_type TEXT DEFAULT 'full',
  status TEXT DEFAULT 'pending',
  score INTEGER,
  grade TEXT,
  summary JSONB,
  score_breakdown JSONB,
  error_message TEXT,
  files_scanned INTEGER DEFAULT 0,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID REFERENCES auth.users(id)
);

-- Indexes for repo_scans
CREATE INDEX IF NOT EXISTS idx_repo_scans_status ON repo_scans(status);
CREATE INDEX IF NOT EXISTS idx_repo_scans_created_at ON repo_scans(created_at DESC);

-- ==================== REPO VULNERABILITIES TABLE ====================
CREATE TABLE IF NOT EXISTS repo_vulnerabilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_scan_id UUID REFERENCES repo_scans(id) ON DELETE CASCADE,
  vuln_type TEXT NOT NULL,
  name TEXT NOT NULL,
  severity TEXT NOT NULL,
  file_path TEXT,
  line_number INTEGER,
  code_snippet TEXT,
  description TEXT,
  fix_suggestion TEXT,
  package_name TEXT,
  installed_version TEXT,
  fixed_version TEXT,
  cve_id TEXT,
  pattern_id TEXT,
  matched_locations JSONB,
  location_count INTEGER DEFAULT 1,
  ai_analyzed BOOLEAN DEFAULT FALSE,
  before_code TEXT,
  after_code TEXT,
  fix_steps JSONB,
  is_fixed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for repo_vulnerabilities
CREATE INDEX IF NOT EXISTS idx_repo_vulns_scan_id ON repo_vulnerabilities(repo_scan_id);
CREATE INDEX IF NOT EXISTS idx_repo_vulns_severity ON repo_vulnerabilities(severity);
CREATE INDEX IF NOT EXISTS idx_repo_vulns_vuln_type ON repo_vulnerabilities(vuln_type);

-- ==================== ROW LEVEL SECURITY ====================
-- RLS enabled: anon key can only read, service_role bypasses RLS
ALTER TABLE scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE vulnerabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE trust_badges ENABLE ROW LEVEL SECURITY;

ALTER TABLE scheduled_scans ENABLE ROW LEVEL SECURITY;

ALTER TABLE repo_scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE repo_vulnerabilities ENABLE ROW LEVEL SECURITY;

-- scans: public read, service_role only write
CREATE POLICY "Allow public read access on scans" ON scans
  FOR SELECT USING (true);

-- vulnerabilities: public read, service_role only write
CREATE POLICY "Allow public read access on vulnerabilities" ON vulnerabilities
  FOR SELECT USING (true);

-- scheduled_scans: public read, service_role only write
CREATE POLICY "Allow public read access on scheduled_scans" ON scheduled_scans
  FOR SELECT USING (true);

-- ai_cache: no policies = anon key fully blocked, service_role bypasses RLS

-- trust_badges: public read, service_role only write
CREATE POLICY "Allow public read access on repo_scans" ON repo_scans
  FOR SELECT USING (true);

-- repo_vulnerabilities: public read, service_role only write
CREATE POLICY "Allow public read access on repo_vulnerabilities" ON repo_vulnerabilities
  FOR SELECT USING (true);

-- trust_badges: public read, service_role only write
CREATE POLICY "Allow public read access on trust_badges" ON trust_badges
  FOR SELECT USING (true);

-- ==================== COMMENTS ====================
COMMENT ON TABLE scans IS 'Security scan records';
COMMENT ON TABLE vulnerabilities IS 'Detected vulnerabilities for each scan';
COMMENT ON TABLE ai_cache IS 'Cache for Claude AI analysis results';
COMMENT ON TABLE trust_badges IS 'Trust badges issued for scans';
COMMENT ON TABLE scheduled_scans IS 'Scheduled recurring security scans';
COMMENT ON TABLE repo_scans IS 'GitHub repository security scan records';
COMMENT ON TABLE repo_vulnerabilities IS 'Detected vulnerabilities from repo source code scans';

-- ==================== SAMPLE DATA (for testing) ====================
-- Uncomment to insert test data

-- INSERT INTO scans (target_url, scan_mode, status, score, grade, summary)
-- VALUES (
--   'http://testphp.vulnweb.com',
--   'quick',
--   'completed',
--   72,
--   'B',
--   '{"critical": 0, "high": 1, "medium": 3, "low": 5, "info": 12}'::jsonb
-- );
