-- 성인 러닝 포털 "이겨라" 술래(추격 대상) 회원 1명
ALTER TABLE public.center_settings
  ADD COLUMN IF NOT EXISTS adult_portal_chase_member_id UUID REFERENCES public.members(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.center_settings.adult_portal_chase_member_id IS
  '마일리지 챌린지 이겨라 이벤트 술래 회원 ID. 랭킹에 (이겨라) 표기·그래프 빨간색 강조.';

NOTIFY pgrst, 'reload schema';
