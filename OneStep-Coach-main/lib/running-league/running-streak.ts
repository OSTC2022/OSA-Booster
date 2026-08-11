import { getKstDateKey } from '@/lib/member-backup/kst-date'
import { toMileageLogDateKey } from '@/lib/running-league/attendance-leaderboard'
import {
  isMileageLogRecognized,
  type MileageRecognition,
} from '@/lib/running-league/mileage-recognition'
import { getWeeklyRunCount } from '@/lib/running-league/weekly-missions'
import {
  getCurrentWeekRange,
  getWeekRangeForDateKey,
  shiftWeekRange,
  type WeekRange,
} from '@/lib/running-league/week-range'
import type { RunningLeagueMileageLog } from '@/lib/types'

/**
 * STREAK 주간 러닝 목표 (주 N회).
 * Weekly Mission RUN_COUNT 목표와 독립 — 이벤트 미션이 5회로 바뀌어도 STREAK는 유지.
 *
 * TODO(future): center_settings 또는 effective_from 기간별 목표로 확장해
 * 과거 주를 새 목표로 재평가하지 않도록 한다.
 * TODO(future): STREAK FREEZE(부상/휴가) — 이번 단계 미구현.
 */
export const STREAK_WEEKLY_RUN_TARGET = 3

export type RunningStreakStatus = {
  currentStreak: number
  bestStreak: number
  currentWeekRuns: number
  weeklyTarget: number
  remainingRuns: number
  currentWeekCompleted: boolean
  /** 진행 중 주에서 목표 미달 + 기존 streak 있음 */
  streakAtRisk: boolean
  week: WeekRange
  /** 첫 유효 러닝 날짜 (없으면 null) */
  firstActivityDate: string | null
  progressPercent: number
  hint: string
}

type StreakLog = Pick<RunningLeagueMileageLog, 'member_id' | 'distance_km' | 'logged_at'>

function progressPercent(runs: number, target: number): number {
  if (!Number.isFinite(target) || target <= 0) return 0
  if (!Number.isFinite(runs) || runs <= 0) return 0
  return Math.min(100, Math.round((runs / target) * 1000) / 10)
}

function buildHint(status: {
  currentStreak: number
  currentWeekRuns: number
  weeklyTarget: number
  remainingRuns: number
  currentWeekCompleted: boolean
  firstActivityDate: string | null
}): string {
  if (status.currentWeekCompleted) {
    return '이번 주 STREAK 확보 🔥'
  }
  if (status.currentStreak <= 0 && !status.firstActivityDate) {
    return `이번 주 ${status.weeklyTarget}회 달성하고 첫 STREAK를 시작해보세요.`
  }
  if (status.currentStreak <= 0) {
    return status.currentWeekRuns > 0
      ? '첫 STREAK에 도전 중'
      : `이번 주 ${status.weeklyTarget}회 달성하고 첫 STREAK를 시작해보세요.`
  }
  if (status.remainingRuns > 0) {
    return `${status.remainingRuns}회 더 달리면 STREAK 유지`
  }
  return '이번 주 STREAK 확보 🔥'
}

/**
 * 주별 러닝 횟수 Map (weekStart yyyy-MM-dd → count).
 * RUN_COUNT와 동일 기준(getWeeklyRunCount). 미래 날짜 로그는 제외.
 * 원본 logs 배열을 mutate하지 않는다.
 */
export function buildWeeklyRunCountMap(input: {
  memberId: string
  logs: ReadonlyArray<StreakLog>
  recognition?: MileageRecognition | null
  /** Asia/Seoul today — 이 날짜 이후 기록 제외 */
  asOfDateKey: string
  firstWeekStart: string
  lastWeekStart: string
}): Map<string, number> {
  const cappedLogs = input.logs.filter((log) => {
    const key = toMileageLogDateKey(String(log.logged_at ?? ''))
    return key !== '' && key <= input.asOfDateKey
  })

  const counts = new Map<string, number>()
  let cursor = getWeekRangeForDateKey(input.firstWeekStart)
  const lastStart = input.lastWeekStart

  while (cursor.start <= lastStart) {
    const endCap =
      cursor.end > input.asOfDateKey ? input.asOfDateKey : cursor.end
    const count = getWeeklyRunCount(
      input.memberId,
      cappedLogs,
      cursor.start,
      endCap,
      input.recognition,
    )
    counts.set(cursor.start, count)
    cursor = shiftWeekRange(cursor, 1)
  }

  return counts
}

