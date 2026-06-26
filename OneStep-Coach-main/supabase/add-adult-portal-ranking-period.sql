-- 성인 러닝 포털 마일리지·출석 랭킹 집계 기간 (관리자 설정)

ALTER TABLE public.center_settings
  ADD COLUMN IF NOT EXISTS adult_portal_ranking_period_start DATE,
  ADD COLUMN IF NOT EXISTS adult_portal_ranking_period_end DATE;

COMMENT ON COLUMN public.center_settings.adult_portal_ranking_period_start IS
  '마일리지·출석 랭킹 집계 시작일 (미설정 시 당월 1일)';
COMMENT ON COLUMN public.center_settings.adult_portal_ranking_period_end IS
  '마일리지·출석 랭킹 집계 종료일 (미설정 시 당월 말일)';

NOTIFY pgrst, 'reload schema';
