import type {
  EquipmentId,
  EquipmentInventory,
  ShopItemId,
  WeaponId,
  WeaponInventory,
} from './types'

export type ProjectileShape = 'shell' | 'diamond' | 'tracer' | 'drill' | 'star'

export interface WeaponVisual {
  /** UI accent color (shop card, weapon slot) */
  theme: string
  effectLabel: string
  shape: ProjectileShape
  projectileColor: string
  glowColor: string
  trailColor: string
  coreColor: string
  ringColor: string
  particleColors: string[]
  particleCount: number
  shockwaves: number
  shake: number
}

export interface WeaponDefinition {
  id: WeaponId
  name: string
  icon: string
  description: string
  damage: number
  blastRadius: number
  terrainRadius: number
  projectileCount: number
  price: number
  unlimited: boolean
  tacticalRole: string
  mechanic: string
  directHitBonus: number
  shieldPiercing: number
  knockback: number
  visual: WeaponVisual
}

export interface EquipmentDefinition {
  id: EquipmentId
  name: string
  icon: string
  description: string
  price: number
  /** UI accent color (shop card) */
  theme: string
  effectLabel: string
}

export const WEAPONS: Record<WeaponId, WeaponDefinition> = {
  basic: {
    id: 'basic',
    name: '기본탄',
    icon: '●',
    description: '안정적인 표준 포탄 · 무제한',
    damage: 52,
    blastRadius: 86,
    terrainRadius: 76,
    projectileCount: 1,
    price: 0,
    unlimited: true,
    tacticalRole: '정밀 견제',
    mechanic: '직격 시 피해 +12 · 안정적인 마무리',
    directHitBonus: 12,
    shieldPiercing: 0,
    knockback: 5,
    visual: {
      theme: '#facc15',
      effectLabel: '황금·자홍 화염 폭발',
      shape: 'shell',
      projectileColor: '#ffffff',
      glowColor: '#ff9f43',
      trailColor: '#ff6bcb',
      coreColor: '#fff7bb',
      ringColor: '#ffe66d',
      particleColors: [
        '#ffffff',
        '#fff3a0',
        '#ffd166',
        '#ff9f1c',
        '#ff6b35',
        '#ef476f',
        '#ff4d6d',
        '#c77dff',
        '#ff85a1',
        '#fb8500',
      ],
      particleCount: 110,
      shockwaves: 4,
      shake: 16,
    },
  },
  heavy: {
    id: 'heavy',
    name: '중포탄',
    icon: '◆',
    description: '피해량이 높은 고밀도 포탄',
    damage: 72,
    blastRadius: 104,
    terrainRadius: 92,
    projectileCount: 1,
    price: 600,
    unlimited: false,
    tacticalRole: '방어막 관통',
    mechanic: '피해 45%가 방어막을 우회 · 강한 밀쳐내기',
    directHitBonus: 18,
    shieldPiercing: 0.45,
    knockback: 18,
    visual: {
      theme: '#f87171',
      effectLabel: '마그마·보라 충격파',
      shape: 'diamond',
      projectileColor: '#ff7a45',
      glowColor: '#ff2d55',
      trailColor: '#9b5de5',
      coreColor: '#ffe066',
      ringColor: '#ff6b3d',
      particleColors: [
        '#ffe066',
        '#ff9f1c',
        '#ff4d00',
        '#e63946',
        '#9b2226',
        '#7209b7',
        '#f72585',
        '#4a4e69',
        '#22223b',
        '#ffd6a5',
      ],
      particleCount: 140,
      shockwaves: 5,
      shake: 26,
    },
  },
  triple: {
    id: 'triple',
    name: '삼연발탄',
    icon: '∴',
    description: '각도가 다른 3발을 동시에 발사',
    damage: 32,
    blastRadius: 50,
    terrainRadius: 42,
    projectileCount: 3,
    price: 900,
    unlimited: false,
    tacticalRole: '구역 압박',
    mechanic: '세 갈래 궤적으로 엄폐 뒤와 경사면을 동시 공략',
    directHitBonus: 4,
    shieldPiercing: 0,
    knockback: 3,
    visual: {
      theme: '#38bdf8',
      effectLabel: '시안·라임 전격 폭발',
      shape: 'tracer',
      projectileColor: '#c9f6ff',
      glowColor: '#00f5d4',
      trailColor: '#7b2cbf',
      coreColor: '#e0fbfc',
      ringColor: '#48cae4',
      particleColors: [
        '#ffffff',
        '#90e0ef',
        '#00b4d8',
        '#0077b6',
        '#00f5d4',
        '#80ffdb',
        '#bdb2ff',
        '#ff99c8',
        '#affc41',
        '#4cc9f0',
      ],
      particleCount: 96,
      shockwaves: 3,
      shake: 14,
    },
  },
  terrain: {
    id: 'terrain',
    name: '지형 파괴탄',
    icon: '◎',
    description: '낮은 피해 · 매우 넓은 지형 파괴',
    damage: 20,
    blastRadius: 78,
    terrainRadius: 150,
    projectileCount: 1,
    price: 700,
    unlimited: false,
    tacticalRole: '지형 붕괴',
    mechanic: '초대형 구덩이로 낙하 피해와 사격각을 설계',
    directHitBonus: 0,
    shieldPiercing: 0,
    knockback: 10,
    visual: {
      theme: '#a3e635',
      effectLabel: '에메랄드·황토 대지 분쇄',
      shape: 'drill',
      projectileColor: '#d6ff7e',
      glowColor: '#70e000',
      trailColor: '#bc6c25',
      coreColor: '#e9c46a',
      ringColor: '#80b918',
      particleColors: [
        '#d8f3dc',
        '#95d5b2',
        '#52b788',
        '#2d6a4f',
        '#d4a373',
        '#bc6c25',
        '#6c584c',
        '#f4a261',
        '#e9f5db',
        '#b5e48c',
      ],
      particleCount: 150,
      shockwaves: 5,
      shake: 20,
    },
  },
  mega: {
    id: 'mega',
    name: '대형 폭발탄',
    icon: '✹',
    description: '강력한 피해와 대형 폭발 범위',
    damage: 92,
    blastRadius: 150,
    terrainRadius: 130,
    projectileCount: 1,
    price: 1500,
    unlimited: false,
    tacticalRole: '광역 결정타',
    mechanic: '넓은 범위와 강한 밀쳐내기 · 근접 사용은 자폭 위험',
    directHitBonus: 8,
    shieldPiercing: 0.15,
    knockback: 30,
    visual: {
      theme: '#fb923c',
      effectLabel: '무지개 섬광 · 초대형 화염 기둥',
      shape: 'star',
      projectileColor: '#ffffff',
      glowColor: '#ff006e',
      trailColor: '#8338ec',
      coreColor: '#ffffff',
      ringColor: '#ffbe0b',
      particleColors: [
        '#ffffff',
        '#ffbe0b',
        '#fb5607',
        '#ff006e',
        '#8338ec',
        '#3a86ff',
        '#06d6a0',
        '#ffd60a',
        '#ef476f',
        '#118ab2',
      ],
      particleCount: 190,
      shockwaves: 6,
      shake: 40,
    },
  },
}

