-- Achievement / Badge (영구 업적)
-- Supabase SQL Editor에서 실행

CREATE TABLE IF NOT EXISTS public.achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL
    CHECK (category IN (
      'RUNNING', 'MILESTONE', 'CONSISTENCY', 'MISSION', 'PB', 'SOCIAL', 'TEAM', 'MVP'
    )),
  criteria_type TEXT NOT NULL,
  target_value NUMERIC(12, 2),
  icon_key TEXT NOT NULL DEFAULT '🏅',
  tier TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.member_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  achievement_id UUID NOT NULL REFERENCES public.achievements(id) ON DELETE CASCADE,
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT member_achievements_unique UNIQUE (member_id, achievement_id)
);

CREATE INDEX IF NOT EXISTS member_achievements_member_idx
  ON public.member_achievements (member_id, unlocked_at DESC);

CREATE TABLE IF NOT EXISTS public.member_achievement_showcase (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  achievement_id UUID NOT NULL REFERENCES public.achievements(id) ON DELETE CASCADE,
  position SMALLINT NOT NULL CHECK (position BETWEEN 1 AND 3),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT member_achievement_showcase_slot UNIQUE (member_id, position),
  CONSTRAINT member_achievement_showcase_unique UNIQUE (member_id, achievement_id)
);

ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_achievement_showcase ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS achievements_read ON public.achievements;
CREATE POLICY achievements_read ON public.achievements
  FOR SELECT TO authenticated
  USING (is_active = TRUE OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'operator')
      AND p.approval_status = 'approved'
  ));

DROP POLICY IF EXISTS achievements_staff_write ON public.achievements;
CREATE POLICY achievements_staff_write ON public.achievements
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

DROP POLICY IF EXISTS member_achievements_select ON public.member_achievements;
CREATE POLICY member_achievements_select ON public.member_achievements
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

DROP POLICY IF EXISTS member_achievements_insert ON public.member_achievements;
CREATE POLICY member_achievements_insert ON public.member_achievements
  FOR INSERT TO authenticated
  WITH CHECK (
    public.running_league_member_owns_row(member_id)
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'operator')
        AND p.approval_status = 'approved'
    )
  );

DROP POLICY IF EXISTS member_achievements_staff_all ON public.member_achievements;
CREATE POLICY member_achievements_staff_all ON public.member_achievements
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

DROP POLICY IF EXISTS member_achievement_showcase_select ON public.member_achievement_showcase;
CREATE POLICY member_achievement_showcase_select ON public.member_achievement_showcase
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS member_achievement_showcase_write ON public.member_achievement_showcase;
CREATE POLICY member_achievement_showcase_write ON public.member_achievement_showcase
  FOR ALL TO authenticated
  USING (public.running_league_member_owns_row(member_id))
  WITH CHECK (public.running_league_member_owns_row(member_id));

-- Seed catalog (idempotent by code)
INSERT INTO public.achievements (
  code, title, description, category, criteria_type, target_value, icon_key, tier, sort_order
) VALUES
  ('FIRST_RUN', '첫 발걸음', '첫 러닝 기록 완료', 'RUNNING', 'first_run', 1, '🏃', NULL, 10),
  ('FIRST_5K', '5K FINISHER', '한 번의 러닝으로 5km 달성', 'RUNNING', 'single_distance', 5, '5️⃣', NULL, 20),
  ('FIRST_10K', '10K FINISHER', '한 번의 러닝으로 10km 달성', 'RUNNING', 'single_distance', 10, '🔟', NULL, 30),
  ('TOTAL_50K', '50K CLUB', '누적 거리 50km 달성', 'MILESTONE', 'total_distance', 50, '🏅', 'BRONZE', 40),
  ('TOTAL_100K', '100K CLUB', '누적 거리 100km 달성', 'MILESTONE', 'total_distance', 100, '🏅', 'SILVER', 50),
  ('TOTAL_300K', '300K CLUB', '누적 거리 300km 달성', 'MILESTONE', 'total_distance', 300, '🏅', 'GOLD', 60),
  ('TOTAL_500K', '500K CLUB', '누적 거리 500km 달성', 'MILESTONE', 'total_distance', 500, '🏅', 'PLATINUM', 70),
  ('TOTAL_1000K', '1000K CLUB', '누적 거리 1000km 달성', 'MILESTONE', 'total_distance', 1000, '🏅', 'LEGEND', 80),
  ('STREAK_4', '4 WEEK STREAK', '주간 목표 4주 연속 달성', 'CONSISTENCY', 'best_streak', 4, '🔥', NULL, 90),
  ('STREAK_8', '8 WEEK STREAK', '주간 목표 8주 연속 달성', 'CONSISTENCY', 'best_streak', 8, '🔥', NULL, 100),
  ('STREAK_12', '12 WEEK STREAK', '주간 목표 12주 연속 달성', 'CONSISTENCY', 'best_streak', 12, '🔥', NULL, 110),
  ('PERFECT_WEEK', 'PERFECT WEEK', '주간 미션 전체 완료', 'MISSION', 'perfect_week', 1, '🎯', NULL, 120),
  ('FIRST_PB', 'FIRST PB', '첫 PB 갱신', 'PB', 'first_pb', 1, '⚡', NULL, 130),
  ('FIRST_RIVAL', 'RIVAL', '라이벌 지정', 'SOCIAL', 'first_rival', 1, '⚔️', NULL, 140),
  ('TEAM_BATTLE_FIRST', 'TEAM PLAYER', '팀 배틀 참가', 'TEAM', 'team_battle', 1, '🔥', NULL, 150),
  ('MVP_FIRST', 'MVP', '주간 또는 월간 MVP 선정', 'MVP', 'mvp_first', 1, '🏆', NULL, 160)
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  criteria_type = EXCLUDED.criteria_type,
  target_value = EXCLUDED.target_value,
  icon_key = EXCLUDED.icon_key,
  tier = EXCLUDED.tier,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

NOTIFY pgrst, 'reload schema';
