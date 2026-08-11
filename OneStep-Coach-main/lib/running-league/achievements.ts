import { formatMileageKmDisplay } from '@/lib/running-league/mileage-leaderboard'
import {
  isMileageLogRecognized,
  type MileageRecognition,
} from '@/lib/running-league/mileage-recognition'
import { collectPbImprovementsInRange } from '@/lib/running-league/mvp'
import { calculateRunningStreak } from '@/lib/running-league/running-streak'
import { toMileageLogDateKey } from '@/lib/running-league/attendance-leaderboard'
import {
  buildDefaultWeeklyMissions,
  buildWeeklyMissionsView,
  type WeeklyMissionDefinition,
} from '@/lib/running-league/weekly-missions'
import {
  getCurrentWeekRange,
  getWeekRangeForDateKey,
  shiftWeekRange,
} from '@/lib/running-league/week-range'

export const ACHIEVEMENT_CATEGORIES = [
  'RUNNING',
  'MILESTONE',
  'CONSISTENCY',
  'MISSION',
  'PB',
  'SOCIAL',
  'TEAM',
  'MVP',
] as const
export type AchievementCategory = (typeof ACHIEVEMENT_CATEGORIES)[number]

export const ACHIEVEMENT_CODES = [
  'FIRST_RUN',
  'FIRST_5K',
  'FIRST_10K',
  'TOTAL_50K',
  'TOTAL_100K',
  'TOTAL_300K',
  'TOTAL_500K',
  'TOTAL_1000K',
  'STREAK_4',
  'STREAK_8',
  'STREAK_12',
  'PERFECT_WEEK',
  'FIRST_PB',
  'FIRST_RIVAL',
  'TEAM_BATTLE_FIRST',
  'MVP_FIRST',
] as const
export type AchievementCode = (typeof ACHIEVEMENT_CODES)[number]

export type AchievementCriteriaType =
  | 'first_run'
  | 'single_distance'
  | 'total_distance'
  | 'best_streak'
  | 'perfect_week'
  | 'first_pb'
  | 'first_rival'
  | 'team_battle'
  | 'mvp_first'

export type AchievementDefinition = {
  id?: string
  code: AchievementCode
  title: string
  description: string
  category: AchievementCategory
  criteria_type: AchievementCriteriaType
  target_value: number | null
  icon_key: string
  tier: string | null
  sort_order: number
  is_active: boolean
  is_hidden: boolean
}

