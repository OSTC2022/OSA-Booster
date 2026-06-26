-- OSA_Booster 전용: 보호 관리자 계정 프로필 시드
-- auth.users에 allakj@naver.com 계정이 이미 있어야 합니다.
-- 없으면: node scripts/ensure-protected-admin.mjs allakj@naver.com <password> 관리자

INSERT INTO public.profiles (id, email, full_name, role, approval_status, updated_at)
SELECT
  u.id,
  u.email,
  COALESCE(u.raw_user_meta_data->>'full_name', '관리자'),
  'admin',
  'approved',
  NOW()
FROM auth.users u
WHERE lower(u.email) = 'allakj@naver.com'
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  full_name = EXCLUDED.full_name,
  role = 'admin',
  approval_status = 'approved',
  updated_at = NOW();

INSERT INTO public.users (id, email, full_name, role)
SELECT
  p.id,
  p.email,
  p.full_name,
  'admin'
FROM public.profiles p
WHERE lower(p.email) = 'allakj@naver.com'
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  full_name = EXCLUDED.full_name,
  role = 'admin';
