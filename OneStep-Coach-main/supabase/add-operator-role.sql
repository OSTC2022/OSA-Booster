-- 운영진(operator) 권한 추가

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'coach', 'member', 'guardian', 'adult_member', 'operator'));

CREATE OR REPLACE FUNCTION public.normalize_profile_role(p_role TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_role TEXT := lower(trim(COALESCE(p_role, 'member')));
BEGIN
  IF v_role = 'instructor' THEN
    RETURN 'coach';
  END IF;
  IF v_role IN ('member', 'members') THEN
    RETURN 'member';
  END IF;
  IF v_role IN ('admin', 'coach', 'member', 'guardian', 'adult_member', 'operator') THEN
    RETURN v_role;
  END IF;
  RETURN 'member';
END;
$$;

CREATE OR REPLACE FUNCTION public.normalize_users_table_role(p_role TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_role TEXT := lower(trim(COALESCE(p_role, 'member')));
BEGIN
  IF v_role IN ('member', 'members') THEN
    RETURN 'member';
  END IF;
  IF v_role IN ('instructor', 'coach') THEN
    RETURN 'instructor';
  END IF;
  IF v_role = 'admin' THEN
    RETURN 'admin';
  END IF;
  -- guardian, adult_member, operator 등은 legacy users 에 member 로 저장
  RETURN 'member';
END;
$$;

DROP POLICY IF EXISTS center_board_posts_member_read ON public.center_board_posts;
CREATE POLICY center_board_posts_member_read ON public.center_board_posts
  FOR SELECT TO authenticated
  USING (
    is_published = true
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND COALESCE(p.approval_status, 'approved') = 'approved'
        AND (
          (audience = 'general' AND p.role IN ('member', 'guardian', 'coach', 'admin'))
          OR (audience = 'adult' AND p.role IN ('adult_member', 'admin', 'operator'))
        )
    )
  );

NOTIFY pgrst, 'reload schema';
