import type { AugmentId, TankState } from './types'

export interface AugmentDefinition {
  id: AugmentId
  name: string
  icon: string
  rarity: 'common' | 'rare' | 'epic'
  description: string
  summary: string
}

export interface AugmentMods {
  damageMult: number
  blastMult: number
  terrainMult: number
  directHitMult: number
  knockbackMult: number
  selfDamageImmune: boolean
  critChance: number
  vampRatio: number
  chainBlast: boolean
  powerBonus: number
}

export const AUGMENTS: Record<AugmentId, AugmentDefinition> = {
  firepower: {
    id: 'firepower',
    name: '화력광',
    icon: '🔥',
    rarity: 'rare',
    description: '모든 폭발 피해 +40% · 자폭 피해 없음',
    summary: '폭딜 · 자폭 면역',
  },
  sniper: {
    id: 'sniper',
    name: '저격수',
    icon: '💀',
    rarity: 'epic',
    description: '직격 시 추가 피해 +200%',
    summary: '직격 특화',
  },
  kangaroo: {
    id: 'kangaroo',
    name: '캥거루',
    icon: '🦘',
    rarity: 'rare',
    description: '순간이동 +1 · 즉시 체력 15 회복',
    summary: '기동 · 회복',
  },
  ironclad: {
    id: 'ironclad',
    name: '철갑',
    icon: '🛡',
    rarity: 'common',
    description: '최대 체력 +25 · 현재 체력 +25',
    summary: '생존력',
  },
  widecrater: {
    id: 'widecrater',
    name: '광폭 구덩이',
    icon: '💥',
    rarity: 'rare',
    description: '폭발 반경 +35% · 넉백 +25%',
    summary: '범위 · 넉백',
  },
  terrainist: {
    id: 'terrainist',
    name: '지형학자',
    icon: '⛰',
    rarity: 'common',
    description: '지형 파괴 반경 +40%',
    summary: '지형 붕괴',
  },
  arsenal: {
    id: 'arsenal',
    name: '화약고',
    icon: '📦',
    rarity: 'common',
    description: '중포탄 +2 · 삼연발 +2 · 대형탄 +1',
    summary: '탄약 보급',
  },
  aegis: {
    id: 'aegis',
    name: '방패병',
    icon: '◈',
    rarity: 'common',
    description: '방어막 +40',
    summary: '즉시 방어',
  },
  medic: {
    id: 'medic',
    name: '야전의무',
    icon: '✚',
    rarity: 'common',
    description: '수리 키트 +1 · 체력 20 회복',
    summary: '회복',
  },
  crit: {
    id: 'crit',
    name: '치명타',
    icon: '⚡',
    rarity: 'epic',
    description: '공격 시 25% 확률로 피해 2배',
    summary: '크리티컬',
  },
  vamp: {
    id: 'vamp',
    name: '흡혈포',
    icon: '🩸',
    rarity: 'rare',
    description: '적에게 준 피해의 18% 회복',
    summary: '흡혈',
  },
  chain: {
    id: 'chain',
    name: '연쇄폭파',
    icon: '✹',
    rarity: 'epic',
    description: '폭발 후 작은 2차 폭발 추가',
    summary: '2차 폭발',
  },
  overcharge: {
    id: 'overcharge',
    name: '과충전',
    icon: '⬆',
    rarity: 'rare',
    description: '발사 세기 +18 · 피해 +15%',
    summary: '사거리 · 화력',
  },
  fortress: {
    id: 'fortress',
    name: '요새',
    icon: '🏛',
    rarity: 'rare',
    description: '최대 체력 +40 · 방어막 +20',
    summary: '탱킹',
  },
  scavenger: {
    id: 'scavenger',
    name: '고철수집',
    icon: '🪙',
    rarity: 'common',
    description: '코인 +500 · 지형 파괴탄 +1',
    summary: '자원',
  },
}

export const AUGMENT_IDS = Object.keys(AUGMENTS) as AugmentId[]

const RARITY_WEIGHT: Record<AugmentDefinition['rarity'], number> = {
  common: 5,
  rare: 3,
  epic: 1,
}

export function emptyAugmentMods(): AugmentMods {
  return {
    damageMult: 1,
    blastMult: 1,
    terrainMult: 1,
    directHitMult: 1,
    knockbackMult: 1,
    selfDamageImmune: false,
    critChance: 0,
    vampRatio: 0,
    chainBlast: false,
    powerBonus: 0,
  }
}

