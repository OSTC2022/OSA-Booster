import { format, parseISO, subMonths } from 'date-fns'
import { ko } from 'date-fns/locale'
import { getKstDateKey } from '@/lib/member-backup/kst-date'
import { formatMileageKmDisplay } from '@/lib/running-league/mileage-leaderboard'
import type { MileageRecognition } from '@/lib/running-league/mileage-recognition'
import { resolvePbTimeSeconds } from '@/lib/running-league/pb-leaderboard'
import { formatSecondsToRunningTime } from '@/lib/running-league/records'
import { calculateRunningStreak } from '@/lib/running-league/running-streak'
import {
  getWeeklyAttendanceCount,
  getWeeklyDistanceKm,
  getWeeklyRunCount,
} from '@/lib/running-league/weekly-missions'
import {
  getCurrentWeekRange,
  shiftWeekRange,
  type WeekRange,
} from '@/lib/running-league/week-range'

export const MVP_PERIODS = ['weekly', 'monthly'] as const
export type MvpPeriod = (typeof MVP_PERIODS)[number]

export const MVP_CATEGORIES = [
  'distance',
  'attendance',
  'growth',
  'pb',
  'consistency',
] as const
export type MvpCategory = (typeof MVP_CATEGORIES)[number]

export const MVP_CATEGORY_META: Record<
  MvpCategory,
  { label: string; icon: string; description: string }
> = {
  distance: {
    label: '거리왕',
    icon: '🏃',
    description: '기간 내 유효 러닝 거리 합계',
  },
  attendance: {
    label: '출석왕',
    icon: '✅',
    description: '마일리지 기록 일수(출석)',
  },
  growth: {
    label: '성장왕',
    icon: '📈',
    description: '이전 기간 대비 활동 증가',
  },
  pb: {
    label: 'PB왕',
    icon: '⚡',
    description: '기간 내 PB 개선율',
  },
  consistency: {
    label: '꾸준왕',
    icon: '🔥',
    description: '주간 STREAK 연속 주 수',
  },
}

/** 성장왕 최소 baseline — 한 곳에서만 관리 */
export const MVP_GROWTH_CONFIG = {
  weeklyMinimumBaselineKm: 5,
  monthlyMinimumBaselineKm: 20,
  weeklyMinimumCurrentKm: 5,
  monthlyMinimumCurrentKm: 20,
} as const

export type MvpMember = {
  memberId: string
  memberName: string
}

export type MvpCandidate = {
  memberId: string
  memberName: string
  /** 비교·정렬용 점수 (클수록 상위) */
  score: number
  valueLabel: string
  /** 상세용 보조 */
  detailLabel?: string
}

export type MvpCategoryResult = {
  category: MvpCategory
  label: string
  icon: string
  description: string
  available: boolean
  unavailableReason: string | null
  winners: MvpCandidate[]
  top: MvpCandidate[]
  myRank: number | null
  myValueLabel: string | null
  titleLabel: string | null
}

export type MvpPeriodBoard = {
  period: MvpPeriod
  periodLabel: string
  rangeLabel: string
  start: string
  end: string
  provisional: boolean
  categories: MvpCategoryResult[]
  myTitles: string[]
}

export type MvpHomeView = {
  weekly: MvpPeriodBoard
  monthly: MvpPeriodBoard
  viewerMemberId: string | null
}

type MileageLog = {
  member_id: string
  distance_km: number
  logged_at: string
}

type PbRecordRow = {
  member_id: string
  distance_event: string
  measured_at: string
  time_seconds?: number | null
  time_text?: string | null
  record_phase?: string | null
  created_at?: string | null
}

function roundKm(km: number): number {
  return Math.round(km * 10) / 10
}

function roundPercent(value: number): number {
  return Math.round(value * 10) / 10
}

/** Asia/Seoul 달력 기준 해당 월 1일~말일 */
export function getMvpMonthRange(asOf = new Date()): { start: string; end: string; label: string } {
  const key = getKstDateKey(asOf)
  const [y, m] = key.split('-').map(Number)
  const start = `${y}-${String(m).padStart(2, '0')}-01`
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const end = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return {
    start,
    end,
    label: format(parseISO(start), 'yyyy년 M월', { locale: ko }),
  }
}

