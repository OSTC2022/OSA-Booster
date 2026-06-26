-- 성인 러닝 포털 랭킹 코치 배지 (관리자 승인)

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS portal_coach BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.members.portal_coach IS
  '성인 러닝 포털 랭킹에 Coach 배지 표시 (관리자 승인)';

NOTIFY pgrst, 'reload schema';
