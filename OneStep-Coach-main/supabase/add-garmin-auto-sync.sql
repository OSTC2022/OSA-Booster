-- 13-D: Garmin automatic sync worker support
-- Supabase SQL Editor에서 실행

-- ---------------------------------------------------------------------------
-- 1) Connection sync scheduling columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.member_activity_connections
  ADD COLUMN IF NOT EXISTS next_sync_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS consecutive_failures INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS initial_sync_done BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_imported_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_import_summary JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS member_activity_connections_due_idx
  ON public.member_activity_connections (provider, status, next_sync_at)
  WHERE status = 'CONNECTED';

COMMENT ON COLUMN public.member_activity_connections.next_sync_at IS
  'When this Garmin connection is next due for automatic sync (UTC).';

-- ---------------------------------------------------------------------------
-- 2) Provider-level circuit breaker / heartbeat
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.activity_provider_sync_state (
  provider TEXT PRIMARY KEY CHECK (provider IN ('GARMIN')),
  status TEXT NOT NULL DEFAULT 'NORMAL'
    CHECK (status IN ('NORMAL', 'RATE_LIMITED')),
  blocked_until TIMESTAMPTZ,
  last_rate_limit_at TIMESTAMPTZ,
  last_error_code TEXT,
  last_worker_heartbeat TIMESTAMPTZ,
  worker_instance_id TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.activity_provider_sync_state (provider, status)
VALUES ('GARMIN', 'NORMAL')
ON CONFLICT (provider) DO NOTHING;

ALTER TABLE public.activity_provider_sync_state ENABLE ROW LEVEL SECURITY;
-- No JWT policies → service role / SECURITY DEFINER only for mutations.
DROP POLICY IF EXISTS activity_provider_sync_state_staff_select ON public.activity_provider_sync_state;
CREATE POLICY activity_provider_sync_state_staff_select
  ON public.activity_provider_sync_state
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'operator')
        AND p.approval_status = 'approved'
    )
  );

-- ---------------------------------------------------------------------------
-- 3) Sync run audit (no raw Garmin payloads)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.garmin_sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL DEFAULT 'GARMIN',
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  trigger_source TEXT NOT NULL DEFAULT 'AUTO'
    CHECK (trigger_source IN ('AUTO', 'MANUAL', 'ADMIN')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'RUNNING'
    CHECK (status IN (
      'RUNNING',
      'SUCCESS',
      'PARTIAL',
      'FAILED',
      'RATE_LIMITED',
      'REAUTH_REQUIRED',
      'SKIPPED'
    )),
  fetched_count INTEGER NOT NULL DEFAULT 0,
  running_count INTEGER NOT NULL DEFAULT 0,
  imported_count INTEGER NOT NULL DEFAULT 0,
  duplicate_count INTEGER NOT NULL DEFAULT 0,
  candidate_count INTEGER NOT NULL DEFAULT 0,
  added_distance_km NUMERIC(8, 2) NOT NULL DEFAULT 0,
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS garmin_sync_runs_member_idx
  ON public.garmin_sync_runs (member_id, started_at DESC);

CREATE INDEX IF NOT EXISTS garmin_sync_runs_started_idx
  ON public.garmin_sync_runs (started_at DESC);

ALTER TABLE public.garmin_sync_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS garmin_sync_runs_member_select ON public.garmin_sync_runs;
CREATE POLICY garmin_sync_runs_member_select
  ON public.garmin_sync_runs
  FOR SELECT TO authenticated
  USING (
    public.running_league_member_owns_row(member_id)
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'operator')
        AND p.approval_status = 'approved'
    )
  );

-- ---------------------------------------------------------------------------
-- 4) Manual sync request queue
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.activity_sync_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'GARMIN' CHECK (provider IN ('GARMIN')),
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'RUNNING', 'SUCCESS', 'FAILED', 'CANCELLED')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_code TEXT,
  result_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS activity_sync_requests_pending_idx
  ON public.activity_sync_requests (provider, status, requested_at)
  WHERE status = 'PENDING';