export function getPreviousMonthRange(monthStart: string): { start: string; end: string } {
  const prev = subMonths(parseISO(monthStart), 1)
  const y = prev.getFullYear()
  const m = prev.getMonth() + 1
  const start = `${y}-${String(m).padStart(2, '0')}-01`
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const end = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return { start, end }
}

export function resolveMvpPeriodRange(
  period: MvpPeriod,
  asOf = new Date(),
): { start: string; end: string; periodLabel: string; rangeLabel: string; week?: WeekRange } {
  const asOfKey = getKstDateKey(asOf)
  if (period === 'weekly') {
    const week = getCurrentWeekRange(asOf)
    const end = asOfKey < week.end ? asOfKey : week.end
    return {
      start: week.start,
      end,
      periodLabel: '이번 주',
      rangeLabel: week.shortLabel,
      week,
    }
  }
  const month = getMvpMonthRange(asOf)
  const end = asOfKey < month.end ? asOfKey : month.end
  return {
    start: month.start,
    end,
    periodLabel: '이번 달',
    rangeLabel: month.label,
  }
}

function distanceEventShortLabel(event: string): string {
  if (event === '5km') return '5K'
  if (event === '10km') return '10K'
  if (event === 'half') return 'Half'
  if (event === 'full') return 'Full'
  return event
}

function pickWinners(ranked: MvpCandidate[]): MvpCandidate[] {
  if (ranked.length === 0) return []
  const topScore = ranked[0].score
  if (!(topScore > 0)) return []
  return ranked.filter((row) => row.score === topScore)
}

function formatWinnersSummary(winners: MvpCandidate[]): string {
  if (winners.length === 0) return '없음'
  if (winners.length === 1) return winners[0].memberName
  if (winners.length === 2) return `${winners[0].memberName} · ${winners[1].memberName}`
  return `${winners[0].memberName} 외 ${winners.length - 1}명`
}

function myRankAmong(ranked: MvpCandidate[], memberId: string | null): number | null {
  if (!memberId) return null
  const index = ranked.findIndex((row) => row.memberId === memberId)
  return index >= 0 ? index + 1 : null
}

function titleForCategory(
  period: MvpPeriod,
  category: MvpCategory,
  monthLabel: string,
): string {
  const meta = MVP_CATEGORY_META[category]
  if (period === 'weekly') {
    if (category === 'consistency') return `${meta.icon} 꾸준왕`
    return `${meta.icon} 이번 주 ${meta.label}`
  }
  if (category === 'consistency') return `${meta.icon} 꾸준왕`
  const monthShort = monthLabel.replace(/^\d+년\s*/, '')
  return `${meta.icon} ${monthShort} ${meta.label}`
}

export function rankDistanceCandidates(input: {
  members: ReadonlyArray<MvpMember>
  logs: ReadonlyArray<MileageLog>
  start: string
  end: string
  recognition?: MileageRecognition | null
}): MvpCandidate[] {
  const rows: MvpCandidate[] = []
  for (const member of input.members) {
    const km = getWeeklyDistanceKm(
      member.memberId,
      input.logs,
      input.start,
      input.end,
      input.recognition,
    )
    if (km <= 0) continue
    rows.push({
      memberId: member.memberId,
      memberName: member.memberName,
      score: km,
      valueLabel: formatMileageKmDisplay(km),
    })
  }
  rows.sort(
    (a, b) => b.score - a.score || a.memberName.localeCompare(b.memberName, 'ko'),
  )
  return rows
}

export function rankAttendanceCandidates(input: {
  members: ReadonlyArray<MvpMember>
  logs: ReadonlyArray<MileageLog>
  start: string
  end: string
}): MvpCandidate[] {
  const rows: MvpCandidate[] = []
  for (const member of input.members) {
    const days = getWeeklyAttendanceCount(member.memberId, input.logs, input.start, input.end)
    if (days <= 0) continue
    rows.push({
      memberId: member.memberId,
      memberName: member.memberName,
      score: days,
      valueLabel: `${days}회`,
    })
  }
  rows.sort(
    (a, b) => b.score - a.score || a.memberName.localeCompare(b.memberName, 'ko'),
  )
  return rows
}

