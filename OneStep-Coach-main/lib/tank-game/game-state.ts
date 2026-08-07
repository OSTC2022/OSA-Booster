import { MAX_WIND, TURN_SECONDS, WORLD_HEIGHT, WORLD_WIDTH } from './constants'
import {
  AUGMENT_INTERVAL,
  rollAugmentChoices,
} from './augments'
import { createTerrain, flattenSpawn, getTankRestingY } from './terrain'
import type {
  CampaignPlayer,
  GameConfig,
  GameSnapshot,
  GameState,
  TankState,
  WeatherType,
} from './types'
import { createCampaignPlayers, DEFAULT_CONFIG } from './campaign'

export function randomWind() {
  const wind = Math.round((Math.random() * 2 - 1) * MAX_WIND)
  return Math.abs(wind) < 2 ? 0 : wind
}

function deterministicWind(seed: number, turn: number) {
  const mixed = Math.imul(seed ^ Math.imul(turn, 0x45d9f3b), 0x27d4eb2d) >>> 0
  const wind = (mixed % (MAX_WIND * 2 + 1)) - MAX_WIND
  return Math.abs(wind) < 2 ? 0 : wind
}

function turnSideKey(tank: TankState) {
  return tank.team === null ? `solo:${tank.id}` : `team:${tank.team}`
}

export function createGameState(
  seed = Math.floor(Math.random() * 2_147_483_647),
  config: GameConfig = DEFAULT_CONFIG,
  campaignPlayers: CampaignPlayer[] = createCampaignPlayers(DEFAULT_CONFIG),
  round = 1,
): GameState {
  const terrain = createTerrain(seed, WORLD_WIDTH, WORLD_HEIGHT, config.terrainType)
  const positions = campaignPlayers.map(
    (_, index) => WORLD_WIDTH * (0.1 + (index / Math.max(1, campaignPlayers.length - 1)) * 0.8),
  )
  positions.forEach((x) => flattenSpawn(terrain, x))
  const tanks: TankState[] = positions.map((x, index) => {
    const player = campaignPlayers[index]
    const equipment = { ...player.equipment }
    const shield = equipment.shield > 0 ? 35 : 0
    if (shield) equipment.shield -= 1
    return {
    id: player.id,
    nickname: player.name,
    color: player.color,
    playerType: player.type,
    aiDifficulty: player.aiDifficulty,
    team: player.team,
    x,
    y: getTankRestingY(terrain, x),
    turretAngle: x < WORLD_WIDTH / 2 ? 48 : 132,
    power: 58,
    health: config.startingHealth,
    maxHealth: config.startingHealth,
    shield,
    alive: true,
    selectedWeapon: 'basic',
    weapons: { ...player.weapons },
    equipment,
    coins: player.coins,
    kills: player.kills,
    roundKills: 0,
    roundWins: player.roundWins,
    damageDealt: 0,
    damageTaken: 0,
    fallStartY: null,
    weaponUses: { basic: 0, heavy: 0, triple: 0, terrain: 0, mega: 0 },
    augments: [],
  }})
  const turnSideOrder = [...new Set(tanks.map(turnSideKey))]
  const firstSide = turnSideOrder[(round - 1) % turnSideOrder.length]
  const firstTankIndex = Math.max(0, tanks.findIndex((tank) => turnSideKey(tank) === firstSide))
  const sideCursors = Object.fromEntries(turnSideOrder.map((side) => [side, -1]))
  sideCursors[firstSide] = firstTankIndex
  const seededWind = Math.abs(seed % (MAX_WIND * 2 + 1)) - MAX_WIND
  const wind = config.windMode === 'none' ? 0 : Math.abs(seededWind) < 2 ? 0 : seededWind
  const weatherRoll = Math.abs((seed * 31 + round * 17) % 100)
  const weather: WeatherType =
    weatherRoll < 42 ? 'clear' : weatherRoll < 78 ? 'rain' : 'snow'
  const weatherLabel = weather === 'rain' ? '비' : weather === 'snow' ? '눈' : '맑음'
  return {
    phase: 'aiming', terrain, tanks, currentTankIndex: firstTankIndex,
    turnSideOrder, sideCursors, projectiles: [],
    explosions: [], effects: [], damageNumbers: [], wind, weather, weatherTime: 0,
    weatherEventIndex: 0,
    nextLightningAt: weather === 'rain' ? 5 + Math.abs(seed % 5) : Number.POSITIVE_INFINITY,
    lightning: null, turnTimeLeft: config.turnTimeSeconds,
    turnNumber: 1, winnerId: null, winnerIds: [], message: `${tanks[firstTankIndex].nickname}의 차례`,
    screenShake: 0, round, totalRounds: config.totalRounds,
    logs: [`라운드 ${round} 시작 · 날씨 ${weatherLabel}`], turnTimeSeconds: config.turnTimeSeconds,
    windMode: config.windMode,
    augmentChoices: [],
  }
}

