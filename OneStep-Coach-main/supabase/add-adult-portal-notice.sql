-- 성인 러닝 포털 공지사항 (게임 룰·안내 문구)
ALTER TABLE public.center_settings
  ADD COLUMN IF NOT EXISTS adult_portal_notice TEXT;

COMMENT ON COLUMN public.center_settings.adult_portal_notice IS
  '성인 러닝 포털 공지사항. 훈련 스케줄 위 접이식 영역에 표시.';

NOTIFY pgrst, 'reload schema';
