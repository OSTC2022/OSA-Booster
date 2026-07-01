-- 성인 러닝 포털: 상태 메시지 색상 (본인 프로필에서 설정, HEX)

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS portal_status_message_color TEXT;

COMMENT ON COLUMN public.members.portal_status_message_color IS
  '성인 러닝 포털 상태 메시지 글자색 (예: #d9f99d)';

NOTIFY pgrst, 'reload schema';
