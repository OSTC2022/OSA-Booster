-- RUN POINT 추첨 이벤트 (응모권 / 가중 추첨 / 환불)
-- Supabase SQL Editor에서 실행

CREATE TABLE IF NOT EXISTS public.raffle_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  prize_name TEXT NOT NULL,
  prize_description TEXT,
  image_url TEXT,
  ticket_cost_points INTEGER NOT NULL CHECK (ticket_cost_points > 0),
  max_entries_per_member INTEGER CHECK (
    max_entries_per_member IS NULL OR max_entries_per_member > 0
  ),
  start_at TIMESTAMPTZ NOT NULL,
  entry_end_at TIMESTAMPTZ NOT NULL,
  draw_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'OPEN', 'CLOSED', 'DRAWING', 'DRAWN', 'CANCELLED')),
  winner_count INTEGER NOT NULL DEFAULT 1 CHECK (winner_count > 0),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT raffle_events_time_range CHECK (entry_end_at > start_at)
);

CREATE TABLE IF NOT EXISTS public.raffle_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raffle_id UUID NOT NULL REFERENCES public.raffle_events(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  ticket_count INTEGER NOT NULL CHECK (ticket_count > 0),
  points_spent INTEGER NOT NULL CHECK (points_spent > 0),
  point_transaction_id UUID REFERENCES public.member_reward_ledger(id) ON DELETE SET NULL,
  idempotency_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT raffle_entries_idempotency UNIQUE (idempotency_key)
);

CREATE TABLE IF NOT EXISTS public.raffle_draws (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raffle_id UUID NOT NULL REFERENCES public.raffle_events(id) ON DELETE CASCADE,
  total_entries INTEGER NOT NULL DEFAULT 0,
  total_members INTEGER NOT NULL DEFAULT 0,
  draw_algorithm_version TEXT NOT NULL DEFAULT 'weighted_v1',
  result_hash TEXT,
  entry_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  executed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT raffle_draws_one_per_event UNIQUE (raffle_id)
);

CREATE TABLE IF NOT EXISTS public.raffle_winners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raffle_id UUID NOT NULL REFERENCES public.raffle_events(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  winner_order INTEGER NOT NULL CHECK (winner_order > 0),
  entry_snapshot INTEGER NOT NULL DEFAULT 0,
  draw_id UUID NOT NULL REFERENCES public.raffle_draws(id) ON DELETE CASCADE,
  drawn_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  drawn_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT raffle_winners_order_unique UNIQUE (raffle_id, winner_order),
  CONSTRAINT raffle_winners_member_unique UNIQUE (raffle_id, member_id)
);

CREATE INDEX IF NOT EXISTS raffle_events_status_entry_end_idx
  ON public.raffle_events (status, entry_end_at);

CREATE INDEX IF NOT EXISTS raffle_entries_raffle_member_idx
  ON public.raffle_entries (raffle_id, member_id);

CREATE INDEX IF NOT EXISTS raffle_winners_raffle_idx
  ON public.raffle_winners (raffle_id, winner_order);

ALTER TABLE public.raffle_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raffle_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raffle_draws ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raffle_winners ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS raffle_events_select ON public.raffle_events;
CREATE POLICY raffle_events_select ON public.raffle_events
  FOR SELECT TO authenticated
  USING (
    status IN ('OPEN', 'CLOSED', 'DRAWING', 'DRAWN', 'CANCELLED')
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'operator')
        AND p.approval_status = 'approved'
    )
  );

DROP POLICY IF EXISTS raffle_events_staff_write ON public.raffle_events;
CREATE POLICY raffle_events_staff_write ON public.raffle_events
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

DROP POLICY IF EXISTS raffle_entries_select ON public.raffle_entries;
CREATE POLICY raffle_entries_select ON public.raffle_entries
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

-- 일반 회원 직접 INSERT/UPDATE/DELETE 금지 (RPC / service role만)
DROP POLICY IF EXISTS raffle_entries_staff_write ON public.raffle_entries;
CREATE POLICY raffle_entries_staff_write ON public.raffle_entries
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

DROP POLICY IF EXISTS raffle_draws_select ON public.raffle_draws;
CREATE POLICY raffle_draws_select ON public.raffle_draws
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS raffle_draws_staff_write ON public.raffle_draws;
CREATE POLICY raffle_draws_staff_write ON public.raffle_draws
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