/** 코드 카탈로그 — DB seed와 동기화. 진행률·평가의 source of truth */
export const DEFAULT_ACHIEVEMENT_CATALOG: AchievementDefinition[] = [
  {
    code: 'FIRST_RUN',
    title: '첫 발걸음',
    description: '첫 러닝 기록 완료',
    category: 'RUNNING',
    criteria_type: 'first_run',
    target_value: 1,
    icon_key: '🏃',
    tier: null,
    sort_order: 10,
    is_active: true,
    is_hidden: false,
  },
  {
    code: 'FIRST_5K',
    title: '5K FINISHER',
    description: '한 번의 러닝으로 5km 달성',
    category: 'RUNNING',
    criteria_type: 'single_distance',
    target_value: 5,
    icon_key: '5️⃣',
    tier: null,
    sort_order: 20,
    is_active: true,
    is_hidden: false,
  },
  {
    code: 'FIRST_10K',
    title: '10K FINISHER',
    description: '한 번의 러닝으로 10km 달성',
    category: 'RUNNING',
    criteria_type: 'single_distance',
    target_value: 10,
    icon_key: '🔟',
    tier: null,
    sort_order: 30,
    is_active: true,
    is_hidden: false,
  },
  {
    code: 'TOTAL_50K',
    title: '50K CLUB',
    description: '누적 거리 50km 달성',
    category: 'MILESTONE',
    criteria_type: 'total_distance',
    target_value: 50,
    icon_key: '🏅',
    tier: 'BRONZE',
    sort_order: 40,
    is_active: true,
    is_hidden: false,
  },
  {
    code: 'TOTAL_100K',
    title: '100K CLUB',
    description: '누적 거리 100km 달성',
    category: 'MILESTONE',
    criteria_type: 'total_distance',
    target_value: 100,
    icon_key: '🏅',
    tier: 'SILVER',
    sort_order: 50,
    is_active: true,
    is_hidden: false,
  },
  {
    code: 'TOTAL_300K',
    title: '300K CLUB',
    description: '누적 거리 300km 달성',
    category: 'MILESTONE',
    criteria_type: 'total_distance',
    target_value: 300,
    icon_key: '🏅',
    tier: 'GOLD',
    sort_order: 60,
    is_active: true,
    is_hidden: false,
  },
  {
    code: 'TOTAL_500K',
    title: '500K CLUB',
    description: '누적 거리 500km 달성',
    category: 'MILESTONE',
    criteria_type: 'total_distance',
    target_value: 500,
    icon_key: '🏅',
    tier: 'PLATINUM',
    sort_order: 70,
    is_active: true,
    is_hidden: false,
  },
  {
    code: 'TOTAL_1000K',
    title: '1000K CLUB',
    description: '누적 거리 1000km 달성',
    category: 'MILESTONE',
    criteria_type: 'total_distance',
    target_value: 1000,
    icon_key: '🏅',
    tier: 'LEGEND',
    sort_order: 80,
    is_active: true,
    is_hidden: false,
  },
  {
    code: 'STREAK_4',
    title: '4 WEEK STREAK',
    description: '주간 목표 4주 연속 달성',
    category: 'CONSISTENCY',
    criteria_type: 'best_streak',
    target_value: 4,
    icon_key: '🔥',
    tier: null,
    sort_order: 90,
    is_active: true,
    is_hidden: false,
  },
  {
    code: 'STREAK_8',
    title: '8 WEEK STREAK',
    description: '주간 목표 8주 연속 달성',
    category: 'CONSISTENCY',
    criteria_type: 'best_streak',
    target_value: 8,
    icon_key: '🔥',
    tier: null,
    sort_order: 100,
    is_active: true,
    is_hidden: false,
  },
  {
    code: 'STREAK_12',
    title: '12 WEEK STREAK',
    description: '주간 목표 12주 연속 달성',
    category: 'CONSISTENCY',
    criteria_type: 'best_streak',
    target_value: 12,
    icon_key: '🔥',
    tier: null,
    sort_order: 110,
    is_active: true,
    is_hidden: false,
  },
  {
    code: 'PERFECT_WEEK',
    title: 'PERFECT WEEK',
    description: '주간 미션 전체 완료',
    category: 'MISSION',
    criteria_type: 'perfect_week',
    target_value: 1,
    icon_key: '🎯',
    tier: null,
    sort_order: 120,
    is_active: true,
    is_hidden: false,
  },
  {
    code: 'FIRST_PB',
    title: 'FIRST PB',
    description: '첫 PB 갱신',
    category: 'PB',
    criteria_type: 'first_pb',
    target_value: 1,
    icon_key: '⚡',
    tier: null,
    sort_order: 130,
    is_active: true,
    is_hidden: false,
  },
  {
    code: 'FIRST_RIVAL',
    title: 'RIVAL',
    description: '라이벌 지정',
    category: 'SOCIAL',
    criteria_type: 'first_rival',
    target_value: 1,
    icon_key: '⚔️',
    tier: null,
    sort_order: 140,
    is_active: true,
    is_hidden: false,
  },
  {
    code: 'TEAM_BATTLE_FIRST',
    title: 'TEAM PLAYER',
    description: '팀 배틀 참가',
    category: 'TEAM',
    criteria_type: 'team_battle',
    target_value: 1,
    icon_key: '🔥',
    tier: null,
    sort_order: 150,
    is_active: true,
    is_hidden: false,
  },
  {
    code: 'MVP_FIRST',
    title: 'MVP',
    description: '주간 또는 월간 MVP 선정',
    category: 'MVP',
    criteria_type: 'mvp_first',
    target_value: 1,
    icon_key: '🏆',
    tier: null,
    sort_order: 160,
    is_active: true,
    is_hidden: false,
  },
]

