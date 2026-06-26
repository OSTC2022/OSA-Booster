-- 성인 러닝 포털 설정 페이지(center_settings)에 필요한 컬럼 일괄 추가
-- Supabase 대시보드 → SQL Editor 에서 이 파일 전체를 실행하세요.

-- 연락처·위치
ALTER TABLE public.center_settings ADD COLUMN IF NOT EXISTS center_phone TEXT;
ALTER TABLE public.center_settings ADD COLUMN IF NOT EXISTS naver_place_url TEXT;
ALTER TABLE public.center_settings ADD COLUMN IF NOT EXISTS center_address TEXT;
ALTER TABLE public.center_settings ADD COLUMN IF NOT EXISTS business_hours TEXT;
ALTER TABLE public.center_settings ADD COLUMN IF NOT EXISTS show_instructor_contact BOOLEAN NOT NULL DEFAULT false;

-- 블라인드 회원 사용
ALTER TABLE public.center_settings
  ADD COLUMN IF NOT EXISTS adult_portal_blind_member_usage BOOLEAN NOT NULL DEFAULT false;

-- 포털 상단 문구·스타일
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

-- 마일리지·출석 집계 기간
ALTER TABLE public.center_settings
  ADD COLUMN IF NOT EXISTS adult_portal_ranking_period_start DATE,
  ADD COLUMN IF NOT EXISTS adult_portal_ranking_period_end DATE;

-- 이겨라 술래
ALTER TABLE public.center_settings
  ADD COLUMN IF NOT EXISTS adult_portal_chase_member_id UUID REFERENCES public.members(id) ON DELETE SET NULL;

-- 이겨라 배지 문구
ALTER TABLE public.center_settings
  ADD COLUMN IF NOT EXISTS adult_portal_chase_label TEXT;

-- 공지사항
ALTER TABLE public.center_settings
  ADD COLUMN IF NOT EXISTS adult_portal_notice TEXT;

NOTIFY pgrst, 'reload schema';
