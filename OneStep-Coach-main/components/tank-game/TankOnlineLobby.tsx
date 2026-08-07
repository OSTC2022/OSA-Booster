'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Copy, Crown, DoorOpen, Plus, RefreshCw, Users } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { PLAYER_COLORS } from '@/lib/tank-game/campaign'
import {
  createOnlineConfig,
  createOnlinePlayers,
  type OnlineGameSession,
  type OnlinePresencePlayer,
  type OnlineRoom,
  type OnlineRoomSummary,
} from '@/lib/tank-game/online'
import type { CampaignPlayer, GameConfig } from '@/lib/tank-game/types'

interface StartPayload {
  seed: number
  config: GameConfig
  players: CampaignPlayer[]
}

interface TankOnlineLobbyProps {
  onStart: (
    session: OnlineGameSession,
    config: GameConfig,
    players: CampaignPlayer[],
  ) => void
  onExit: () => void
}

const button =
  'inline-flex min-h-11 items-center justify-center gap-2 border border-cyan-400/30 bg-cyan-400/10 px-4 font-mono text-xs font-bold transition hover:bg-cyan-300/20 disabled:cursor-not-allowed disabled:opacity-35'
const primary =
  'inline-flex min-h-12 items-center justify-center gap-2 border-2 border-lime-300 bg-lime-300 px-5 font-mono text-sm font-black text-black disabled:border-zinc-600 disabled:bg-zinc-700 disabled:text-zinc-400'
const input =
  'h-11 w-full border border-cyan-400/25 bg-[#030a12] px-3 font-mono text-sm text-white outline-none focus:border-cyan-300'

function getOnlineIdentity() {
  const playerKey = 'tank-online-player-id'
  const nameKey = 'tank-online-nickname'
  let playerId = localStorage.getItem(playerKey)
  if (!playerId) {
    playerId = crypto.randomUUID()
    localStorage.setItem(playerKey, playerId)
  }
  return {
    playerId,
    nickname: localStorage.getItem(nameKey) || `PLAYER-${playerId.slice(0, 4).toUpperCase()}`,
  }
}

function normalizeRoom(raw: Record<string, unknown>): OnlineRoom {
  return {
    id: String(raw.id),
    code: String(raw.code),
    name: String(raw.name),
    hostPlayerId: String(raw.host_player_id),
    maxPlayers: Number(raw.max_players),
  }
}

