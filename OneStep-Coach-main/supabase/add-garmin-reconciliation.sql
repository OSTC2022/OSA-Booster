-- 13-E: Garmin reconciliation — resolutions, audit events, issue types
-- Extends member_mileage_duplicate_candidates (no new duplicate table).
-- Never auto-deletes mileage. Raw Garmin payloads / tokens are never stored.

-- ---------------------------------------------------------------------------
-- 1) Extend duplicate candidates → general sync issues
-- ---------------------------------------------------------------------------
ALTER TABLE public.member_mileage_duplicate_candidates
  ADD COLUMN IF NOT EXISTS issue_type TEXT NOT NULL DEFAULT 'POSSIBLE_DUPLICATE';

ALTER TABLE public.member_mileage_duplicate_candidates
  ADD COLUMN IF NOT EXISTS confidence TEXT NOT NULL DEFAULT 'HIGH';

ALTER TABLE public.member_mileage_duplicate_candidates
  ADD COLUMN IF NOT EXISTS proposed_summary JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.member_mileage_duplicate_candidates
  ADD COLUMN IF NOT EXISTS existing_summary JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.member_mileage_duplicate_candidates
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

ALTER TABLE public.member_mileage_duplicate_candidates
  ADD COLUMN IF NOT EXISTS resolved_by UUID;

-- Allow IGNORED status (replay prevention / user dismissed)
DO $$
BEGIN
  ALTER TABLE public.member_mileage_duplicate_candidates
    DROP CONSTRAINT IF EXISTS member_mileage_duplicate_candidates_status_check;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE public.member_mileage_duplicate_candidates
  DROP CONSTRAINT IF EXISTS member_mileage_duplicate_candidates_status_check;

ALTER TABLE public.member_mileage_duplicate_candidates
  ADD CONSTRAINT member_mileage_duplicate_candidates_status_check
  CHECK (status IN ('OPEN', 'DISMISSED', 'RESOLVED', 'IGNORED'));

DO $$
BEGIN
  ALTER TABLE public.member_mileage_duplicate_candidates
    DROP CONSTRAINT IF EXISTS member_mileage_duplicate_candidates_issue_type_check;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE public.member_mileage_duplicate_candidates
  ADD CONSTRAINT member_mileage_duplicate_candidates_issue_type_check
  CHECK (issue_type IN (
    'POSSIBLE_DUPLICATE',
    'SOURCE_CHANGED',
    'SOURCE_CHANGED_AFTER_FINALIZATION',
    'DATE_BOUNDARY_CHANGED',
    'WEEK_BOUNDARY_CHANGED',
    'ACTIVITY_NO_LONGER_RUNNING',
    'SOURCE_ACTIVITY_DELETED'
  ));

DO $$
BEGIN
  ALTER TABLE public.member_mileage_duplicate_candidates
    DROP CONSTRAINT IF EXISTS member_mileage_duplicate_candidates_confidence_check;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE public.member_mileage_duplicate_candidates
  ADD CONSTRAINT member_mileage_duplicate_candidates_confidence_check
  CHECK (confidence IN ('HIGH', 'LOW'));

-- Replace legacy unique (one row per external id) so multiple issue types can exist historically.
-- Open issues: at most one OPEN per (member, provider, external_id, issue_type).
DO $$
BEGIN
  ALTER TABLE public.member_mileage_duplicate_candidates
    DROP CONSTRAINT IF EXISTS member_mileage_duplicate_candidates_member_id_provider_external_activity_id_key;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DROP INDEX IF EXISTS member_mileage_duplicate_candidates_member_id_provider_external_activity_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS member_mileage_duplicate_candidates_open_issue_uidx
  ON public.member_mileage_duplicate_candidates (member_id, provider, external_activity_id, issue_type)
  WHERE status = 'OPEN';