export type MileageLogRow = {
  member_id: string
  distance_km: number
  logged_at: string
}

export type AchievementStats = {
  recognizedRunCount: number
  totalDistanceKm: number
  longestSingleRunKm: number
  bestStreak: number
  hasPerfectWeek: boolean
  hasPbImprovement: boolean
  hasRival: boolean
  hasTeamBattle: boolean
  isCurrentMvp: boolean
  pbHistoryAvailable: boolean
  /** milestone code → unlock date key when computable */
  milestoneUnlockDates: Partial<Record<AchievementCode, string>>
}

export type AchievementUnlockCandidate = {
  code: AchievementCode
  unlockedAt: string | null
  metadata: Record<string, unknown>
}

export type AchievementProgressView = {
  code: AchievementCode
  title: string
  description: string
  category: AchievementCategory
  icon_key: string
  tier: string | null
  sort_order: number
  unlocked: boolean
  unlockedAt: string | null
  progressKind: 'none' | 'ratio'
  currentValue: number | null
  targetValue: number | null
  progressLabel: string | null
  progressPercent: number | null
  unavailable: boolean
  unavailableReason: string | null
  metadata: Record<string, unknown> | null
  isShowcase: boolean
  showcasePosition: number | null
}

export type MemberAchievementsView = {
  tableReady: boolean
  unlockedCount: number
  totalCount: number
  recent: AchievementProgressView[]
  showcase: AchievementProgressView[]
  items: AchievementProgressView[]
  newlyUnlockedCodes: AchievementCode[]
}

function roundKm(km: number): number {
  return Math.round(km * 10) / 10
}

export function isAchievementCode(value: string): value is AchievementCode {
  return (ACHIEVEMENT_CODES as readonly string[]).includes(value)
}

export function mergeAchievementCatalog(
  rows: ReadonlyArray<Partial<AchievementDefinition> & { code: string; id?: string }>,
): AchievementDefinition[] {
  const byCode = new Map(DEFAULT_ACHIEVEMENT_CATALOG.map((row) => [row.code, { ...row }]))
  for (const row of rows) {
    if (!isAchievementCode(row.code)) continue
    const base = byCode.get(row.code)
    if (!base) continue
    byCode.set(row.code, {
      ...base,
      id: row.id ?? base.id,
      title: row.title?.trim() || base.title,
      description: row.description ?? base.description,
      category: (row.category as AchievementCategory) || base.category,
      criteria_type: (row.criteria_type as AchievementCriteriaType) || base.criteria_type,
      target_value:
        row.target_value === undefined ? base.target_value : Number(row.target_value),
      icon_key: row.icon_key?.trim() || base.icon_key,
      tier: row.tier === undefined ? base.tier : row.tier,
      sort_order: row.sort_order ?? base.sort_order,
      is_active: row.is_active !== false,
      is_hidden: Boolean(row.is_hidden),
    })
  }
  // DB에 없는 기본 배지도 포함 (id는 나중에 seed)
  return [...byCode.values()]
    .filter((row) => row.is_active && !row.is_hidden)
    .sort((a, b) => a.sort_order - b.sort_order || a.code.localeCompare(b.code))
}

