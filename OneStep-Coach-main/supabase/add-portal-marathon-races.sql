-- 마라톤·대회 일정
-- Supabase SQL Editor에서 실행

CREATE TABLE IF NOT EXISTS public.portal_marathon_races (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  location TEXT,
  race_date DATE NOT NULL,
  distances TEXT[] NOT NULL DEFAULT '{}',
  apply_url TEXT,
  is_open_for_apply BOOLEAN NOT NULL DEFAULT true,
  is_published BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.portal_marathon_race_signups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  race_id UUID NOT NULL REFERENCES public.portal_marathon_races(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (race_id, member_id)
);

CREATE INDEX IF NOT EXISTS portal_marathon_races_date_idx
  ON public.portal_marathon_races (race_date ASC, sort_order ASC);

CREATE INDEX IF NOT EXISTS portal_marathon_race_signups_race_idx
  ON public.portal_marathon_race_signups (race_id);

CREATE INDEX IF NOT EXISTS portal_marathon_race_signups_member_idx
  ON public.portal_marathon_race_signups (member_id);

ALTER TABLE public.portal_marathon_races ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_marathon_race_signups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS portal_marathon_races_read ON public.portal_marathon_races;
CREATE POLICY portal_marathon_races_read ON public.portal_marathon_races
  FOR SELECT TO authenticated
  USING (is_published = true OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'operator')
      AND p.approval_status = 'approved'
  ));

DROP POLICY IF EXISTS portal_marathon_races_staff_write ON public.portal_marathon_races;
CREATE POLICY portal_marathon_races_staff_write ON public.portal_marathon_races
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

DROP POLICY IF EXISTS portal_marathon_signups_read ON public.portal_marathon_race_signups;
CREATE POLICY portal_marathon_signups_read ON public.portal_marathon_race_signups
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS portal_marathon_signups_member_write ON public.portal_marathon_race_signups;
CREATE POLICY portal_marathon_signups_member_write ON public.portal_marathon_race_signups
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.members m
      WHERE m.id = member_id
        AND (m.auth_user_id = auth.uid() OR m.user_id = auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'operator')
        AND p.approval_status = 'approved'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.members m
      WHERE m.id = member_id
        AND (m.auth_user_id = auth.uid() OR m.user_id = auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'operator')
        AND p.approval_status = 'approved'
    )
  );

NOTIFY pgrst, 'reload schema';
