import {
  EQUIPMENT,
  SHOP_ITEMS,
  WEAPONS,
  createEquipmentInventory,
  createWeaponInventory,
  isWeaponId,
} from './weapons'
import type {
  AiDifficulty,
  CampaignPlayer,
  GameConfig,
  RoundResult,
  SavedCampaign,
  ShopItemId,
  WeaponId,
} from './types'

export const SAVE_VERSION = 1
export const SAVE_KEY = 'one-step-artillery-save-v1'
export const SETTINGS_KEY = 'one-step-artillery-settings-v1'

export const PLAYER_COLORS = [
  '#39ff88',
  '#ff9f43',
  '#43c7ff',
  '#ff5b87',
  '#c084fc',
  '#f7e34f',
  '#fb7185',
  '#2dd4bf',
  '#a3e635',
  '#f97316',
]

export const DEFAULT_CONFIG: GameConfig = {
  playerCount: 2,
  humanCount: 1,
  aiCount: 1,
  aiDifficulty: 'normal',
  totalRounds: 3,
  startingHealth: 100,
  startingCoins: 5000,
  turnTimeSeconds: 30,
  windMode: 'turn',
  terrainType: 'random',
  shopEnabled: true,
  fallDamage: true,
  crtEffect: true,
  screenShake: true,
}

export function normalizeConfig(input: GameConfig): GameConfig {
  const playerCount = Math.max(2, Math.min(6, Math.round(input.playerCount)))
  const humanCount = Math.max(1, Math.min(playerCount, Math.round(input.humanCount)))
  return {
    ...input,
    playerCount,
    humanCount,
    aiCount: playerCount - humanCount,
    totalRounds: Math.max(1, Math.min(9, Math.round(input.totalRounds))),
    startingHealth: Math.max(50, Math.min(300, Math.round(input.startingHealth))),
    startingCoins: Math.max(0, Math.min(20_000, Math.round(input.startingCoins))),
    turnTimeSeconds: Math.max(10, Math.min(120, Math.round(input.turnTimeSeconds))),
  }
}

export function createCampaignPlayers(config: GameConfig): CampaignPlayer[] {
  return Array.from({ length: config.playerCount }, (_, index) => {
    const human = index < config.humanCount
    return {
      id: `player-${index + 1}`,
      name: human ? (index === 0 ? '러닝라이프' : `PLAYER ${index + 1}`) : `AI ${String.fromCharCode(65 + index - config.humanCount)}`,
      type: human ? 'human' : 'ai',
      aiDifficulty: config.aiDifficulty,
      color: PLAYER_COLORS[index],
      team: null,
      coins: config.startingCoins,
      weapons: createWeaponInventory(),
      equipment: createEquipmentInventory(),
      kills: 0,
      totalDamage: 0,
      damageTaken: 0,
      roundWins: 0,
      weaponUses: { basic: 0, heavy: 0, triple: 0, terrain: 0, mega: 0 },
      ready: false,
    }
  })
}

export function purchaseItem(player: CampaignPlayer, itemId: ShopItemId) {
  const item = isWeaponId(itemId) ? WEAPONS[itemId] : EQUIPMENT[itemId]
  if (!item || player.coins < item.price) return false
  player.coins -= item.price
  if (isWeaponId(itemId)) player.weapons[itemId] += 1
  else player.equipment[itemId] += 1
  return true
}

export function autoShop(player: CampaignPlayer) {
  if (player.type !== 'ai') return
  const priorities: Record<AiDifficulty, ShopItemId[]> = {
    easy: ['shield', 'heavy'],
    normal: ['shield', 'triple', 'heavy', 'repair'],
    hard: ['mega', 'shield', 'triple', 'terrain', 'repair', 'teleport', 'heavy'],
  }
  for (const itemId of priorities[player.aiDifficulty]) {
    if (purchaseItem(player, itemId) && player.coins >= 600 && Math.random() > 0.45) {
      purchaseItem(player, itemId)
    }
  }
  player.ready = true
}

export function calculateRoundRewards(result: RoundResult, players: CampaignPlayer[]) {
  return players.map((player) => {
    const stats = result.stats.find((entry) => entry.playerId === player.id)
    if (!stats) return player
    const next = structuredClone(player)
    next.coins += stats.coinsEarned
    next.kills += stats.kills
    next.totalDamage += stats.damageDealt
    next.damageTaken += stats.damageTaken
    if ((result.winnerIds ?? [result.winnerId]).includes(next.id)) next.roundWins += 1
    for (const weaponId of Object.keys(stats.usedWeapons) as WeaponId[]) {
      next.weaponUses[weaponId] += stats.usedWeapons[weaponId]
    }
    next.ready = false
    return next
  })
}

export function rankPlayers(players: CampaignPlayer[]) {
  return [...players].sort(
    (a, b) =>
      b.roundWins - a.roundWins ||
      b.kills - a.kills ||
      b.totalDamage - a.totalDamage ||
      b.coins - a.coins,
  )
}

export function createSave(
  phase: SavedCampaign['phase'],
  config: GameConfig,
  players: CampaignPlayer[],
  currentRound: number,
  roundResults: RoundResult[],
): SavedCampaign {
  return {
    version: SAVE_VERSION,
    phase,
    config,
    players,
    currentRound,
    roundResults,
    savedAt: Date.now(),
  }
}

export function parseSave(raw: string | null): SavedCampaign | null {
  if (!raw) return null
  try {
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object') return null
    const candidate = value as Partial<SavedCampaign>
    if (
      candidate.version !== SAVE_VERSION ||
      !candidate.config ||
      !Array.isArray(candidate.players) ||
      !Array.isArray(candidate.roundResults) ||
      typeof candidate.currentRound !== 'number'
    ) {
      return null
    }
    return candidate as SavedCampaign
  } catch {
    return null
  }
}

export function cheapestAffordableItem(player: CampaignPlayer) {
  return SHOP_ITEMS
    .filter((item) => item.price <= player.coins)
    .sort((a, b) => a.price - b.price)[0] ?? null
}
