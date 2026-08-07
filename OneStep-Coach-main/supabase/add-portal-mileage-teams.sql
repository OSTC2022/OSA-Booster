-- 마일리지 팀전
-- Supabase SQL Editor에서 실행

CREATE TABLE IF NOT EXISTS public.portal_mileage_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  color TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.portal_mileage_team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.portal_mileage_teams(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (team_id, member_id)
);

-- 한 회원은 한 팀에만 소속
CREATE UNIQUE INDEX IF NOT EXISTS portal_mileage_team_members_member_uidx
  ON public.portal_mileage_team_members (member_id);

CREATE INDEX IF NOT EXISTS portal_mileage_teams_active_sort_idx
  ON public.portal_mileage_teams (is_active, sort_order ASC, name ASC);

CREATE INDEX IF NOT EXISTS portal_mileage_team_members_team_idx
  ON public.portal_mileage_team_members (team_id);

ALTER TABLE public.portal_mileage_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_mileage_team_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS portal_mileage_teams_read ON public.portal_mileage_teams;
CREATE POLICY portal_mileage_teams_read ON public.portal_mileage_teams
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS portal_mileage_teams_staff_write ON public.portal_mileage_teams;
CREATE POLICY portal_mileage_teams_staff_write ON public.portal_mileage_teams
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

DROP POLICY IF EXISTS portal_mileage_team_members_read ON public.portal_mileage_team_members;
CREATE POLICY portal_mileage_team_members_read ON public.portal_mileage_team_members
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS portal_mileage_team_members_staff_write ON public.portal_mileage_team_members;
CREATE POLICY portal_mileage_team_members_staff_write ON public.portal_mileage_team_members
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
