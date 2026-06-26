-- 성인 회원 포털 상단 브랜드 헤더 문구·스타일 설정

ALTER TABLE public.center_settings
  ADD COLUMN IF NOT EXISTS adult_portal_brand_eyebrow TEXT,
  ADD COLUMN IF NOT EXISTS adult_portal_brand_title TEXT,
  ADD COLUMN IF NOT EXISTS adult_portal_brand_eyebrow_color TEXT,
  ADD COLUMN IF NOT EXISTS adult_portal_brand_title_color TEXT,
  ADD COLUMN IF NOT EXISTS adult_portal_brand_eyebrow_size TEXT,
  ADD COLUMN IF NOT EXISTS adult_portal_brand_title_size TEXT,
  ADD COLUMN IF NOT EXISTS adult_portal_brand_eyebrow_weight TEXT,
  ADD COLUMN IF NOT EXISTS adult_portal_brand_title_weight TEXT,
  ADD COLUMN IF NOT EXISTS adult_portal_brand_hidden BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.center_settings.adult_portal_brand_eyebrow IS '성인 포털 상단 영문/보조 문구';
COMMENT ON COLUMN public.center_settings.adult_portal_brand_title IS '성인 포털 상단 제목';
COMMENT ON COLUMN public.center_settings.adult_portal_brand_hidden IS '성인 포털 상단 브랜드 헤더 숨김';

NOTIFY pgrst, 'reload schema';
