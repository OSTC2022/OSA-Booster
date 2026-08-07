-- 명예의 전당 (풀코스 기록 보유자)
-- Supabase SQL Editor에서 실행

CREATE TABLE IF NOT EXISTS public.hall_of_fame_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name TEXT NOT NULL,
  time_text TEXT NOT NULL,
  time_seconds INTEGER NOT NULL CHECK (time_seconds > 0),
  race_name TEXT,
  measured_at DATE,
  member_id UUID REFERENCES public.members(id) ON DELETE SET NULL,
  notes TEXT,
  is_published BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hall_of_fame_entries_published_time_idx
  ON public.hall_of_fame_entries (is_published, time_seconds ASC);

COMMENT ON TABLE public.hall_of_fame_entries IS
  '로그인 화면 명예의 전당 — 풀코스(풀마라톤) 기록 보유자';

ALTER TABLE public.hall_of_fame_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hall_of_fame_entries_public_read ON public.hall_of_fame_entries;
CREATE POLICY hall_of_fame_entries_public_read ON public.hall_of_fame_entries
  FOR SELECT TO anon, authenticated
  USING (is_published = true);

DROP POLICY IF EXISTS hall_of_fame_entries_staff_all ON public.hall_of_fame_entries;
CREATE POLICY hall_of_fame_entries_staff_all ON public.hall_of_fame_entries
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