export function computeMemberAchievementStats(input: {
  memberId: string
  logs: ReadonlyArray<MileageLogRow>
  recognition?: MileageRecognition | null
  missionDefs?: WeeklyMissionDefinition[]
  pbRecords?: ReadonlyArray<{
    member_id: string
    distance_event: string
    measured_at: string
    time_seconds?: number | null
    time_text?: string | null
    record_phase?: string | null
    created_at?: string | null
  }>
  pbHistoryAvailable?: boolean
  hasRival?: boolean
  hasTeamBattle?: boolean
  isCurrentMvp?: boolean
  asOf?: Date
}): AchievementStats {
  const memberLogs = input.logs.filter((log) => log.member_id === input.memberId)
  let recognizedRunCount = 0
  let totalDistanceKm = 0
  let longestSingleRunKm = 0

  const sortedForMilestone = [...memberLogs].sort((a, b) => {
    const da = toMileageLogDateKey(String(a.logged_at))
    const db = toMileageLogDateKey(String(b.logged_at))
    if (da !== db) return da.localeCompare(db)
    return String(a.logged_at).localeCompare(String(b.logged_at))
  })

  const milestoneTargets: Array<{ code: AchievementCode; km: number }> = [
    { code: 'TOTAL_50K', km: 50 },
    { code: 'TOTAL_100K', km: 100 },
    { code: 'TOTAL_300K', km: 300 },
    { code: 'TOTAL_500K', km: 500 },
    { code: 'TOTAL_1000K', km: 1000 },
  ]
  const milestoneUnlockDates: Partial<Record<AchievementCode, string>> = {}
  let runningTotal = 0

  for (const log of sortedForMilestone) {
    if (!isMileageLogRecognized(log.distance_km, input.recognition)) continue
    const km = Number(log.distance_km ?? 0)
    recognizedRunCount += 1
    totalDistanceKm += km
    if (km > longestSingleRunKm) longestSingleRunKm = km

    const prev = runningTotal
    runningTotal = roundKm(runningTotal + km)
    const dateKey = toMileageLogDateKey(String(log.logged_at))
    for (const target of milestoneTargets) {
      if (milestoneUnlockDates[target.code]) continue
      if (prev < target.km && runningTotal >= target.km && dateKey) {
        milestoneUnlockDates[target.code] = dateKey
      }
    }
  }

  totalDistanceKm = roundKm(totalDistanceKm)
  longestSingleRunKm = roundKm(longestSingleRunKm)

  const streak = calculateRunningStreak({
    memberId: input.memberId,
    logs: input.logs,
    recognition: input.recognition,
    asOf: input.asOf,
  })

  const hasPerfectWeek = detectPerfectWeek({
    memberId: input.memberId,
    logs: input.logs,
    recognition: input.recognition,
    missionDefs: input.missionDefs ?? [],
    asOf: input.asOf,
  })

  const pbHistoryAvailable = input.pbHistoryAvailable !== false
  let hasPbImprovement = false
  if (pbHistoryAvailable && input.pbRecords && input.pbRecords.length > 0) {
    const improvements = collectPbImprovementsInRange({
      records: input.pbRecords,
      start: '1970-01-01',
      end: '9999-12-31',
    })
    hasPbImprovement = improvements.some((row) => row.memberId === input.memberId)
  }

  return {
    recognizedRunCount,
    totalDistanceKm,
    longestSingleRunKm,
    bestStreak: streak.bestStreak,
    hasPerfectWeek,
    hasPbImprovement,
    hasRival: Boolean(input.hasRival),
    hasTeamBattle: Boolean(input.hasTeamBattle),
    isCurrentMvp: Boolean(input.isCurrentMvp),
    pbHistoryAvailable,
    milestoneUnlockDates,
  }
}

