-- =============================================================================
-- OSA_Booster Supabase 초기화 SQL (안전 버전)
-- =============================================================================
-- 대상: OSA_Booster (새 프로젝트) ONLY
-- 금지: osa osa 운영 프로젝트에서 실행하지 마세요
-- 생성: node scripts/build-osa-booster-init.mjs
-- 포함: CREATE/ALTER/RLS/Storage bucket/함수 (DROP TABLE·DELETE·TRUNCATE 제외)
-- =============================================================================


-- >>> BEGIN schema.sql

-- OneStep Coach database schema
-- Run in Supabase Dashboard > SQL Editor

-- Users (linked to auth.users)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'instructor', 'member')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-create profile when a new auth user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'role', 'member')
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Instructors
CREATE TABLE IF NOT EXISTS public.instructors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  phone TEXT,
  kakao_id TEXT,
  instagram_id TEXT,
  speciality TEXT[] DEFAULT '{}',
  hourly_rate_weekday NUMERIC NOT NULL DEFAULT 30000,
  hourly_rate_weekend NUMERIC NOT NULL DEFAULT 40000,
  extra_member_rate NUMERIC NOT NULL DEFAULT 10000,
  calendar_color TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Members
CREATE TABLE IF NOT EXISTS public.members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  age INTEGER,
  birth_date DATE,
  grade TEXT,
  school TEXT,
  phone TEXT,
  parent_phone TEXT,
  kakao_id TEXT,
  instagram_id TEXT,
  sport TEXT,
  height_cm NUMERIC,
  weight_kg NUMERIC,
  bmi NUMERIC,
  goal TEXT,
  injury_history TEXT,
  memo TEXT,
  primary_instructor_id UUID REFERENCES public.instructors(id) ON DELETE SET NULL,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Session packages
CREATE TABLE IF NOT EXISTS public.session_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  total_sessions INTEGER NOT NULL,
  remaining_sessions INTEGER NOT NULL,
  price NUMERIC,
  paid_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  payment_method TEXT,
  note TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Signatures
CREATE TABLE IF NOT EXISTS public.signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  lesson_id UUID,
  signature_data TEXT NOT NULL,
  signed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Lessons
CREATE TABLE IF NOT EXISTS public.lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID REFERENCES public.members(id) ON DELETE CASCADE,
  instructor_id UUID REFERENCES public.instructors(id) ON DELETE SET NULL,
  session_package_id UUID REFERENCES public.session_packages(id) ON DELETE SET NULL,
  lesson_date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  lesson_type TEXT NOT NULL DEFAULT 'individual',
  title TEXT,
  content TEXT,
  special_note TEXT,
  attendance_status TEXT NOT NULL DEFAULT 'present' CHECK (attendance_status IN ('present', 'absent', 'makeup', 'cancelled')),
  session_deducted BOOLEAN NOT NULL DEFAULT FALSE,
  lesson_no INTEGER,
  signature_id UUID REFERENCES public.signatures(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL
);

ALTER TABLE public.signatures
  DROP CONSTRAINT IF EXISTS signatures_lesson_id_fkey;
ALTER TABLE public.signatures
  ADD CONSTRAINT signatures_lesson_id_fkey
  FOREIGN KEY (lesson_id) REFERENCES public.lessons(id) ON DELETE SET NULL;

-- Row Level Security
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instructors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read users"
  ON public.users FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile"
  ON public.users FOR UPDATE TO authenticated USING (auth.uid() = id);

CREATE POLICY "Authenticated users full access instructors"
  ON public.instructors FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users full access members"
  ON public.members FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users full access session_packages"
  ON public.session_packages FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users full access signatures"
  ON public.signatures FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users full access lessons"
  ON public.lessons FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- After running this schema, create an admin account:
-- 1. Supabase Dashboard > Authentication > Users > Add user
--    (email + password, check "Auto Confirm User")
-- 2. Run the SQL below with your user's UUID and email:
--
-- INSERT INTO public.users (id, email, full_name, role)
-- VALUES ('YOUR-USER-UUID', 'your@email.com', 'Admin', 'admin')
-- ON CONFLICT (id) DO UPDATE SET role = 'admin';

-- <<< END schema.sql


-- >>> BEGIN members.sql

-- 회원 테이블만 빠르게 생성 (Supabase Dashboard > SQL Editor에서 실행)
-- 전체 스키마는 supabase/schema.sql 참고

CREATE TABLE IF NOT EXISTS public.members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  name TEXT NOT NULL,
  age INTEGER,
  birth_date DATE,
  grade TEXT,
  phone TEXT,
  parent_phone TEXT,
  sport TEXT,
  height_cm NUMERIC,
  weight_kg NUMERIC,
  bmi NUMERIC,
  goal TEXT,
  injury_history TEXT,
  memo TEXT,
  primary_instructor_id UUID,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.members TO service_role;

DROP POLICY IF EXISTS "Authenticated users full access members" ON public.members;
CREATE POLICY "Authenticated users full access members"
  ON public.members FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- <<< END members.sql


-- >>> BEGIN add-auth-roles-mvp.sql

-- OneStep Coach: Auth / Roles / Sessions MVP
-- Run in Supabase Dashboard > SQL Editor (after schema.sql)
-- Does NOT drop existing tables — ALTER + CREATE only.

-- ---------------------------------------------------------------------------
-- 1. profiles (auth.users linked)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'member'
    CHECK (role IN ('admin', 'coach', 'member', 'guardian')),
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

-- Migrate legacy public.users → profiles (instructor → coach)
INSERT INTO public.profiles (id, email, full_name, role, created_at)
SELECT
  u.id,
  u.email,
  u.full_name,
  CASE
    WHEN u.role = 'instructor' THEN 'coach'
    WHEN u.role IN ('admin', 'coach', 'member', 'guardian') THEN u.role
    ELSE 'member'
  END,
  u.created_at
FROM public.users u
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  full_name = COALESCE(EXCLUDED.full_name, profiles.full_name),
  role = EXCLUDED.role;

-- Keep legacy public.users rows in sync (FK from instructors/members still reference users)
INSERT INTO public.users (id, email, full_name, role)
SELECT
  p.id,
  p.email,
  p.full_name,
  public.normalize_users_table_role(p.role)
FROM public.profiles p
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  full_name = EXCLUDED.full_name,
  role = EXCLUDED.role;

-- ---------------------------------------------------------------------------
-- 2. members: auth link + remaining_sessions cache
-- ---------------------------------------------------------------------------
ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS remaining_sessions INTEGER NOT NULL DEFAULT 0;

-- Sync auth_user_id from legacy user_id
UPDATE public.members
SET auth_user_id = user_id
WHERE auth_user_id IS NULL AND user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_members_auth_user_id ON public.members(auth_user_id);

-- Cache remaining_sessions from active packages
CREATE OR REPLACE FUNCTION public.sync_member_remaining_sessions(p_member_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.members m
  SET remaining_sessions = COALESCE((
    SELECT SUM(sp.remaining_sessions)::INTEGER
    FROM public.session_packages sp
    WHERE sp.member_id = p_member_id
      AND sp.is_active = TRUE
      AND sp.remaining_sessions > 0
  ), 0)
  WHERE m.id = p_member_id;
END;
$$;

-- Initial sync for all members
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.members LOOP
    PERFORM public.sync_member_remaining_sessions(r.id);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 3. lesson_sessions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lesson_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID REFERENCES public.lessons(id) ON DELETE SET NULL,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  instructor_id UUID REFERENCES public.instructors(id) ON DELETE SET NULL,
  session_package_id UUID REFERENCES public.session_packages(id) ON DELETE SET NULL,
  session_date DATE NOT NULL DEFAULT CURRENT_DATE,
  checked_in_at TIMESTAMPTZ,
  checked_in_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'present', 'absent', 'makeup', 'cancelled')),
  notes TEXT,
  signature_url TEXT,
  signature_data TEXT,
  session_deducted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lesson_sessions_member ON public.lesson_sessions(member_id);
CREATE INDEX IF NOT EXISTS idx_lesson_sessions_lesson ON public.lesson_sessions(lesson_id);
CREATE INDEX IF NOT EXISTS idx_lesson_sessions_date ON public.lesson_sessions(session_date);

-- ---------------------------------------------------------------------------
-- 4. session_transactions (+/- audit trail)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.session_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  session_package_id UUID REFERENCES public.session_packages(id) ON DELETE SET NULL,
  lesson_session_id UUID REFERENCES public.lesson_sessions(id) ON DELETE SET NULL,
  delta INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  reason TEXT NOT NULL,
  note TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_session_transactions_member ON public.session_transactions(member_id);

-- ---------------------------------------------------------------------------
-- 5. RLS helper functions
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_profile_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.current_member_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.members
  WHERE auth_user_id = auth.uid()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_instructor_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.instructors
  WHERE user_id = auth.uid()
  LIMIT 1;
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

CREATE OR REPLACE FUNCTION public.is_coach()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.current_profile_role() = 'coach';
$$;

-- ---------------------------------------------------------------------------
-- 6. Check-in RPC (attendance + deduct + transaction)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_in_lesson(
  p_lesson_id UUID,
  p_status TEXT DEFAULT 'present',
  p_signature_data TEXT DEFAULT NULL,
  p_signature_url TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_role TEXT;
  v_lesson RECORD;
  v_pkg RECORD;
  v_session_id UUID;
  v_new_remaining INTEGER;
  v_member_remaining INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', '로그인이 필요합니다.');
  END IF;

  v_role := public.current_profile_role();
  IF v_role NOT IN ('admin', 'coach') THEN
    RETURN jsonb_build_object('error', '출석 체크 권한이 없습니다.');
  END IF;

  SELECT l.* INTO v_lesson
  FROM public.lessons l
  WHERE l.id = p_lesson_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', '수업을 찾을 수 없습니다.');
  END IF;

  IF v_role = 'coach' THEN
    IF v_lesson.instructor_id IS DISTINCT FROM public.current_instructor_id() THEN
      RETURN jsonb_build_object('error', '담당 수업만 출석 처리할 수 있습니다.');
    END IF;
  END IF;

  IF v_lesson.member_id IS NULL THEN
    RETURN jsonb_build_object('error', '회원이 연결되지 않은 수업입니다.');
  END IF;

  -- Upsert lesson_sessions
  SELECT id INTO v_session_id
  FROM public.lesson_sessions
  WHERE lesson_id = p_lesson_id
  LIMIT 1;

  IF v_session_id IS NULL THEN
    INSERT INTO public.lesson_sessions (
      lesson_id, member_id, instructor_id, session_package_id,
      session_date, checked_in_at, checked_in_by, status,
      notes, signature_data, signature_url
    ) VALUES (
      p_lesson_id, v_lesson.member_id, v_lesson.instructor_id, v_lesson.session_package_id,
      v_lesson.lesson_date, NOW(), v_user_id, p_status,
      p_notes, p_signature_data, p_signature_url
    )
    RETURNING id INTO v_session_id;
  ELSE
    UPDATE public.lesson_sessions SET
      status = p_status,
      checked_in_at = NOW(),
      checked_in_by = v_user_id,
      notes = COALESCE(p_notes, notes),
      signature_data = COALESCE(p_signature_data, signature_data),
      signature_url = COALESCE(p_signature_url, signature_url),
      updated_at = NOW()
    WHERE id = v_session_id;
  END IF;

  -- Deduct session on present (once)
  IF p_status = 'present' AND NOT COALESCE(v_lesson.session_deducted, FALSE) THEN
    IF v_lesson.session_package_id IS NOT NULL THEN
      SELECT * INTO v_pkg
      FROM public.session_packages
      WHERE id = v_lesson.session_package_id
      FOR UPDATE;

      IF v_pkg.remaining_sessions <= 0 THEN
        RETURN jsonb_build_object('error', '남은 수업 횟수가 없습니다.');
      END IF;

      v_new_remaining := v_pkg.remaining_sessions - 1;

      UPDATE public.session_packages
      SET remaining_sessions = v_new_remaining,
          is_active = v_new_remaining > 0
      WHERE id = v_pkg.id;

      INSERT INTO public.session_transactions (
        member_id, session_package_id, lesson_session_id,
        delta, balance_after, reason, created_by
      ) VALUES (
        v_lesson.member_id, v_pkg.id, v_session_id,
        -1, v_new_remaining, 'lesson_check_in', v_user_id
      );

      UPDATE public.lesson_sessions
      SET session_deducted = TRUE
      WHERE id = v_session_id;

      PERFORM public.sync_member_remaining_sessions(v_lesson.member_id);
    END IF;

    UPDATE public.lessons
    SET attendance_status = p_status,
        session_deducted = TRUE
    WHERE id = p_lesson_id;
  ELSE
    UPDATE public.lessons
    SET attendance_status = p_status
    WHERE id = p_lesson_id;
  END IF;

  SELECT remaining_sessions INTO v_member_remaining
  FROM public.members WHERE id = v_lesson.member_id;

  RETURN jsonb_build_object(
    'success', TRUE,
    'lesson_session_id', v_session_id,
    'member_remaining_sessions', v_member_remaining
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_in_lesson TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_member_remaining_sessions TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. Auth trigger → profiles
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_role TEXT;
  v_users_role TEXT;
BEGIN
  v_profile_role := public.normalize_profile_role(
    COALESCE(NEW.raw_user_meta_data->>'role', 'member')
  );
  v_users_role := public.normalize_users_table_role(v_profile_role);

  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    v_profile_role
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(EXCLUDED.full_name, profiles.full_name),
    role = EXCLUDED.role;

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
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. RLS policies
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_transactions ENABLE ROW LEVEL SECURITY;

-- Drop permissive policies (if re-running)
DROP POLICY IF EXISTS "Authenticated users can read users" ON public.users;
DROP POLICY IF EXISTS "Authenticated users full access members" ON public.members;
DROP POLICY IF EXISTS "Authenticated users full access lessons" ON public.lessons;
DROP POLICY IF EXISTS "Authenticated users full access session_packages" ON public.session_packages;
DROP POLICY IF EXISTS "Authenticated users full access instructors" ON public.instructors;

-- profiles
DROP POLICY IF EXISTS "profiles_select_own_or_admin" ON public.profiles;
CREATE POLICY "profiles_select_own_or_admin" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- members
DROP POLICY IF EXISTS "members_admin_all" ON public.members;
CREATE POLICY "members_admin_all" ON public.members
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "members_coach_assigned" ON public.members;
CREATE POLICY "members_coach_assigned" ON public.members
  FOR SELECT TO authenticated
  USING (
    public.is_coach()
    AND primary_instructor_id = public.current_instructor_id()
  );

DROP POLICY IF EXISTS "members_self_read" ON public.members;
CREATE POLICY "members_self_read" ON public.members
  FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid());

-- lessons
DROP POLICY IF EXISTS "lessons_admin_all" ON public.lessons;
CREATE POLICY "lessons_admin_all" ON public.lessons
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "lessons_coach_own" ON public.lessons;
CREATE POLICY "lessons_coach_own" ON public.lessons
  FOR ALL TO authenticated
  USING (
    public.is_coach()
    AND instructor_id = public.current_instructor_id()
  )
  WITH CHECK (
    public.is_coach()
    AND instructor_id = public.current_instructor_id()
  );

DROP POLICY IF EXISTS "lessons_member_own" ON public.lessons;
CREATE POLICY "lessons_member_own" ON public.lessons
  FOR SELECT TO authenticated
  USING (member_id = public.current_member_id());

-- session_packages
DROP POLICY IF EXISTS "packages_admin_all" ON public.session_packages;
CREATE POLICY "packages_admin_all" ON public.session_packages
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "packages_member_read" ON public.session_packages;
CREATE POLICY "packages_member_read" ON public.session_packages
  FOR SELECT TO authenticated
  USING (member_id = public.current_member_id());

DROP POLICY IF EXISTS "packages_coach_read" ON public.session_packages;
CREATE POLICY "packages_coach_read" ON public.session_packages
  FOR SELECT TO authenticated
  USING (
    public.is_coach()
    AND member_id IN (
      SELECT id FROM public.members
      WHERE primary_instructor_id = public.current_instructor_id()
    )
  );

-- lesson_sessions
DROP POLICY IF EXISTS "lesson_sessions_admin" ON public.lesson_sessions;
CREATE POLICY "lesson_sessions_admin" ON public.lesson_sessions
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "lesson_sessions_coach" ON public.lesson_sessions;
CREATE POLICY "lesson_sessions_coach" ON public.lesson_sessions
  FOR ALL TO authenticated
  USING (
    public.is_coach()
    AND instructor_id = public.current_instructor_id()
  )
  WITH CHECK (
    public.is_coach()
    AND instructor_id = public.current_instructor_id()
  );

DROP POLICY IF EXISTS "lesson_sessions_member_read" ON public.lesson_sessions;
CREATE POLICY "lesson_sessions_member_read" ON public.lesson_sessions
  FOR SELECT TO authenticated
  USING (member_id = public.current_member_id());

-- session_transactions
DROP POLICY IF EXISTS "session_tx_admin" ON public.session_transactions;
CREATE POLICY "session_tx_admin" ON public.session_transactions
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "session_tx_member_read" ON public.session_transactions;
CREATE POLICY "session_tx_member_read" ON public.session_transactions
  FOR SELECT TO authenticated
  USING (member_id = public.current_member_id());

DROP POLICY IF EXISTS "session_tx_coach_read" ON public.session_transactions;
CREATE POLICY "session_tx_coach_read" ON public.session_transactions
  FOR SELECT TO authenticated
  USING (
    public.is_coach()
    AND member_id IN (
      SELECT id FROM public.members
      WHERE primary_instructor_id = public.current_instructor_id()
    )
  );

-- instructors: admin full, coach read self, members read own primary
DROP POLICY IF EXISTS "instructors_admin" ON public.instructors;
CREATE POLICY "instructors_admin" ON public.instructors
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "instructors_coach_self" ON public.instructors;
CREATE POLICY "instructors_coach_self" ON public.instructors
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "instructors_member_read" ON public.instructors;
CREATE POLICY "instructors_member_read" ON public.instructors
  FOR SELECT TO authenticated
  USING (
    id IN (
      SELECT primary_instructor_id FROM public.members
      WHERE auth_user_id = auth.uid()
    )
  );

-- <<< END add-auth-roles-mvp.sql


-- >>> BEGIN add-profile-approval.sql

-- 가입 승인: pending → 관리자 승인 후 접속
-- Supabase SQL Editor에서 실행

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'approved'
    CHECK (approval_status IN ('pending', 'approved', 'rejected'));

COMMENT ON COLUMN public.profiles.approval_status IS
  'pending: 승인 대기, approved: 접속 허용, rejected: 거절';

UPDATE public.profiles
SET approval_status = 'approved'
WHERE approval_status IS NULL;

-- 신규 가입 시 metadata·역할에 따라 승인 상태 설정
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
    approval_status = EXCLUDED.approval_status;

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

-- <<< END add-profile-approval.sql


-- >>> BEGIN fix-users-role-trigger.sql

-- Fix public.users role constraint violations (e.g. role = 'members')
-- Run in Supabase SQL Editor

-- 1) Normalize legacy role values for public.users CHECK constraint
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
  IF v_role = 'guardian' THEN
    RETURN 'member';
  END IF;
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
  IF v_role = 'instructor' THEN
    RETURN 'coach';
  END IF;
  IF v_role IN ('member', 'members') THEN
    RETURN 'member';
  END IF;
  IF v_role IN ('admin', 'coach', 'member', 'guardian') THEN
    RETURN v_role;
  END IF;
  RETURN 'member';
