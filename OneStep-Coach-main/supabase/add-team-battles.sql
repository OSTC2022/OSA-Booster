-- TEAM BATTLE (점수 컬럼 없음 — mileage logs가 source of truth)
-- Supabase SQL Editor에서 실행

CREATE TABLE IF NOT EXISTS public.team_battles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  start_at DATE NOT NULL,
  end_at DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'ended', 'archived')),
  assignment_mode TEXT NOT NULL DEFAULT 'balanced'
    CHECK (assignment_mode IN ('balanced', 'random')),
  scoring_mode TEXT NOT NULL DEFAULT 'average_distance'
    CHECK (scoring_mode IN ('average_distance', 'total_distance')),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT team_battles_date_range CHECK (end_at >= start_at)
);

CREATE TABLE IF NOT EXISTS public.team_battle_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  battle_id UUID NOT NULL REFERENCES public.team_battles(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  team_code TEXT NOT NULL CHECK (team_code IN ('RED', 'BLUE')),
  baseline_distance NUMERIC(10, 2) NOT NULL DEFAULT 0,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT team_battle_members_unique UNIQUE (battle_id, member_id)
);

CREATE INDEX IF NOT EXISTS team_battles_status_range_idx
  ON public.team_battles (status, start_at, end_at);

CREATE INDEX IF NOT EXISTS team_battle_members_battle_idx
  ON public.team_battle_members (battle_id, team_code);

CREATE INDEX IF NOT EXISTS team_battle_members_member_idx
  ON public.team_battle_members (member_id);

ALTER TABLE public.team_battles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_battle_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS team_battles_read ON public.team_battles;
CREATE POLICY team_battles_read ON public.team_battles
  FOR SELECT TO authenticated
  USING (
    status IN ('active', 'ended')
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'operator')
        AND p.approval_status = 'approved'
    )
  );

DROP POLICY IF EXISTS team_battles_staff_write ON public.team_battles;
CREATE POLICY team_battles_staff_write ON public.team_battles
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

DROP POLICY IF EXISTS team_battle_members_read ON public.team_battle_members;
CREATE POLICY team_battle_members_read ON public.team_battle_members
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.team_battles b
      WHERE b.id = battle_id
        AND (
          b.status IN ('active', 'ended')
          OR EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.role IN ('admin', 'operator')
              AND p.approval_status = 'approved'
          )
        )
    )
  );

DROP POLICY IF EXISTS team_battle_members_staff_write ON public.team_battle_members;
CREATE POLICY team_battle_members_staff_write ON public.team_battle_members
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