function detectPerfectWeek(input: {
  memberId: string
  logs: ReadonlyArray<MileageLogRow>
  recognition?: MileageRecognition | null
  missionDefs: WeeklyMissionDefinition[]
  asOf?: Date
}): boolean {
  const asOf = input.asOf ?? new Date()
  const current = getCurrentWeekRange(asOf)
  let firstDate: string | null = null
  for (const log of input.logs) {
    if (log.member_id !== input.memberId) continue
    const key = toMileageLogDateKey(String(log.logged_at))
    if (!key) continue
    if (!firstDate || key < firstDate) firstDate = key
  }
  if (!firstDate) {
    // still check current week with defaults
    firstDate = current.start
  }

  const earliest = shiftWeekRange(current, -52).start
  let cursor =
    firstDate < earliest
      ? getWeekRangeForDateKey(earliest)
      : getWeekRangeForDateKey(firstDate)
  while (cursor.start <= current.start) {
    const overlapping = input.missionDefs.filter(
      (m) => m.is_active && m.start_at <= cursor.end && m.end_at >= cursor.start,
    )
    const defs =
      overlapping.length > 0
        ? overlapping.map((m) => ({
            ...m,
            start_at: cursor.start,
            end_at: cursor.end,
          }))
        : buildDefaultWeeklyMissions(cursor)

    const view = buildWeeklyMissionsView({
      week: cursor,
      missions: defs,
      memberId: input.memberId,
      logs: input.logs,
      recognition: input.recognition,
      source: overlapping.length > 0 ? 'admin' : 'default',
      tableReady: true,
    })
    if (view.totalCount > 0 && view.completedCount === view.totalCount) {
      return true
    }
    cursor = shiftWeekRange(cursor, 1)
  }
  return false
}

export function evaluateAchievementUnlocks(
  catalog: ReadonlyArray<AchievementDefinition>,
  stats: AchievementStats,
): AchievementUnlockCandidate[] {
  const unlocked: AchievementUnlockCandidate[] = []

  for (const def of catalog) {
    if (!def.is_active || def.is_hidden) continue

    switch (def.criteria_type) {
      case 'first_run':
        if (stats.recognizedRunCount >= 1) {
          unlocked.push({
            code: def.code,
            unlockedAt: null,
            metadata: { runCount: stats.recognizedRunCount },
          })
        }
        break
      case 'single_distance': {
        const target = Number(def.target_value ?? 0)
        if (target > 0 && stats.longestSingleRunKm >= target) {
          unlocked.push({
            code: def.code,
            unlockedAt: null,
            metadata: { longestRunKm: stats.longestSingleRunKm },
          })
        }
        break
      }
      case 'total_distance': {
        const target = Number(def.target_value ?? 0)
        if (target > 0 && stats.totalDistanceKm >= target) {
          unlocked.push({
            code: def.code,
            unlockedAt: stats.milestoneUnlockDates[def.code]
              ? `${stats.milestoneUnlockDates[def.code]}T00:00:00.000Z`
              : null,
            metadata: { distanceAtUnlock: stats.totalDistanceKm },
          })
        }
        break
      }
      case 'best_streak': {
        const target = Number(def.target_value ?? 0)
        if (target > 0 && stats.bestStreak >= target) {
          unlocked.push({
            code: def.code,
            unlockedAt: null,
            metadata: { bestStreakAtUnlock: stats.bestStreak },
          })
        }
        break
      }
      case 'perfect_week':
        if (stats.hasPerfectWeek) {
          unlocked.push({
            code: def.code,
            unlockedAt: null,
            metadata: {},
          })
        }
        break
      case 'first_pb':
        if (stats.pbHistoryAvailable && stats.hasPbImprovement) {
          unlocked.push({
            code: def.code,
            unlockedAt: null,
            metadata: {},
          })
        }
        break
      case 'first_rival':
        if (stats.hasRival) {
          unlocked.push({ code: def.code, unlockedAt: null, metadata: {} })
        }
        break
      case 'team_battle':
        if (stats.hasTeamBattle) {
          unlocked.push({ code: def.code, unlockedAt: null, metadata: {} })
        }
        break
      case 'mvp_first':
        if (stats.isCurrentMvp) {
          unlocked.push({ code: def.code, unlockedAt: null, metadata: {} })
        }
        break
      default:
        break
    }
  }

  return unlocked
}

function progressFor(
  def: AchievementDefinition,
  stats: AchievementStats,
): Pick<
  AchievementProgressView,
  | 'progressKind'
  | 'currentValue'
  | 'targetValue'
  | 'progressLabel'
  | 'progressPercent'
  | 'unavailable'
  | 'unavailableReason'
