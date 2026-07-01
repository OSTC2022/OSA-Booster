-- 성인 러닝 포털: 회원 상태 메시지 (랭킹 이름 옆 표시, 최대 10자)

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS portal_status_message TEXT;

COMMENT ON COLUMN public.members.portal_status_message IS
  '성인 러닝 포털 랭킹에 표시할 상태 메시지 (최대 10자)';

NOTIFY pgrst, 'reload schema';
