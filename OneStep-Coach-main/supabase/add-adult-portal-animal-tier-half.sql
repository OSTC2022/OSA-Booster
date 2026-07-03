-- 동물 등급 기준 절반 이벤트 (성인 러닝 포털)
ALTER TABLE public.center_settings
  ADD COLUMN IF NOT EXISTS adult_portal_animal_tier_half_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS adult_portal_animal_tier_half_start DATE,
  ADD COLUMN IF NOT EXISTS adult_portal_animal_tier_half_end DATE;

COMMENT ON COLUMN public.center_settings.adult_portal_animal_tier_half_enabled IS
  '동물 등급 기준 km를 절반으로 적용하는 이벤트 사용 여부';
COMMENT ON COLUMN public.center_settings.adult_portal_animal_tier_half_start IS
  '동물 등급 절반 이벤트 시작일 (미설정 시 켜져 있는 동안 항상 적용)';
COMMENT ON COLUMN public.center_settings.adult_portal_animal_tier_half_end IS
  '동물 등급 절반 이벤트 종료일 (미설정 시 켜져 있는 동안 항상 적용)';