END;
$$;

-- 2) Auth trigger: profiles + legacy public.users (mapped roles)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_role TEXT;
  v_users_role TEXT;
BEGIN
  v_profile_role := public.normalize_profile_role(NEW.raw_user_meta_data->>'role');
  v_users_role := public.normalize_users_table_role(v_profile_role);

  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    v_profile_role
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(EXCLUDED.full_name, profiles.full_name),
    role = EXCLUDED.role;

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

-- 3) Repair bad rows already inserted
UPDATE public.users
SET role = public.normalize_users_table_role(role)
WHERE role IS DISTINCT FROM public.normalize_users_table_role(role);

UPDATE public.profiles
SET role = public.normalize_profile_role(role)
WHERE role IS DISTINCT FROM public.normalize_profile_role(role);

-- 4) Optional: store last invited email on member record
ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS invite_email TEXT;

-- <<< END fix-users-role-trigger.sql


-- >>> BEGIN add-profile-avatar-contact.sql

-- 프로필 사진 · 연락처 · SNS (profiles)
  -- Supabase SQL Editor에서 실행

  ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS avatar_url TEXT,
    ADD COLUMN IF NOT EXISTS phone TEXT,
    ADD COLUMN IF NOT EXISTS kakao_id TEXT,
    ADD COLUMN IF NOT EXISTS instagram_id TEXT;

  COMMENT ON COLUMN public.profiles.avatar_url IS '프로필 사진 URL (storage avatars 버킷)';
  COMMENT ON COLUMN public.profiles.phone IS '연락처';
  COMMENT ON COLUMN public.profiles.kakao_id IS '카카오톡 아이디';
  COMMENT ON COLUMN public.profiles.instagram_id IS '인스타그램 아이디';

  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES (
    'avatars',
    'avatars',
    true,
    2097152,
    ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
  )
  ON CONFLICT (id) DO UPDATE SET
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

  DROP POLICY IF EXISTS "avatars_public_read" ON storage.objects;
  CREATE POLICY "avatars_public_read" ON storage.objects
    FOR SELECT TO public
    USING (bucket_id = 'avatars');

  DROP POLICY IF EXISTS "avatars_insert_own" ON storage.objects;
  CREATE POLICY "avatars_insert_own" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
      bucket_id = 'avatars'
      AND (storage.foldername(name))[1] = auth.uid()::text
    );

  DROP POLICY IF EXISTS "avatars_update_own" ON storage.objects;
  CREATE POLICY "avatars_update_own" ON storage.objects
    FOR UPDATE TO authenticated
    USING (
      bucket_id = 'avatars'
      AND (storage.foldername(name))[1] = auth.uid()::text
    )
    WITH CHECK (
      bucket_id = 'avatars'
      AND (storage.foldername(name))[1] = auth.uid()::text
    );

  DROP POLICY IF EXISTS "avatars_delete_own" ON storage.objects;
  CREATE POLICY "avatars_delete_own" ON storage.objects
    FOR DELETE TO authenticated
    USING (
      bucket_id = 'avatars'
      AND (storage.foldername(name))[1] = auth.uid()::text
    );

  NOTIFY pgrst, 'reload schema';

-- <<< END add-profile-avatar-contact.sql


-- >>> BEGIN add-member-login-fields.sql

-- 회원 로그인 계정 연결 필드
-- supabase/add-auth-roles-mvp.sql, member-invite-flow.sql 실행 후 적용

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS member_login_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS member_invite_code TEXT,
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

COMMENT ON COLUMN public.members.member_login_enabled IS '회원/보호자 앱 로그인 활성화 여부';
COMMENT ON COLUMN public.members.member_invite_code IS '초대·연결 시 발급 코드 (선택)';
COMMENT ON COLUMN public.members.last_login_at IS '회원 계정 마지막 로그인 시각';

CREATE UNIQUE INDEX IF NOT EXISTS idx_members_member_invite_code
  ON public.members (member_invite_code)
  WHERE member_invite_code IS NOT NULL;

-- <<< END add-member-login-fields.sql


-- >>> BEGIN add-members-columns.sql

-- members 테이블 누락 컬럼 추가 (기존 테이블·데이터 유지)
-- Supabase Dashboard > SQL Editor에서 실행
--
-- 앱 코드 기준 (lib/actions/members.ts createMember/updateMember, Member 타입):
--   name, birth_date, age, grade, phone, parent_phone, sport,
--   height_cm, weight_kg, bmi, goal, injury_history, memo,
--   primary_instructor_id, registered_at, is_active, created_at, user_id

ALTER TABLE public.members ADD COLUMN IF NOT EXISTS user_id UUID;

ALTER TABLE public.members ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS age INTEGER;
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS birth_date DATE;
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS grade TEXT;
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS parent_phone TEXT;
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS sport TEXT;
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS height_cm NUMERIC;
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS weight_kg NUMERIC;
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS bmi NUMERIC;
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS goal TEXT;
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS injury_history TEXT;
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS memo TEXT;
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS primary_instructor_id UUID;

ALTER TABLE public.members ADD COLUMN IF NOT EXISTS registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

NOTIFY pgrst, 'reload schema';

-- <<< END add-members-columns.sql


-- >>> BEGIN add-age-column.sql

-- 기존 DB에 age 컬럼 추가 (Supabase SQL Editor에서 실행)
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS age INTEGER;

-- <<< END add-age-column.sql


-- >>> BEGIN add-member-gender-pb-distances.sql

-- 회원 성별(랭킹 필터) + PB 거리 half/full 확장
-- Supabase SQL Editor에서 실행

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS gender TEXT;

ALTER TABLE public.members DROP CONSTRAINT IF EXISTS members_gender_check;
ALTER TABLE public.members
  ADD CONSTRAINT members_gender_check
  CHECK (gender IS NULL OR gender IN ('male', 'female'));

COMMENT ON COLUMN public.members.gender IS 'male | female — 성인 러닝 랭킹 성별 필터용';

ALTER TABLE public.running_league_records DROP CONSTRAINT IF EXISTS running_league_records_distance_event_check;
ALTER TABLE public.running_league_records
  ADD CONSTRAINT running_league_records_distance_event_check
  CHECK (distance_event IN ('1km', '3km', '5km', '10km', 'half', 'full'));

NOTIFY pgrst, 'reload schema';

-- <<< END add-member-gender-pb-distances.sql


-- >>> BEGIN add-member-school.sql

-- 학교/소속팀 + 회원 본인 기본 정보 수정
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS school TEXT;

DROP POLICY IF EXISTS "members_self_update" ON public.members;
CREATE POLICY "members_self_update" ON public.members
  FOR UPDATE TO authenticated
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

-- <<< END add-member-school.sql


-- >>> BEGIN add-members-deleted-at.sql

-- 회원 휴지통(소프트 삭제) 컬럼
-- Supabase Dashboard > SQL Editor에서 실행

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS members_deleted_at_idx
  ON public.members (deleted_at)
  WHERE deleted_at IS NOT NULL;

NOTIFY pgrst, 'reload schema';

-- <<< END add-members-deleted-at.sql


-- >>> BEGIN member-invite-flow.sql

-- Member invite flow (email invitation via Supabase Auth Admin API)
-- Run in Supabase Dashboard > SQL Editor

-- Admin may update profiles when linking member login accounts
DROP POLICY IF EXISTS "profiles_admin_update" ON public.profiles;
CREATE POLICY "profiles_admin_update" ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Optional: track invited email on member record
ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS invite_email TEXT;

COMMENT ON COLUMN public.members.invite_email IS
  'Last email used for member app login invitation';

-- ---------------------------------------------------------------------------
-- Supabase Dashboard checklist (manual, not SQL):
-- 1. Authentication > URL Configuration
--    Site URL: https://your-domain.com (or http://localhost:3000)
--    Redirect URLs:
--      - http://localhost:3000/auth/callback
--      - http://localhost:3000/auth/callback/hash
--      - http://localhost:3000/auth/confirm
--      - http://localhost:3000/auth/set-password
--      - (production URLs with same paths)
-- 2. Authentication > Email Templates > Invite user
--    Ensure invite emails are enabled
-- 3. Add SUPABASE_SERVICE_ROLE_KEY to server env (.env.local)
-- 4. Add NEXT_PUBLIC_SITE_URL to env

-- <<< END member-invite-flow.sql


-- >>> BEGIN fix-member-self-read-rls.sql

-- 회원 로그인 후 본인 members 행 조회 (auth_user_id · user_id 모두 인식)
-- 마이페이지가 비어 보이거나 current_member_id()가 null일 때 실행

CREATE OR REPLACE FUNCTION public.current_member_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.members
  WHERE auth_user_id = auth.uid() OR user_id = auth.uid()
  LIMIT 1;
$$;

DROP POLICY IF EXISTS "members_self_read" ON public.members;
CREATE POLICY "members_self_read" ON public.members
  FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid() OR user_id = auth.uid());

DROP POLICY IF EXISTS "instructors_member_read" ON public.instructors;
CREATE POLICY "instructors_member_read" ON public.instructors
  FOR SELECT TO authenticated
  USING (
    id IN (
      SELECT primary_instructor_id FROM public.members
      WHERE auth_user_id = auth.uid() OR user_id = auth.uid()
    )
  );

NOTIFY pgrst, 'reload schema';

-- <<< END fix-member-self-read-rls.sql


-- >>> BEGIN fix-members-rls.sql

-- members 테이블 RLS — 관리자·강사 회원 등록·수정 허용
-- "row-level security" / 데이터베이스 권한 오류 시 Supabase SQL Editor에서 실행

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.members TO service_role;

-- is_admin: profiles·users·보호 관리자 이메일
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  )
  OR EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.role = 'admin'
  )
  OR EXISTS (
    SELECT 1 FROM auth.users au
    WHERE au.id = auth.uid()
      AND lower(trim(coalesce(au.email, ''))) IN ('allakj@naver.com')
  );
$$;

ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users full access members" ON public.members;
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.members;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.members;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON public.members;
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON public.members;
DROP POLICY IF EXISTS "members_select_authenticated" ON public.members;
DROP POLICY IF EXISTS "members_insert_authenticated" ON public.members;
DROP POLICY IF EXISTS "members_update_authenticated" ON public.members;
DROP POLICY IF EXISTS "members_delete_authenticated" ON public.members;
DROP POLICY IF EXISTS "members_admin_all" ON public.members;
DROP POLICY IF EXISTS "members_coach_assigned" ON public.members;
DROP POLICY IF EXISTS "members_coach_write" ON public.members;
DROP POLICY IF EXISTS "members_coach_update" ON public.members;
DROP POLICY IF EXISTS "members_self_read" ON public.members;

-- 관리자: 전체 CRUD
CREATE POLICY "members_admin_all" ON public.members
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 강사: 담당 회원 조회 + 신규 등록·수정 (앱에서 강사도 회원 등록)
CREATE POLICY "members_coach_assigned" ON public.members
  FOR SELECT TO authenticated
  USING (
    public.is_coach()
    AND primary_instructor_id = public.current_instructor_id()
  );

CREATE POLICY "members_coach_write" ON public.members
  FOR INSERT TO authenticated
  WITH CHECK (public.is_coach());

CREATE POLICY "members_coach_update" ON public.members
  FOR UPDATE TO authenticated
  USING (public.is_coach())
  WITH CHECK (public.is_coach());

-- 회원 본인 조회
CREATE POLICY "members_self_read" ON public.members
  FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid() OR user_id = auth.uid());

NOTIFY pgrst, 'reload schema';

-- <<< END fix-members-rls.sql


-- >>> BEGIN fix-instructors-rls.sql

-- 강사(instructors) RLS — 관리자 등록·수정 허용
-- "new row violates row-level security policy for table instructors" 발생 시 실행

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.instructors TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.instructors TO service_role;