DROP POLICY IF EXISTS raffle_winners_select ON public.raffle_winners;
CREATE POLICY raffle_winners_select ON public.raffle_winners
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS raffle_winners_staff_write ON public.raffle_winners;
CREATE POLICY raffle_winners_staff_write ON public.raffle_winners
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

-- POINT 잔액 확인 + ledger 차감 + entry 생성을 원자적으로 처리
CREATE OR REPLACE FUNCTION public.enter_raffle_with_points(
  p_raffle_id UUID,
  p_member_id UUID,
  p_ticket_count INTEGER,
  p_idempotency_key TEXT,
  p_created_by UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event public.raffle_events%ROWTYPE;
  v_balance INTEGER;
  v_cost INTEGER;
  v_existing INTEGER;
  v_ledger_id UUID;
  v_entry_id UUID;
  v_now TIMESTAMPTZ := now();
  v_existing_entry public.raffle_entries%ROWTYPE;
BEGIN
  IF p_ticket_count IS NULL OR p_ticket_count <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_TICKET_COUNT');
  END IF;
  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'MISSING_IDEMPOTENCY_KEY');
  END IF;

  SELECT * INTO v_existing_entry
  FROM public.raffle_entries
  WHERE idempotency_key = p_idempotency_key;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'duplicate', true,
      'entry_id', v_existing_entry.id,
      'ticket_count', v_existing_entry.ticket_count,
      'points_spent', v_existing_entry.points_spent,
      'point_transaction_id', v_existing_entry.point_transaction_id
    );
  END IF;

  -- 회원별 직렬화 (동시 응모 race 방지)
  PERFORM pg_advisory_xact_lock(hashtext('raffle_entry:' || p_member_id::text));

  SELECT * INTO v_event
  FROM public.raffle_events
  WHERE id = p_raffle_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'EVENT_NOT_FOUND');
  END IF;

  IF v_event.status <> 'OPEN' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'EVENT_NOT_OPEN');
  END IF;

  IF v_now < v_event.start_at OR v_now >= v_event.entry_end_at THEN
    RETURN jsonb_build_object('ok', false, 'error', 'OUTSIDE_ENTRY_WINDOW');
  END IF;

  IF v_event.ticket_cost_points <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_TICKET_COST');
  END IF;

  SELECT COALESCE(SUM(ticket_count), 0) INTO v_existing
  FROM public.raffle_entries
  WHERE raffle_id = p_raffle_id AND member_id = p_member_id;

  IF v_event.max_entries_per_member IS NOT NULL
     AND (v_existing + p_ticket_count) > v_event.max_entries_per_member THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'MAX_ENTRIES_EXCEEDED',
      'max', v_event.max_entries_per_member,
      'current', v_existing
    );
  END IF;

  v_cost := v_event.ticket_cost_points * p_ticket_count;

  SELECT COALESCE(SUM(amount), 0) INTO v_balance
  FROM public.member_reward_ledger
  WHERE member_id = p_member_id AND currency = 'POINT';

  IF v_balance < v_cost THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'INSUFFICIENT_POINTS',
      'balance', v_balance,
      'required', v_cost
    );
  END IF;

  INSERT INTO public.member_reward_ledger (
    member_id,
    currency,
    amount,
    source_type,
    source_id,
    idempotency_key,
    description,
    metadata,
    created_by
  ) VALUES (
    p_member_id,
    'POINT',
    -v_cost,
    'RAFFLE_ENTRY',
    p_raffle_id::text,
    p_idempotency_key,
    v_event.title || ' 추첨권 ' || p_ticket_count || '장',
    jsonb_build_object(
      'raffle_id', p_raffle_id,
      'ticket_count', p_ticket_count,
      'ticket_cost_points', v_event.ticket_cost_points
    ),
    p_created_by
  )
  ON CONFLICT (member_id, idempotency_key) DO NOTHING
  RETURNING id INTO v_ledger_id;

  IF v_ledger_id IS NULL THEN
    SELECT id INTO v_ledger_id
    FROM public.member_reward_ledger
    WHERE member_id = p_member_id AND idempotency_key = p_idempotency_key;

    SELECT * INTO v_existing_entry
    FROM public.raffle_entries
    WHERE idempotency_key = p_idempotency_key;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'ok', true,
        'duplicate', true,
        'entry_id', v_existing_entry.id,
        'ticket_count', v_existing_entry.ticket_count,
        'points_spent', v_existing_entry.points_spent,
        'point_transaction_id', v_existing_entry.point_transaction_id
      );
    END IF;
  END IF;

  INSERT INTO public.raffle_entries (
    raffle_id,
    member_id,
    ticket_count,
    points_spent,
    point_transaction_id,
    idempotency_key
  ) VALUES (
    p_raffle_id,
    p_member_id,
    p_ticket_count,
    v_cost,
    v_ledger_id,
    p_idempotency_key
  )
  RETURNING id INTO v_entry_id;

  RETURN jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'entry_id', v_entry_id,
    'ticket_count', p_ticket_count,
    'points_spent', v_cost,
    'point_transaction_id', v_ledger_id,
    'balance_after', v_balance - v_cost
  );
