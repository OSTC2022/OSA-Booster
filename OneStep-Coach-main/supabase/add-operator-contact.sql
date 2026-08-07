-- 운영진 공개 연락처 (로그인 화면 마스코트용)
-- Supabase SQL Editor에서 실행

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS kakao_qr_url TEXT;

COMMENT ON COLUMN public.profiles.kakao_qr_url IS '운영진 카카오톡 QR 이미지 URL (공개 노출 가능)';

NOTIFY pgrst, 'reload schema';