-- is_admin: profiles·users·보호 관리자 이메일
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  )
  OR EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.role = 'admin'
  )
  OR EXISTS (
    SELECT 1 FROM auth.users au
    WHERE au.id = auth.uid()
      AND lower(trim(coalesce(au.email, ''))) IN ('allakj@naver.com')
  );
$$;

ALTER TABLE public.instructors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users full access instructors" ON public.instructors;
DROP POLICY IF EXISTS "instructors_admin" ON public.instructors;
DROP POLICY IF EXISTS "instructors_coach_self" ON public.instructors;
DROP POLICY IF EXISTS "instructors_member_read" ON public.instructors;

CREATE POLICY "instructors_admin" ON public.instructors
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "instructors_coach_self" ON public.instructors
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "instructors_member_read" ON public.instructors
  FOR SELECT TO authenticated
  USING (
    id IN (
      SELECT primary_instructor_id FROM public.members
      WHERE auth_user_id = auth.uid() OR user_id = auth.uid()
    )
  );

NOTIFY pgrst, 'reload schema';

-- <<< END fix-instructors-rls.sql


-- >>> BEGIN fix-lessons.sql

-- lessons · instructors 테이블·RLS (최소 버전)
-- Supabase SQL Editor에서 전체 선택 후 Run
-- members 테이블만 있어도 실행 가능합니다.

CREATE TABLE IF NOT EXISTS public.session_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  total_sessions INTEGER NOT NULL,
  remaining_sessions INTEGER NOT NULL,
  price NUMERIC,
  paid_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  payment_method TEXT,
  note TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.instructors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  name TEXT NOT NULL,
  phone TEXT,
  speciality TEXT[] DEFAULT '{}',
  hourly_rate_weekday NUMERIC NOT NULL DEFAULT 30000,
  hourly_rate_weekend NUMERIC NOT NULL DEFAULT 40000,
  extra_member_rate NUMERIC NOT NULL DEFAULT 10000,
  calendar_color TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID REFERENCES public.members(id) ON DELETE CASCADE,
  instructor_id UUID REFERENCES public.instructors(id) ON DELETE SET NULL,
  session_package_id UUID REFERENCES public.session_packages(id) ON DELETE SET NULL,
  lesson_date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  lesson_type TEXT NOT NULL DEFAULT 'individual',
  title TEXT,
  content TEXT,
  special_note TEXT,
  attendance_status TEXT NOT NULL DEFAULT 'present' CHECK (attendance_status IN ('present', 'absent', 'makeup', 'cancelled')),
  session_deducted BOOLEAN NOT NULL DEFAULT FALSE,
  lesson_no INTEGER,
  signature_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID
);

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.session_packages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.instructors TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.lessons TO authenticated;

ALTER TABLE public.session_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instructors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users full access session_packages" ON public.session_packages;
DROP POLICY IF EXISTS "Authenticated users full access instructors" ON public.instructors;
DROP POLICY IF EXISTS "Authenticated users full access lessons" ON public.lessons;

CREATE POLICY "Authenticated users full access session_packages"
  ON public.session_packages FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users full access instructors"
  ON public.instructors FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users full access lessons"
  ON public.lessons FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  lesson_id UUID REFERENCES public.lessons(id) ON DELETE SET NULL,
  signature_data TEXT NOT NULL,
  signed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'lessons_signature_id_fkey'
  ) THEN
    ALTER TABLE public.lessons
      ADD CONSTRAINT lessons_signature_id_fkey
      FOREIGN KEY (signature_id) REFERENCES public.signatures(id) ON DELETE SET NULL;
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.signatures TO authenticated;
ALTER TABLE public.signatures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users full access signatures" ON public.signatures;
CREATE POLICY "Authenticated users full access signatures"
  ON public.signatures FOR ALL TO authenticated USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';

-- 기존 DB: 강사 캘린더 색상 컬럼
ALTER TABLE public.instructors
  ADD COLUMN IF NOT EXISTS calendar_color TEXT;

-- 기존 DB: 회원 없는 캘린더 일정
ALTER TABLE public.lessons
  ALTER COLUMN member_id DROP NOT NULL;

ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS title TEXT;

-- <<< END fix-lessons.sql


-- >>> BEGIN fix-lessons-rls.sql

-- lessons RLS — 관리자·강사 캘린더 수업 등록·수정 허용
-- "row-level security policy for table lessons" 오류 시 실행

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.lessons TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.lessons TO service_role;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  )
  OR EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.role = 'admin'
  )
  OR EXISTS (
    SELECT 1 FROM auth.users au
    WHERE au.id = auth.uid()
      AND lower(trim(coalesce(au.email, ''))) IN ('allakj@naver.com')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_coach()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'coach'
  )
  OR EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.role IN ('coach', 'instructor')
  );
$$;

ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users full access lessons" ON public.lessons;
DROP POLICY IF EXISTS "lessons_admin_all" ON public.lessons;
DROP POLICY IF EXISTS "lessons_coach_own" ON public.lessons;
DROP POLICY IF EXISTS "lessons_coach_all" ON public.lessons;
DROP POLICY IF EXISTS "lessons_member_own" ON public.lessons;

CREATE POLICY "lessons_admin_all" ON public.lessons
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 강사: 캘린더 전체 관리 (자율배정·타 강사 일정 포함)
CREATE POLICY "lessons_coach_all" ON public.lessons
  FOR ALL TO authenticated
  USING (public.is_coach())
  WITH CHECK (public.is_coach());

CREATE POLICY "lessons_member_own" ON public.lessons
  FOR SELECT TO authenticated
  USING (member_id = public.current_member_id());

NOTIFY pgrst, 'reload schema';

-- <<< END fix-lessons-rls.sql


-- >>> BEGIN add-lesson-title.sql

-- 회원 없이 캘린더 일정 추가 (표시 이름)
ALTER TABLE public.lessons
  ALTER COLUMN member_id DROP NOT NULL;

ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS title TEXT;

COMMENT ON COLUMN public.lessons.title IS '회원 미연결 시 캘린더 표시 이름';

NOTIFY pgrst, 'reload schema';

-- <<< END add-lesson-title.sql


-- >>> BEGIN add-lesson-recurrence.sql

-- 반복 수업 시리즈 연결
-- Supabase SQL Editor에서 실행

ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS recurrence_group_id UUID,
  ADD COLUMN IF NOT EXISTS recurrence_pattern TEXT;

CREATE INDEX IF NOT EXISTS idx_lessons_recurrence_group_date
  ON public.lessons (recurrence_group_id, lesson_date)
  WHERE recurrence_group_id IS NOT NULL;

-- <<< END add-lesson-recurrence.sql


-- >>> BEGIN add-calendar-recurrence-v2.sql

-- Calendar recurrence v2: recurring master + exception model (Google Calendar / Apple Calendar style)
-- Run in Supabase SQL Editor after add-lesson-recurrence.sql
-- google_event_id: 아래 ALTER에 포함 (Google Calendar 미연동 시에도 #21에서 안전 실행)

ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS event_type TEXT NOT NULL DEFAULT 'single'
    CHECK (event_type IN ('single', 'recurring_master', 'exception', 'materialized')),
  ADD COLUMN IF NOT EXISTS recurrence TEXT[],
  ADD COLUMN IF NOT EXISTS recurring_master_id UUID REFERENCES public.lessons(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS google_calendar_id TEXT,
  ADD COLUMN IF NOT EXISTS google_ical_uid TEXT,
  ADD COLUMN IF NOT EXISTS google_recurring_event_id TEXT,
  ADD COLUMN IF NOT EXISTS google_event_id TEXT,
  ADD COLUMN IF NOT EXISTS original_start_time TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS event_timezone TEXT,
  ADD COLUMN IF NOT EXISTS event_status TEXT NOT NULL DEFAULT 'confirmed'
    CHECK (event_status IN ('confirmed', 'cancelled'));

CREATE INDEX IF NOT EXISTS idx_lessons_event_type ON public.lessons (event_type);
CREATE INDEX IF NOT EXISTS idx_lessons_recurring_master_id ON public.lessons (recurring_master_id);
CREATE INDEX IF NOT EXISTS idx_lessons_recurring_master_range ON public.lessons (event_type, lesson_date)
  WHERE event_type = 'recurring_master';
CREATE INDEX IF NOT EXISTS idx_lessons_google_recurring_event_id
  ON public.lessons (google_recurring_event_id)
  WHERE google_recurring_event_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_lessons_google_recurring_instance
  ON public.lessons (google_recurring_event_id, original_start_time)
  WHERE google_recurring_event_id IS NOT NULL
    AND original_start_time IS NOT NULL
    AND event_type = 'exception';

-- Legacy materialized rows (recurrence_group_id set, multiple rows per series)
UPDATE public.lessons
SET event_type = 'materialized'
WHERE event_type = 'single'
  AND recurrence_group_id IS NOT NULL
  AND recurrence_pattern IS NOT NULL
  AND google_event_id IS NULL;

-- Google-synced instance rows → keep as materialized until next sync consolidates to master
UPDATE public.lessons
SET event_type = 'materialized'
WHERE event_type = 'single'
  AND google_event_id IS NOT NULL
  AND recurrence_group_id IS NOT NULL;

COMMENT ON COLUMN public.lessons.event_type IS 'single | recurring_master | exception | materialized(legacy)';
COMMENT ON COLUMN public.lessons.recurrence IS 'RRULE/EXDATE/RDATE lines for recurring_master';
COMMENT ON COLUMN public.lessons.recurring_master_id IS 'Parent master for exception rows';
COMMENT ON COLUMN public.lessons.original_start_time IS 'Original occurrence start for Google/app exceptions';

-- <<< END add-calendar-recurrence-v2.sql


-- >>> BEGIN add-lesson-calendar-display.sql

-- 캘린더 표시 텍스트·글자 크기
ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS calendar_font_size REAL;

COMMENT ON COLUMN public.lessons.title IS '캘린더 표시 텍스트 (회원 연결 시에도 사용 가능)';
COMMENT ON COLUMN public.lessons.calendar_font_size IS '캘린더 블록 글자 크기(px)';

NOTIFY pgrst, 'reload schema';

-- <<< END add-lesson-calendar-display.sql


-- >>> BEGIN fix-check-in-lesson.sql

-- check_in_lesson 출석 권한 — 관리자·강사 허용 (자율배정 수업 포함)
-- "출석 체크 권한이 없습니다." 오류 시 실행

CREATE OR REPLACE FUNCTION public.current_profile_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT role FROM public.profiles WHERE id = auth.uid()),
    (SELECT role FROM public.users WHERE id = auth.uid()),
    'member'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  )
  OR EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.role = 'admin'
  )
  OR EXISTS (
    SELECT 1 FROM auth.users au
    WHERE au.id = auth.uid()
      AND lower(trim(coalesce(au.email, ''))) IN ('allakj@naver.com')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_coach()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'coach'
  )
  OR EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.role IN ('coach', 'instructor')
  );
$$;

CREATE OR REPLACE FUNCTION public.check_in_lesson(
  p_lesson_id UUID,
  p_status TEXT DEFAULT 'present',
  p_signature_data TEXT DEFAULT NULL,
  p_signature_url TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_lesson RECORD;
  v_pkg RECORD;
  v_session_id UUID;
  v_new_remaining INTEGER;
  v_member_remaining INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', '로그인이 필요합니다.');
  END IF;

  IF NOT (public.is_admin() OR public.is_coach()) THEN
    RETURN jsonb_build_object('error', '출석 체크 권한이 없습니다.');
  END IF;

  SELECT l.* INTO v_lesson
  FROM public.lessons l
  WHERE l.id = p_lesson_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', '수업을 찾을 수 없습니다.');
  END IF;

  IF v_lesson.member_id IS NULL THEN
    RETURN jsonb_build_object('error', '회원이 연결되지 않은 수업입니다.');
  END IF;

  SELECT id INTO v_session_id
  FROM public.lesson_sessions
  WHERE lesson_id = p_lesson_id
  LIMIT 1;

  IF v_session_id IS NULL THEN
    INSERT INTO public.lesson_sessions (
      lesson_id, member_id, instructor_id, session_package_id,
      session_date, checked_in_at, checked_in_by, status,
      notes, signature_data, signature_url
    ) VALUES (
      p_lesson_id, v_lesson.member_id, v_lesson.instructor_id, v_lesson.session_package_id,
      v_lesson.lesson_date, NOW(), v_user_id, p_status,
      p_notes, p_signature_data, p_signature_url
    )
    RETURNING id INTO v_session_id;
  ELSE
    UPDATE public.lesson_sessions SET
      status = p_status,
      checked_in_at = NOW(),
      checked_in_by = v_user_id,
      notes = COALESCE(p_notes, notes),
      signature_data = COALESCE(p_signature_data, signature_data),
      signature_url = COALESCE(p_signature_url, signature_url),
      updated_at = NOW()
    WHERE id = v_session_id;
  END IF;

  IF p_status = 'present' AND NOT COALESCE(v_lesson.session_deducted, FALSE) THEN
    IF v_lesson.session_package_id IS NOT NULL THEN
      SELECT * INTO v_pkg
      FROM public.session_packages
      WHERE id = v_lesson.session_package_id
      FOR UPDATE;

      IF v_pkg.remaining_sessions <= 0 THEN
        RETURN jsonb_build_object('error', '남은 수업 횟수가 없습니다.');
      END IF;

      v_new_remaining := v_pkg.remaining_sessions - 1;

      UPDATE public.session_packages
      SET remaining_sessions = v_new_remaining,
          is_active = v_new_remaining > 0
      WHERE id = v_pkg.id;

      INSERT INTO public.session_transactions (
        member_id, session_package_id, lesson_session_id,
        delta, balance_after, reason, created_by
      ) VALUES (
        v_lesson.member_id, v_pkg.id, v_session_id,
        -1, v_new_remaining, 'lesson_check_in', v_user_id
      );

      UPDATE public.lesson_sessions
      SET session_deducted = TRUE
      WHERE id = v_session_id;

      PERFORM public.sync_member_remaining_sessions(v_lesson.member_id);
    END IF;

    UPDATE public.lessons
    SET attendance_status = p_status,
        session_deducted = TRUE
    WHERE id = p_lesson_id;
  ELSE
    UPDATE public.lessons
    SET attendance_status = p_status
    WHERE id = p_lesson_id;
  END IF;

  SELECT remaining_sessions INTO v_member_remaining
  FROM public.members WHERE id = v_lesson.member_id;

  RETURN jsonb_build_object(
    'success', TRUE,
    'lesson_session_id', v_session_id,
    'member_remaining_sessions', v_member_remaining
  );
END;
$$;

NOTIFY pgrst, 'reload schema';

-- <<< END fix-check-in-lesson.sql


-- >>> BEGIN fix-session-packages.sql

-- session_packages 테이블·RLS 설정
-- 수업권 저장 실패 시 Supabase SQL Editor에서 실행

CREATE TABLE IF NOT EXISTS public.session_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  total_sessions INTEGER NOT NULL,
  remaining_sessions INTEGER NOT NULL,
  price NUMERIC,
  paid_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  payment_method TEXT,
  note TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.session_packages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.session_packages TO service_role;

ALTER TABLE public.session_packages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users full access session_packages" ON public.session_packages;
DROP POLICY IF EXISTS "session_packages_select_authenticated" ON public.session_packages;
DROP POLICY IF EXISTS "session_packages_insert_authenticated" ON public.session_packages;
DROP POLICY IF EXISTS "session_packages_update_authenticated" ON public.session_packages;
DROP POLICY IF EXISTS "session_packages_delete_authenticated" ON public.session_packages;

CREATE POLICY "Authenticated users full access session_packages"
  ON public.session_packages
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

NOTIFY pgrst, 'reload schema';

-- <<< END fix-session-packages.sql


-- >>> BEGIN fix-session-packages-rls.sql

-- session_packages RLS — 관리자 수업권 등록·수정 허용
-- "row-level security policy for table session_packages" 오류 시 실행

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.session_packages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.session_packages TO service_role;

-- is_admin (fix-members-rls.sql 과 동일 — 이미 있으면 덮어씀)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  )
  OR EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.role = 'admin'
  )
  OR EXISTS (
    SELECT 1 FROM auth.users au
    WHERE au.id = auth.uid()
      AND lower(trim(coalesce(au.email, ''))) IN ('allakj@naver.com')
  );
