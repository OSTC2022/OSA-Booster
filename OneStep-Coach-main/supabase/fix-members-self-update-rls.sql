-- 회원 본인 정보 수정: auth_user_id · user_id 모두 인식 (fix-member-self-read-rls.sql 과 동일)
-- 프로필 상태 메시지·색상 등 members 직접 수정 시 RLS 차단 방지

DROP POLICY IF EXISTS "members_self_update" ON public.members;
CREATE POLICY "members_self_update" ON public.members
  FOR UPDATE TO authenticated
  USING (auth_user_id = auth.uid() OR user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid() OR user_id = auth.uid());

NOTIFY pgrst, 'reload schema';