-- ---------------------------------------------------------------------------
-- 2) Resolutions (permanent decisions — worker must respect)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.activity_sync_resolutions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'GARMIN',
  external_activity_id TEXT NOT NULL,
  resolution_type TEXT NOT NULL
    CHECK (resolution_type IN (
      'KEEP_MANUAL',
      'USE_GARMIN',
      'ALLOW_BOTH',
      'KEEP_LOCAL_AFTER_SOURCE_DELETE',
      'REMOVE_LOCAL_AFTER_SOURCE_DELETE',
      'KEEP_LOCAL_AFTER_TYPE_CHANGE',
      'REMOVE_LOCAL_AFTER_TYPE_CHANGE'
    )),
  mileage_log_id UUID REFERENCES public.running_league_mileage_logs(id) ON DELETE SET NULL,
  issue_id UUID REFERENCES public.member_mileage_duplicate_candidates(id) ON DELETE SET NULL,
  resolved_by UUID,
  resolved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (member_id, provider, external_activity_id)
);

CREATE INDEX IF NOT EXISTS activity_sync_resolutions_member_idx
  ON public.activity_sync_resolutions (member_id, provider);

ALTER TABLE public.activity_sync_resolutions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS activity_sync_resolutions_select ON public.activity_sync_resolutions;
CREATE POLICY activity_sync_resolutions_select
  ON public.activity_sync_resolutions
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

-- Members/admins resolve via SECURITY DEFINER RPCs only (no direct INSERT)

-- ---------------------------------------------------------------------------
-- 3) Append-only reconciliation audit
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.activity_reconciliation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'GARMIN',
  external_activity_id TEXT,
  mileage_log_id UUID,
  event_type TEXT NOT NULL,
  previous_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  new_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  source TEXT NOT NULL DEFAULT 'system',
  resolved_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS activity_reconciliation_events_member_idx
  ON public.activity_reconciliation_events (member_id, created_at DESC);

ALTER TABLE public.activity_reconciliation_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS activity_reconciliation_events_select ON public.activity_reconciliation_events;
CREATE POLICY activity_reconciliation_events_select
  ON public.activity_reconciliation_events
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

-- No UPDATE/DELETE policies for authenticated — append-only via service role / DEFINER

-- ---------------------------------------------------------------------------
-- 4) Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._garmin_actor_may_resolve(p_member_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.running_league_member_owns_row(p_member_id)
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'operator')
        AND p.approval_status = 'approved'
    );
$$;