export function TankOnlineLobby({ onStart, onExit }: TankOnlineLobbyProps) {
  const supabase = useMemo(() => createClient(), [])
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const transferredRef = useRef(false)
  const hostTokenRef = useRef<string | null>(null)
  const identityRef = useRef<{ playerId: string; nickname: string } | null>(null)
  const joinedAtRef = useRef(Date.now())
  const selectedColorRef = useRef(PLAYER_COLORS[0])
  const [nickname, setNickname] = useState('')
  const [roomName, setRoomName] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [maxPlayers, setMaxPlayers] = useState(10)
  const [rooms, setRooms] = useState<OnlineRoomSummary[]>([])
  const [room, setRoom] = useState<OnlineRoom | null>(null)
  const [participants, setParticipants] = useState<OnlinePresencePlayer[]>([])
  const [connected, setConnected] = useState(false)
  const [localSeat, setLocalSeat] = useState<number | null>(null)
  const [selectedColor, setSelectedColor] = useState(PLAYER_COLORS[0])
  const [aiCount, setAiCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const localPlayerId = identityRef.current?.playerId

  const publishPresence = useCallback(
    async (color: string) => {
      const identity = identityRef.current
      const channel = channelRef.current
      if (!identity || localSeat === null || !channel) return
      localStorage.setItem('tank-online-color', color)
      await channel.track({
        playerId: identity.playerId,
        nickname: identity.nickname,
        seat: localSeat,
        joinedAt: joinedAtRef.current,
        color,
      })
    },
    [localSeat],
  )

  const selectTeamColor = useCallback(
    (color: string) => {
      selectedColorRef.current = color
      setSelectedColor(color)
      const identity = identityRef.current
      if (identity) {
        // 즉시 로컬 슬롯 닉네임 색 반영 (모든 화면에서 팀 구분 보이게)
        setParticipants((current) =>
          current.map((player) =>
            player.playerId === identity.playerId ? { ...player, color } : player,
          ),
        )
      }
      void publishPresence(color)
    },
    [publishPresence],
  )
  useEffect(() => {
    const identity = getOnlineIdentity()
    identityRef.current = identity
    setNickname(identity.nickname)
    setRoomName(`${identity.nickname}의 전장`)
    const savedColor = localStorage.getItem('tank-online-color')
    if (savedColor && PLAYER_COLORS.includes(savedColor)) {
      selectedColorRef.current = savedColor
      setSelectedColor(savedColor)
    }
  }, [])

  const loadRooms = useCallback(async () => {
    try {
      const response = await fetch('/api/tank-battle/rooms', { cache: 'no-store' })
      const data = (await response.json()) as { rooms?: OnlineRoomSummary[]; error?: string }
      if (!response.ok) throw new Error(data.error || '방 목록 오류')
      setRooms(data.rooms ?? [])
      setError('')
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '방 목록을 불러오지 못했습니다.')
    }
  }, [])

  useEffect(() => {
    if (room) return
    void loadRooms()
    const timer = window.setInterval(loadRooms, 5000)
    return () => window.clearInterval(timer)
  }, [loadRooms, room])

  const beginGame = useCallback(
    (payload: StartPayload, activeRoom: OnlineRoom) => {
      const identity = identityRef.current
      const channel = channelRef.current
      if (!identity || !channel) return
      transferredRef.current = true
      onStart(
        {
          room: activeRoom,
          localPlayerId: identity.playerId,
          isHost: activeRoom.hostPlayerId === identity.playerId,
          hostToken: hostTokenRef.current,
          seed: payload.seed,
          channel,
        },
        payload.config,
        payload.players,
      )
    },
    [onStart],
  )

  const connectRoom = useCallback(
    async (activeRoom: OnlineRoom, seat: number) => {
      const identity = identityRef.current
      if (!identity) return
      if (channelRef.current) await supabase.removeChannel(channelRef.current)

      const channel = supabase.channel(`tank-battle-room:${activeRoom.id}`, {
        config: {
          presence: { key: identity.playerId },
          broadcast: { self: false },
        },
      })
      channelRef.current = channel
      channel
        .on('presence', { event: 'sync' }, () => {
          const state = channel.presenceState<Record<string, unknown>>()
          const identity = identityRef.current
          const online = Object.values(state)
            .flat()
            .map((entry) => {
              const playerId = String(entry.playerId ?? '')
              const rawColor = String(entry.color ?? '').trim()
              const seat = Number(entry.seat ?? 99)
              const color =
                rawColor ||
                (identity && playerId === identity.playerId
                  ? selectedColorRef.current
                  : PLAYER_COLORS[seat % PLAYER_COLORS.length])
              return {
                playerId,
                nickname: String(entry.nickname ?? 'PLAYER'),
                seat,
                joinedAt: Number(entry.joinedAt ?? Date.now()),
                color,
              }
            })
            .filter((entry) => entry.playerId)
            .sort((a, b) => a.seat - b.seat)
            .slice(0, activeRoom.maxPlayers)
          setParticipants(online)
        })
        .on('broadcast', { event: 'start-game' }, ({ payload }) => {
          beginGame(payload as StartPayload, activeRoom)
        })
        .on('broadcast', { event: 'room-closed' }, () => {
          setError('방장이 대기실을 종료했습니다.')
          setRoom(null)
          setParticipants([])
          setConnected(false)
          void supabase.removeChannel(channel)
          channelRef.current = null
        })
        .subscribe(async (status) => {
          if (status !== 'SUBSCRIBED') return
          setConnected(true)
          joinedAtRef.current = Date.now()
          await channel.track({
            playerId: identity.playerId,
            nickname: identity.nickname,
            seat,
            joinedAt: joinedAtRef.current,
            color: selectedColor,
          })
        })
      setLocalSeat(seat)
      setRoom(activeRoom)
    },
    [beginGame, selectedColor, supabase],
  )

  useEffect(() => {
    if (!room || !connected || localSeat === null) return
    void publishPresence(selectedColor)
  }, [connected, localSeat, publishPresence, room, selectedColor])

  const request = useCallback(
    async (body: Record<string, unknown>) => {
      const identity = identityRef.current
      if (!identity) throw new Error('플레이어 정보를 준비 중입니다.')
      localStorage.setItem('tank-online-nickname', nickname.trim())
      identity.nickname = nickname.trim() || identity.nickname
      const response = await fetch('/api/tank-battle/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...body,
          playerId: identity.playerId,
          nickname: identity.nickname,
        }),
      })
      const data = (await response.json()) as Record<string, unknown>
      if (!response.ok) throw new Error(String(data.error || '온라인 요청 실패'))
      return data
    },
    [nickname],
  )

  const createRoom = async () => {
    if (!nickname.trim()) return
    setLoading(true)
    setError('')
    try {
      const hostToken = crypto.randomUUID()
      hostTokenRef.current = hostToken
      const data = await request({
        action: 'create',
        name: roomName,
        maxPlayers,
        hostToken,
      })
      await connectRoom(normalizeRoom(data.room as Record<string, unknown>), Number(data.seat))
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : '방 생성 실패')
    } finally {
      setLoading(false)
    }
  }

  const joinRoom = async (code: string) => {
    if (!nickname.trim()) return
    setLoading(true)
    setError('')
    try {
      hostTokenRef.current = null
      const data = await request({ action: 'join', code })
      await connectRoom(normalizeRoom(data.room as Record<string, unknown>), Number(data.seat))
    } catch (joinError) {
      setError(joinError instanceof Error ? joinError.message : '방 참가 실패')
    } finally {
      setLoading(false)
    }
  }

  const leaveRoom = useCallback(async () => {
    const identity = identityRef.current
    const activeRoom = room
    const channel = channelRef.current
    if (!identity || !activeRoom) return
    const isHost = activeRoom.hostPlayerId === identity.playerId
    if (isHost && channel) {
      await channel.send({ type: 'broadcast', event: 'room-closed', payload: {} })
    }
    try {
      await request({
        action: 'leave',
        roomId: activeRoom.id,
        isHost,
        hostToken: hostTokenRef.current,
      })
    } finally {
      if (channel) await supabase.removeChannel(channel)
      channelRef.current = null
      hostTokenRef.current = null
      setRoom(null)
      setParticipants([])
      setConnected(false)
      setLocalSeat(null)
    }
  }, [request, room, supabase])

  useEffect(() => {
    if (!room) return
    const identity = identityRef.current
    const timer = window.setInterval(() => {
      if (!identity) return
      void request({
        action: 'heartbeat',
        roomId: room.id,
        isHost: room.hostPlayerId === identity.playerId,
      })
    }, 25_000)
    return () => window.clearInterval(timer)
  }, [request, room])

  useEffect(
    () => () => {
      if (!transferredRef.current && channelRef.current) {
        void supabase.removeChannel(channelRef.current)
      }
    },
    [supabase],
  )

  const startGame = async () => {
    const identity = identityRef.current
    const channel = channelRef.current
    if (!identity || !room || !channel) return
    setLoading(true)
    setError('')
    try {
      const roster = [...participants]
      if (aiCount > 0) {
        const occupiedSeats = new Set(roster.map((player) => player.seat))
        const usedColors = new Set(roster.map((player) => player.color))
        let addedAi = 0
        for (let seat = 0; seat < room.maxPlayers; seat += 1) {
          if (occupiedSeats.has(seat) || addedAi >= aiCount) continue
          const aiColor =
            PLAYER_COLORS.find((color) => !usedColors.has(color)) ??
            PLAYER_COLORS[seat % PLAYER_COLORS.length]
          usedColors.add(aiColor)
          roster.push({
            playerId: `online-ai-${seat}`,
            nickname: `COM ${seat + 1}`,
            seat,
            joinedAt: Date.now() + seat,
            color: aiColor,
          })
          addedAi += 1
        }
      }
      const config = createOnlineConfig(roster.length, participants.length)
      const players = createOnlinePlayers(roster)
      const seed = Math.floor(1 + Math.random() * 2_000_000_000)
      await request({
        action: 'start',
        roomId: room.id,
        hostToken: hostTokenRef.current,
        seed,
        config,
        players,
      })
      const payload = { seed, config, players }
      await channel.send({ type: 'broadcast', event: 'start-game', payload })
      beginGame(payload, room)
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : '게임 시작 실패')
    } finally {
      setLoading(false)
    }
  }

  if (room) {
    const identity = identityRef.current
    const isHost = room.hostPlayerId === identity?.playerId
    const availableAiSlots = Math.max(0, room.maxPlayers - participants.length)
    const safeAiCount = Math.min(aiCount, availableAiSlots)
    const canStart = participants.length + safeAiCount >= 2
    return (
      <main className="min-h-[100dvh] bg-[#03050b] px-4 py-6 text-cyan-50">
        <div className="mx-auto max-w-4xl">
          <header className="border-b border-cyan-400/20 pb-4">
            <p className="font-mono text-[10px] tracking-[.3em] text-lime-300">ONLINE WAITING ROOM</p>
            <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="font-mono text-2xl font-black">{room.name}</h1>
                <p className="mt-1 text-xs text-cyan-100/50">
                  최대 {room.maxPlayers}명 · {connected ? '실시간 서버 연결됨' : '연결 중...'}
                </p>
              </div>
              <button type="button" className={button}
                onClick={() => void navigator.clipboard.writeText(room.code)}>
                <Copy className="h-4 w-4" /> 초대 코드 {room.code}
              </button>
            </div>
          </header>

          <section className="mt-4 border border-cyan-400/20 bg-[#07111d] p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-mono text-xs font-bold">팀 색상 선택</p>
                <p className="mt-1 text-[10px] text-cyan-100/45">
                  같은 색상을 선택한 플레이어는 같은 팀으로 승리합니다.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {PLAYER_COLORS.map((color) => (
                  <button key={color} type="button" aria-label={`팀 색상 ${color}`}
                    onClick={() => selectTeamColor(color)}
                    className={`h-8 w-8 rounded-full border-2 transition ${
                      selectedColor === color ? 'scale-110 border-white' : 'border-white/20'
                    }`}
                    style={{ backgroundColor: color, boxShadow: selectedColor === color ? `0 0 14px ${color}` : undefined }}
                  />
                ))}
              </div>
            </div>
          </section>

          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {Array.from({ length: room.maxPlayers }, (_, seat) => {
              const player = participants.find((entry) => entry.seat === seat)
              const isLocal = Boolean(player && localPlayerId && player.playerId === localPlayerId)
              const displayColor = isLocal ? selectedColor : player?.color
              return (
                <div key={seat}
                  style={displayColor ? {
                    borderColor: `${displayColor}aa`,
                    boxShadow: `inset 0 0 18px ${displayColor}22`,
                  } : undefined}
                  className={`min-h-24 border p-3 ${
                    player ? 'bg-black/25' : 'border-white/10 bg-black/20'
                  }`}>
                  <div className="flex items-center justify-between font-mono text-[10px] text-cyan-100/40">
                    <span>SLOT {seat + 1}</span>
                    {player?.playerId === room.hostPlayerId && <Crown className="h-3.5 w-3.5 text-yellow-300" />}
                  </div>
                  <p
                    className="mt-4 truncate font-mono text-sm font-bold"
                    style={displayColor ? { color: displayColor } : { color: 'rgba(255,255,255,.45)' }}
                  >
                    {player?.nickname ?? '대기 중...'}
                  </p>
                  {player && displayColor && (
                    <p className="mt-1 font-mono text-[9px]" style={{ color: displayColor }}>
                      {isLocal ? '내 팀 색상' : '팀 색상'}
                    </p>
                  )}
                </div>
              )
            })}
          </div>

          {error && <p className="mt-3 border border-red-400/30 bg-red-400/10 p-3 text-xs text-red-200">{error}</p>}
          <div className="mt-5 flex flex-wrap justify-between gap-2 border-t border-cyan-400/20 pt-4">
            <button type="button" className={button} onClick={() => void leaveRoom()}>
              <ArrowLeft className="h-4 w-4" /> 나가기
            </button>
            {isHost ? (
              <div className="flex flex-wrap items-center justify-end gap-2">
                <div className="flex items-center border border-orange-300/30 bg-orange-300/10 font-mono text-xs">
                  <button type="button" className="h-10 px-3 text-orange-200"
                    onClick={() => setAiCount((count) => Math.max(0, count - 1))}>−</button>
                  <span className="min-w-20 text-center text-orange-100">COM {safeAiCount}명</span>
                  <button type="button" className="h-10 px-3 text-orange-200"
                    onClick={() => setAiCount((count) => Math.min(availableAiSlots, count + 1))}>＋</button>
                </div>
                <button type="button" className={primary} disabled={loading || !canStart}
                  onClick={() => void startGame()}>
                  <Users className="h-4 w-4" /> {
                    `${participants.length + safeAiCount}명 전투 시작`
                  }
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 font-mono text-xs text-cyan-100/55">
                <RefreshCw className="h-4 w-4 animate-spin" /> 방장이 시작하기를 기다리는 중
              </div>
            )}
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-[100dvh] bg-[#03050b] px-4 py-6 text-cyan-50">
      <div className="mx-auto max-w-5xl">
        <header className="flex items-end justify-between gap-3 border-b border-cyan-400/20 pb-4">
          <div>
            <p className="font-mono text-[10px] tracking-[.3em] text-lime-300">ONLINE PVP</p>
            <h1 className="mt-1 font-mono text-2xl font-black">온라인 전장 찾기</h1>
            <p className="mt-1 text-xs text-cyan-100/50">방을 만들거나 초대 코드로 참가하세요 · 최대 10명</p>
          </div>
          <button type="button" className={button} onClick={onExit}>
            <ArrowLeft className="h-4 w-4" /> 메인 메뉴
          </button>
        </header>

        <div className="mt-4 grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <section className="space-y-3 border border-cyan-400/20 bg-[#07111d] p-4">
            <label className="block space-y-1">
              <span className="font-mono text-[10px] text-cyan-100/55">닉네임</span>
              <input className={input} maxLength={18} value={nickname}
                onChange={(event) => setNickname(event.target.value)} />
            </label>
            <label className="block space-y-1">
              <span className="font-mono text-[10px] text-cyan-100/55">방 이름</span>
              <input className={input} maxLength={40} value={roomName}
                onChange={(event) => setRoomName(event.target.value)} />
            </label>
            <label className="block space-y-1">
              <span className="font-mono text-[10px] text-cyan-100/55">최대 인원 · {maxPlayers}명</span>
              <input className="w-full accent-lime-300" type="range" min="2" max="10"
                value={maxPlayers} onChange={(event) => setMaxPlayers(Number(event.target.value))} />
            </label>
            <button type="button" className={`${primary} w-full`} disabled={loading || !nickname.trim()}
              onClick={() => void createRoom()}>
              <Plus className="h-4 w-4" /> 새 방 만들기
            </button>
            <div className="flex gap-2 border-t border-cyan-400/15 pt-3">
              <input className={input} maxLength={6} placeholder="초대 코드"
                value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} />
              <button type="button" className={button} disabled={loading || joinCode.length !== 6}
                onClick={() => void joinRoom(joinCode)}>
                <DoorOpen className="h-4 w-4" /> 참가
              </button>
            </div>
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-mono text-sm font-bold">공개 대기실</h2>
              <button type="button" className={button} onClick={() => void loadRooms()}>
                <RefreshCw className="h-4 w-4" /> 새로고침
              </button>
            </div>
            <div className="space-y-2">
              {rooms.map((entry) => (
                <article key={entry.id}
                  className="flex flex-wrap items-center justify-between gap-3 border border-cyan-400/20 bg-[#07111d] p-4">
                  <div>
                    <h3 className="font-mono text-sm font-bold">{entry.name}</h3>
                    <p className="mt-1 font-mono text-[10px] text-cyan-100/45">
                      CODE {entry.code} · {entry.playerCount}/{entry.maxPlayers}명
                    </p>
                  </div>
                  <button type="button" className={button}
                    disabled={loading || entry.playerCount >= entry.maxPlayers}
                    onClick={() => void joinRoom(entry.code)}>
                    <DoorOpen className="h-4 w-4" /> 참가하기
                  </button>
                </article>
              ))}
              {!rooms.length && !error && (
                <div className="grid min-h-40 place-items-center border border-dashed border-cyan-400/20 text-center text-xs text-cyan-100/40">
                  현재 기다리는 방이 없습니다. 첫 방을 만들어보세요.
                </div>
              )}
            </div>
          </section>
        </div>
        {error && <p className="mt-3 border border-red-400/30 bg-red-400/10 p-3 text-xs text-red-200">{error}</p>}
      </div>
    </main>
  )
}