$$;

ALTER TABLE public.session_packages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users full access session_packages" ON public.session_packages;
DROP POLICY IF EXISTS "packages_admin_all" ON public.session_packages;
DROP POLICY IF EXISTS "packages_member_read" ON public.session_packages;
DROP POLICY IF EXISTS "packages_coach_read" ON public.session_packages;

CREATE POLICY "packages_admin_all" ON public.session_packages
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "packages_member_read" ON public.session_packages
  FOR SELECT TO authenticated
  USING (
    member_id IN (
      SELECT id FROM public.members
      WHERE user_id = auth.uid() OR auth_user_id = auth.uid()
    )
  );

CREATE POLICY "packages_coach_read" ON public.session_packages
  FOR SELECT TO authenticated
  USING (
    member_id IN (
      SELECT id FROM public.members
      WHERE primary_instructor_id IN (
        SELECT id FROM public.instructors WHERE user_id = auth.uid()
      )
    )
  );

-- session_transactions (수업권 등록 시 함께 기록)
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.session_transactions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.session_transactions TO service_role;

ALTER TABLE public.session_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "session_tx_admin" ON public.session_transactions;
DROP POLICY IF EXISTS "Authenticated users full access session_transactions" ON public.session_transactions;

CREATE POLICY "session_tx_admin" ON public.session_transactions
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

NOTIFY pgrst, 'reload schema';

-- <<< END fix-session-packages-rls.sql


-- >>> BEGIN add-session-packages-deleted-at.sql

-- 수업권 휴지통 (소프트 삭제)
ALTER TABLE public.session_packages
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS session_packages_deleted_at_idx
  ON public.session_packages (deleted_at)
  WHERE deleted_at IS NOT NULL;

-- 휴지통에 있는 수업권은 잔여 회차 합산에서 제외
CREATE OR REPLACE FUNCTION public.sync_member_remaining_sessions(p_member_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.members m
  SET remaining_sessions = COALESCE((
    SELECT SUM(sp.remaining_sessions)::INTEGER
    FROM public.session_packages sp
    WHERE sp.member_id = p_member_id
      AND sp.is_active = TRUE
      AND sp.remaining_sessions > 0
      AND sp.deleted_at IS NULL
  ), 0)
  WHERE m.id = p_member_id;
END;
$$;

-- <<< END add-session-packages-deleted-at.sql


-- >>> BEGIN add-signatures.sql

-- 서명(signatures) 테이블 — 수업 종료 시 서명 저장
-- Supabase SQL Editor에서 전체 선택 후 Run

CREATE TABLE IF NOT EXISTS public.signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  lesson_id UUID REFERENCES public.lessons(id) ON DELETE SET NULL,
  signature_data TEXT NOT NULL,
  signed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- lessons.signature_id 컬럼 (없으면 추가)
ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS signature_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'lessons_signature_id_fkey'
  ) THEN
    ALTER TABLE public.lessons
      ADD CONSTRAINT lessons_signature_id_fkey
      FOREIGN KEY (signature_id) REFERENCES public.signatures(id) ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE public.signatures
  DROP CONSTRAINT IF EXISTS signatures_lesson_id_fkey;
ALTER TABLE public.signatures
  ADD CONSTRAINT signatures_lesson_id_fkey
  FOREIGN KEY (lesson_id) REFERENCES public.lessons(id) ON DELETE SET NULL;

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.signatures TO authenticated;

ALTER TABLE public.signatures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users full access signatures" ON public.signatures;
CREATE POLICY "Authenticated users full access signatures"
  ON public.signatures FOR ALL TO authenticated USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';

-- <<< END add-signatures.sql


-- >>> BEGIN add-instructor-calendar-color.sql

-- 강사별 캘린더 색상
ALTER TABLE public.instructors
  ADD COLUMN IF NOT EXISTS calendar_color TEXT;

COMMENT ON COLUMN public.instructors.calendar_color IS 'Hex color for calendar lesson blocks (#38BDF8 etc.)';

-- <<< END add-instructor-calendar-color.sql


-- >>> BEGIN add-instructor-pay-overrides.sql

-- 강사료 타임별 관리자 수동 조정 (강사는 조회만)
CREATE TABLE IF NOT EXISTS public.instructor_pay_slot_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id UUID NOT NULL REFERENCES public.instructors(id) ON DELETE CASCADE,
  slot_key TEXT NOT NULL,
  pay_amount NUMERIC NOT NULL CHECK (pay_amount >= 0),
  member_count INTEGER CHECK (member_count IS NULL OR member_count >= 1),
  note TEXT,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (instructor_id, slot_key)
);

CREATE INDEX IF NOT EXISTS idx_instructor_pay_slot_overrides_instructor
  ON public.instructor_pay_slot_overrides (instructor_id);

ALTER TABLE public.instructor_pay_slot_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS instructor_pay_slot_overrides_select ON public.instructor_pay_slot_overrides;
CREATE POLICY instructor_pay_slot_overrides_select ON public.instructor_pay_slot_overrides
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS instructor_pay_slot_overrides_admin_write ON public.instructor_pay_slot_overrides;
CREATE POLICY instructor_pay_slot_overrides_admin_write ON public.instructor_pay_slot_overrides
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- <<< END add-instructor-pay-overrides.sql


-- >>> BEGIN add-sns-accounts.sql

-- 회원 프로필 확장 (학교/소속팀 + 카카오톡·인스타그램)

ALTER TABLE public.members ADD COLUMN IF NOT EXISTS school TEXT;
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS kakao_id TEXT;
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS instagram_id TEXT;

ALTER TABLE public.instructors ADD COLUMN IF NOT EXISTS kakao_id TEXT;
ALTER TABLE public.instructors ADD COLUMN IF NOT EXISTS instagram_id TEXT;
ALTER TABLE public.instructors ADD COLUMN IF NOT EXISTS blog_url TEXT;

CREATE TABLE IF NOT EXISTS public.center_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  name TEXT NOT NULL DEFAULT '센터',
  kakao_id TEXT,
  instagram_id TEXT,
  blog_url TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.center_settings (id, name)
VALUES ('default', '센터')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.center_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "center_settings_read" ON public.center_settings;
CREATE POLICY "center_settings_read" ON public.center_settings
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "center_settings_admin_write" ON public.center_settings;
CREATE POLICY "center_settings_admin_write" ON public.center_settings
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

GRANT SELECT ON TABLE public.center_settings TO authenticated;
GRANT ALL ON TABLE public.center_settings TO authenticated;
GRANT ALL ON TABLE public.center_settings TO service_role;

DROP POLICY IF EXISTS "members_self_update" ON public.members;
CREATE POLICY "members_self_update" ON public.members
  FOR UPDATE TO authenticated
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

NOTIFY pgrst, 'reload schema';

-- <<< END add-sns-accounts.sql


-- >>> BEGIN add-center-contact-fields.sql

-- 센터 연락·위치 정보 (회원 마이페이지 "코치 & 센터 연락")

ALTER TABLE public.center_settings ADD COLUMN IF NOT EXISTS center_phone TEXT;
ALTER TABLE public.center_settings ADD COLUMN IF NOT EXISTS naver_place_url TEXT;
ALTER TABLE public.center_settings ADD COLUMN IF NOT EXISTS center_address TEXT;
ALTER TABLE public.center_settings ADD COLUMN IF NOT EXISTS business_hours TEXT;
ALTER TABLE public.center_settings ADD COLUMN IF NOT EXISTS show_instructor_contact BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.center_settings.center_phone IS '센터 대표 전화 (회원 포털 tel: 링크)';
COMMENT ON COLUMN public.center_settings.naver_place_url IS '네이버 플레이스 URL';
COMMENT ON COLUMN public.center_settings.center_address IS '센터 주소 (표시용)';
COMMENT ON COLUMN public.center_settings.business_hours IS '운영 시간 (표시용)';
COMMENT ON COLUMN public.center_settings.show_instructor_contact IS '회원 포털에 담당 코치 전화 노출 여부';

NOTIFY pgrst, 'reload schema';

-- <<< END add-center-contact-fields.sql


-- >>> BEGIN add-blog-url.sql

-- 강사·센터 블로그 URL

ALTER TABLE public.instructors ADD COLUMN IF NOT EXISTS blog_url TEXT;
ALTER TABLE public.center_settings ADD COLUMN IF NOT EXISTS blog_url TEXT;

NOTIFY pgrst, 'reload schema';

-- <<< END add-blog-url.sql


-- >>> BEGIN add-center-board-posts.sql

-- 센터 공지사항 · 이벤트 게시판 (회원 포털 헤더)

CREATE TABLE IF NOT EXISTS public.center_board_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL CHECK (kind IN ('notice', 'event')),
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  link_url TEXT,
  event_starts_at TIMESTAMPTZ,
  event_ends_at TIMESTAMPTZ,
  is_published BOOLEAN NOT NULL DEFAULT true,
  pinned BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS center_board_posts_list_idx
  ON public.center_board_posts (kind, is_published, pinned DESC, created_at DESC);

ALTER TABLE public.center_board_posts ENABLE ROW LEVEL SECURITY;

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
    )
  );

DROP POLICY IF EXISTS center_board_posts_admin_all ON public.center_board_posts;
CREATE POLICY center_board_posts_admin_all ON public.center_board_posts
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

COMMENT ON TABLE public.center_board_posts IS '회원 포털 공지사항·이벤트 게시글';
COMMENT ON COLUMN public.center_board_posts.kind IS 'notice | event';

NOTIFY pgrst, 'reload schema';

-- <<< END add-center-board-posts.sql


-- >>> BEGIN add-adult-member-role-and-board-audience.sql

-- 성인회원 권한 + 성인 전용 공지·이벤트 게시판

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'coach', 'member', 'guardian', 'adult_member'));

ALTER TABLE public.center_board_posts
  ADD COLUMN IF NOT EXISTS audience TEXT NOT NULL DEFAULT 'general';

ALTER TABLE public.center_board_posts DROP CONSTRAINT IF EXISTS center_board_posts_audience_check;
ALTER TABLE public.center_board_posts
  ADD CONSTRAINT center_board_posts_audience_check
  CHECK (audience IN ('general', 'adult'));

ALTER TABLE public.center_board_posts
  ADD COLUMN IF NOT EXISTS event_subtype TEXT;

ALTER TABLE public.center_board_posts DROP CONSTRAINT IF EXISTS center_board_posts_event_subtype_check;
ALTER TABLE public.center_board_posts
  ADD CONSTRAINT center_board_posts_event_subtype_check
  CHECK (event_subtype IS NULL OR event_subtype IN ('mileage_challenge', 'running_league'));

ALTER TABLE public.center_board_posts
  ADD COLUMN IF NOT EXISTS challenge_goal_km NUMERIC;

CREATE INDEX IF NOT EXISTS center_board_posts_audience_idx
  ON public.center_board_posts (audience, kind, is_published, pinned DESC, created_at DESC);

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
          OR (audience = 'adult' AND p.role IN ('adult_member', 'admin'))
        )
    )
  );

COMMENT ON COLUMN public.center_board_posts.audience IS 'general | adult — 노출 대상';
COMMENT ON COLUMN public.center_board_posts.event_subtype IS 'mileage_challenge 등 이벤트 유형';
COMMENT ON COLUMN public.center_board_posts.challenge_goal_km IS '마일리지 챌린지 목표(km)';

NOTIFY pgrst, 'reload schema';

-- <<< END add-adult-member-role-and-board-audience.sql


-- >>> BEGIN add-member-body-records.sql

-- 회원 체중·신체 변화 이력 (그래프용)
-- Supabase SQL Editor에서 실행

CREATE TABLE IF NOT EXISTS public.member_body_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  recorded_at DATE NOT NULL DEFAULT (CURRENT_DATE),
  weight_kg NUMERIC NOT NULL CHECK (weight_kg > 0 AND weight_kg < 500),
  height_cm NUMERIC,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_member_body_records_member_date
  ON public.member_body_records (member_id, recorded_at ASC);

COMMENT ON TABLE public.member_body_records IS '회원 체중 변화 추적 (신체 변화 그래프)';

ALTER TABLE public.member_body_records ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.member_body_records TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.member_body_records TO service_role;

DROP POLICY IF EXISTS "member_body_records_admin_all" ON public.member_body_records;
DROP POLICY IF EXISTS "member_body_records_coach_read" ON public.member_body_records;
DROP POLICY IF EXISTS "member_body_records_coach_write" ON public.member_body_records;

CREATE POLICY "member_body_records_admin_all" ON public.member_body_records
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "member_body_records_coach_read" ON public.member_body_records
  FOR SELECT TO authenticated
  USING (
    public.is_coach()
    AND EXISTS (
      SELECT 1 FROM public.members m
      WHERE m.id = member_body_records.member_id
        AND m.primary_instructor_id = public.current_instructor_id()
    )
  );

CREATE POLICY "member_body_records_coach_write" ON public.member_body_records
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_coach()
    AND EXISTS (
      SELECT 1 FROM public.members m
      WHERE m.id = member_body_records.member_id
        AND m.primary_instructor_id = public.current_instructor_id()
    )
  );

-- <<< END add-member-body-records.sql


-- >>> BEGIN add-member-body-records-self-rls.sql

-- 회원 본인 신체·컨디션 기록 RLS
-- supabase/add-member-body-records.sql 실행 후 적용

DROP POLICY IF EXISTS "member_body_records_self_read" ON public.member_body_records;
DROP POLICY IF EXISTS "member_body_records_self_insert" ON public.member_body_records;
DROP POLICY IF EXISTS "member_body_records_self_update" ON public.member_body_records;
DROP POLICY IF EXISTS "member_body_records_self_delete" ON public.member_body_records;

CREATE POLICY "member_body_records_self_read" ON public.member_body_records
  FOR SELECT TO authenticated
  USING (
    member_id = public.current_member_id()
  );

CREATE POLICY "member_body_records_self_insert" ON public.member_body_records
  FOR INSERT TO authenticated
  WITH CHECK (
    member_id = public.current_member_id()
  );

CREATE POLICY "member_body_records_self_update" ON public.member_body_records
  FOR UPDATE TO authenticated
  USING (
    member_id = public.current_member_id()
  )
  WITH CHECK (
    member_id = public.current_member_id()
  );

CREATE POLICY "member_body_records_self_delete" ON public.member_body_records
  FOR DELETE TO authenticated
  USING (
    member_id = public.current_member_id()
  );

-- <<< END add-member-body-records-self-rls.sql


-- >>> BEGIN add-member-body-baseline-date.sql

-- 신체정보 초기 설정 날짜 (등록일과 별도, 관리자만 조정)
ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS body_baseline_recorded_at DATE;

COMMENT ON COLUMN public.members.body_baseline_recorded_at IS '신체정보 초기 설정 기준일 (미설정 시 registered_at 사용)';

-- <<< END add-member-body-baseline-date.sql


-- >>> BEGIN add-member-body-nutrition-fields.sql

-- 신체 기록 — 회복 & 영양 체크 (nullable)
-- supabase/add-member-body-wellness-fields.sql 실행 후 적용

