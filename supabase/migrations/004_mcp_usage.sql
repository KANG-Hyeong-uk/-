-- MCP Usage Tracking table
CREATE TABLE mcp_usage (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tool_name text NOT NULL,
  client_hint text,
  arguments jsonb,
  duration_ms integer,
  success boolean DEFAULT true,
  error_message text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_mcp_usage_created_at ON mcp_usage (created_at DESC);
CREATE INDEX idx_mcp_usage_tool_name ON mcp_usage (tool_name);