export const EQUIPMENT: Record<EquipmentId, EquipmentDefinition> = {
  shield: {
    id: 'shield',
    name: '소형 방어막',
    icon: '◈',
    description: '다음 라운드 시작 시 피해 35 흡수',
    price: 800,
    theme: '#22d3ee',
    effectLabel: '육각 에너지 돔 · 피격 스파크',
  },
  repair: {
    id: 'repair',
    name: '수리 키트',
    icon: '✚',
    description: '공격 대신 체력 30 회복 후 턴 종료',
    price: 650,
    theme: '#4ade80',
    effectLabel: '나노봇 회복 오라 · 상승 십자광',
  },
  teleport: {
    id: 'teleport',
    name: '순간 이동 장치',
    icon: '↯',
    description: '공격 대신 적과 먼 안전 지대로 이동 후 턴 종료',
    price: 1000,
    theme: '#c084fc',
    effectLabel: '공간 왜곡 빔 · 잔상 워프',
  },
}

export const SHOP_ITEMS = [
  ...Object.values(WEAPONS).filter((weapon) => !weapon.unlimited),
  ...Object.values(EQUIPMENT),
]

export function createWeaponInventory(): WeaponInventory {
  return { basic: -1, heavy: 0, triple: 0, terrain: 0, mega: 0 }
}

export function createEquipmentInventory(): EquipmentInventory {
  return { shield: 0, repair: 0, teleport: 0 }
}

export function isWeaponId(id: ShopItemId): id is WeaponId {
  return id in WEAPONS
}

export function availableWeapons(inventory: WeaponInventory) {
  return Object.values(WEAPONS).filter(
    (weapon) => weapon.unlimited || inventory[weapon.id] > 0,
  )
}

export function nextAvailableWeapon(
  current: WeaponId,
  inventory: WeaponInventory,
  direction: 1 | -1,
) {
  const ids = Object.keys(WEAPONS) as WeaponId[]
  const currentIndex = ids.indexOf(current)
  for (let offset = 1; offset <= ids.length; offset += 1) {
    const id = ids[(currentIndex + offset * direction + ids.length * 2) % ids.length]
    if (WEAPONS[id].unlimited || inventory[id] > 0) return id
  }
  return 'basic'
}