export function getAugmentMods(augmentIds: AugmentId[]): AugmentMods {
  const mods = emptyAugmentMods()
  for (const id of augmentIds) {
    switch (id) {
      case 'firepower':
        mods.damageMult *= 1.4
        mods.selfDamageImmune = true
        break
      case 'sniper':
        mods.directHitMult *= 3
        break
      case 'widecrater':
        mods.blastMult *= 1.35
        mods.knockbackMult *= 1.25
        break
      case 'terrainist':
        mods.terrainMult *= 1.4
        break
      case 'crit':
        mods.critChance += 0.25
        break
      case 'vamp':
        mods.vampRatio += 0.18
        break
      case 'chain':
        mods.chainBlast = true
        break
      case 'overcharge':
        mods.powerBonus += 18
        mods.damageMult *= 1.15
        break
      default:
        break
    }
  }
  return mods
}

function hashString(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function mulberry32(seed: number) {
  let t = seed >>> 0
  return () => {
    t += 0x6d2b79f5
    let result = Math.imul(t ^ (t >>> 15), 1 | t)
    result ^= result + Math.imul(result ^ (result >>> 7), 61 | result)
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296
  }
}

function weightedPick(
  pool: AugmentId[],
  owned: Set<AugmentId>,
  random: () => number,
): AugmentId | null {
  const candidates = pool.filter((id) => !owned.has(id))
  if (!candidates.length) return null
  const weights = candidates.map((id) => RARITY_WEIGHT[AUGMENTS[id].rarity])
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  let roll = random() * total
  for (let index = 0; index < candidates.length; index += 1) {
    roll -= weights[index]
    if (roll <= 0) return candidates[index]
  }
  return candidates[candidates.length - 1]
}

/** 결정론적 3장 증강 선택지 */
export function rollAugmentChoices(
  seed: number,
  turnNumber: number,
  tankId: string,
  owned: AugmentId[],
  count = 3,
): AugmentId[] {
  const random = mulberry32(
    (seed ^ Math.imul(turnNumber, 0x9e3779b9) ^ hashString(tankId)) >>> 0,
  )
  const ownedSet = new Set(owned)
  const picks: AugmentId[] = []
  for (let index = 0; index < count; index += 1) {
    const pick = weightedPick(AUGMENT_IDS, new Set([...ownedSet, ...picks]), random)
    if (!pick) break
    picks.push(pick)
  }
  // 풀이 거의 소진되면 중복 허용으로 채운다
  while (picks.length < count) {
    const fallback = AUGMENT_IDS[Math.floor(random() * AUGMENT_IDS.length)]
    if (!picks.includes(fallback)) picks.push(fallback)
    else if (picks.length < count) picks.push(fallback)
    else break
  }
  return picks.slice(0, count)
}

export function applyAugmentImmediate(tank: TankState, augmentId: AugmentId) {
  tank.augments.push(augmentId)
  switch (augmentId) {
    case 'kangaroo':
      tank.equipment.teleport += 1
      tank.health = Math.min(tank.maxHealth, tank.health + 15)
      break
    case 'ironclad':
      tank.maxHealth += 25
      tank.health = Math.min(tank.maxHealth, tank.health + 25)
      break
    case 'arsenal':
      tank.weapons.heavy += 2
      tank.weapons.triple += 2
      tank.weapons.mega += 1
      break
    case 'aegis':
      tank.shield += 40
      break
    case 'medic':
      tank.equipment.repair += 1
      tank.health = Math.min(tank.maxHealth, tank.health + 20)
      break
    case 'fortress':
      tank.maxHealth += 40
      tank.health = Math.min(tank.maxHealth, tank.health + 40)
      tank.shield += 20
      break
    case 'scavenger':
      tank.coins += 500
      tank.weapons.terrain += 1
      break
    default:
      break
  }
}

export function chooseAiAugment(choices: AugmentId[], tank: TankState): AugmentId {
  const prefer =
    tank.health < tank.maxHealth * 0.45
      ? (['medic', 'ironclad', 'fortress', 'aegis', 'vamp', 'kangaroo'] as AugmentId[])
      : (['firepower', 'sniper', 'crit', 'chain', 'overcharge', 'widecrater'] as AugmentId[])
  return prefer.find((id) => choices.includes(id)) ?? choices[0]
}

export const AUGMENT_INTERVAL = 3
