-- 성인 회원 포털: 내 회원 정보·오늘 관리 섹션 블라인드(숨김) 설정

ALTER TABLE public.center_settings
  ADD COLUMN IF NOT EXISTS adult_portal_blind_member_usage BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.center_settings.adult_portal_blind_member_usage IS
  '성인 회원 마이페이지에서 내 회원 정보·오늘 관리 섹션 숨김';

NOTIFY pgrst, 'reload schema';
