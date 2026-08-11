/**
 * XP / POINT / Level 보상 수치 — 이 파일만 수정하면 정책 변경 가능.
 * 과거 Ledger amount는 재계산하지 않는다.
 */

export const REWARD_CURRENCIES = ['XP', 'POINT'] as const
export type RewardCurrency = (typeof REWARD_CURRENCIES)[number]

export const REWARD_SOURCE_TYPES = [
  'RUN_DAY',
  'WEEKLY_MISSION',
  'PERFECT_WEEK',
  'ACHIEVEMENT',
  'PB',
  'TEAM_BATTLE_PARTICIPATION',
  'TEAM_BATTLE_WIN',
  'MVP',
  'ADMIN_ADJUSTMENT',
] as const
export type RewardSourceType = (typeof REWARD_SOURCE_TYPES)[number]

/** 유효 러닝 인정 최소 거리(km) — RUN_DAY XP farming 완화 */
export const MIN_REWARDED_RUN_DISTANCE_KM = 1.0

export const LEVEL_CONFIG = {
  maxLevel: 50,
  /** cumulative XP for level N = base * (N-1)*N/2 */
  baseXp: 100,
} as const

export const RUNNER_TITLE_BANDS: Array<{
  minLevel: number
  maxLevel: number
  title: string
}> = [
  { minLevel: 1, maxLevel: 4, title: 'STARTER' },
  { minLevel: 5, maxLevel: 9, title: 'RUNNER' },
  { minLevel: 10, maxLevel: 19, title: 'PACER' },
  { minLevel: 20, maxLevel: 29, title: 'RACER' },
  { minLevel: 30, maxLevel: 39, title: 'ELITE' },
  { minLevel: 40, maxLevel: 49, title: 'MASTER' },
  { minLevel: 50, maxLevel: 50, title: 'LEGEND' },
]

export const REWARD_RULES = {
  RUN_DAY: { xp: 5, point: 0, description: '러닝 활동' },
  WEEKLY_MISSION: { xp: 15, point: 0, description: '주간 미션 완료' },
  PERFECT_WEEK: { xp: 30, point: 5, description: 'Perfect Week' },
  PB: { xp: 25, point: 3, description: 'PB 갱신' },
  TEAM_BATTLE_PARTICIPATION: {
    xp: 20,
    point: 3,
    description: '팀 배틀 참여',
  },
  TEAM_BATTLE_WIN: { xp: 10, point: 0, description: '팀 배틀 승리' },
  MVP: { xp: 30, point: 5, description: 'MVP 선정' },
} as const

export type AchievementTier = 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM' | 'LEGEND'

export const ACHIEVEMENT_TIER_REWARDS: Record<
  AchievementTier,
  { xp: number; point: number }
> = {
  BRONZE: { xp: 20, point: 0 },
  SILVER: { xp: 35, point: 2 },
  GOLD: { xp: 50, point: 5 },
  PLATINUM: { xp: 75, point: 8 },
  LEGEND: { xp: 100, point: 15 },
}

/** tier 없는 배지 코드별 보상 */
export const ACHIEVEMENT_CODE_REWARDS: Record<string, { xp: number; point: number }> = {
  FIRST_RUN: { xp: 20, point: 0 },
  FIRST_5K: { xp: 20, point: 0 },
  FIRST_10K: { xp: 25, point: 0 },
  STREAK_4: { xp: 20, point: 0 },
  STREAK_8: { xp: 35, point: 2 },
  STREAK_12: { xp: 50, point: 5 },
  PERFECT_WEEK: { xp: 20, point: 0 },
  FIRST_PB: { xp: 25, point: 3 },
  FIRST_RIVAL: { xp: 15, point: 0 },
  TEAM_BATTLE_FIRST: { xp: 15, point: 0 },
  MVP_FIRST: { xp: 30, point: 5 },
}

export function resolveAchievementReward(input: {
  code: string
  tier: string | null | undefined
}): { xp: number; point: number } {
  const tier = String(input.tier ?? '').toUpperCase()
  if (tier in ACHIEVEMENT_TIER_REWARDS) {
    return ACHIEVEMENT_TIER_REWARDS[tier as AchievementTier]
  }
  return ACHIEVEMENT_CODE_REWARDS[input.code] ?? { xp: 20, point: 0 }
}