/** 순수 함수 — DB fetch 없이 STREAK 계산 (테스트용) */
export function calculateRunningStreak(input: {
  memberId: string
  logs: ReadonlyArray<StreakLog>
  weeklyTarget?: number
  recognition?: MileageRecognition | null
  asOf?: Date
}): RunningStreakStatus {
  const weeklyTarget = input.weeklyTarget ?? STREAK_WEEKLY_RUN_TARGET
  const asOf = input.asOf ?? new Date()
  const asOfDateKey = getKstDateKey(asOf)
  const week = getCurrentWeekRange(asOf)

  const eligibleLogs = input.logs.filter((log) => {
    if (log.member_id !== input.memberId) return false
    const key = toMileageLogDateKey(String(log.logged_at ?? ''))
    if (!key || key > asOfDateKey) return false
    return isMileageLogRecognized(log.distance_km, input.recognition)
  })

  let firstActivityDate: string | null = null
  for (const log of eligibleLogs) {
    const key = toMileageLogDateKey(String(log.logged_at ?? ''))
    if (!key) continue
    if (firstActivityDate == null || key < firstActivityDate) firstActivityDate = key
  }

  const currentWeekRuns = getWeeklyRunCount(
    input.memberId,
    eligibleLogs,
    week.start,
    asOfDateKey < week.end ? asOfDateKey : week.end,
    input.recognition,
  )
  const currentWeekCompleted = currentWeekRuns >= weeklyTarget
  const remainingRuns = Math.max(0, weeklyTarget - currentWeekRuns)

  if (!firstActivityDate) {
    return {
      currentStreak: 0,
      bestStreak: 0,
      currentWeekRuns,
      weeklyTarget,
      remainingRuns,
      currentWeekCompleted,
      streakAtRisk: false,
      week,
      firstActivityDate: null,
      progressPercent: progressPercent(currentWeekRuns, weeklyTarget),
      hint: buildHint({
        currentStreak: 0,
        currentWeekRuns,
        weeklyTarget,
        remainingRuns,
        currentWeekCompleted,
        firstActivityDate: null,
      }),
    }
  }

  const firstWeek = getWeekRangeForDateKey(firstActivityDate)
  const weeklyCounts = buildWeeklyRunCountMap({
    memberId: input.memberId,
    logs: input.logs,
    recognition: input.recognition,
    asOfDateKey,
    firstWeekStart: firstWeek.start,
    lastWeekStart: week.start,
  })

  /**
   * 현재 STREAK:
   * - 진행 중 주는 미달성이어도 실패로 확정하지 않음 (끊지 않음)
   * - 이미 목표 달성한 진행 중 주는 포함
   */
  let currentStreak = 0
  let cursorStart = currentWeekCompleted
    ? week.start
    : shiftWeekRange(week, -1).start

  if (cursorStart >= firstWeek.start) {
    while (cursorStart >= firstWeek.start) {
      const runs = weeklyCounts.get(cursorStart) ?? 0
      if (runs >= weeklyTarget) {
        currentStreak += 1
        cursorStart = shiftWeekRange(getWeekRangeForDateKey(cursorStart), -1).start
        continue
      }
      break
    }
  }

  /**
   * 최고 STREAK: 평가 확정된 주만
   * = 첫 활동 주 ~ 지난주 + (이번 주 완료 시 이번 주)
   * 진행 중·미완료 주는 best에서 실패로 처리하지 않음
   */
  const evaluated: boolean[] = []
  let evalCursor = firstWeek.start
  const lastEvaluatedStart = currentWeekCompleted
    ? week.start
    : shiftWeekRange(week, -1).start

  while (evalCursor <= lastEvaluatedStart) {
    const runs = weeklyCounts.get(evalCursor) ?? 0
    evaluated.push(runs >= weeklyTarget)
    evalCursor = shiftWeekRange(getWeekRangeForDateKey(evalCursor), 1).start
  }

  let bestStreak = 0
  let run = 0
  for (const success of evaluated) {
    if (success) {
      run += 1
      if (run > bestStreak) bestStreak = run
    } else {
      run = 0
    }
  }

  const streakAtRisk =
    currentStreak > 0 && !currentWeekCompleted && remainingRuns > 0

  return {
    currentStreak,
    bestStreak: Math.max(bestStreak, currentStreak),
    currentWeekRuns,
    weeklyTarget,
    remainingRuns,
    currentWeekCompleted,
    streakAtRisk,
    week,
    firstActivityDate,
    progressPercent: progressPercent(currentWeekRuns, weeklyTarget),
    hint: buildHint({
      currentStreak,
      currentWeekRuns,
      weeklyTarget,
      remainingRuns,
      currentWeekCompleted,
      firstActivityDate,
    }),
  }
}