REVOKE ALL ON FUNCTION public._garmin_actor_may_resolve(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._garmin_actor_may_resolve(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public._garmin_sync_participant_mileage(p_participant_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total NUMERIC := 0;
BEGIN
  SELECT COALESCE(ROUND(SUM(distance_km)::numeric, 2), 0)
    INTO v_total
  FROM public.running_league_mileage_logs
  WHERE participant_id = p_participant_id;

  UPDATE public.running_league_participants
  SET mileage_km = v_total, updated_at = now()
  WHERE id = p_participant_id;

  RETURN v_total;
END;
$$;

REVOKE ALL ON FUNCTION public._garmin_sync_participant_mileage(UUID) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- 5) Atomic resolve: KEEP_MANUAL / USE_GARMIN / ALLOW_BOTH
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_garmin_duplicate_candidate(
  p_issue_id UUID,
  p_resolution TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_issue public.member_mileage_duplicate_candidates%ROWTYPE;
  v_log public.running_league_mileage_logs%ROWTYPE;
  v_actor UUID := auth.uid();
  v_existing_res public.activity_sync_resolutions%ROWTYPE;
  v_new_id UUID;
  v_prev JSONB;
  v_new JSONB;
BEGIN
  IF p_resolution NOT IN ('KEEP_MANUAL', 'USE_GARMIN', 'ALLOW_BOTH') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_RESOLUTION');
  END IF;

  SELECT * INTO v_issue
  FROM public.member_mileage_duplicate_candidates
  WHERE id = p_issue_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ISSUE_NOT_FOUND');
  END IF;

  IF NOT public._garmin_actor_may_resolve(v_issue.member_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  END IF;

  IF v_issue.status <> 'OPEN' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ALREADY_RESOLVED', 'status', v_issue.status);
  END IF;

  IF v_issue.issue_type <> 'POSSIBLE_DUPLICATE' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'WRONG_ISSUE_TYPE');
  END IF;

  -- Double-click / replay: existing resolution for this activity wins
  SELECT * INTO v_existing_res
  FROM public.activity_sync_resolutions
  WHERE member_id = v_issue.member_id
    AND provider = v_issue.provider
    AND external_activity_id = v_issue.external_activity_id;

  IF FOUND THEN
    UPDATE public.member_mileage_duplicate_candidates
    SET status = 'RESOLVED', resolved_at = now(), resolved_by = v_actor
    WHERE id = v_issue.id;
    RETURN jsonb_build_object(
      'ok', true,
      'replay', true,
      'resolution', v_existing_res.resolution_type
    );
  END IF;

  IF p_resolution = 'KEEP_MANUAL' THEN
    INSERT INTO public.activity_sync_resolutions (
      member_id, provider, external_activity_id, resolution_type,
      mileage_log_id, issue_id, resolved_by, metadata
    ) VALUES (
      v_issue.member_id, v_issue.provider, v_issue.external_activity_id, 'KEEP_MANUAL',
      v_issue.existing_log_id, v_issue.id, v_actor,
      jsonb_build_object('proposed_distance_km', v_issue.proposed_distance_km)
    );

    INSERT INTO public.activity_reconciliation_events (
      member_id, provider, external_activity_id, mileage_log_id,
      event_type, previous_summary, new_summary, source, resolved_by
    ) VALUES (
      v_issue.member_id, v_issue.provider, v_issue.external_activity_id, v_issue.existing_log_id,
      'KEEP_MANUAL',
      jsonb_build_object('existing_log_id', v_issue.existing_log_id),
      jsonb_build_object('garmin_not_imported', true, 'external_activity_id', v_issue.external_activity_id),
      'member_review', v_actor
    );

  ELSIF p_resolution = 'ALLOW_BOTH' THEN
    -- Insert Garmin row if not already present (unique protects)
    IF EXISTS (
      SELECT 1 FROM public.running_league_mileage_logs
      WHERE member_id = v_issue.member_id
        AND source_app = 'GARMIN'
        AND external_activity_id = v_issue.external_activity_id
    ) THEN
      NULL; -- already imported
    ELSE
      SELECT * INTO v_log
      FROM public.running_league_mileage_logs
      WHERE id = v_issue.existing_log_id;

      IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'EXISTING_LOG_MISSING');
      END IF;

      INSERT INTO public.running_league_mileage_logs (
        league_id, participant_id, member_id, distance_km, logged_at,
        duration, activity_time, notes, source, source_app, external_activity_id,
        verification_status
      ) VALUES (
        v_log.league_id, v_log.participant_id, v_issue.member_id,
        v_issue.proposed_distance_km, v_issue.proposed_logged_at,
        v_issue.proposed_duration, v_issue.proposed_activity_time,
        'Imported from Garmin Connect',
        'import', 'GARMIN', v_issue.external_activity_id,
        'confirmed'
      )
      RETURNING id INTO v_new_id;

      PERFORM public._garmin_sync_participant_mileage(v_log.participant_id);
    END IF;

    INSERT INTO public.activity_sync_resolutions (
      member_id, provider, external_activity_id, resolution_type,
      mileage_log_id, issue_id, resolved_by, metadata
    ) VALUES (
      v_issue.member_id, v_issue.provider, v_issue.external_activity_id, 'ALLOW_BOTH',
      COALESCE(v_new_id, v_issue.existing_log_id), v_issue.id, v_actor, '{}'::jsonb
    );

    INSERT INTO public.activity_reconciliation_events (
      member_id, provider, external_activity_id, mileage_log_id,
      event_type, previous_summary, new_summary, source, resolved_by
    ) VALUES (
      v_issue.member_id, v_issue.provider, v_issue.external_activity_id, COALESCE(v_new_id, v_issue.existing_log_id),
      'ALLOW_BOTH',
      jsonb_build_object('manual_log_id', v_issue.existing_log_id),
      jsonb_build_object('garmin_log_id', v_new_id, 'distance_km', v_issue.proposed_distance_km),
      'member_review', v_actor
    );

  ELSIF p_resolution = 'USE_GARMIN' THEN
    SELECT * INTO v_log
    FROM public.running_league_mileage_logs
    WHERE id = v_issue.existing_log_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'EXISTING_LOG_MISSING');
    END IF;

    -- Prefer UPDATE in place (preserve row id)
    v_prev := jsonb_build_object(
      'distance_km', v_log.distance_km,
      'logged_at', v_log.logged_at,
      'activity_time', v_log.activity_time,
      'duration', v_log.duration,
      'source', v_log.source,
      'source_app', v_log.source_app,
      'external_activity_id', v_log.external_activity_id
    );

    -- Guard: another Garmin row with this external id must not exist on a different row
    IF EXISTS (
      SELECT 1 FROM public.running_league_mileage_logs
      WHERE member_id = v_issue.member_id
        AND source_app = 'GARMIN'
        AND external_activity_id = v_issue.external_activity_id
        AND id <> v_log.id
    ) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'GARMIN_ROW_ALREADY_EXISTS');
    END IF;

    UPDATE public.running_league_mileage_logs
    SET
      distance_km = v_issue.proposed_distance_km,
      logged_at = v_issue.proposed_logged_at,
      activity_time = v_issue.proposed_activity_time,
      duration = v_issue.proposed_duration,
      source = 'import',
      source_app = 'GARMIN',
      external_activity_id = v_issue.external_activity_id,
      notes = COALESCE(NULLIF(notes, ''), 'Imported from Garmin Connect'),
      verification_status = 'confirmed',
      updated_at = now()
    WHERE id = v_log.id;

    v_new := jsonb_build_object(
      'distance_km', v_issue.proposed_distance_km,
      'logged_at', v_issue.proposed_logged_at,
      'activity_time', v_issue.proposed_activity_time,
      'duration', v_issue.proposed_duration,
      'source', 'import',
      'source_app', 'GARMIN',
      'external_activity_id', v_issue.external_activity_id
    );

    PERFORM public._garmin_sync_participant_mileage(v_log.participant_id);

    INSERT INTO public.activity_sync_resolutions (
      member_id, provider, external_activity_id, resolution_type,
      mileage_log_id, issue_id, resolved_by, metadata
    ) VALUES (
      v_issue.member_id, v_issue.provider, v_issue.external_activity_id, 'USE_GARMIN',
      v_log.id, v_issue.id, v_actor, '{}'::jsonb
    );

    INSERT INTO public.activity_reconciliation_events (
      member_id, provider, external_activity_id, mileage_log_id,
      event_type, previous_summary, new_summary, source, resolved_by
    ) VALUES (
      v_issue.member_id, v_issue.provider, v_issue.external_activity_id, v_log.id,
      'USE_GARMIN', v_prev, v_new, 'member_review', v_actor
    );
  END IF;

  UPDATE public.member_mileage_duplicate_candidates
  SET status = 'RESOLVED', resolved_at = now(), resolved_by = v_actor
  WHERE id = v_issue.id;

  RETURN jsonb_build_object('ok', true, 'resolution', p_resolution);
