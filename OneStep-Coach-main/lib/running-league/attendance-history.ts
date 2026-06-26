import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import { toMileageLogDateKey } from '@/lib/running-league/attendance-leaderboard'
import type { RunningLeagueMileageLog, RunningLeagueParticipant } from '@/lib/types'

export type AttendanceHistoryPoint = {
  date: string
  label: string
  cumulativeDays: number
}

function formatChartDate(value: string): string {
  try {
    return format(parseISO(value), 'M/d', { locale: ko })
  } catch {
    return value
  }
}

/** 해당 날짜까지 기록을 올린 출석일 수 */
export function countAttendanceDaysUpToDate(
  memberId: string,
  logs: ReadonlyArray<Pick<RunningLeagueMileageLog, 'member_id' | 'logged_at'>>,
  asOfDate: string,
  periodStart?: string,
  periodEnd?: string,
): number {
  const days = new Set<string>()

  for (const log of logs) {
    if (log.member_id !== memberId) continue
    const dateKey = toMileageLogDateKey(log.logged_at)
    if (!dateKey || dateKey > asOfDate) continue
    if (periodStart && dateKey < periodStart) continue
    if (periodEnd && dateKey > periodEnd) continue
    days.add(dateKey)
  }

  return days.size
}

function collectMemberAttendanceDates(
  memberId: string,
  logs: ReadonlyArray<RunningLeagueMileageLog>,
  periodStart?: string,
  periodEnd?: string,
): string[] {
  const days = new Set<string>()

  for (const log of logs) {
    if (log.member_id !== memberId) continue
    const dateKey = toMileageLogDateKey(log.logged_at)
    if (!dateKey) continue
    if (periodStart && dateKey < periodStart) continue
    if (periodEnd && dateKey > periodEnd) continue
    days.add(dateKey)
  }

  return [...days].sort()
}

/** 회원 출석일 누적 그래프 — 기록을 올린 날마다 +1 */
export function buildMemberAttendanceHistorySeries(
  memberId: string,
  logs: ReadonlyArray<RunningLeagueMileageLog>,
  periodStart?: string,
  periodEnd?: string,
): AttendanceHistoryPoint[] {
  const dates = collectMemberAttendanceDates(memberId, logs, periodStart, periodEnd)
  let cumulativeDays = 0

  return dates.map((date) => {
    cumulativeDays += 1
    return {
      date,
      label: formatChartDate(date),
      cumulativeDays,
    }
  })
}

export type AttendanceRankHistoryPoint = {
  date: string
  label: string
  rank: number | null
  cumulativeDays: number
}

export function computeAttendanceRankAtDate(input: {
  memberId: string
  participants: ReadonlyArray<RunningLeagueParticipant>
  logs: ReadonlyArray<RunningLeagueMileageLog>
  asOfDate: string
  periodStart?: string
  periodEnd?: string
}): number | null {
  const rows: Array<{ memberId: string; days: number; memberName: string }> = []

  for (const participant of input.participants) {
    const days = countAttendanceDaysUpToDate(
      participant.member_id,
      input.logs,
      input.asOfDate,
      input.periodStart,
      input.periodEnd,
    )
    if (days <= 0) continue
    rows.push({
      memberId: participant.member_id,
      days,
      memberName: participant.member?.name?.trim() || '회원',
    })
  }

  if (rows.length === 0) return null

  rows.sort((a, b) => {
    if (b.days !== a.days) return b.days - a.days
    return a.memberName.localeCompare(b.memberName, 'ko')
  })

  let rank = 0
  let previousDays: number | null = null
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]
    if (previousDays === null || row.days !== previousDays) {
      rank = index + 1
      previousDays = row.days
    }
    if (row.memberId === input.memberId) return rank
  }

  return null
}

export function buildMemberAttendanceRankHistorySeries(input: {
  memberId: string
  participants: ReadonlyArray<RunningLeagueParticipant>
  logs: ReadonlyArray<RunningLeagueMileageLog>
  periodStart?: string
  periodEnd?: string
}): AttendanceRankHistoryPoint[] {
  const dates = collectMemberAttendanceDates(input.memberId, input.logs, input.periodStart, input.periodEnd)

  return dates.map((date) => ({
    date,
    label: formatChartDate(date),
    rank: computeAttendanceRankAtDate({
      memberId: input.memberId,
      participants: input.participants,
      logs: input.logs,
      asOfDate: date,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
    }),
    cumulativeDays: countAttendanceDaysUpToDate(
      input.memberId,
      input.logs,
      date,
      input.periodStart,
      input.periodEnd,
    ),
  }))
}