ALTER TABLE public.member_body_records
  ADD COLUMN IF NOT EXISTS protein_status TEXT,
  ADD COLUMN IF NOT EXISTS post_workout_meal_status TEXT,
  ADD COLUMN IF NOT EXISTS hydration_status TEXT,
  ADD COLUMN IF NOT EXISTS supplement_status JSONB,
  ADD COLUMN IF NOT EXISTS nutrition_note TEXT;

COMMENT ON COLUMN public.member_body_records.protein_status IS 'sufficient | normal | insufficient';
COMMENT ON COLUMN public.member_body_records.post_workout_meal_status IS 'done | normal | missed';
COMMENT ON COLUMN public.member_body_records.hydration_status IS 'sufficient | normal | insufficient';
COMMENT ON COLUMN public.member_body_records.supplement_status IS '선수별 영양제 복용 상태 jsonb';
COMMENT ON COLUMN public.member_body_records.nutrition_note IS '회복·영양 메모 (선택)';

-- <<< END add-member-body-nutrition-fields.sql


-- >>> BEGIN add-member-body-wellness-fields.sql

-- 신체 기록 — 수면·컨디션·피로 등 선택 입력 (버튼 값)
-- supabase/add-member-body-records.sql 실행 후 적용

ALTER TABLE public.member_body_records
  ADD COLUMN IF NOT EXISTS sleep_hours TEXT,
  ADD COLUMN IF NOT EXISTS condition TEXT,
  ADD COLUMN IF NOT EXISTS fatigue TEXT,
  ADD COLUMN IF NOT EXISTS muscle_soreness TEXT,
  ADD COLUMN IF NOT EXISTS pain_area TEXT,
  ADD COLUMN IF NOT EXISTS meal_status TEXT;

COMMENT ON COLUMN public.member_body_records.sleep_hours IS 'under_6 | 6_7 | 7_8 | over_8';
COMMENT ON COLUMN public.member_body_records.condition IS 'good | normal | bad';
COMMENT ON COLUMN public.member_body_records.fatigue IS 'low | normal | high';
COMMENT ON COLUMN public.member_body_records.muscle_soreness IS 'none | mild | severe';
COMMENT ON COLUMN public.member_body_records.pain_area IS 'none | knee | shoulder | back | ankle | other';
COMMENT ON COLUMN public.member_body_records.meal_status IS 'good | normal | poor';

-- <<< END add-member-body-wellness-fields.sql


-- >>> BEGIN add-member-pain-detail-fields.sql

-- 통증 부위 상세 — 통증 정도(1~10) · 기타 부위 직접 입력
-- supabase/add-member-body-wellness-fields.sql 실행 후 적용

ALTER TABLE public.member_body_records
  ADD COLUMN IF NOT EXISTS pain_level SMALLINT,
  ADD COLUMN IF NOT EXISTS pain_area_note TEXT;

COMMENT ON COLUMN public.member_body_records.pain_level IS '통증 정도 1~10 (없음 제외 부위 선택 시)';
COMMENT ON COLUMN public.member_body_records.pain_area_note IS '통증 부위 기타(other) 직접 입력';

-- <<< END add-member-pain-detail-fields.sql


-- >>> BEGIN add-member-protein-tracking.sql

-- 단백질 목표·섭취 자동 계산 (nullable)
-- supabase/add-member-body-nutrition-fields.sql 실행 후 적용

ALTER TABLE public.member_body_records
  ADD COLUMN IF NOT EXISTS protein_target_g NUMERIC,
  ADD COLUMN IF NOT EXISTS protein_intake_g NUMERIC,
  ADD COLUMN IF NOT EXISTS protein_goal_multiplier NUMERIC;

COMMENT ON COLUMN public.member_body_records.protein_target_g IS '기록 당시 하루 단백질 목표(g)';
COMMENT ON COLUMN public.member_body_records.protein_intake_g IS '오늘 단백질 섭취량(g)';
COMMENT ON COLUMN public.member_body_records.protein_goal_multiplier IS '기록 당시 체중×계수';

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS protein_goal_multiplier NUMERIC DEFAULT 1.5,
  ADD COLUMN IF NOT EXISTS protein_goal_mode TEXT DEFAULT 'training';

COMMENT ON COLUMN public.members.protein_goal_multiplier IS '단백질 목표 계수 (기본 1.5)';
COMMENT ON COLUMN public.members.protein_goal_mode IS 'basic | training | high_intensity | recovery';

-- <<< END add-member-protein-tracking.sql


-- >>> BEGIN add-member-protein-intake-by-slot.sql

-- 시간대별 단백질 섭취 (아침·점심·저녁·운동 전/후·간식)
-- supabase/add-member-protein-tracking.sql 실행 후 적용

ALTER TABLE public.member_body_records
  ADD COLUMN IF NOT EXISTS protein_intake_by_slot JSONB;

COMMENT ON COLUMN public.member_body_records.protein_intake_by_slot IS '시간대별 단백질 섭취(g) — breakfast/lunch/dinner/pre_workout/post_workout/snack';

-- <<< END add-member-protein-intake-by-slot.sql


-- >>> BEGIN add-member-body-share-token.sql

-- 회원 신체·컨디션 그래프 외부 공유 링크 (토큰 URL, 읽기 전용)
ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS body_share_token TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_members_body_share_token
  ON public.members (body_share_token)
  WHERE body_share_token IS NOT NULL;

COMMENT ON COLUMN public.members.body_share_token IS '신체·컨디션 그래프 공유 URL용 비공개 토큰';

-- <<< END add-member-body-share-token.sql


-- >>> BEGIN add-member-backup-settings.sql

-- 회원 데이터 Google Drive 백업 설정

CREATE TABLE IF NOT EXISTS public.member_backup_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  enabled BOOLEAN NOT NULL DEFAULT true,
  drive_folder_id TEXT,
  drive_folder_name TEXT,
  last_run_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_error TEXT,
  last_file_id TEXT,
  last_file_name TEXT,
  last_file_url TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.member_backup_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS member_backup_settings_admin_all ON public.member_backup_settings;
CREATE POLICY member_backup_settings_admin_all ON public.member_backup_settings
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

INSERT INTO public.member_backup_settings (id, enabled)
VALUES ('default', true)
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE public.member_backup_settings IS '회원·세션·출석 Excel Google Drive 백업 상태';

NOTIFY pgrst, 'reload schema';

-- <<< END add-member-backup-settings.sql


-- >>> BEGIN add-member-backup-auto-date.sql

-- 자정(KST) 자동 백업 — 하루 1회만 실행 (업로드 전용)

ALTER TABLE public.member_backup_settings
  ADD COLUMN IF NOT EXISTS last_auto_backup_date TEXT;

COMMENT ON COLUMN public.member_backup_settings.last_auto_backup_date IS
  'KST 기준 yyyy-MM-dd — cron 자동 백업 성공일 (하루 1회)';

NOTIFY pgrst, 'reload schema';

-- <<< END add-member-backup-auto-date.sql


-- >>> BEGIN add-food-items.sql

-- 식품 영양 DB (음식 검색)
-- 별도 Supabase 프로젝트를 쓰는 경우 FOOD_DATABASE_URL / FOOD_DATABASE_ANON_KEY 로 연결

CREATE TABLE IF NOT EXISTS public.food_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  serving_label TEXT NOT NULL DEFAULT '100g',
  serving_size_g NUMERIC NOT NULL DEFAULT 100,
  calories_kcal NUMERIC,
  carbs_g NUMERIC,
  protein_g NUMERIC,
  fat_g NUMERIC,
  is_public BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_food_items_name ON public.food_items (name);

ALTER TABLE public.food_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "food_items_select_public" ON public.food_items;
CREATE POLICY "food_items_select_public"
  ON public.food_items FOR SELECT
  TO authenticated
  USING (is_public = true OR created_by = auth.uid());

DROP POLICY IF EXISTS "food_items_insert_own" ON public.food_items;
CREATE POLICY "food_items_insert_own"
  ON public.food_items FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid() OR created_by IS NULL);

COMMENT ON TABLE public.food_items IS '음식 검색 · 단백질 보충용 영양 DB';

-- 전체 카탈로그(125종+)는 seed-food-catalog.sql 실행

-- 기본 식품 (중복 방지)
INSERT INTO public.food_items (name, serving_label, serving_size_g, calories_kcal, carbs_g, protein_g, fat_g, is_public)
SELECT * FROM (VALUES
  ('계란', '1개(50g)', 50, 78, 0.6, 6, 5.3, true),
  ('닭가슴살', '100g', 100, 165, 0, 31, 3.6, true),
  ('소고기(등심)', '100g', 100, 250, 0, 26, 15, true),
  ('돼지고기(안심)', '100g', 100, 143, 0, 21, 6, true),
  ('연어', '100g', 100, 208, 0, 20, 13, true),
  ('참치(캔)', '100g', 100, 116, 0, 26, 1, true),
  ('고등어', '100g', 100, 205, 0, 19, 14, true),
  ('두부', '100g', 100, 76, 1.9, 8, 4.8, true),
  ('우유', '200ml', 200, 130, 10, 6.6, 7, true),
  ('그릭요거트', '150g', 150, 130, 6, 15, 4, true),
  ('프로틴(1회)', '30g', 30, 120, 3, 24, 1.5, true),
  ('설렁탕', '100g', 100, 45, 2, 4.5, 2, true),
  ('곰탕면', '100g', 100, 95, 16, 5, 1.5, true),
  ('도가니탕', '100g', 100, 62, 0.5, 12, 1.2, true),
  ('삼계탕', '100g', 100, 120, 1, 14, 6, true),
  ('밥', '1공기(210g)', 210, 310, 68, 5.5, 0.6, true),
  ('현미밥', '1공기(210g)', 210, 290, 60, 6.2, 1.8, true),
  ('새우', '100g', 100, 99, 0.2, 24, 0.3, true),
  ('오징어', '100g', 100, 92, 3.1, 16, 1.4, true),
  ('렌틸콩', '100g', 100, 116, 20, 9, 0.4, true),
  ('오트밀', '100g', 100, 389, 66, 17, 7, true),
  ('바나나', '1개(120g)', 120, 105, 27, 1.3, 0.4, true),
  ('아몬드', '30g', 30, 174, 6, 6, 15, true),
  ('슬라이스 치즈', '1장(20g)', 20, 70, 0.4, 4.2, 5.6, true),
  ('김치찌개', '100g', 100, 45, 4, 3.5, 2, true),
  ('된장찌개', '100g', 100, 55, 5, 4, 2.5, true),
  ('닭볶음탕', '100g', 100, 130, 8, 14, 5, true),
  ('제육볶음', '100g', 100, 180, 6, 16, 10, true),
  ('불고기', '100g', 100, 190, 8, 18, 9, true),
  ('계란찜', '100g', 100, 110, 2, 10, 7, true)
) AS seed(name, serving_label, serving_size_g, calories_kcal, carbs_g, protein_g, fat_g, is_public)
WHERE NOT EXISTS (SELECT 1 FROM public.food_items LIMIT 1);

-- <<< END add-food-items.sql


-- >>> BEGIN add-google-calendar-sync.sql

-- Google Calendar → 원스텝 코치 수업 동기화 (센터 공용)
-- Supabase SQL Editor에서 실행

CREATE TABLE IF NOT EXISTS public.google_calendar_sync (
  id TEXT PRIMARY KEY DEFAULT 'default',
  connected_email TEXT,
  refresh_token TEXT,
  calendar_id TEXT,
  calendar_name TEXT,
  sync_token TEXT,
  watch_channel_id TEXT,
  watch_resource_id TEXT,
  watch_expiration TIMESTAMPTZ,
  sync_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  last_synced_at TIMESTAMPTZ,
  last_sync_error TEXT,
  pending_member_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS google_event_id TEXT,
  ADD COLUMN IF NOT EXISTS google_sync_status TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS lessons_google_event_id_unique
  ON public.lessons (google_event_id)
  WHERE google_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS lessons_google_sync_pending_idx
  ON public.lessons (google_sync_status)
  WHERE google_sync_status = 'pending_member';

ALTER TABLE public.google_calendar_sync ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read google calendar sync"
  ON public.google_calendar_sync;

CREATE POLICY "Authenticated users can read google calendar sync"
  ON public.google_calendar_sync FOR SELECT TO authenticated USING (true);

-- <<< END add-google-calendar-sync.sql


-- >>> BEGIN add-google-calendar-oauth-state.sql

-- Google OAuth state (쿠키 대신 DB 저장 — invalid state 방지)
ALTER TABLE public.google_calendar_sync
  ADD COLUMN IF NOT EXISTS oauth_state TEXT,
  ADD COLUMN IF NOT EXISTS oauth_state_expires_at TIMESTAMPTZ;

-- <<< END add-google-calendar-oauth-state.sql


-- >>> BEGIN add-google-calendar-sync-v2.sql

-- Google Calendar 동기화 상태·중복 방지 (v2)
-- Supabase SQL Editor에서 실행

ALTER TABLE public.google_calendar_sync
  ADD COLUMN IF NOT EXISTS last_sync_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sync_status TEXT,
  ADD COLUMN IF NOT EXISTS sync_status_detail TEXT;

ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS google_account_id TEXT;

-- 기존 단일 google_event_id 인덱스 → 복합 unique 로 교체
DROP INDEX IF EXISTS public.lessons_google_event_id_unique;

CREATE UNIQUE INDEX IF NOT EXISTS lessons_google_sync_unique
  ON public.lessons (google_account_id, google_calendar_id, google_event_id)
  WHERE google_event_id IS NOT NULL
    AND google_calendar_id IS NOT NULL
    AND google_account_id IS NOT NULL;

-- google_event_id 단독 중복 방지 (account/calendar 미기록 레거시 행용)
CREATE UNIQUE INDEX IF NOT EXISTS lessons_google_event_id_unique
  ON public.lessons (google_event_id)
  WHERE google_event_id IS NOT NULL
    AND (google_account_id IS NULL OR google_calendar_id IS NULL);

-- <<< END add-google-calendar-sync-v2.sql


-- >>> BEGIN add-google-calendar-sync-lesson2.sql

-- Google Calendar 「수업2」 캘린더 추가 연동
-- Supabase SQL Editor에서 add-google-calendar-sync.sql 실행 후 이 파일을 실행하세요.

ALTER TABLE public.google_calendar_sync
  ADD COLUMN IF NOT EXISTS calendar_id_2 TEXT,
  ADD COLUMN IF NOT EXISTS calendar_name_2 TEXT,
  ADD COLUMN IF NOT EXISTS sync_token_2 TEXT,
  ADD COLUMN IF NOT EXISTS watch_channel_id_2 TEXT,
  ADD COLUMN IF NOT EXISTS watch_resource_id_2 TEXT,
  ADD COLUMN IF NOT EXISTS watch_expiration_2 TIMESTAMPTZ;

-- <<< END add-google-calendar-sync-lesson2.sql


-- >>> BEGIN add-google-calendar-bidirectional-sync.sql

-- Google Calendar 양방향 동기화 (최근 수정 우선)
-- Supabase SQL Editor에서 실행

ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS app_modified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS google_event_updated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS lessons_app_modified_at_idx
  ON public.lessons (app_modified_at DESC)
  WHERE app_modified_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS lessons_google_push_pending_idx
  ON public.lessons (lesson_date)
  WHERE google_event_id IS NULL
    AND app_modified_at IS NOT NULL;

-- <<< END add-google-calendar-bidirectional-sync.sql


-- >>> BEGIN add-running-league-tables.sql

-- ONE STEP RUNNING LEAGUE — 성인 러닝 리그 운영 테이블 (선수 챌린지와 분리)

CREATE TABLE IF NOT EXISTS public.running_leagues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  starts_at DATE NOT NULL,
  ends_at DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'closed')),
  board_post_id UUID REFERENCES public.center_board_posts(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ends_at >= starts_at)
);