export function rankGrowthCandidates(input: {
  members: ReadonlyArray<MvpMember>
  logs: ReadonlyArray<MileageLog>
  currentStart: string
  currentEnd: string
  previousStart: string
  previousEnd: string
  period: MvpPeriod
  recognition?: MileageRecognition | null
}): MvpCandidate[] {
  const minPrev =
    input.period === 'weekly'
      ? MVP_GROWTH_CONFIG.weeklyMinimumBaselineKm
      : MVP_GROWTH_CONFIG.monthlyMinimumBaselineKm
  const minCurrent =
    input.period === 'weekly'
      ? MVP_GROWTH_CONFIG.weeklyMinimumCurrentKm
      : MVP_GROWTH_CONFIG.monthlyMinimumCurrentKm

  const rows: MvpCandidate[] = []
  for (const member of input.members) {
    const current = getWeeklyDistanceKm(
      member.memberId,
      input.logs,
      input.currentStart,
      input.currentEnd,
      input.recognition,
    )
    const previous = getWeeklyDistanceKm(
      member.memberId,
      input.logs,
      input.previousStart,
      input.previousEnd,
      input.recognition,
    )
    if (previous < minPrev || current < minCurrent) continue
    if (previous <= 0) continue
    const growthRate = roundPercent(((current - previous) / previous) * 100)
    if (growthRate <= 0) continue
    rows.push({
      memberId: member.memberId,
      memberName: member.memberName,
      score: growthRate,
      valueLabel: `+${growthRate}%`,
      detailLabel: `${formatMileageKmDisplay(previous)} → ${formatMileageKmDisplay(current)}`,
    })
  }
  rows.sort(
    (a, b) => b.score - a.score || a.memberName.localeCompare(b.memberName, 'ko'),
  )
  return rows
}

/**
 * 기간 내 PB 개선 이벤트.
 * 기록(현재 PB + pb_history)을 시간순으로 보며 best가 갱신될 때 improvement로 집계.
 */
export function collectPbImprovementsInRange(input: {
  records: ReadonlyArray<PbRecordRow>
  start: string
  end: string
}): Array<{
  memberId: string
  distanceEvent: string
  previousSeconds: number
  newSeconds: number
  improvementRate: number
  deltaSeconds: number
  measuredAt: string
}> {
  const byKey = new Map<string, PbRecordRow[]>()
  for (const row of input.records) {
    const memberId = String(row.member_id ?? '')
    const event = String(row.distance_event ?? '')
    if (!memberId || !event) continue
    const seconds = resolvePbTimeSeconds({
      time_seconds: row.time_seconds,
      time_text: row.time_text,
    })
    if (seconds == null) continue
    const key = `${memberId}::${event}`
    const list = byKey.get(key) ?? []
    list.push(row)
    byKey.set(key, list)
  }

  const improvements: Array<{
    memberId: string
    distanceEvent: string
    previousSeconds: number
    newSeconds: number
    improvementRate: number
    deltaSeconds: number
    measuredAt: string
  }> = []

  for (const [key, list] of byKey) {
    const [memberId, distanceEvent] = key.split('::')
    const sorted = [...list].sort((a, b) => {
      const da = String(a.measured_at).slice(0, 10)
      const db = String(b.measured_at).slice(0, 10)
      if (da !== db) return da.localeCompare(db)
      return String(a.created_at ?? '').localeCompare(String(b.created_at ?? ''))
    })

    let best: number | null = null
    for (const row of sorted) {
      const measuredAt = String(row.measured_at).slice(0, 10)
      const seconds = resolvePbTimeSeconds({
        time_seconds: row.time_seconds,
        time_text: row.time_text,
      })
      if (seconds == null) continue

      if (best == null) {
        best = seconds
        continue
      }
      if (seconds < best) {
        const previous = best
        const delta = previous - seconds
        const rate = roundPercent((delta / previous) * 100)
        if (measuredAt >= input.start && measuredAt <= input.end && rate > 0) {
          improvements.push({
            memberId,
            distanceEvent,
            previousSeconds: previous,
            newSeconds: seconds,
            improvementRate: rate,
            deltaSeconds: delta,
            measuredAt,
          })
        }
        best = seconds
      }
    }
  }

  return improvements
}

