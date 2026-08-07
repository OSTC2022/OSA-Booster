import type { RealtimeChannel } from '@supabase/supabase-js'
import { DEFAULT_CONFIG, PLAYER_COLORS } from './campaign'
import { createEquipmentInventory, createWeaponInventory } from './weapons'
import type { AugmentId, CampaignPlayer, GameConfig, WeaponId } from './types'

export interface OnlineRoomSummary {
  id: string
  code: string
  name: string
  hostPlayerId: string
  status: 'waiting' | 'playing' | 'finished'
  maxPlayers: number
  playerCount: number
  createdAt: string
}

export interface OnlineRoom {
  id: string
  code: string
  name: string
  hostPlayerId: string
  maxPlayers: number
}

export interface OnlinePresencePlayer {
  playerId: string
  nickname: string
  seat: number
  joinedAt: number
  color: string
}

export interface OnlineGameSession {
  room: OnlineRoom
  localPlayerId: string
  isHost: boolean
  hostToken: string | null
  seed: number
  channel: RealtimeChannel
}

export type OnlineCommand =
  | { kind: 'aim'; playerId: string; key: 'turretAngle' | 'power'; value: number }
  | { kind: 'selectWeapon'; playerId: string; weaponId: WeaponId }
  | {
      kind: 'fire'
      playerId: string
      angle: number
      power: number
      weaponId: WeaponId
      perfectShot?: boolean
      assistStrength?: number
      assistTargetId?: string | null
    }
  | { kind: 'repair'; playerId: string }
  | { kind: 'teleport'; playerId: string; targetX: number }
  | { kind: 'timeout'; playerId: string }
  | { kind: 'pickAugment'; playerId: string; augmentId: AugmentId }

export function createOnlineConfig(playerCount: number, humanCount = playerCount): GameConfig {
  return {
    ...DEFAULT_CONFIG,
    playerCount,
    humanCount,
    aiCount: playerCount - humanCount,
    totalRounds: 1,
    startingCoins: 0,
    shopEnabled: false,
    turnTimeSeconds: 35,
    windMode: 'turn',
  }
}

export function createOnlinePlayers(
  participants: OnlinePresencePlayer[],
): CampaignPlayer[] {
  const teamByColor = new Map<string, number>()
  participants.forEach((participant) => {
    if (!teamByColor.has(participant.color)) {
      teamByColor.set(participant.color, teamByColor.size)
    }
  })
  return [...participants]
    .sort((a, b) => a.seat - b.seat)
    .slice(0, 10)
    .map((participant, index) => ({
      id: participant.playerId,
      name: participant.nickname,
      type: participant.playerId.startsWith('online-ai-') ? 'ai' : 'human',
      aiDifficulty: 'normal',
      color: participant.color || PLAYER_COLORS[index % PLAYER_COLORS.length],
      team: teamByColor.get(participant.color) ?? index,
      coins: 0,
      weapons: {
        ...createWeaponInventory(),
        heavy: 2,
        triple: 2,
        terrain: 2,
        mega: 1,
      },
      equipment: {
        ...createEquipmentInventory(),
        shield: 1,
        repair: 1,
        teleport: 1,
      },
      kills: 0,
      totalDamage: 0,
      damageTaken: 0,
      roundWins: 0,
      weaponUses: { basic: 0, heavy: 0, triple: 0, terrain: 0, mega: 0 },
      ready: true,
    }))
}
