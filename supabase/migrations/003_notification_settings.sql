-- Add notification settings columns to users table
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS digest_enabled BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS digest_email TEXT,
  ADD COLUMN IF NOT EXISTS digest_frequency TEXT DEFAULT 'weekly'
    CHECK (digest_frequency IN ('weekly', 'daily'));
