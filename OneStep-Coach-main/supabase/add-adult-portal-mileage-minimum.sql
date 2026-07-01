-- 성인 러닝 포털: 마일리지 최소 거리 인정 설정

ALTER TABLE public.center_settings
  ADD COLUMN IF NOT EXISTS adult_portal_mileage_min_km_enabled BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.center_settings
  ADD COLUMN IF NOT EXISTS adult_portal_mileage_min_km NUMERIC(5, 1) NOT NULL DEFAULT 3;

COMMENT ON COLUMN public.center_settings.adult_portal_mileage_min_km_enabled IS
  '마일리지 최소 거리 규칙 사용 여부';

COMMENT ON COLUMN public.center_settings.adult_portal_mileage_min_km IS
  '마일리지 인정 최소 거리(km). 설정값 이상만 랭킹·집계에 반영';

NOTIFY pgrst, 'reload schema';
