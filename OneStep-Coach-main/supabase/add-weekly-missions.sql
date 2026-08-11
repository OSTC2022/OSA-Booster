-- 주간 미션 (progress는 원본 러닝/출석 데이터로 실시간 계산 — 별도 progress 테이블 없음)
-- Supabase SQL Editor에서 실행하거나 scripts/apply-weekly-missions-sql.mjs 사용

CREATE TABLE IF NOT EXISTS public.weekly_missions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  mission_type TEXT NOT NULL
    CHECK (mission_type IN ('distance', 'run_count', 'attendance_count')),
  target_value NUMERIC(10, 2) NOT NULL CHECK (target_value > 0),
  unit TEXT NOT NULL DEFAULT 'km',
  start_at DATE NOT NULL,
  end_at DATE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_auto BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reward_points INTEGER NOT NULL DEFAULT 0 CHECK (reward_points >= 0),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT weekly_missions_date_range CHECK (end_at >= start_at)
);

CREATE INDEX IF NOT EXISTS weekly_missions_active_range_idx
  ON public.weekly_missions (is_active, start_at, end_at, sort_order);

CREATE INDEX IF NOT EXISTS weekly_missions_sort_idx
  ON public.weekly_missions (sort_order ASC, created_at DESC);

ALTER TABLE public.weekly_missions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS weekly_missions_read ON public.weekly_missions;
CREATE POLICY weekly_missions_read ON public.weekly_missions
  FOR SELECT TO authenticated
  USING (
    is_active = true
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'operator')
        AND p.approval_status = 'approved'
    )
  );

DROP POLICY IF EXISTS weekly_missions_staff_write ON public.weekly_missions;
CREATE POLICY weekly_missions_staff_write ON public.weekly_missions
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

NOTIFY pgrst, 'reload schema';
