-- 13-C: Garmin one-time pairing sessions
-- Supabase SQL Editor에서 실행

CREATE TABLE IF NOT EXISTS public.garmin_connection_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN (
      'PENDING',
      'CLAIMED',
      'AUTHENTICATING',
      'COMPLETED',
      'EXPIRED',
      'FAILED',
      'CANCELLED'
    )),
  pairing_code_hash TEXT NOT NULL,
  connector_secret_hash TEXT NOT NULL,
  completion_token_hash TEXT,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  claimed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  consumed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS garmin_connection_sessions_member_idx
  ON public.garmin_connection_sessions (member_id, created_at DESC);

CREATE INDEX IF NOT EXISTS garmin_connection_sessions_status_idx
  ON public.garmin_connection_sessions (status, expires_at);

COMMENT ON TABLE public.garmin_connection_sessions IS
  'One-time Garmin connector pairing. Secrets stored as hashes only.';

ALTER TABLE public.garmin_connection_sessions ENABLE ROW LEVEL SECURITY;

-- Members: select/update own sessions only (never includes plaintext secrets — columns are hashes)
DROP POLICY IF EXISTS garmin_connection_sessions_member_select ON public.garmin_connection_sessions;
CREATE POLICY garmin_connection_sessions_member_select
  ON public.garmin_connection_sessions
  FOR SELECT TO authenticated
  USING (public.running_league_member_owns_row(member_id));

DROP POLICY IF EXISTS garmin_connection_sessions_member_insert ON public.garmin_connection_sessions;
CREATE POLICY garmin_connection_sessions_member_insert
  ON public.garmin_connection_sessions
  FOR INSERT TO authenticated
  WITH CHECK (public.running_league_member_owns_row(member_id));

DROP POLICY IF EXISTS garmin_connection_sessions_member_update ON public.garmin_connection_sessions;
CREATE POLICY garmin_connection_sessions_member_update
  ON public.garmin_connection_sessions
  FOR UPDATE TO authenticated
  USING (public.running_league_member_owns_row(member_id))
  WITH CHECK (public.running_league_member_owns_row(member_id));

-- No DELETE for members (cancel = status update). Service role bypasses for connector claim.

NOTIFY pgrst, 'reload schema';
