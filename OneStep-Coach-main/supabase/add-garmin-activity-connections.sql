-- 13-B: Garmin multi-member connections + mileage external_activity_id
-- Supabase SQL Editor에서 실행 (또는 node scripts/apply-garmin-connections-sql.mjs)

-- ---------------------------------------------------------------------------
-- 1) Mileage: Garmin activity id + unique (idempotent sync)
-- ---------------------------------------------------------------------------
ALTER TABLE public.running_league_mileage_logs
  ADD COLUMN IF NOT EXISTS external_activity_id TEXT;

COMMENT ON COLUMN public.running_league_mileage_logs.external_activity_id IS
  'Provider activity id (e.g. Garmin activityId). NULL for manual/OCR rows.';

CREATE UNIQUE INDEX IF NOT EXISTS running_league_mileage_logs_garmin_activity_uidx
  ON public.running_league_mileage_logs (member_id, source_app, external_activity_id)
  WHERE external_activity_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS running_league_mileage_logs_external_activity_idx
  ON public.running_league_mileage_logs (member_id, external_activity_id)
  WHERE external_activity_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2) Per-member activity provider connections (encrypted tokens — service only)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.member_activity_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('GARMIN')),
  status TEXT NOT NULL DEFAULT 'CONNECTED'
    CHECK (status IN (
      'CONNECTED',
      'REAUTH_REQUIRED',
      'ERROR',
      'DISCONNECTED'
    )),
  encrypted_token TEXT NOT NULL,
  token_format_version INTEGER NOT NULL DEFAULT 1,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_sync_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_error_code TEXT,
  last_error_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT member_activity_connections_member_provider_uidx
    UNIQUE (member_id, provider)
);

CREATE INDEX IF NOT EXISTS member_activity_connections_member_idx
  ON public.member_activity_connections (member_id);

COMMENT ON COLUMN public.member_activity_connections.encrypted_token IS
  'Authenticated ciphertext of DI OAuth token JSON. Never expose to browser clients.';
COMMENT ON COLUMN public.member_activity_connections.token_format_version IS
  '1 = JSON {di_token, di_refresh_token, di_client_id} Fernet/AES-GCM envelope';

ALTER TABLE public.member_activity_connections ENABLE ROW LEVEL SECURITY;

-- No SELECT/INSERT/UPDATE/DELETE policies for authenticated/anon.
-- encrypted_token is service_role (worker) only. JWT clients never see ciphertext.
-- Status for UI: SECURITY DEFINER RPCs below (no token columns).

DROP POLICY IF EXISTS member_activity_connections_staff_select ON public.member_activity_connections;

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
  last_error_at TIMESTAMPTZ
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
    c.last_error_at
  FROM public.member_activity_connections c
  WHERE c.member_id = v_member_id
    AND c.provider = p_provider;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_activity_connection_status(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_activity_connection_status(TEXT) TO authenticated;

-- Staff status lookup (still never returns encrypted_token)
CREATE OR REPLACE FUNCTION public.get_member_activity_connection_status(
  p_member_id UUID,
  p_provider TEXT DEFAULT 'GARMIN'
)
RETURNS TABLE (
  id UUID,
  member_id UUID,
  provider TEXT,
  status TEXT,
  connected_at TIMESTAMPTZ,
  last_sync_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_error_code TEXT,
  last_error_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'operator')
      AND p.approval_status = 'approved'
  ) THEN
    RAISE EXCEPTION 'forbidden';
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
    c.last_error_at
  FROM public.member_activity_connections c
  WHERE c.member_id = p_member_id
    AND c.provider = p_provider;
END;
$$;

REVOKE ALL ON FUNCTION public.get_member_activity_connection_status(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_member_activity_connection_status(UUID, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3) Duplicate candidates (manual vs Garmin) — detect only, no auto-merge
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.member_mileage_duplicate_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  existing_log_id UUID REFERENCES public.running_league_mileage_logs(id) ON DELETE SET NULL,
  provider TEXT NOT NULL DEFAULT 'GARMIN',
  external_activity_id TEXT NOT NULL,
  proposed_distance_km NUMERIC(8, 2) NOT NULL,
  proposed_logged_at DATE NOT NULL,
  proposed_activity_time TEXT,
  proposed_duration TEXT,
  reason TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN', 'DISMISSED', 'RESOLVED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (member_id, provider, external_activity_id)
);

CREATE INDEX IF NOT EXISTS member_mileage_duplicate_candidates_member_idx
  ON public.member_mileage_duplicate_candidates (member_id, status);

ALTER TABLE public.member_mileage_duplicate_candidates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS member_mileage_duplicate_candidates_select ON public.member_mileage_duplicate_candidates;
CREATE POLICY member_mileage_duplicate_candidates_select
  ON public.member_mileage_duplicate_candidates
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

-- Writes: service role / staff only
DROP POLICY IF EXISTS member_mileage_duplicate_candidates_staff_write
  ON public.member_mileage_duplicate_candidates;
CREATE POLICY member_mileage_duplicate_candidates_staff_write
  ON public.member_mileage_duplicate_candidates
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'operator')
        AND p.approval_status = 'approved'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'operator')
        AND p.approval_status = 'approved'
    )
  );

-- ---------------------------------------------------------------------------
-- 4) Idempotent Garmin mileage insert (unique index + conflict handling)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.import_garmin_mileage_log(
  p_member_id UUID,
  p_participant_id UUID,
  p_league_id UUID,
  p_distance_km NUMERIC,
  p_logged_at DATE,
  p_duration TEXT,
  p_activity_time TEXT,
  p_external_activity_id TEXT,
  p_notes TEXT DEFAULT ''
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted UUID;
BEGIN
  IF p_external_activity_id IS NULL OR length(trim(p_external_activity_id)) = 0 THEN
    RAISE EXCEPTION 'external_activity_id required';
  END IF;

  INSERT INTO public.running_league_mileage_logs (
    participant_id,
    league_id,
    member_id,
    distance_km,
    logged_at,
    source,
    source_app,
    notes,
    duration,
    activity_time,
    external_activity_id,
    verification_status,
    updated_at
  ) VALUES (
    p_participant_id,
    p_league_id,
    p_member_id,
    round(p_distance_km::numeric, 2),
    p_logged_at,
    'import',
    'GARMIN',
    coalesce(p_notes, ''),
    p_duration,
    p_activity_time,
    p_external_activity_id,
    'confirmed',
    now()
  )
  ON CONFLICT (member_id, source_app, external_activity_id)
    WHERE (external_activity_id IS NOT NULL)
  DO NOTHING
  RETURNING id INTO v_inserted;

  IF v_inserted IS NULL THEN
    RETURN 'ALREADY_IMPORTED';
  END IF;

  RETURN 'IMPORTED';
END;
$$;

REVOKE ALL ON FUNCTION public.import_garmin_mileage_log(
  UUID, UUID, UUID, NUMERIC, DATE, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC;
-- Callable by service role (worker). Authenticated JWT users should not import arbitrarily.
GRANT EXECUTE ON FUNCTION public.import_garmin_mileage_log(
  UUID, UUID, UUID, NUMERIC, DATE, TEXT, TEXT, TEXT, TEXT
) TO service_role;

NOTIFY pgrst, 'reload schema';
