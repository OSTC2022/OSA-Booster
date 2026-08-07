export type CombatPhase =
  | 'aiming'
  | 'augment'
  | 'flying'
  | 'exploding'
  | 'settling'
  | 'finished'

export type AugmentId =
  | 'firepower'
  | 'sniper'
  | 'kangaroo'
  | 'ironclad'
  | 'widecrater'
  | 'terrainist'
  | 'arsenal'
  | 'aegis'
  | 'medic'
  | 'crit'
  | 'vamp'
  | 'chain'
  | 'overcharge'
  | 'fortress'
  | 'scavenger'
export type AppGamePhase =
  | 'mainMenu'
  | 'gameSetup'
  | 'playerSetup'
  | 'shopping'
  | 'battle'
  | 'roundResult'
  | 'finalResult'
  | 'help'
  | 'settings'

export type PlayerType = 'human' | 'ai'
export type AiDifficulty = 'easy' | 'normal' | 'hard'
export type WindMode = 'none' | 'fixed' | 'round' | 'turn'
export type TerrainType = 'random' | 'hills' | 'mountains' | 'valley' | 'rough'
export type WeatherType = 'clear' | 'rain' | 'snow'
export type WeaponId = 'basic' | 'heavy' | 'triple' | 'terrain' | 'mega'
export type EquipmentId = 'shield' | 'repair' | 'teleport'
export type ShopItemId = WeaponId | EquipmentId

export interface GameConfig {
  playerCount: number
  humanCount: number
  aiCount: number
  aiDifficulty: AiDifficulty
  totalRounds: number
  startingHealth: number
  startingCoins: number
  turnTimeSeconds: number
  windMode: WindMode
  terrainType: TerrainType
  shopEnabled: boolean
  fallDamage: boolean
  crtEffect: boolean
  screenShake: boolean
}

export type WeaponInventory = Record<WeaponId, number>
export type EquipmentInventory = Record<EquipmentId, number>

export interface CampaignPlayer {
  id: string
  name: string
  type: PlayerType
  aiDifficulty: AiDifficulty
  color: string
  team: number | null
  coins: number
  weapons: WeaponInventory
  equipment: EquipmentInventory
  kills: number
  totalDamage: number
  damageTaken: number
  roundWins: number
  weaponUses: Record<WeaponId, number>
  ready: boolean
}

export interface PlayerRoundStats {
  playerId: string
  rank: number
  damageDealt: number
  damageTaken: number
  kills: number
  coinsEarned: number
  usedWeapons: Record<WeaponId, number>
}

export interface RoundResult {
  round: number
  winnerId: string | null
  winnerIds: string[]
  stats: PlayerRoundStats[]
}

export interface SavedCampaign {
  version: number
  phase: Exclude<AppGamePhase, 'battle'>
  config: GameConfig
  players: CampaignPlayer[]
  currentRound: number
  roundResults: RoundResult[]
  savedAt: number
}

export interface Point { x: number; y: number }

export interface TankState extends Point {
  id: string
  nickname: string
  color: string
  playerType: PlayerType
  aiDifficulty: AiDifficulty
  team: number | null
  turretAngle: number
  power: number
  health: number
  maxHealth: number
  shield: number
  alive: boolean
  selectedWeapon: WeaponId
  weapons: WeaponInventory
  equipment: EquipmentInventory
  coins: number
  kills: number
  roundKills: number
  roundWins: number
  damageDealt: number
  damageTaken: number
  fallStartY: number | null
  weaponUses: Record<WeaponId, number>
  augments: AugmentId[]
}

export interface ProjectileState extends Point {
  velocityX: number
  velocityY: number
  ownerId: string
  weaponId: WeaponId
  age: number
  trail: Point[]
  perfectShot?: boolean
  /** 0~1 추천 타이밍 명중 보정 */
  assistStrength?: number
  assistTargetId?: string | null
}

export type ParticleKind = 'ember' | 'spark' | 'smoke' | 'shard'

export interface Particle extends Point {
  velocityX: number
  velocityY: number
  life: number
  maxLife: number
  color: string
  size: number
  kind: ParticleKind
  gravity: number
  drag: number
}

export interface ExplosionState extends Point {
  radius: number
  age: number
  duration: number
  weaponId: WeaponId
  particles: Particle[]
}

export type VisualEffectKind =
  | 'muzzleFlash'
  | 'shieldHit'
  | 'repairHeal'
  | 'teleportOut'
  | 'teleportIn'
  | 'megaFlash'
  | 'perfectShot'

export interface VisualEffect extends Point {
  kind: VisualEffectKind
  age: number
  duration: number
  color: string
  angle?: number
}

export interface LightningState {
  x: number
  age: number
  strikeAt: number
  duration: number
  struck: boolean
}

export interface TerrainState {
  width: number
  height: number
  seed: number
  mask: Uint8Array
  heights: number[]
  revision: number
}

export interface GameState {
  phase: CombatPhase
  terrain: TerrainState
  tanks: TankState[]
  currentTankIndex: number
  turnSideOrder: string[]
  sideCursors: Record<string, number>
  projectiles: ProjectileState[]
  explosions: ExplosionState[]
  effects: VisualEffect[]
  damageNumbers: Array<Point & { value: number; life: number }>
  wind: number
  weather: WeatherType
  weatherTime: number
  weatherEventIndex: number
  nextLightningAt: number
  lightning: LightningState | null
  turnTimeLeft: number
  turnNumber: number
  winnerId: string | null
  winnerIds: string[]
  message: string
  screenShake: number
  round: number
  totalRounds: number
  logs: string[]
  turnTimeSeconds: number
  windMode: WindMode
  augmentChoices: AugmentId[]
}

export interface GameSnapshot {
  phase: CombatPhase
  tanks: Array<Pick<TankState,
    | 'id' | 'nickname' | 'color' | 'health' | 'shield' | 'alive'
    | 'selectedWeapon' | 'weapons' | 'equipment' | 'coins' | 'kills' | 'roundWins'
    | 'damageDealt' | 'damageTaken' | 'playerType' | 'team' | 'augments'>>
  currentTankId: string
  angle: number
  power: number
  wind: number
  weather: WeatherType
  turnTimeLeft: number
  turnNumber: number
  winnerId: string | null
  winnerIds: string[]
  message: string
  logs: string[]
  augmentChoices: AugmentId[]
}
