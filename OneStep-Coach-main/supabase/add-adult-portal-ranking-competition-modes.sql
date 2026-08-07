-- 성인 포털 랭킹 모드: 개인전 / 팀전 (중복 가능)
-- Supabase SQL Editor에서 실행

ALTER TABLE public.center_settings
  ADD COLUMN IF NOT EXISTS adult_portal_ranking_show_individual BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.center_settings
  ADD COLUMN IF NOT EXISTS adult_portal_ranking_show_team BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.center_settings.adult_portal_ranking_show_individual IS
  '성인 포털 랭킹에 개인전(마일리지·출석·이겨라·PB) 탭 표시';

COMMENT ON COLUMN public.center_settings.adult_portal_ranking_show_team IS
  '성인 포털 랭킹에 팀전 탭 표시';

NOTIFY pgrst, 'reload schema';
