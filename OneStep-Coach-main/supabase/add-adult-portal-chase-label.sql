-- 이겨라 술래 이름 옆 배지 문구 (관리자 설정)
ALTER TABLE public.center_settings
  ADD COLUMN IF NOT EXISTS adult_portal_chase_label TEXT;

COMMENT ON COLUMN public.center_settings.adult_portal_chase_label IS
  '이겨라 탭 술래 이름 옆 배지 문구. 미설정 시 "이겨라".';

NOTIFY pgrst, 'reload schema';