CREATE TABLE IF NOT EXISTS public.running_league_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID NOT NULL REFERENCES public.running_leagues(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  goal_level TEXT,
  personal_goal TEXT,
  attendance_score NUMERIC(5, 2) NOT NULL DEFAULT 0,
  goal_score NUMERIC(5, 2) NOT NULL DEFAULT 0,
  record_score NUMERIC(5, 2) NOT NULL DEFAULT 0,
  mileage_score NUMERIC(5, 2) NOT NULL DEFAULT 0,
  recovery_score NUMERIC(5, 2) NOT NULL DEFAULT 0,
  mileage_km NUMERIC(8, 2) NOT NULL DEFAULT 0,
  record_baseline TEXT,
  record_current TEXT,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (league_id, member_id)
);

CREATE INDEX IF NOT EXISTS running_leagues_status_idx
  ON public.running_leagues (status, starts_at DESC);

CREATE INDEX IF NOT EXISTS running_league_participants_league_idx
  ON public.running_league_participants (league_id);

CREATE INDEX IF NOT EXISTS running_league_participants_member_idx
  ON public.running_league_participants (member_id);

ALTER TABLE public.running_leagues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.running_league_participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS running_leagues_admin_all ON public.running_leagues;
CREATE POLICY running_leagues_admin_all ON public.running_leagues
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS running_league_participants_admin_all ON public.running_league_participants;
CREATE POLICY running_league_participants_admin_all ON public.running_league_participants
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS running_leagues_member_read ON public.running_leagues;
CREATE POLICY running_leagues_member_read ON public.running_leagues
  FOR SELECT TO authenticated
  USING (
    status IN ('active', 'closed')
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND COALESCE(p.approval_status, 'approved') = 'approved'
    )
  );

DROP POLICY IF EXISTS running_league_participants_member_read ON public.running_league_participants;
CREATE POLICY running_league_participants_member_read ON public.running_league_participants
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.members m
      WHERE m.id = running_league_participants.member_id
        AND (m.auth_user_id = auth.uid() OR m.user_id = auth.uid())
    )
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND COALESCE(p.approval_status, 'approved') = 'approved'
    )
  );

DROP POLICY IF EXISTS running_league_participants_leaderboard_read ON public.running_league_participants;
CREATE POLICY running_league_participants_leaderboard_read ON public.running_league_participants
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.running_leagues l
      WHERE l.id = running_league_participants.league_id
        AND l.status IN ('active', 'closed')
    )
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND COALESCE(p.approval_status, 'approved') = 'approved'
    )
  );

COMMENT ON TABLE public.running_leagues IS '성인 ONE STEP RUNNING LEAGUE 시즌';
COMMENT ON TABLE public.running_league_participants IS '러닝 리그 참가자·점수';

NOTIFY pgrst, 'reload schema';

-- <<< END add-running-league-tables.sql


-- >>> BEGIN expand-running-league-schema.sql

-- ONE STEP RUNNING LEAGUE — 스키마 확장
-- 기존 running_leagues / running_league_participants 를 유지하고 보조 테이블을 추가합니다.
-- (사용자 예시의 running_challenges 등은 아래 COMMENT 매핑 참고)
--
-- 매핑:
--   running_leagues              ≈ running_challenges
--   running_league_participants  ≈ running_challenge_participants
--   running_league_goals         ≈ running_challenge_goals
--   running_league_records       ≈ running_challenge_records
--   running_league_mileage_logs  ≈ running_challenge_mileage
--   running_league_recovery_logs ≈ running_challenge_recovery_logs
--   running_league_score_snapshots ≈ running_challenge_scores
--   running_league_awards        ≈ running_challenge_awards
--   running_league_reports       ≈ running_challenge_reports

-- ---------------------------------------------------------------------------
-- 1. 기존 테이블 확장
-- ---------------------------------------------------------------------------

ALTER TABLE public.running_leagues
  ADD COLUMN IF NOT EXISTS audience TEXT NOT NULL DEFAULT 'adult';

ALTER TABLE public.running_leagues DROP CONSTRAINT IF EXISTS running_leagues_audience_check;
ALTER TABLE public.running_leagues
  ADD CONSTRAINT running_leagues_audience_check
  CHECK (audience IN ('adult'));

COMMENT ON COLUMN public.running_leagues.audience IS 'adult 전용 — 선수 성장 챌린지와 분리';
COMMENT ON COLUMN public.running_leagues.status IS 'draft=예정, active=진행중, closed=종료';

ALTER TABLE public.running_league_participants
  ADD COLUMN IF NOT EXISTS coach_comment TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS goal_achievement_rate NUMERIC(5, 2);

COMMENT ON COLUMN public.running_league_participants.notes IS '관리자 내부 메모';
COMMENT ON COLUMN public.running_league_participants.coach_comment IS '회원 리포트에 노출되는 코치 코멘트';
COMMENT ON COLUMN public.running_league_participants.goal_achievement_rate IS '목표 달성률 0~100';
COMMENT ON COLUMN public.running_league_participants.mileage_km IS '월 누적 거리(km), 80km 이상 만점(100점)';

-- 총점: 앱과 동일한 가중치 (30/25/20/15/10)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'running_league_participants'
      AND column_name = 'total_score'
  ) THEN
    ALTER TABLE public.running_league_participants
      ADD COLUMN total_score NUMERIC(6, 2) GENERATED ALWAYS AS (
        ROUND(
          LEAST(GREATEST(attendance_score, 0), 100) * 0.30 +
          LEAST(GREATEST(goal_score, 0), 100) * 0.25 +
          LEAST(GREATEST(record_score, 0), 100) * 0.20 +
          LEAST(GREATEST(mileage_score, 0), 100) * 0.15 +
          LEAST(GREATEST(recovery_score, 0), 100) * 0.10,
          1
        )
      ) STORED;
  END IF;
END $$;

-- 마일리지 점수 환산 (80km 만점)
CREATE OR REPLACE FUNCTION public.running_league_mileage_score(km NUMERIC)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN km >= 80 THEN 100
    WHEN km >= 60 THEN 80
    WHEN km >= 40 THEN 60
    WHEN km >= 20 THEN 40
    WHEN km <= 0 THEN 0
    ELSE ROUND((km / 20.0) * 40, 2)
  END;
$$;

COMMENT ON FUNCTION public.running_league_mileage_score IS '러닝 마일리지 점수 — 20/40/60/80km 구간, 80km 이상 100점 상한';

-- ---------------------------------------------------------------------------
-- 2. 보조 테이블
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.running_league_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id UUID NOT NULL REFERENCES public.running_league_participants(id) ON DELETE CASCADE,
  league_id UUID NOT NULL REFERENCES public.running_leagues(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  goal_level TEXT,
  personal_goal TEXT NOT NULL DEFAULT '',
  achievement_rate NUMERIC(5, 2),
  goal_score NUMERIC(5, 2) NOT NULL DEFAULT 0,
  week_number INTEGER,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS running_league_goals_primary_uidx
  ON public.running_league_goals (participant_id)
  WHERE is_primary = true;

CREATE INDEX IF NOT EXISTS running_league_goals_member_idx
  ON public.running_league_goals (member_id, league_id);

CREATE TABLE IF NOT EXISTS public.running_league_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id UUID NOT NULL REFERENCES public.running_league_participants(id) ON DELETE CASCADE,
  league_id UUID NOT NULL REFERENCES public.running_leagues(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  distance_event TEXT NOT NULL CHECK (distance_event IN ('1km', '3km', '5km', '10km')),
  record_phase TEXT NOT NULL CHECK (record_phase IN ('month_start', 'month_end', 'mid_month', 'other')),
  time_text TEXT,
  time_seconds INTEGER,
  measured_at DATE NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (participant_id, distance_event, record_phase)
);

CREATE INDEX IF NOT EXISTS running_league_records_member_idx
  ON public.running_league_records (member_id, league_id, measured_at DESC);

CREATE TABLE IF NOT EXISTS public.running_league_mileage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id UUID NOT NULL REFERENCES public.running_league_participants(id) ON DELETE CASCADE,
  league_id UUID NOT NULL REFERENCES public.running_leagues(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  distance_km NUMERIC(8, 2) NOT NULL CHECK (distance_km > 0),
  logged_at DATE NOT NULL DEFAULT CURRENT_DATE,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'lesson', 'import', 'other')),
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS running_league_mileage_logs_member_idx
  ON public.running_league_mileage_logs (member_id, league_id, logged_at DESC);