EXCEPTION
  WHEN unique_violation THEN
    -- Concurrent double-click
    RETURN jsonb_build_object('ok', false, 'error', 'CONCURRENT_RESOLUTION');
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_garmin_duplicate_candidate(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_garmin_duplicate_candidate(UUID, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6) Resolve source-deleted / type-change: keep or remove local
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_garmin_source_issue(
  p_issue_id UUID,
  p_resolution TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_issue public.member_mileage_duplicate_candidates%ROWTYPE;
  v_log public.running_league_mileage_logs%ROWTYPE;
  v_actor UUID := auth.uid();
  v_prev JSONB;
  v_res_type TEXT;
BEGIN
  IF p_resolution NOT IN ('KEEP_LOCAL', 'REMOVE_LOCAL') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_RESOLUTION');
  END IF;

  SELECT * INTO v_issue
  FROM public.member_mileage_duplicate_candidates
  WHERE id = p_issue_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ISSUE_NOT_FOUND');
  END IF;

  IF NOT public._garmin_actor_may_resolve(v_issue.member_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  END IF;

  IF v_issue.status <> 'OPEN' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ALREADY_RESOLVED');
  END IF;

  IF v_issue.issue_type NOT IN ('SOURCE_ACTIVITY_DELETED', 'ACTIVITY_NO_LONGER_RUNNING') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'WRONG_ISSUE_TYPE');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.activity_sync_resolutions
    WHERE member_id = v_issue.member_id
      AND provider = v_issue.provider
      AND external_activity_id = v_issue.external_activity_id
  ) THEN
    UPDATE public.member_mileage_duplicate_candidates
    SET status = 'RESOLVED', resolved_at = now(), resolved_by = v_actor
    WHERE id = v_issue.id;
    RETURN jsonb_build_object('ok', true, 'replay', true);
  END IF;

  IF p_resolution = 'KEEP_LOCAL' THEN
    v_res_type := CASE
      WHEN v_issue.issue_type = 'SOURCE_ACTIVITY_DELETED' THEN 'KEEP_LOCAL_AFTER_SOURCE_DELETE'
      ELSE 'KEEP_LOCAL_AFTER_TYPE_CHANGE'
    END;

    INSERT INTO public.activity_sync_resolutions (
      member_id, provider, external_activity_id, resolution_type,
      mileage_log_id, issue_id, resolved_by
    ) VALUES (
      v_issue.member_id, v_issue.provider, v_issue.external_activity_id, v_res_type,
      v_issue.existing_log_id, v_issue.id, v_actor
    );

    INSERT INTO public.activity_reconciliation_events (
      member_id, provider, external_activity_id, mileage_log_id,
      event_type, previous_summary, new_summary, source, resolved_by
    ) VALUES (
      v_issue.member_id, v_issue.provider, v_issue.external_activity_id, v_issue.existing_log_id,
      v_res_type,
      jsonb_build_object('kept', true),
      jsonb_build_object('mileage_retained', true),
      'member_review', v_actor
    );

  ELSE
    -- REMOVE_LOCAL: hard delete only after audit snapshot (no soft-delete column on logs)
    SELECT * INTO v_log
    FROM public.running_league_mileage_logs
    WHERE id = v_issue.existing_log_id
    FOR UPDATE;

    IF FOUND THEN
      v_prev := jsonb_build_object(
        'distance_km', v_log.distance_km,
        'logged_at', v_log.logged_at,
        'duration', v_log.duration,
        'activity_time', v_log.activity_time,
        'source_app', v_log.source_app,
        'external_activity_id', v_log.external_activity_id
      );

      INSERT INTO public.activity_reconciliation_events (
        member_id, provider, external_activity_id, mileage_log_id,
        event_type, previous_summary, new_summary, source, resolved_by
      ) VALUES (
        v_issue.member_id, v_issue.provider, v_issue.external_activity_id, v_log.id,
        'REMOVE_LOCAL_SNAPSHOT',
        v_prev,
        jsonb_build_object('deleted', true),
        'member_review', v_actor
      );

      DELETE FROM public.running_league_mileage_logs WHERE id = v_log.id;
      PERFORM public._garmin_sync_participant_mileage(v_log.participant_id);
    END IF;

    v_res_type := CASE
      WHEN v_issue.issue_type = 'SOURCE_ACTIVITY_DELETED' THEN 'REMOVE_LOCAL_AFTER_SOURCE_DELETE'
      ELSE 'REMOVE_LOCAL_AFTER_TYPE_CHANGE'
    END;

    INSERT INTO public.activity_sync_resolutions (
      member_id, provider, external_activity_id, resolution_type,
      mileage_log_id, issue_id, resolved_by
    ) VALUES (
      v_issue.member_id, v_issue.provider, v_issue.external_activity_id, v_res_type,
      v_issue.existing_log_id, v_issue.id, v_actor
    );
  END IF;

  UPDATE public.member_mileage_duplicate_candidates
  SET status = 'RESOLVED', resolved_at = now(), resolved_by = v_actor
  WHERE id = v_issue.id;

  RETURN jsonb_build_object('ok', true, 'resolution', p_resolution);
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'CONCURRENT_RESOLUTION');
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_garmin_source_issue(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_garmin_source_issue(UUID, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 7) Resolve boundary / source-changed review: apply Garmin or keep local
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_garmin_change_issue(
  p_issue_id UUID,
  p_resolution TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_issue public.member_mileage_duplicate_candidates%ROWTYPE;
  v_log public.running_league_mileage_logs%ROWTYPE;
  v_actor UUID := auth.uid();
  v_prev JSONB;
  v_prop JSONB;
BEGIN
  IF p_resolution NOT IN ('APPLY_GARMIN', 'KEEP_LOCAL') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_RESOLUTION');
  END IF;

  SELECT * INTO v_issue
  FROM public.member_mileage_duplicate_candidates
  WHERE id = p_issue_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ISSUE_NOT_FOUND');
  END IF;

  IF NOT public._garmin_actor_may_resolve(v_issue.member_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  END IF;

  IF v_issue.status <> 'OPEN' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ALREADY_RESOLVED');
  END IF;

  IF v_issue.issue_type NOT IN (
    'SOURCE_CHANGED',
    'SOURCE_CHANGED_AFTER_FINALIZATION',
    'DATE_BOUNDARY_CHANGED',
    'WEEK_BOUNDARY_CHANGED'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'WRONG_ISSUE_TYPE');
  END IF;

  SELECT * INTO v_log
  FROM public.running_league_mileage_logs
  WHERE id = v_issue.existing_log_id
  FOR UPDATE;

  IF p_resolution = 'KEEP_LOCAL' THEN
    INSERT INTO public.activity_reconciliation_events (
      member_id, provider, external_activity_id, mileage_log_id,
      event_type, previous_summary, new_summary, source, resolved_by
    ) VALUES (
      v_issue.member_id, v_issue.provider, v_issue.external_activity_id, v_issue.existing_log_id,
      'KEEP_LOCAL_AFTER_SOURCE_CHANGE',
      COALESCE(v_issue.existing_summary, '{}'::jsonb),
      COALESCE(v_issue.proposed_summary, '{}'::jsonb),
      'member_review', v_actor
    );
  ELSIF FOUND THEN
    v_prev := jsonb_build_object(
      'distance_km', v_log.distance_km,
      'logged_at', v_log.logged_at,
      'activity_time', v_log.activity_time,
      'duration', v_log.duration
    );
    v_prop := COALESCE(v_issue.proposed_summary, '{}'::jsonb);

    UPDATE public.running_league_mileage_logs
    SET
      distance_km = COALESCE((v_prop->>'distance_km')::numeric, v_issue.proposed_distance_km, v_log.distance_km),
      logged_at = COALESCE((v_prop->>'logged_at')::date, v_issue.proposed_logged_at, v_log.logged_at),
      activity_time = COALESCE(v_prop->>'activity_time', v_issue.proposed_activity_time, v_log.activity_time),
      duration = COALESCE(v_prop->>'duration', v_issue.proposed_duration, v_log.duration),
      updated_at = now()
    WHERE id = v_log.id;

    PERFORM public._garmin_sync_participant_mileage(v_log.participant_id);

    INSERT INTO public.activity_reconciliation_events (
      member_id, provider, external_activity_id, mileage_log_id,
      event_type, previous_summary, new_summary, source, resolved_by
    ) VALUES (
      v_issue.member_id, v_issue.provider, v_issue.external_activity_id, v_log.id,
      'APPLY_GARMIN_SOURCE_CHANGE',
      v_prev,
      v_prop,
      'member_review', v_actor
    );
  END IF;

  -- Note: FINALIZED season snapshots (Hall of Fame etc.) are never touched here.

  UPDATE public.member_mileage_duplicate_candidates
  SET status = 'RESOLVED', resolved_at = now(), resolved_by = v_actor
  WHERE id = v_issue.id;

  RETURN jsonb_build_object('ok', true, 'resolution', p_resolution);
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_garmin_change_issue(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_garmin_change_issue(UUID, TEXT) TO authenticated;
