-- Minimal bootstrap: profiles + users + admin account (allakj@naver.com)
-- Run once in Supabase Dashboard → SQL Editor

CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'instructor', 'member')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'member'
    CHECK (role IN ('admin', 'coach', 'member', 'guardian')),
  approval_status TEXT NOT NULL DEFAULT 'approved'
    CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION public.normalize_users_table_role(p_role TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_role TEXT := lower(trim(COALESCE(p_role, 'member')));
BEGIN
  IF v_role IN ('member', 'members') THEN RETURN 'member'; END IF;
  IF v_role IN ('instructor', 'coach') THEN RETURN 'instructor'; END IF;
  IF v_role = 'admin' THEN RETURN 'admin'; END IF;
  IF v_role = 'guardian' THEN RETURN 'member'; END IF;
  RETURN 'member';
END;
$$;

CREATE OR REPLACE FUNCTION public.normalize_profile_role(p_role TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_role TEXT := lower(trim(COALESCE(p_role, 'member')));
BEGIN
  IF v_role = 'instructor' THEN RETURN 'coach'; END IF;
  IF v_role IN ('member', 'members') THEN RETURN 'member'; END IF;
  IF v_role IN ('admin', 'coach', 'member', 'guardian') THEN RETURN v_role; END IF;
  RETURN 'member';
END;
$$;

CREATE OR REPLACE FUNCTION public.current_profile_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.current_profile_role() = 'admin';
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_role TEXT;
  v_users_role TEXT;
  v_approval TEXT;
BEGIN
  v_profile_role := public.normalize_profile_role(NEW.raw_user_meta_data->>'role');
  v_users_role := public.normalize_users_table_role(v_profile_role);
  v_approval := lower(trim(COALESCE(NEW.raw_user_meta_data->>'approval_status', 'pending')));

  IF v_profile_role = 'admin' THEN
    v_approval := 'approved';
  ELSIF v_approval NOT IN ('pending', 'approved', 'rejected') THEN
    v_approval := 'pending';
  END IF;

  INSERT INTO public.profiles (id, email, full_name, role, approval_status)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    v_profile_role,
    v_approval
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(EXCLUDED.full_name, profiles.full_name),
    role = EXCLUDED.role,
    approval_status = EXCLUDED.approval_status,
    updated_at = NOW();

  INSERT INTO public.users (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    v_users_role
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user failed for %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_own_or_admin" ON public.profiles;
CREATE POLICY "profiles_select_own_or_admin" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "users_select_authenticated" ON public.users;
CREATE POLICY "users_select_authenticated" ON public.users
  FOR SELECT TO authenticated
  USING (true);

-- Admin account: allakj@naver.com
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