> {
  if (def.criteria_type === 'first_pb' && !stats.pbHistoryAvailable) {
    return {
      progressKind: 'none',
      currentValue: null,
      targetValue: null,
      progressLabel: null,
      progressPercent: null,
      unavailable: true,
      unavailableReason: 'PB 이력이 없어 이 배지를 계산할 수 없습니다.',
    }
  }

  switch (def.criteria_type) {
    case 'total_distance': {
      const target = Number(def.target_value ?? 0)
      const current = stats.totalDistanceKm
      const percent =
        target > 0 ? Math.min(100, Math.round((current / target) * 1000) / 10) : null
      return {
        progressKind: 'ratio',
        currentValue: current,
        targetValue: target,
        progressLabel: `${formatMileageKmDisplay(current)} / ${formatMileageKmDisplay(target)}`,
        progressPercent: percent,
        unavailable: false,
        unavailableReason: null,
      }
    }
    case 'single_distance': {
      const target = Number(def.target_value ?? 0)
      const current = stats.longestSingleRunKm
      const percent =
        target > 0 ? Math.min(100, Math.round((current / target) * 1000) / 10) : null
      return {
        progressKind: 'ratio',
        currentValue: current,
        targetValue: target,
        progressLabel: `${formatMileageKmDisplay(current)} / ${formatMileageKmDisplay(target)}`,
        progressPercent: percent,
        unavailable: false,
        unavailableReason: null,
      }
    }
    case 'best_streak': {
      const target = Number(def.target_value ?? 0)
      const current = stats.bestStreak
      const percent =
        target > 0 ? Math.min(100, Math.round((current / target) * 1000) / 10) : null
      return {
        progressKind: 'ratio',
        currentValue: current,
        targetValue: target,
        progressLabel: `${current} / ${target}주`,
        progressPercent: percent,
        unavailable: false,
        unavailableReason: null,
      }
    }
    default:
      return {
        progressKind: 'none',
        currentValue: null,
        targetValue: def.target_value,
        progressLabel: null,
        progressPercent: null,
        unavailable: false,
        unavailableReason: null,
      }
  }
}

export function buildMemberAchievementsView(input: {
  catalog: ReadonlyArray<AchievementDefinition>
  stats: AchievementStats
  unlockedByCode: ReadonlyMap<
    string,
    { unlockedAt: string; metadata: Record<string, unknown> | null }
  >
  showcaseCodes: ReadonlyArray<{ code: string; position: number }>
  newlyUnlockedCodes?: AchievementCode[]
  tableReady?: boolean
}): MemberAchievementsView {
  const showcaseMap = new Map(
    input.showcaseCodes.map((row) => [row.code, row.position]),
  )

  const items: AchievementProgressView[] = input.catalog.map((def) => {
    const unlockedRow = input.unlockedByCode.get(def.code)
    const progress = progressFor(def, input.stats)
    return {
      code: def.code,
      title: def.title,
      description: def.description,
      category: def.category,
      icon_key: def.icon_key,
      tier: def.tier,
      sort_order: def.sort_order,
      unlocked: Boolean(unlockedRow),
      unlockedAt: unlockedRow?.unlockedAt ?? null,
      metadata: unlockedRow?.metadata ?? null,
      isShowcase: showcaseMap.has(def.code),
      showcasePosition: showcaseMap.get(def.code) ?? null,
      ...progress,
    }
  })

  const unlockedItems = items.filter((row) => row.unlocked)
  const recent = [...unlockedItems]
    .sort((a, b) => String(b.unlockedAt ?? '').localeCompare(String(a.unlockedAt ?? '')))
    .slice(0, 3)

  const showcase = [...items]
    .filter((row) => row.isShowcase)
    .sort((a, b) => (a.showcasePosition ?? 99) - (b.showcasePosition ?? 99))

  return {
    tableReady: input.tableReady !== false,
    unlockedCount: unlockedItems.length,
    totalCount: items.filter((row) => !row.unavailable).length || items.length,
    recent,
    showcase,
    items,
    newlyUnlockedCodes: input.newlyUnlockedCodes ?? [],
  }
}

export const MAX_SHOWCASE_BADGES = 3
