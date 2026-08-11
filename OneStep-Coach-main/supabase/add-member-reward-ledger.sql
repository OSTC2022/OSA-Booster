-- XP / REWARD POINT Ledger (마일리지 km와 별개)
-- Supabase SQL Editor에서 실행

CREATE TABLE IF NOT EXISTS public.member_reward_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  currency TEXT NOT NULL CHECK (currency IN ('XP', 'POINT')),
  amount INTEGER NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT,
  idempotency_key TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT member_reward_ledger_idempotency UNIQUE (member_id, idempotency_key),
  CONSTRAINT member_reward_ledger_xp_non_negative CHECK (
    currency <> 'XP' OR amount >= 0
  )
);

CREATE INDEX IF NOT EXISTS member_reward_ledger_member_idx
  ON public.member_reward_ledger (member_id, created_at DESC);

CREATE INDEX IF NOT EXISTS member_reward_ledger_member_currency_idx
  ON public.member_reward_ledger (member_id, currency);

ALTER TABLE public.member_reward_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS member_reward_ledger_select ON public.member_reward_ledger;
CREATE POLICY member_reward_ledger_select ON public.member_reward_ledger
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

-- 일반 회원 INSERT/UPDATE/DELETE 불가. 지급은 service role / staff RPC 경로만.
DROP POLICY IF EXISTS member_reward_ledger_staff_write ON public.member_reward_ledger;
CREATE POLICY member_reward_ledger_staff_write ON public.member_reward_ledger
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'operator')
        AND p.approval_status = 'approved'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'operator')
        AND p.approval_status = 'approved'
    )
  );

NOTIFY pgrst, 'reload schema';
