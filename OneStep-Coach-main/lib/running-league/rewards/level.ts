import {
  LEVEL_CONFIG,
  RUNNER_TITLE_BANDS,
} from '@/lib/running-league/rewards/config'

/** Level N에 필요한 누적 XP: 100 * (N-1)*N/2 */
export function getXpThresholdForLevel(level: number): number {
  const n = Math.max(1, Math.floor(level))
  if (n <= 1) return 0
  return (LEVEL_CONFIG.baseXp * (n - 1) * n) / 2
}

export function getLevelFromXp(totalXp: number): number {
  const xp = Math.max(0, Math.floor(Number(totalXp) || 0))
  let level = 1
  while (level < LEVEL_CONFIG.maxLevel) {
    const next = level + 1
    if (xp >= getXpThresholdForLevel(next)) {
      level = next
    } else {
      break
    }
  }
  return level
}

export function getRunnerTitle(level: number): string {
  const lv = Math.max(1, Math.floor(level))
  for (const band of RUNNER_TITLE_BANDS) {
    if (lv >= band.minLevel && lv <= band.maxLevel) return band.title
  }
  return RUNNER_TITLE_BANDS[RUNNER_TITLE_BANDS.length - 1]?.title ?? 'RUNNER'
}

export type LevelProgress = {
  level: number
  title: string
  totalXp: number
  currentThreshold: number
  nextThreshold: number | null
  xpIntoLevel: number
  xpToNext: number | null
  progressPercent: number
  isMaxLevel: boolean
}

export function getLevelProgress(totalXp: number): LevelProgress {
  const xp = Math.max(0, Math.floor(Number(totalXp) || 0))
  const level = getLevelFromXp(xp)
  const title = getRunnerTitle(level)
  const currentThreshold = getXpThresholdForLevel(level)
  const isMaxLevel = level >= LEVEL_CONFIG.maxLevel
  const nextThreshold = isMaxLevel ? null : getXpThresholdForLevel(level + 1)
  const xpIntoLevel = Math.max(0, xp - currentThreshold)
  const span =
    nextThreshold == null ? 1 : Math.max(1, nextThreshold - currentThreshold)
  const xpToNext = nextThreshold == null ? null : Math.max(0, nextThreshold - xp)
  const rawPercent =
    nextThreshold == null ? 100 : Math.min(100, Math.round((xpIntoLevel / span) * 1000) / 10)
  const progressPercent = Number.isFinite(rawPercent)
    ? Math.min(100, Math.max(0, rawPercent))
    : 0

  return {
    level,
    title,
    totalXp: xp,
    currentThreshold,
    nextThreshold,
    xpIntoLevel,
    xpToNext,
    progressPercent,
    isMaxLevel,
  }
}