export function getCurrentTank(state: GameState) {
  return state.tanks[state.currentTankIndex]
}

export function nextTurn(state: GameState) {
  const currentSide = turnSideKey(getCurrentTank(state))
  const currentSideIndex = state.turnSideOrder.indexOf(currentSide)
  let nextSide = currentSide
  for (let offset = 1; offset <= state.turnSideOrder.length; offset += 1) {
    const candidate =
      state.turnSideOrder[
        (Math.max(0, currentSideIndex) + offset) % state.turnSideOrder.length
      ]
    if (state.tanks.some((tank) => tank.alive && turnSideKey(tank) === candidate)) {
      nextSide = candidate
      break
    }
  }

  const eligible = state.tanks
    .map((tank, index) => ({ tank, index }))
    .filter(({ tank }) => tank.alive && turnSideKey(tank) === nextSide)
  const lastIndex = state.sideCursors[nextSide] ?? -1
  const nextEntry =
    eligible.find(({ index }) => index > lastIndex) ??
    eligible[0] ??
    { index: state.currentTankIndex }
  state.currentTankIndex = nextEntry.index
  state.sideCursors[nextSide] = nextEntry.index
  state.turnTimeLeft = state.turnTimeSeconds || TURN_SECONDS
  state.turnNumber += 1
  if (state.windMode === 'turn') {
    state.wind = deterministicWind(state.terrain.seed, state.turnNumber)
  }
  state.phase = 'aiming'
  state.message = `${getCurrentTank(state).nickname}의 차례`
  state.augmentChoices = []
  maybeBeginAugmentPhase(state)
}

/** 3턴마다 현재 플레이어에게 증강 카드 3장 제시 */
export function maybeBeginAugmentPhase(state: GameState) {
  if (state.turnNumber <= 0 || state.turnNumber % AUGMENT_INTERVAL !== 0) return
  const tank = getCurrentTank(state)
  if (!tank.alive) return
  state.augmentChoices = rollAugmentChoices(
    state.terrain.seed,
    state.turnNumber,
    tank.id,
    tank.augments,
  )
  if (!state.augmentChoices.length) return
  state.phase = 'augment'
  state.message = `${tank.nickname} 증강 선택`
  state.logs.push(`TURN ${state.turnNumber} · 증강 카드 등장`)
}

export function createSnapshot(state: GameState): GameSnapshot {
  const current = getCurrentTank(state)
  return {
    phase: state.phase,
    tanks: state.tanks.map(({
      id,
      nickname,
      color,
      health,
      shield,
      alive,
      selectedWeapon,
      weapons,
      equipment,
      coins,
      kills,
      roundWins,
      damageDealt,
      damageTaken,
      playerType,
      team,
      augments,
    }) => ({
      id,
      nickname,
      color,
      health,
      shield,
      alive,
      selectedWeapon,
      weapons: { ...weapons },
      equipment: { ...equipment },
      coins,
      kills,
      roundWins,
      damageDealt,
      damageTaken,
      playerType,
      team,
      augments: [...augments],
    })),
    currentTankId: current.id,
    angle: Math.round(current.turretAngle),
    power: Math.round(current.power),
    wind: state.wind,
    weather: state.weather,
    turnTimeLeft: Math.max(0, Math.ceil(state.turnTimeLeft)),
    turnNumber: state.turnNumber,
    winnerId: state.winnerId,
    winnerIds: [...state.winnerIds],
    message: state.message,
    logs: state.logs.slice(-6),
    augmentChoices: [...state.augmentChoices],
  }
}

export function isBelowWorld(tank: TankState) {
  return tank.y > WORLD_HEIGHT + 20
}