CREATE TABLE IF NOT EXISTS public.running_league_recovery_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id UUID NOT NULL REFERENCES public.running_league_participants(id) ON DELETE CASCADE,
  league_id UUID NOT NULL REFERENCES public.running_leagues(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  check_type TEXT NOT NULL CHECK (
    check_type IN (
      'stretching',
      'pain_check',
      'condition_check',
      'recovery_jog',
      'intensity_compliance'
    )
  ),
  completed BOOLEAN NOT NULL DEFAULT false,
  points NUMERIC(5, 2) NOT NULL DEFAULT 0,
  logged_at DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS running_league_recovery_logs_member_idx
  ON public.running_league_recovery_logs (member_id, league_id, logged_at DESC);

CREATE TABLE IF NOT EXISTS public.running_league_score_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id UUID NOT NULL REFERENCES public.running_league_participants(id) ON DELETE CASCADE,
  league_id UUID NOT NULL REFERENCES public.running_leagues(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  attendance_score NUMERIC(5, 2) NOT NULL DEFAULT 0,
  goal_score NUMERIC(5, 2) NOT NULL DEFAULT 0,
  record_score NUMERIC(5, 2) NOT NULL DEFAULT 0,
  mileage_score NUMERIC(5, 2) NOT NULL DEFAULT 0,
  recovery_score NUMERIC(5, 2) NOT NULL DEFAULT 0,
  total_score NUMERIC(6, 2) NOT NULL DEFAULT 0,
  week_number INTEGER,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'auto', 'import')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS running_league_score_snapshots_member_idx
  ON public.running_league_score_snapshots (member_id, league_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.running_league_awards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID NOT NULL REFERENCES public.running_leagues(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES public.running_league_participants(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  award_key TEXT NOT NULL,
  award_name TEXT NOT NULL,
  criteria TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL DEFAULT '',
  is_recommended BOOLEAN NOT NULL DEFAULT true,
  is_confirmed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (league_id, member_id, award_key)
);

CREATE INDEX IF NOT EXISTS running_league_awards_league_idx
  ON public.running_league_awards (league_id, is_confirmed DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS public.running_league_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id UUID NOT NULL UNIQUE REFERENCES public.running_league_participants(id) ON DELETE CASCADE,
  league_id UUID NOT NULL REFERENCES public.running_leagues(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  rank INTEGER,
  total_score NUMERIC(6, 2),
  summary TEXT NOT NULL DEFAULT '',
  highlights JSONB NOT NULL DEFAULT '[]'::jsonb,
  coach_comment TEXT NOT NULL DEFAULT '',
  is_published BOOLEAN NOT NULL DEFAULT false,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS running_league_reports_member_idx
  ON public.running_league_reports (member_id, league_id);

COMMENT ON TABLE public.running_league_goals IS '참가자 개인 목표 (주차별·대표 목표)';
COMMENT ON TABLE public.running_league_records IS '기록 측정 — 1km/3km/5km/10km, 월초·월말';
COMMENT ON TABLE public.running_league_mileage_logs IS '러닝 마일리지 일별/회별 로그';
COMMENT ON TABLE public.running_league_recovery_logs IS '회복관리 체크 로그';
COMMENT ON TABLE public.running_league_score_snapshots IS '점수 스냅샷 (주차별·최종)';
COMMENT ON TABLE public.running_league_awards IS '수상 부문·추천·확정';
COMMENT ON TABLE public.running_league_reports IS '회원별 리그 리포트';

-- ---------------------------------------------------------------------------
-- 3. updated_at 트리거
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_running_league_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'running_leagues',
    'running_league_participants',
    'running_league_goals',
    'running_league_records',
    'running_league_mileage_logs',
    'running_league_recovery_logs',
    'running_league_score_snapshots',
    'running_league_awards',
    'running_league_reports'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_set_updated_at ON public.%I', tbl, tbl);
    EXECUTE format(
      'CREATE TRIGGER %I_set_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_running_league_updated_at()',
      tbl,
      tbl
    );
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 4. 기존 participants 데이터 → 보조 테이블 백필 (있을 때만)
-- ---------------------------------------------------------------------------

INSERT INTO public.running_league_goals (
  participant_id,
  league_id,
  member_id,
  goal_level,
  personal_goal,
  achievement_rate,
  goal_score,
  is_primary
)
SELECT
  p.id,
  p.league_id,
  p.member_id,
  p.goal_level,
  COALESCE(p.personal_goal, ''),
  p.goal_achievement_rate,
  p.goal_score,
  true
FROM public.running_league_participants p
WHERE (p.goal_level IS NOT NULL OR COALESCE(p.personal_goal, '') <> '')
  AND NOT EXISTS (
    SELECT 1
    FROM public.running_league_goals g
    WHERE g.participant_id = p.id
      AND g.is_primary = true
  );

INSERT INTO public.running_league_records (
  participant_id,
  league_id,
  member_id,
  distance_event,
  record_phase,
  time_text,
  measured_at
)
SELECT
  p.id,
  p.league_id,
  p.member_id,
  '5km',
  'month_start',
  p.record_baseline,
  l.starts_at
FROM public.running_league_participants p
JOIN public.running_leagues l ON l.id = p.league_id
WHERE COALESCE(p.record_baseline, '') <> ''
ON CONFLICT (participant_id, distance_event, record_phase) DO NOTHING;

INSERT INTO public.running_league_records (
  participant_id,
  league_id,
  member_id,
  distance_event,
  record_phase,
  time_text,
  measured_at
)
SELECT
  p.id,
  p.league_id,
  p.member_id,
  '5km',
  'month_end',
  p.record_current,
  l.ends_at
FROM public.running_league_participants p
JOIN public.running_leagues l ON l.id = p.league_id
WHERE COALESCE(p.record_current, '') <> ''
ON CONFLICT (participant_id, distance_event, record_phase) DO NOTHING;

INSERT INTO public.running_league_mileage_logs (
  participant_id,
  league_id,
  member_id,
  distance_km,
  logged_at,
  source,
  notes
)
SELECT
  p.id,
  p.league_id,
  p.member_id,
  p.mileage_km,
  l.ends_at,
  'import',
  'participants.mileage_km 백필'
FROM public.running_league_participants p
JOIN public.running_leagues l ON l.id = p.league_id
WHERE p.mileage_km > 0
  AND NOT EXISTS (
    SELECT 1
    FROM public.running_league_mileage_logs m
    WHERE m.participant_id = p.id
      AND m.source = 'import'
  );

UPDATE public.running_league_participants
SET coach_comment = notes
WHERE COALESCE(coach_comment, '') = ''
  AND COALESCE(notes, '') <> '';

-- ---------------------------------------------------------------------------
-- 5. RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.running_league_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.running_league_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.running_league_mileage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.running_league_recovery_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.running_league_score_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.running_league_awards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.running_league_reports ENABLE ROW LEVEL SECURITY;

-- admin: 전체
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'running_league_goals',
    'running_league_records',
    'running_league_mileage_logs',
    'running_league_recovery_logs',
    'running_league_score_snapshots',
    'running_league_awards',
    'running_league_reports'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_admin_all ON public.%I', tbl, tbl);
    EXECUTE format(
      'CREATE POLICY %I_admin_all ON public.%I FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin())',
      tbl,
      tbl
    );
  END LOOP;
END $$;

-- member: 본인 데이터 읽기
CREATE OR REPLACE FUNCTION public.running_league_member_owns_row(target_member_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.members m
  WHERE m.id = target_member_id
      AND (m.auth_user_id = auth.uid() OR m.user_id = auth.uid())
  )
  AND EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND COALESCE(p.approval_status, 'approved') = 'approved'
  );
$$;

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'running_league_goals',
    'running_league_records',
    'running_league_mileage_logs',
    'running_league_recovery_logs',
    'running_league_score_snapshots'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_member_read ON public.%I', tbl, tbl);
    EXECUTE format(
      'CREATE POLICY %I_member_read ON public.%I FOR SELECT TO authenticated USING (public.running_league_member_owns_row(member_id))',
      tbl,
      tbl
    );
  END LOOP;
END $$;

DROP POLICY IF EXISTS running_league_awards_member_read ON public.running_league_awards;
CREATE POLICY running_league_awards_member_read ON public.running_league_awards
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.running_leagues l
      WHERE l.id = running_league_awards.league_id
        AND l.status IN ('active', 'closed')
    )
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND COALESCE(p.approval_status, 'approved') = 'approved'
    )
  );

DROP POLICY IF EXISTS running_league_reports_member_read ON public.running_league_reports;
CREATE POLICY running_league_reports_member_read ON public.running_league_reports
  FOR SELECT TO authenticated
  USING (
    is_published = true
    AND public.running_league_member_owns_row(member_id)
  );

NOTIFY pgrst, 'reload schema';

-- <<< END expand-running-league-schema.sql


-- >>> BEGIN add-running-league-goal-type.sql

-- 참가자 개인 목표 유형

ALTER TABLE public.running_league_participants
  ADD COLUMN IF NOT EXISTS goal_type TEXT;

ALTER TABLE public.running_league_participants DROP CONSTRAINT IF EXISTS running_league_participants_goal_type_check;
ALTER TABLE public.running_league_participants
  ADD CONSTRAINT running_league_participants_goal_type_check
  CHECK (
    goal_type IS NULL
    OR goal_type IN (
      'finish',
      'record_improvement',
      'attendance',
      'mileage',
      'health',
      'race_prep'
    )
  );

ALTER TABLE public.running_league_goals
  ADD COLUMN IF NOT EXISTS goal_type TEXT;

ALTER TABLE public.running_league_goals DROP CONSTRAINT IF EXISTS running_league_goals_goal_type_check;
ALTER TABLE public.running_league_goals
  ADD CONSTRAINT running_league_goals_goal_type_check
  CHECK (
    goal_type IS NULL
    OR goal_type IN (
      'finish',
      'record_improvement',
      'attendance',
      'mileage',
      'health',
      'race_prep'
    )
  );

COMMENT ON COLUMN public.running_league_participants.goal_type IS 'finish | record_improvement | attendance | mileage | health | race_prep';
COMMENT ON COLUMN public.running_league_goals.goal_type IS '개인 목표 유형';

NOTIFY pgrst, 'reload schema';

-- <<< END add-running-league-goal-type.sql


-- >>> BEGIN add-running-league-target-group.sql

-- 러닝 리그 대상 그룹

ALTER TABLE public.running_leagues
  ADD COLUMN IF NOT EXISTS target_group TEXT NOT NULL DEFAULT 'all';

ALTER TABLE public.running_leagues DROP CONSTRAINT IF EXISTS running_leagues_target_group_check;
ALTER TABLE public.running_leagues
  ADD CONSTRAINT running_leagues_target_group_check
  CHECK (target_group IN ('all', 'beginner', '5km', '10km', 'half_marathon'));

COMMENT ON COLUMN public.running_leagues.target_group IS 'all | beginner | 5km | 10km | half_marathon';

NOTIFY pgrst, 'reload schema';

-- <<< END add-running-league-target-group.sql


-- >>> BEGIN add-running-league-event-subtype.sql

-- 원스텝 러닝 리그 이벤트 subtype 추가

ALTER TABLE public.center_board_posts DROP CONSTRAINT IF EXISTS center_board_posts_event_subtype_check;
ALTER TABLE public.center_board_posts
  ADD CONSTRAINT center_board_posts_event_subtype_check
  CHECK (event_subtype IS NULL OR event_subtype IN ('mileage_challenge', 'running_league'));

NOTIFY pgrst, 'reload schema';

-- <<< END add-running-league-event-subtype.sql


-- >>> BEGIN add-running-league-daily-recovery.sql

-- ONE STEP RUNNING LEAGUE 일일 회복관리 체크
-- 컨디션·통증·스트레칭·강도·코치 강도 준수를 날짜별로 기록합니다.

CREATE TABLE IF NOT EXISTS public.running_league_daily_recovery (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id UUID NOT NULL REFERENCES public.running_league_participants(id) ON DELETE CASCADE,
  league_id UUID NOT NULL REFERENCES public.running_leagues(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  logged_at DATE NOT NULL DEFAULT CURRENT_DATE,
  condition TEXT NOT NULL CHECK (condition IN ('good', 'normal', 'tired')),
  pain TEXT NOT NULL CHECK (pain IN ('none', 'mild', 'severe')),
  stretching TEXT NOT NULL CHECK (stretching IN ('done', 'not_done')),
  intensity TEXT NOT NULL CHECK (intensity IN ('light', 'moderate', 'hard', 'excessive')),
  coach_compliance TEXT NOT NULL CHECK (coach_compliance IN ('followed', 'slightly_fast', 'excessive')),
  points NUMERIC(5, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (participant_id, logged_at)
);

CREATE INDEX IF NOT EXISTS running_league_daily_recovery_league_idx
  ON public.running_league_daily_recovery (league_id, logged_at DESC);

CREATE INDEX IF NOT EXISTS running_league_daily_recovery_member_idx
  ON public.running_league_daily_recovery (member_id, league_id, logged_at DESC);

COMMENT ON TABLE public.running_league_daily_recovery IS '러닝 리그 일일 회복관리 체크 (컨디션·통증·스트레칭·강도)';

ALTER TABLE public.running_league_daily_recovery ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS running_league_daily_recovery_admin_all ON public.running_league_daily_recovery;
CREATE POLICY running_league_daily_recovery_admin_all ON public.running_league_daily_recovery
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS running_league_daily_recovery_member_read ON public.running_league_daily_recovery;
CREATE POLICY running_league_daily_recovery_member_read ON public.running_league_daily_recovery
  FOR SELECT TO authenticated
  USING (public.running_league_member_owns_row(member_id));

DROP POLICY IF EXISTS running_league_daily_recovery_member_write ON public.running_league_daily_recovery;
CREATE POLICY running_league_daily_recovery_member_write ON public.running_league_daily_recovery
  FOR INSERT TO authenticated
  WITH CHECK (public.running_league_member_owns_row(member_id));

DROP POLICY IF EXISTS running_league_daily_recovery_member_update ON public.running_league_daily_recovery;
CREATE POLICY running_league_daily_recovery_member_update ON public.running_league_daily_recovery
  FOR UPDATE TO authenticated
  USING (public.running_league_member_owns_row(member_id))
  WITH CHECK (public.running_league_member_owns_row(member_id));

-- <<< END add-running-league-daily-recovery.sql


-- >>> BEGIN add-running-league-pb-history.sql

-- PB 수정 시 이전 기록을 pb_history 로 보존하고, 현재 PB(other)는 1건만 유지합니다.
-- notes JSON 이력과 함께 동작합니다(앱 코드 참고).

ALTER TABLE public.running_league_records
  DROP CONSTRAINT IF EXISTS running_league_records_record_phase_check;

ALTER TABLE public.running_league_records
  ADD CONSTRAINT running_league_records_record_phase_check
  CHECK (record_phase IN ('month_start', 'month_end', 'mid_month', 'other', 'pb_history'));

ALTER TABLE public.running_league_records
  DROP CONSTRAINT IF EXISTS running_league_records_participant_id_distance_event_record_phase_key;

-- 일부 환경에서 제약 이름이 다를 수 있어 인덱스도 제거합니다.
DROP INDEX IF EXISTS running_league_records_participant_id_distance_event_record_phase_key;

CREATE UNIQUE INDEX IF NOT EXISTS running_league_records_phase_slot_uidx
  ON public.running_league_records (participant_id, distance_event, record_phase)
  WHERE record_phase IN ('month_start', 'month_end', 'mid_month', 'other');

COMMENT ON COLUMN public.running_league_records.record_phase IS
  'other=현재 PB, pb_history=이전 PB 이력(추이 그래프용)';

-- <<< END add-running-league-pb-history.sql


-- >>> BEGIN add-running-league-pb-snapshots.sql

-- PB 수정 이력(스냅샷) — 수정할 때마다 행이 추가되어 기록 목록·추이에 사용됩니다.

CREATE TABLE IF NOT EXISTS public.running_league_pb_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id UUID NOT NULL REFERENCES public.running_league_participants(id) ON DELETE CASCADE,
  league_id UUID NOT NULL REFERENCES public.running_leagues(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  distance_event TEXT NOT NULL CHECK (distance_event IN ('1km', '3km', '5km', '10km', 'half', 'full')),
  time_text TEXT NOT NULL,
  time_seconds INTEGER,
  measured_at DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS running_league_pb_snapshots_participant_distance_idx
  ON public.running_league_pb_snapshots (participant_id, distance_event, measured_at DESC, created_at DESC);

ALTER TABLE public.running_league_pb_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS running_league_pb_snapshots_member_all ON public.running_league_pb_snapshots;
CREATE POLICY running_league_pb_snapshots_member_all ON public.running_league_pb_snapshots
  FOR ALL TO authenticated
  USING (public.running_league_member_owns_row(member_id))
  WITH CHECK (public.running_league_member_owns_row(member_id));

DROP POLICY IF EXISTS running_league_pb_snapshots_portal_read ON public.running_league_pb_snapshots;
CREATE POLICY running_league_pb_snapshots_portal_read ON public.running_league_pb_snapshots
  FOR SELECT TO authenticated
  USING (
    public.is_center_portal_ranking_league(league_id)
    AND public.is_approved_portal_member()
  );

COMMENT ON TABLE public.running_league_pb_snapshots IS
  '포털 PB 수정 이력 — 저장할 때마다 추가, 기록 목록·추이 그래프용';

-- <<< END add-running-league-pb-snapshots.sql


-- >>> BEGIN add-running-league-mileage-extraction.sql

-- 러닝 마일리지 스크린샷 추출 필드 확장
-- Supabase SQL Editor에서 실행

ALTER TABLE public.running_league_mileage_logs
  ADD COLUMN IF NOT EXISTS duration TEXT,
  ADD COLUMN IF NOT EXISTS pace TEXT,
  ADD COLUMN IF NOT EXISTS heart_rate INTEGER,
  ADD COLUMN IF NOT EXISTS calories INTEGER,
  ADD COLUMN IF NOT EXISTS activity_time TEXT,
  ADD COLUMN IF NOT EXISTS source_app TEXT,
  ADD COLUMN IF NOT EXISTS screenshot_url TEXT,
  ADD COLUMN IF NOT EXISTS image_hash TEXT,
  ADD COLUMN IF NOT EXISTS extraction_confidence NUMERIC(5, 4),
  ADD COLUMN IF NOT EXISTS extraction_raw_json JSONB,
  ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'pending';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'running_league_mileage_logs_verification_status_check'
  ) THEN
    ALTER TABLE public.running_league_mileage_logs
      ADD CONSTRAINT running_league_mileage_logs_verification_status_check
      CHECK (verification_status IN ('pending', 'confirmed', 'manual', 'rejected'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS running_league_mileage_logs_dup_idx
  ON public.running_league_mileage_logs (member_id, logged_at, distance_km, duration, image_hash);

COMMENT ON COLUMN public.running_league_mileage_logs.duration IS '총 운동 시간 (예: 1:00:27)';
COMMENT ON COLUMN public.running_league_mileage_logs.pace IS '평균 페이스 (예: 4:29)';
COMMENT ON COLUMN public.running_league_mileage_logs.screenshot_url IS '러닝 앱 스크린샷 URL';
COMMENT ON COLUMN public.running_league_mileage_logs.image_hash IS '스크린샷 SHA-256 (중복 방지)';

-- 스크린샷 저장 버킷 (서비스 롤 업로드)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'running-mileage-screenshots',
  'running-mileage-screenshots',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
ON CONFLICT (id) DO NOTHING;

-- <<< END add-running-league-mileage-extraction.sql


-- >>> BEGIN add-running-league-training-schedule.sql

-- 주간 훈련 스케줄 (요일별) + 참여 신청
-- 실행: Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.running_league_training_schedule_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID NOT NULL REFERENCES public.running_leagues(id) ON DELETE CASCADE,
  weekday SMALLINT NOT NULL CHECK (weekday >= 0 AND weekday <= 6),
  training_summary TEXT NOT NULL DEFAULT '',
  location_label TEXT NOT NULL DEFAULT '',
  naver_map_url TEXT,
  is_hidden BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (league_id, weekday)
);

CREATE INDEX IF NOT EXISTS running_league_training_schedule_days_league_idx
  ON public.running_league_training_schedule_days (league_id, weekday);

CREATE TABLE IF NOT EXISTS public.running_league_training_schedule_signups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID NOT NULL REFERENCES public.running_leagues(id) ON DELETE CASCADE,
  schedule_day_id UUID NOT NULL REFERENCES public.running_league_training_schedule_days(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  participant_id UUID REFERENCES public.running_league_participants(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (schedule_day_id, member_id)
);

CREATE INDEX IF NOT EXISTS running_league_training_schedule_signups_day_idx
  ON public.running_league_training_schedule_signups (schedule_day_id, created_at);

COMMENT ON TABLE public.running_league_training_schedule_days IS '러닝 리그 주간 훈련 스케줄 (월~일)';
COMMENT ON COLUMN public.running_league_training_schedule_days.weekday IS '0=월 … 6=일';
COMMENT ON TABLE public.running_league_training_schedule_signups IS '요일별 그룹 러닝 참여 신청';

ALTER TABLE public.running_league_training_schedule_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.running_league_training_schedule_signups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS running_league_training_schedule_days_admin_all ON public.running_league_training_schedule_days;
CREATE POLICY running_league_training_schedule_days_admin_all ON public.running_league_training_schedule_days
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS running_league_training_schedule_signups_admin_all ON public.running_league_training_schedule_signups;
CREATE POLICY running_league_training_schedule_signups_admin_all ON public.running_league_training_schedule_signups
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS running_league_training_schedule_days_member_read ON public.running_league_training_schedule_days;
CREATE POLICY running_league_training_schedule_days_member_read ON public.running_league_training_schedule_days
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.running_leagues l
      WHERE l.id = running_league_training_schedule_days.league_id
        AND l.status IN ('active', 'closed')
    )
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND COALESCE(p.approval_status, 'approved') = 'approved'
    )
  );

DROP POLICY IF EXISTS running_league_training_schedule_signups_member_read ON public.running_league_training_schedule_signups;
CREATE POLICY running_league_training_schedule_signups_member_read ON public.running_league_training_schedule_signups
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.running_leagues l
      WHERE l.id = running_league_training_schedule_signups.league_id
        AND l.status IN ('active', 'closed')
    )
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND COALESCE(p.approval_status, 'approved') = 'approved'
    )
  );

DROP POLICY IF EXISTS running_league_training_schedule_signups_member_write ON public.running_league_training_schedule_signups;
CREATE POLICY running_league_training_schedule_signups_member_write ON public.running_league_training_schedule_signups
  FOR INSERT TO authenticated
  WITH CHECK (public.running_league_member_owns_row(member_id));