export function rankPbCandidates(input: {
  members: ReadonlyArray<MvpMember>
  records: ReadonlyArray<PbRecordRow>
  start: string
  end: string
  pbHistoryAvailable: boolean
}): { available: boolean; unavailableReason: string | null; ranked: MvpCandidate[] } {
  if (!input.pbHistoryAvailable) {
    return {
      available: false,
      unavailableReason:
        '현재 PB 저장 구조에는 기록 변경 이력이 없어 기간별 PB왕을 정확히 계산할 수 없습니다.',
      ranked: [],
    }
  }

  const nameById = new Map(input.members.map((m) => [m.memberId, m.memberName]))
  const eligible = new Set(input.members.map((m) => m.memberId))
  const improvements = collectPbImprovementsInRange({
    records: input.records,
    start: input.start,
    end: input.end,
  }).filter((row) => eligible.has(row.memberId))

  const bestByMember = new Map<string, (typeof improvements)[number]>()
  for (const row of improvements) {
    const prev = bestByMember.get(row.memberId)
    if (!prev || row.improvementRate > prev.improvementRate) {
      bestByMember.set(row.memberId, row)
    }
  }

  const ranked: MvpCandidate[] = [...bestByMember.values()].map((row) => ({
    memberId: row.memberId,
    memberName: nameById.get(row.memberId) ?? '회원',
    score: row.improvementRate,
    valueLabel: `${distanceEventShortLabel(row.distanceEvent)} -${formatSecondsToRunningTime(row.deltaSeconds)}`,
    detailLabel: `개선율 +${row.improvementRate}%`,
  }))

  ranked.sort(
    (a, b) => b.score - a.score || a.memberName.localeCompare(b.memberName, 'ko'),
  )

  return { available: true, unavailableReason: null, ranked }
}

export function rankConsistencyCandidates(input: {
  members: ReadonlyArray<MvpMember>
  logs: ReadonlyArray<MileageLog>
  periodStart: string
  periodEnd: string
  recognition?: MileageRecognition | null
  asOf?: Date
}): MvpCandidate[] {
  const asOf = input.asOf ?? new Date()
  const rows: MvpCandidate[] = []

  for (const member of input.members) {
    const streak = calculateRunningStreak({
      memberId: member.memberId,
      logs: input.logs,
      recognition: input.recognition,
      asOf,
    })
    if (streak.currentStreak <= 0) continue
    const periodRuns = getWeeklyRunCount(
      member.memberId,
      input.logs,
      input.periodStart,
      input.periodEnd,
      input.recognition,
    )
    // score: currentStreak primary; bestStreak + periodRuns as tie-break via composite
    const score =
      streak.currentStreak * 1_000_000 + streak.bestStreak * 1_000 + periodRuns
    rows.push({
      memberId: member.memberId,
      memberName: member.memberName,
      score,
      valueLabel: `${streak.currentStreak}주`,
      detailLabel: `최고 ${streak.bestStreak}주`,
    })
  }

  rows.sort(
    (a, b) => b.score - a.score || a.memberName.localeCompare(b.memberName, 'ko'),
  )
  return rows
}

function buildCategoryResult(input: {
  category: MvpCategory
  period: MvpPeriod
  monthLabel: string
  ranked: MvpCandidate[]
  viewerMemberId: string | null
  available?: boolean
  unavailableReason?: string | null
}): MvpCategoryResult {
  const meta = MVP_CATEGORY_META[input.category]
  const available = input.available !== false
  const winners = available ? pickWinners(input.ranked) : []
  const top = available ? input.ranked.slice(0, 3) : []
  const mine = input.viewerMemberId
    ? input.ranked.find((row) => row.memberId === input.viewerMemberId) ?? null
    : null

  return {
    category: input.category,
    label: meta.label,
    icon: meta.icon,
    description: meta.description,
    available,
    unavailableReason: available ? null : (input.unavailableReason ?? '계산 불가'),
    winners,
    top,
    myRank: available ? myRankAmong(input.ranked, input.viewerMemberId) : null,
    myValueLabel: mine?.valueLabel ?? null,
    titleLabel:
      available && winners.some((w) => w.memberId === input.viewerMemberId)
        ? titleForCategory(input.period, input.category, input.monthLabel)
        : null,
  }
}

