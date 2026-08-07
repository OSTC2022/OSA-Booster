import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

function cleanText(value: unknown, fallback: string, maxLength: number) {
  const text = typeof value === 'string' ? value.trim() : ''
  return (text || fallback).slice(0, maxLength)
}

function roomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from(
    { length: 6 },
    () => alphabet[Math.floor(Math.random() * alphabet.length)],
  ).join('')
}

export async function GET(request: Request) {
  try {
    const supabase = createServiceRoleClient()
    const url = new URL(request.url)
    const roomId = url.searchParams.get('roomId')

    if (roomId) {
      const { data: room, error } = await supabase
        .from('tank_battle_rooms')
        .select(
          'id, code, name, host_player_id, status, max_players, seed, game_config, game_players, expires_at',
        )
        .eq('id', roomId)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle()
      if (error) throw error
      if (!room) return NextResponse.json({ error: '방을 찾을 수 없습니다.' }, { status: 404 })

      const { data: members, error: membersError } = await supabase
        .from('tank_battle_room_members')
        .select('player_id, nickname, seat, joined_at')
        .eq('room_id', roomId)
        .order('seat')
      if (membersError) throw membersError
      return NextResponse.json({ room, members: members ?? [] })
    }

    const now = new Date().toISOString()
    const staleMemberCutoff = new Date(Date.now() - 75_000).toISOString()
    const staleRoomCutoff = new Date(Date.now() - 90_000).toISOString()
    await supabase
      .from('tank_battle_room_members')
      .delete()
      .lt('last_seen_at', staleMemberCutoff)
    await supabase
      .from('tank_battle_rooms')
      .delete()
      .eq('status', 'waiting')
      .lt('updated_at', staleRoomCutoff)

    const { data: rooms, error } = await supabase
      .from('tank_battle_rooms')
      .select(
        'id, code, name, host_player_id, status, max_players, created_at, tank_battle_room_members(count)',
      )
      .eq('status', 'waiting')
      .gt('expires_at', now)
      .order('created_at', { ascending: false })
      .limit(40)
    if (error) throw error

    return NextResponse.json({
      rooms: (rooms ?? []).map((room) => ({
        id: room.id,
        code: room.code,
        name: room.name,
        hostPlayerId: room.host_player_id,
        status: room.status,
        maxPlayers: room.max_players,
        playerCount:
          (room.tank_battle_room_members as unknown as Array<{ count: number }>)?.[0]?.count ?? 0,
        createdAt: room.created_at,
      })),
    })
  } catch (error) {
    console.error('[tank-battle/rooms] GET failed', error)
    return NextResponse.json(
      { error: '온라인 방 목록을 불러오지 못했습니다. DB 설치 상태를 확인해주세요.' },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>
    const action = cleanText(body.action, '', 20)
    const playerId = cleanText(body.playerId, '', 80)
    const nickname = cleanText(body.nickname, 'PLAYER', 18)
    const supabase = createServiceRoleClient()

    if (!playerId) {
      return NextResponse.json({ error: '플레이어 식별자가 없습니다.' }, { status: 400 })
    }

    if (action === 'create') {
      const hostToken = cleanText(body.hostToken, '', 100)
      if (!hostToken) {
        return NextResponse.json({ error: '방장 인증키가 없습니다.' }, { status: 400 })
      }
      const maxPlayers = Math.max(2, Math.min(10, Number(body.maxPlayers) || 10))
      const name = cleanText(body.name, `${nickname}의 전장`, 40)
      let room: Record<string, unknown> | null = null
      let lastError: unknown = null
      for (let attempt = 0; attempt < 5 && !room; attempt += 1) {
        const { data, error } = await supabase
          .from('tank_battle_rooms')
          .insert({
            code: roomCode(),
            name,
            host_player_id: playerId,
            host_token_hash: hashToken(hostToken),
            max_players: maxPlayers,
          })
          .select('id, code, name, host_player_id, status, max_players')
          .single()
        if (!error) room = data
        else lastError = error
      }
      if (!room) throw lastError

      const { error: memberError } = await supabase.from('tank_battle_room_members').insert({
        room_id: room.id,
        player_id: playerId,
        nickname,
        seat: 0,
      })
      if (memberError) throw memberError
      return NextResponse.json({ room, seat: 0 })
    }

    if (action === 'join') {
      const code = cleanText(body.code, '', 6).toUpperCase()
      const { data, error } = await supabase.rpc('tank_join_room', {
        p_code: code,
        p_player_id: playerId,
        p_nickname: nickname,
      })
      if (error) {
        const message = error.message.includes('ROOM_FULL')
          ? '방이 가득 찼습니다.'
          : '참가할 수 있는 대기실이 아닙니다.'
        return NextResponse.json({ error: message }, { status: 409 })
      }
      const joined = data?.[0]
      if (!joined) {
        return NextResponse.json({ error: '방을 찾을 수 없습니다.' }, { status: 404 })
      }
      return NextResponse.json({
        room: {
          id: joined.room_id,
          code: joined.room_code,
          name: joined.room_name,
          host_player_id: joined.host_player_id,
          status: 'waiting',
          max_players: joined.max_players,
        },
        seat: joined.seat,
      })
    }

    const roomId = cleanText(body.roomId, '', 80)
    if (!roomId) {
      return NextResponse.json({ error: '방 식별자가 없습니다.' }, { status: 400 })
    }

    if (action === 'heartbeat') {
      await supabase
        .from('tank_battle_room_members')
        .update({ last_seen_at: new Date().toISOString() })
        .eq('room_id', roomId)
        .eq('player_id', playerId)
      if (body.isHost === true) {
        await supabase
          .from('tank_battle_rooms')
          .update({
            updated_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
          })
          .eq('id', roomId)
          .eq('host_player_id', playerId)
      }
      return NextResponse.json({ ok: true })
    }

    if (action === 'leave') {
      if (body.isHost === true) {
        const token = cleanText(body.hostToken, '', 100)
        await supabase
          .from('tank_battle_rooms')
          .delete()
          .eq('id', roomId)
          .eq('host_player_id', playerId)
          .eq('host_token_hash', hashToken(token))
      } else {
        await supabase
          .from('tank_battle_room_members')
          .delete()
          .eq('room_id', roomId)
          .eq('player_id', playerId)
      }
      return NextResponse.json({ ok: true })
    }

    if (action === 'start') {
      const token = cleanText(body.hostToken, '', 100)
      const seed = Math.max(1, Math.floor(Number(body.seed) || Date.now()))
      const requestedPlayers = Array.isArray(body.players) ? body.players : []
      const { count } = await supabase
        .from('tank_battle_room_members')
        .select('*', { count: 'exact', head: true })
        .eq('room_id', roomId)
      if (
        (count ?? 0) < 1 ||
        requestedPlayers.length < 2 ||
        requestedPlayers.length > 10
      ) {
        return NextResponse.json(
          { error: '사람과 COM을 포함해 2~10명이 필요합니다.' },
          { status: 409 },
        )
      }
      const { data, error } = await supabase
        .from('tank_battle_rooms')
        .update({
          status: 'playing',
          seed,
          game_config: body.config,
          game_players: body.players,
          updated_at: new Date().toISOString(),
        })
        .eq('id', roomId)
        .eq('host_player_id', playerId)
        .eq('host_token_hash', hashToken(token))
        .select('id')
        .maybeSingle()
      if (error) throw error
      if (!data) return NextResponse.json({ error: '방장만 시작할 수 있습니다.' }, { status: 403 })
      return NextResponse.json({ ok: true, seed })
    }

    return NextResponse.json({ error: '지원하지 않는 요청입니다.' }, { status: 400 })
  } catch (error) {
    console.error('[tank-battle/rooms] POST failed', error)
    return NextResponse.json(
      { error: '온라인 방 요청을 처리하지 못했습니다.' },
      { status: 500 },
    )
  }
}
