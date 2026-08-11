-- 1:1 라이벌 (단방향). member당 활성 라이벌 1명.
-- Supabase SQL Editor 또는 scripts/apply-member-rivals-sql.mjs

CREATE TABLE IF NOT EXISTS public.member_rivals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  rival_member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT member_rivals_not_self CHECK (member_id <> rival_member_id),
  CONSTRAINT member_rivals_member_unique UNIQUE (member_id)
);

CREATE INDEX IF NOT EXISTS member_rivals_rival_member_idx
  ON public.member_rivals (rival_member_id);

ALTER TABLE public.member_rivals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS member_rivals_select ON public.member_rivals;
CREATE POLICY member_rivals_select ON public.member_rivals
  FOR SELECT TO authenticated
  USING (
    public.running_league_member_owns_row(member_id)
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'operator')
        AND p.approval_status = 'approved'
    )
  );

DROP POLICY IF EXISTS member_rivals_insert ON public.member_rivals;
CREATE POLICY member_rivals_insert ON public.member_rivals
  FOR INSERT TO authenticated
  WITH CHECK (
    public.running_league_member_owns_row(member_id)
    AND member_id <> rival_member_id
  );

DROP POLICY IF EXISTS member_rivals_update ON public.member_rivals;
CREATE POLICY member_rivals_update ON public.member_rivals
  FOR UPDATE TO authenticated
  USING (public.running_league_member_owns_row(member_id))
  WITH CHECK (
    public.running_league_member_owns_row(member_id)
    AND member_id <> rival_member_id
  );

DROP POLICY IF EXISTS member_rivals_delete ON public.member_rivals;
CREATE POLICY member_rivals_delete ON public.member_rivals
  FOR DELETE TO authenticated
  USING (public.running_league_member_owns_row(member_id));

NOTIFY pgrst, 'reload schema';