DROP POLICY IF EXISTS running_league_training_schedule_signups_member_delete ON public.running_league_training_schedule_signups;
CREATE POLICY running_league_training_schedule_signups_member_delete ON public.running_league_training_schedule_signups
  FOR DELETE TO authenticated
  USING (public.running_league_member_owns_row(member_id));

NOTIFY pgrst, 'reload schema';

-- <<< END add-running-league-training-schedule.sql


-- >>> BEGIN add-center-portal-ranking-league.sql

-- 센터 메인 랭킹 전용 리그 (이벤트 시즌과 별도)
-- 이어서 add-center-portal-member-mileage-rls.sql 도 실행하세요.

INSERT INTO public.running_leagues (
  title,
  description,
  starts_at,
  ends_at,
  status,
  audience,
  target_group
)
SELECT
  'ONE STEP RUNNING RANKING',
  '__center_portal_ranking__ 센터 메인 랭킹 (이벤트 시즌과 별도)',
  date_trunc('year', CURRENT_DATE)::date,
  '2099-12-31'::date,
  'active',
  'adult',
  'all'
WHERE NOT EXISTS (
  SELECT 1
  FROM public.running_leagues
  WHERE description LIKE '%__center_portal_ranking__%'
     OR title = 'ONE STEP RUNNING RANKING'
);

-- <<< END add-center-portal-ranking-league.sql


-- >>> BEGIN add-center-portal-member-mileage-rls.sql

-- 센터 메인 랭킹: 회원이 리그 참가·마일리지·PB를 직접 등록할 수 있게 합니다.
-- add-center-portal-ranking-league.sql 과 함께 실행하세요.

CREATE OR REPLACE FUNCTION public.is_center_portal_ranking_league(target_league_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.running_leagues l
    WHERE l.id = target_league_id
      AND (
        l.description LIKE '%__center_portal_ranking__%'
        OR l.title = 'ONE STEP RUNNING RANKING'
      )
  );
$$;

-- 메인 랭킹 리그 (없으면 생성)
INSERT INTO public.running_leagues (
  title,
  description,
  starts_at,
  ends_at,
  status
)
SELECT
  'ONE STEP RUNNING RANKING',
  '__center_portal_ranking__ 센터 메인 랭킹 (이벤트 시즌과 별도)',
  date_trunc('year', CURRENT_DATE)::date,
  '2099-12-31'::date,
  'active'
WHERE NOT EXISTS (
  SELECT 1
  FROM public.running_leagues
  WHERE description LIKE '%__center_portal_ranking__%'
     OR title = 'ONE STEP RUNNING RANKING'
);

DROP POLICY IF EXISTS running_league_participants_portal_self_insert ON public.running_league_participants;
CREATE POLICY running_league_participants_portal_self_insert ON public.running_league_participants
  FOR INSERT TO authenticated
  WITH CHECK (
    public.running_league_member_owns_row(member_id)
    AND public.is_center_portal_ranking_league(league_id)
  );

DROP POLICY IF EXISTS running_league_participants_portal_self_update ON public.running_league_participants;
CREATE POLICY running_league_participants_portal_self_update ON public.running_league_participants
  FOR UPDATE TO authenticated
  USING (
    public.running_league_member_owns_row(member_id)
    AND public.is_center_portal_ranking_league(league_id)
  )
  WITH CHECK (
    public.running_league_member_owns_row(member_id)
    AND public.is_center_portal_ranking_league(league_id)
  );

DROP POLICY IF EXISTS running_league_mileage_logs_member_write ON public.running_league_mileage_logs;
CREATE POLICY running_league_mileage_logs_member_write ON public.running_league_mileage_logs
  FOR ALL TO authenticated
  USING (public.running_league_member_owns_row(member_id))
  WITH CHECK (public.running_league_member_owns_row(member_id));

DROP POLICY IF EXISTS running_league_records_member_write ON public.running_league_records;
CREATE POLICY running_league_records_member_write ON public.running_league_records
  FOR ALL TO authenticated
  USING (public.running_league_member_owns_row(member_id))
  WITH CHECK (public.running_league_member_owns_row(member_id));

NOTIFY pgrst, 'reload schema';

-- <<< END add-center-portal-member-mileage-rls.sql


-- >>> BEGIN add-center-portal-leaderboard-read-rls.sql

-- 센터 메인 랭킹: 성인 회원이 서로의 PB·마일리지·이름을 랭킹/그래프용으로 조회
-- add-center-portal-member-mileage-rls.sql 실행 후 적용하세요.

CREATE OR REPLACE FUNCTION public.is_approved_portal_member()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND COALESCE(p.approval_status, 'approved') = 'approved'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_center_portal_ranking_participant(target_member_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.running_league_participants p
    WHERE p.member_id = target_member_id
      AND public.is_center_portal_ranking_league(p.league_id)
  );
$$;

DROP POLICY IF EXISTS running_league_records_portal_leaderboard_read ON public.running_league_records;
CREATE POLICY running_league_records_portal_leaderboard_read ON public.running_league_records
  FOR SELECT TO authenticated
  USING (
    public.is_center_portal_ranking_league(league_id)
    AND public.is_approved_portal_member()
  );

DROP POLICY IF EXISTS running_league_mileage_logs_portal_leaderboard_read ON public.running_league_mileage_logs;
CREATE POLICY running_league_mileage_logs_portal_leaderboard_read ON public.running_league_mileage_logs
  FOR SELECT TO authenticated
  USING (
    public.is_center_portal_ranking_league(league_id)
    AND public.is_approved_portal_member()
  );

DROP POLICY IF EXISTS members_portal_ranking_leaderboard_read ON public.members;
CREATE POLICY members_portal_ranking_leaderboard_read ON public.members
  FOR SELECT TO authenticated
  USING (
    public.is_approved_portal_member()
    AND public.is_center_portal_ranking_participant(id)
  );

DROP POLICY IF EXISTS profiles_portal_ranking_role_read ON public.profiles;
CREATE POLICY profiles_portal_ranking_role_read ON public.profiles
  FOR SELECT TO authenticated
  USING (
    public.is_approved_portal_member()
    AND EXISTS (
      SELECT 1
      FROM public.members m
      WHERE (m.auth_user_id = profiles.id OR m.user_id = profiles.id)
        AND public.is_center_portal_ranking_participant(m.id)
    )
  );

NOTIFY pgrst, 'reload schema';

-- <<< END add-center-portal-leaderboard-read-rls.sql


-- >>> BEGIN add-center-running-training-schedule.sql

-- 센터 단독 주간 러닝 훈련 스케줄 (챌린지/리그와 무관)
-- 실행: Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.center_running_training_schedule_days (
  weekday SMALLINT PRIMARY KEY CHECK (weekday >= 0 AND weekday <= 6),
  training_summary TEXT NOT NULL DEFAULT '',
  location_label TEXT NOT NULL DEFAULT '',
  naver_map_url TEXT,
  is_hidden BOOLEAN NOT NULL DEFAULT false,
  schedule_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.center_running_training_schedule_days
  ADD COLUMN IF NOT EXISTS schedule_date DATE;

CREATE TABLE IF NOT EXISTS public.center_running_training_schedule_signups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  weekday SMALLINT NOT NULL REFERENCES public.center_running_training_schedule_days(weekday) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (weekday, member_id)
);

CREATE INDEX IF NOT EXISTS center_running_training_schedule_signups_weekday_idx
  ON public.center_running_training_schedule_signups (weekday, created_at);

COMMENT ON TABLE public.center_running_training_schedule_days IS '센터 주간 러닝 훈련 스케줄 (월~일, 챌린지 무관)';
COMMENT ON COLUMN public.center_running_training_schedule_days.weekday IS '0=월 … 6=일';
COMMENT ON TABLE public.center_running_training_schedule_signups IS '센터 주간 훈련 참여 투표/신청';

ALTER TABLE public.center_running_training_schedule_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.center_running_training_schedule_signups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS center_running_training_schedule_days_admin_all ON public.center_running_training_schedule_days;
CREATE POLICY center_running_training_schedule_days_admin_all ON public.center_running_training_schedule_days
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS center_running_training_schedule_signups_admin_all ON public.center_running_training_schedule_signups;
CREATE POLICY center_running_training_schedule_signups_admin_all ON public.center_running_training_schedule_signups
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS center_running_training_schedule_days_member_read ON public.center_running_training_schedule_days;
CREATE POLICY center_running_training_schedule_days_member_read ON public.center_running_training_schedule_days
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND COALESCE(p.approval_status, 'approved') = 'approved'
    )
  );

DROP POLICY IF EXISTS center_running_training_schedule_signups_member_read ON public.center_running_training_schedule_signups;
CREATE POLICY center_running_training_schedule_signups_member_read ON public.center_running_training_schedule_signups
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND COALESCE(p.approval_status, 'approved') = 'approved'
    )
  );

DROP POLICY IF EXISTS center_running_training_schedule_signups_member_write ON public.center_running_training_schedule_signups;
CREATE POLICY center_running_training_schedule_signups_member_write ON public.center_running_training_schedule_signups
  FOR INSERT TO authenticated
  WITH CHECK (public.running_league_member_owns_row(member_id));

DROP POLICY IF EXISTS center_running_training_schedule_signups_member_delete ON public.center_running_training_schedule_signups;
CREATE POLICY center_running_training_schedule_signups_member_delete ON public.center_running_training_schedule_signups
  FOR DELETE TO authenticated
  USING (public.running_league_member_owns_row(member_id));

NOTIFY pgrst, 'reload schema';

-- <<< END add-center-running-training-schedule.sql


-- >>> BEGIN add-center-running-training-schedule-dates.sql

-- 센터 러닝 스케줄 요일별 날짜 (이번 주 월~일)
ALTER TABLE public.center_running_training_schedule_days
  ADD COLUMN IF NOT EXISTS schedule_date DATE;

COMMENT ON COLUMN public.center_running_training_schedule_days.schedule_date IS '이번 주 해당 요일 날짜 (관리자가 월요일 기준으로 설정)';

NOTIFY pgrst, 'reload schema';

-- <<< END add-center-running-training-schedule-dates.sql


-- >>> BEGIN add-center-running-training-schedule-library.sql

-- 주간 스케줄 저장 목록 + 장소/지도 URL 프리셋
-- 실행: Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.center_running_training_schedule_week_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start_date DATE,
  days JSONB NOT NULL DEFAULT '[]'::jsonb,
  saved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS center_running_training_schedule_week_snapshots_week_idx
  ON public.center_running_training_schedule_week_snapshots (week_start_date)
  WHERE week_start_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS center_running_training_schedule_week_snapshots_saved_idx
  ON public.center_running_training_schedule_week_snapshots (saved_at DESC);

CREATE TABLE IF NOT EXISTS public.center_running_training_schedule_location_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_label TEXT NOT NULL DEFAULT '',
  naver_map_url TEXT NOT NULL DEFAULT '',
  saved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (location_label, naver_map_url)
);

CREATE INDEX IF NOT EXISTS center_running_training_schedule_location_presets_saved_idx
  ON public.center_running_training_schedule_location_presets (saved_at DESC);

COMMENT ON TABLE public.center_running_training_schedule_week_snapshots IS '센터 러닝 주간 스케줄 저장 이력';
COMMENT ON TABLE public.center_running_training_schedule_location_presets IS '센터 러닝 스케줄 장소·지도 URL 프리셋';

ALTER TABLE public.center_running_training_schedule_week_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.center_running_training_schedule_location_presets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS center_running_training_schedule_week_snapshots_admin_all
  ON public.center_running_training_schedule_week_snapshots;
CREATE POLICY center_running_training_schedule_week_snapshots_admin_all
  ON public.center_running_training_schedule_week_snapshots
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS center_running_training_schedule_location_presets_admin_all
  ON public.center_running_training_schedule_location_presets;
CREATE POLICY center_running_training_schedule_location_presets_admin_all
  ON public.center_running_training_schedule_location_presets
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

NOTIFY pgrst, 'reload schema';

-- <<< END add-center-running-training-schedule-library.sql


-- >>> BEGIN performance-indexes.sql

-- OneStep Coach 성능 인덱스 (Supabase SQL Editor에서 전체 선택 후 Run)
-- 일부 컬럼이 없으면 해당 인덱스만 건너뜁니다.

-- ── 선택: 가입 승인 컬럼 (알림·승인 대기용) ──
-- approval_status 인덱스가 필요하면 아래 주석 해제 후 먼저 실행하거나
-- supabase/add-profile-approval.sql 을 실행하세요.
--
-- ALTER TABLE public.profiles
--   ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'approved'
--     CHECK (approval_status IN ('pending', 'approved', 'rejected'));

-- 회원
CREATE INDEX IF NOT EXISTS idx_members_is_active_created_at
  ON public.members (is_active, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_members_name
  ON public.members (name);

CREATE INDEX IF NOT EXISTS idx_members_primary_instructor_id
  ON public.members (primary_instructor_id)
  WHERE primary_instructor_id IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'members' AND column_name = 'deleted_at'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_members_deleted_at
      ON public.members (deleted_at)
      WHERE deleted_at IS NULL;
  ELSE
    RAISE NOTICE 'members.deleted_at 없음 — add-members-deleted-at.sql 실행 후 인덱스 생성 가능';
  END IF;
END $$;

-- 수업권
CREATE INDEX IF NOT EXISTS idx_session_packages_member_id_created_at
  ON public.session_packages (member_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_session_packages_active_remaining
  ON public.session_packages (is_active, remaining_sessions)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_session_packages_paid_at
  ON public.session_packages (paid_at)
  WHERE paid_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_session_packages_expires_at
  ON public.session_packages (expires_at)
  WHERE expires_at IS NOT NULL;

-- 수업
CREATE INDEX IF NOT EXISTS idx_lessons_lesson_date_start_time
  ON public.lessons (lesson_date, start_time);

CREATE INDEX IF NOT EXISTS idx_lessons_member_id_lesson_date
  ON public.lessons (member_id, lesson_date DESC)
  WHERE member_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lessons_instructor_id_lesson_date
  ON public.lessons (instructor_id, lesson_date)
  WHERE instructor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lessons_session_package_id
  ON public.lessons (session_package_id)
  WHERE session_package_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lessons_created_at
  ON public.lessons (created_at DESC);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'lessons' AND column_name = 'recurrence_group_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_lessons_recurrence_group_id
      ON public.lessons (recurrence_group_id)
      WHERE recurrence_group_id IS NOT NULL;
  ELSE
    RAISE NOTICE 'lessons.recurrence_group_id 없음 — fix-lessons-recurrence-delete.sql 실행 후 인덱스 생성 가능';
  END IF;
END $$;

-- 강사
CREATE INDEX IF NOT EXISTS idx_instructors_is_active_name
  ON public.instructors (is_active, name);

CREATE INDEX IF NOT EXISTS idx_instructors_user_id
  ON public.instructors (user_id)
  WHERE user_id IS NOT NULL;

-- 프로필 (가입 승인 알림)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'approval_status'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_profiles_approval_status_created_at
      ON public.profiles (approval_status, created_at DESC);
  ELSE
    RAISE NOTICE 'profiles.approval_status 없음 — supabase/add-profile-approval.sql 실행 후 다시 Run';
  END IF;
END $$;

-- 선택: 월 매출 합계용 (대시보드)
-- CREATE OR REPLACE FUNCTION public.sum_session_revenue_since(p_start date)
-- RETURNS numeric LANGUAGE sql STABLE AS $$
--   SELECT COALESCE(SUM(price), 0) FROM public.session_packages
--   WHERE paid_at >= p_start AND price IS NOT NULL;
-- $$;

-- <<< END performance-indexes.sql


-- >>> BEGIN osa-booster-seed-admin.sql

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

-- <<< END osa-booster-seed-admin.sql


NOTIFY pgrst, 'reload schema';
