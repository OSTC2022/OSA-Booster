-- 13-G3: Health Bridge primary provider + pause DIRECT_GARMIN auto sync
-- Run in Supabase SQL Editor (or apply script). Safe / idempotent.

-- ---------------------------------------------------------------------------
-- 1) Member preferred auto-collection provider (one primary path)
-- ---------------------------------------------------------------------------
ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS preferred_activity_sync_provider TEXT;

DO $$
BEGIN
  ALTER TABLE public.members
    DROP CONSTRAINT IF EXISTS members_preferred_activity_sync_provider_check;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE public.members
  ADD CONSTRAINT members_preferred_activity_sync_provider_check
  CHECK (
    preferred_activity_sync_provider IS NULL
    OR preferred_activity_sync_provider IN (
      'DIRECT_GARMIN',
      'APPLE_HEALTH',
      'HEALTH_CONNECT'
    )
  );

COMMENT ON COLUMN public.members.preferred_activity_sync_provider IS
  'Primary automatic mileage path: APPLE_HEALTH | HEALTH_CONNECT | DIRECT_GARMIN. NULL = unset.';

-- ---------------------------------------------------------------------------
-- 2) Pause Garmin worker auto sync without deleting tokens
-- ---------------------------------------------------------------------------
ALTER TABLE public.member_activity_connections
  ADD COLUMN IF NOT EXISTS auto_sync_paused BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.member_activity_connections.auto_sync_paused IS
  'When true, AUTO scheduler skips this connection. Tokens/status CONNECTED preserved.';

CREATE INDEX IF NOT EXISTS member_activity_connections_auto_sync_idx
  ON public.member_activity_connections (provider, status, auto_sync_paused, next_sync_at)
  WHERE status = 'CONNECTED' AND auto_sync_paused = false;

NOTIFY pgrst, 'reload schema';