CREATE UNIQUE INDEX IF NOT EXISTS activity_sync_requests_one_pending_uidx
  ON public.activity_sync_requests (member_id, provider)
  WHERE status IN ('PENDING', 'RUNNING');

ALTER TABLE public.activity_sync_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS activity_sync_requests_member_select ON public.activity_sync_requests;
CREATE POLICY activity_sync_requests_member_select
  ON public.activity_sync_requests
  FOR SELECT TO authenticated
  USING (public.running_league_member_owns_row(member_id));

DROP POLICY IF EXISTS activity_sync_requests_member_insert ON public.activity_sync_requests;
CREATE POLICY activity_sync_requests_member_insert
  ON public.activity_sync_requests
  FOR INSERT TO authenticated
  WITH CHECK (public.running_league_member_owns_row(member_id));

-- ---------------------------------------------------------------------------
-- 5) Advisory lock helpers (global worker + per-member)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.try_garmin_worker_lock(p_lock_key BIGINT DEFAULT 9134001)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN pg_try_advisory_lock(p_lock_key);
END;
$$;

CREATE OR REPLACE FUNCTION public.release_garmin_worker_lock(p_lock_key BIGINT DEFAULT 9134001)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN pg_advisory_unlock(p_lock_key);
END;
$$;

CREATE OR REPLACE FUNCTION public.try_garmin_member_lock(p_member_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  k BIGINT;
BEGIN
  -- Stable positive int from UUID bits
  k := (('x' || substr(replace(p_member_id::text, '-', ''), 1, 15))::bit(60)::bigint);
  RETURN pg_try_advisory_lock(91341, k);
END;
$$;

CREATE OR REPLACE FUNCTION public.release_garmin_member_lock(p_member_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  k BIGINT;
BEGIN
  k := (('x' || substr(replace(p_member_id::text, '-', ''), 1, 15))::bit(60)::bigint);
  RETURN pg_advisory_unlock(91341, k);
END;
$$;

REVOKE ALL ON FUNCTION public.try_garmin_worker_lock(BIGINT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_garmin_worker_lock(BIGINT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.try_garmin_member_lock(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_garmin_member_lock(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.try_garmin_worker_lock(BIGINT) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_garmin_worker_lock(BIGINT) TO service_role;
GRANT EXECUTE ON FUNCTION public.try_garmin_member_lock(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_garmin_member_lock(UUID) TO service_role;

-- Safe status for members (no tokens): extend existing RPC with next_sync_at
-- Postgres cannot change OUT/RETURNS TABLE shape via CREATE OR REPLACE.
DROP FUNCTION IF EXISTS public.get_my_activity_connection_status(TEXT);

CREATE OR REPLACE FUNCTION public.get_my_activity_connection_status(p_provider TEXT DEFAULT 'GARMIN')
RETURNS TABLE (
  id UUID,
  member_id UUID,
  provider TEXT,
  status TEXT,
  connected_at TIMESTAMPTZ,
  last_sync_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_error_code TEXT,
  last_error_at TIMESTAMPTZ,
  next_sync_at TIMESTAMPTZ,
  initial_sync_done BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member_id UUID;
BEGIN
  SELECT m.id INTO v_member_id
  FROM public.members m
  WHERE m.auth_user_id = auth.uid()
     OR m.user_id = auth.uid()
  LIMIT 1;

  IF v_member_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    c.id,
    c.member_id,
    c.provider,
    c.status,
    c.connected_at,
    c.last_sync_at,
    c.last_success_at,
    c.last_error_code,
    c.last_error_at,
    c.next_sync_at,
    c.initial_sync_done
  FROM public.member_activity_connections c
  WHERE c.member_id = v_member_id
    AND c.provider = p_provider;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_activity_connection_status(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_activity_connection_status(TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