export function buildMvpPeriodBoard(input: {
  period: MvpPeriod
  members: ReadonlyArray<MvpMember>
  logs: ReadonlyArray<MileageLog>
  pbRecords: ReadonlyArray<PbRecordRow>
  pbHistoryAvailable: boolean
  viewerMemberId?: string | null
  recognition?: MileageRecognition | null
  asOf?: Date
}): MvpPeriodBoard {
  const asOf = input.asOf ?? new Date()
  const range = resolveMvpPeriodRange(input.period, asOf)
  const monthMeta = getMvpMonthRange(asOf)
  const viewerMemberId = input.viewerMemberId?.trim() || null

  let previousStart: string
  let previousEnd: string
  if (input.period === 'weekly') {
    const week = getCurrentWeekRange(asOf)
    const prev = shiftWeekRange(week, -1)
    previousStart = prev.start
    previousEnd = prev.end
  } else {
    const prev = getPreviousMonthRange(monthMeta.start)
    previousStart = prev.start
    previousEnd = prev.end
  }

  const distanceRanked = rankDistanceCandidates({
    members: input.members,
    logs: input.logs,
    start: range.start,
    end: range.end,
    recognition: input.recognition,
  })
  const attendanceRanked = rankAttendanceCandidates({
    members: input.members,
    logs: input.logs,
    start: range.start,
    end: range.end,
  })
  const growthRanked = rankGrowthCandidates({
    members: input.members,
    logs: input.logs,
    currentStart: range.start,
    currentEnd: range.end,
    previousStart,
    previousEnd,
    period: input.period,
    recognition: input.recognition,
  })
  const pb = rankPbCandidates({
    members: input.members,
    records: input.pbRecords,
    start: range.start,
    end: range.end,
    pbHistoryAvailable: input.pbHistoryAvailable,
  })
  const consistencyRanked = rankConsistencyCandidates({
    members: input.members,
    logs: input.logs,
    periodStart: range.start,
    periodEnd: range.end,
    recognition: input.recognition,
    asOf,
  })

  const categories = (
    [
      ['distance', distanceRanked],
      ['attendance', attendanceRanked],
      ['growth', growthRanked],
      ['pb', pb.ranked],
      ['consistency', consistencyRanked],
    ] as const
  ).map(([category, ranked]) =>
    buildCategoryResult({
      category,
      period: input.period,
      monthLabel: monthMeta.label,
      ranked,
      viewerMemberId,
      available: category === 'pb' ? pb.available : true,
      unavailableReason: category === 'pb' ? pb.unavailableReason : null,
    }),
  )

  const myTitles = categories
    .map((row) => row.titleLabel)
    .filter((label): label is string => Boolean(label))

  return {
    period: input.period,
    periodLabel: range.periodLabel,
    rangeLabel: range.rangeLabel,
    start: range.start,
    end: range.end,
    provisional: true,
    categories,
    myTitles,
  }
}

export function buildMvpHomeView(input: {
  members: ReadonlyArray<MvpMember>
  logs: ReadonlyArray<MileageLog>
  pbRecords: ReadonlyArray<PbRecordRow>
  pbHistoryAvailable: boolean
  viewerMemberId?: string | null
  recognition?: MileageRecognition | null
  asOf?: Date
}): MvpHomeView {
  return {
    weekly: buildMvpPeriodBoard({ ...input, period: 'weekly' }),
    monthly: buildMvpPeriodBoard({ ...input, period: 'monthly' }),
    viewerMemberId: input.viewerMemberId?.trim() || null,
  }
}

export function summarizeMvpWinnersLabel(winners: MvpCandidate[]): string {
  return formatWinnersSummary(winners)
}