EXCEPTION
  WHEN unique_violation THEN
    SELECT * INTO v_existing_entry
    FROM public.raffle_entries
    WHERE idempotency_key = p_idempotency_key;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'ok', true,
        'duplicate', true,
        'entry_id', v_existing_entry.id,
        'ticket_count', v_existing_entry.ticket_count,
        'points_spent', v_existing_entry.points_spent,
        'point_transaction_id', v_existing_entry.point_transaction_id
      );
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'UNIQUE_VIOLATION');
END;
$$;

REVOKE ALL ON FUNCTION public.enter_raffle_with_points(UUID, UUID, INTEGER, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enter_raffle_with_points(UUID, UUID, INTEGER, TEXT, UUID) TO service_role;

-- 이벤트 취소 시 회원별 응모 POINT 전액 환불 (idempotent)
CREATE OR REPLACE FUNCTION public.refund_raffle_on_cancel(
  p_raffle_id UUID,
  p_executed_by UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event public.raffle_events%ROWTYPE;
  v_row RECORD;
  v_refunded INTEGER := 0;
  v_skipped INTEGER := 0;
  v_key TEXT;
  v_title TEXT;
  v_ledger_id UUID;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('raffle_cancel:' || p_raffle_id::text));

  SELECT * INTO v_event
  FROM public.raffle_events
  WHERE id = p_raffle_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'EVENT_NOT_FOUND');
  END IF;

  IF v_event.status = 'DRAWN' OR v_event.status = 'DRAWING' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'CANNOT_CANCEL_DRAWN');
  END IF;

  IF v_event.status = 'CANCELLED' THEN
    -- 이미 취소됨: 환불만 idempotent 재시도 (추가 지급 없음)
    NULL;
  ELSE
    UPDATE public.raffle_events
    SET status = 'CANCELLED', updated_at = now()
    WHERE id = p_raffle_id;
  END IF;

  v_title := v_event.title;

  FOR v_row IN
    SELECT member_id, SUM(points_spent)::INTEGER AS spent
    FROM public.raffle_entries
    WHERE raffle_id = p_raffle_id
    GROUP BY member_id
  LOOP
    IF v_row.spent IS NULL OR v_row.spent <= 0 THEN
      CONTINUE;
    END IF;

    v_key := 'RAFFLE_REFUND:' || p_raffle_id::text || ':' || v_row.member_id::text;

    INSERT INTO public.member_reward_ledger (
      member_id,
      currency,
      amount,
      source_type,
      source_id,
      idempotency_key,
      description,
      metadata,
      created_by
    ) VALUES (
      v_row.member_id,
      'POINT',
      v_row.spent,
      'RAFFLE_REFUND',
      p_raffle_id::text,
      v_key,
      v_title || ' 취소 환불',
      jsonb_build_object('raffle_id', p_raffle_id, 'refunded_points', v_row.spent),
      p_executed_by
    )
    ON CONFLICT (member_id, idempotency_key) DO NOTHING
    RETURNING id INTO v_ledger_id;

    IF v_ledger_id IS NOT NULL THEN
      v_refunded := v_refunded + 1;
      v_ledger_id := NULL;
    ELSE
      v_skipped := v_skipped + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'refunded_members', v_refunded,
    'skipped_members', v_skipped
  );
END;
$$;

REVOKE ALL ON FUNCTION public.refund_raffle_on_cancel(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refund_raffle_on_cancel(UUID, UUID) TO service_role;

NOTIFY pgrst, 'reload schema';
