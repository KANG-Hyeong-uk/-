-- api_keys에 issuer_ip 컬럼 추가 (비회원 무료 발급 IP 추적)
ALTER TABLE api_keys
  ADD COLUMN IF NOT EXISTS issuer_ip TEXT;

CREATE INDEX IF NOT EXISTS idx_api_keys_issuer_ip_created
  ON api_keys (issuer_ip, created_at DESC)
  WHERE issuer_ip IS NOT NULL;
