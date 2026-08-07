-- ONE STEP TANK BATTLE 온라인 방 · 최대 10인

CREATE TABLE IF NOT EXISTS public.tank_battle_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE CHECK (code ~ '^[A-Z0-9]{6}$'),
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 40),
  host_player_id TEXT NOT NULL,
  host_token_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting', 'playing', 'finished')),
  max_players INTEGER NOT NULL DEFAULT 10 CHECK (max_players BETWEEN 2 AND 10),
  seed BIGINT,
  game_config JSONB,
  game_players JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '2 hours'
);

CREATE TABLE IF NOT EXISTS public.tank_battle_room_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.tank_battle_rooms(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL,
  nickname TEXT NOT NULL CHECK (char_length(nickname) BETWEEN 1 AND 18),
  seat INTEGER NOT NULL CHECK (seat BETWEEN 0 AND 9),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (room_id, player_id),
  UNIQUE (room_id, seat)
);

CREATE INDEX IF NOT EXISTS tank_battle_rooms_list_idx
  ON public.tank_battle_rooms (status, expires_at, created_at DESC);
CREATE INDEX IF NOT EXISTS tank_battle_members_room_idx
  ON public.tank_battle_room_members (room_id, seat);

ALTER TABLE public.tank_battle_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tank_battle_room_members ENABLE ROW LEVEL SECURITY;

-- 모든 접근은 서비스 역할을 사용하는 서버 API를 통한다.
REVOKE ALL ON public.tank_battle_rooms FROM anon, authenticated;
REVOKE ALL ON public.tank_battle_room_members FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.tank_join_room(
  p_code TEXT,
  p_player_id TEXT,
  p_nickname TEXT
)
RETURNS TABLE (
  room_id UUID,
  room_code TEXT,
  room_name TEXT,
  host_player_id TEXT,
  max_players INTEGER,
  seat INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target public.tank_battle_rooms%ROWTYPE;
  existing_seat INTEGER;
  next_seat INTEGER;
BEGIN
  SELECT *
  INTO target
  FROM public.tank_battle_rooms
  WHERE code = UPPER(TRIM(p_code))
    AND status = 'waiting'
    AND expires_at > NOW()
  FOR UPDATE;

  IF target.id IS NULL THEN
    RAISE EXCEPTION 'ROOM_NOT_FOUND';
  END IF;

  SELECT m.seat INTO existing_seat
  FROM public.tank_battle_room_members m
  WHERE m.room_id = target.id AND m.player_id = p_player_id;

  IF existing_seat IS NOT NULL THEN
    UPDATE public.tank_battle_room_members
    SET nickname = LEFT(TRIM(p_nickname), 18), last_seen_at = NOW()
    WHERE tank_battle_room_members.room_id = target.id
      AND tank_battle_room_members.player_id = p_player_id;
    next_seat := existing_seat;
  ELSE
    IF (
      SELECT COUNT(*) FROM public.tank_battle_room_members m WHERE m.room_id = target.id
    ) >= target.max_players THEN
      RAISE EXCEPTION 'ROOM_FULL';
    END IF;

    SELECT candidate INTO next_seat
    FROM generate_series(0, target.max_players - 1) candidate
    WHERE NOT EXISTS (
      SELECT 1 FROM public.tank_battle_room_members m
      WHERE m.room_id = target.id AND m.seat = candidate
    )
    ORDER BY candidate
    LIMIT 1;

    INSERT INTO public.tank_battle_room_members (room_id, player_id, nickname, seat)
    VALUES (target.id, p_player_id, LEFT(TRIM(p_nickname), 18), next_seat);
  END IF;

  UPDATE public.tank_battle_rooms
  SET updated_at = NOW()
  WHERE id = target.id;

  RETURN QUERY SELECT
    target.id,
    target.code,
    target.name,
    target.host_player_id,
    target.max_players,
    next_seat;
END;
$$;

REVOKE ALL ON FUNCTION public.tank_join_room(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tank_join_room(TEXT, TEXT, TEXT) TO service_role;

COMMENT ON TABLE public.tank_battle_rooms IS '탱크 배틀 온라인 대기실';
COMMENT ON TABLE public.tank_battle_room_members IS '탱크 배틀 온라인 방 참가자';

NOTIFY pgrst, 'reload schema';
