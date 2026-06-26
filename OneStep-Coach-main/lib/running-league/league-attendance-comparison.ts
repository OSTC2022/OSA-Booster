import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import { countAttendanceDaysUpToDate } from '@/lib/running-league/attendance-history'
import { toMileageLogDateKey } from '@/lib/running-league/attendance-leaderboard'
import { maskMemberNameForRanking } from '@/lib/running-league/mask-member-name'
import type { LeagueRankMemberSeries } from '@/lib/running-league/league-rank-comparison'
import type { RunningLeagueMileageLog, RunningLeagueParticipant } from '@/lib/types'

export type LeagueAttendanceComparisonRow = {
  date: string
  label: string
  [key: `days_${string}`]: number | null | undefined
}

export type LeagueAttendanceComparisonChart = {
  rows: LeagueAttendanceComparisonRow[]
  members: LeagueRankMemberSeries[]
}

function formatChartDate(value: string): string {
  try {
    return format(parseISO(value), 'M/d', { locale: ko })
  } catch {
    return value
  }
}

function collectAttendanceSnapshotDates(
  logs: ReadonlyArray<RunningLeagueMileageLog>,
  periodStart?: string,
  periodEnd?: string,
  maxPoints = 12,
): string[] {
  const dates = new Set<string>()

  for (const log of logs) {
    const dateKey = toMileageLogDateKey(log.logged_at)
    if (!dateKey) continue
    if (periodStart && dateKey < periodStart) continue
    if (periodEnd && dateKey > periodEnd) continue
    dates.add(dateKey)
  }

  const sorted = [...dates].sort()
  if (sorted.length <= maxPoints) return sorted
  return sorted.slice(-maxPoints)
}

function resolveRankedMembersAtLatest(input: {
  participants: ReadonlyArray<RunningLeagueParticipant>
  logs: ReadonlyArray<RunningLeagueMileageLog>
  latestDate: string
  periodStart?: string
  periodEnd?: string
  maxMembers: number
}): Array<{ memberId: string; memberName: string; days: number }> {
  return input.participants
    .map((participant) => ({
      memberId: participant.member_id,
      memberName: participant.member?.name?.trim() || '회원',
      days: countAttendanceDaysUpToDate(
        participant.member_id,
        input.logs,
        input.latestDate,
        input.periodStart,
        input.periodEnd,
      ),
    }))
    .filter((row) => row.days > 0)
    .sort((a, b) => b.days - a.days || a.memberName.localeCompare(b.memberName, 'ko'))
    .slice(0, input.maxMembers)
}

/** 전체 회원 출석일 누적 비교 */
export function buildLeagueAttendanceComparisonChart(input: {
  participants: ReadonlyArray<RunningLeagueParticipant>
  logs: ReadonlyArray<RunningLeagueMileageLog>
  periodStart?: string
  periodEnd?: string
  maxMembers?: number
}): LeagueAttendanceComparisonChart | null {
  const dates = collectAttendanceSnapshotDates(
    input.logs,
    input.periodStart,
    input.periodEnd,
  )
  if (dates.length === 0) return null

  const latestDate = dates[dates.length - 1]
  const rankedMembers = resolveRankedMembersAtLatest({
    participants: input.participants,
    logs: input.logs,
    latestDate,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    maxMembers: input.maxMembers ?? 20,
  })
  if (rankedMembers.length === 0) return null

  const members: LeagueRankMemberSeries[] = rankedMembers.map((row) => ({
    memberId: row.memberId,
    memberName: maskMemberNameForRanking(row.memberName),
    isSelected: false,
  }))

  const rows: LeagueAttendanceComparisonRow[] = dates.map((date) => {
    const row: LeagueAttendanceComparisonRow = {
      date,
      label: formatChartDate(date),
    }
    for (const member of members) {
      row[`days_${member.memberId}`] = countAttendanceDaysUpToDate(
        member.memberId,
        input.logs,
        date,
        input.periodStart,
        input.periodEnd,
      )
    }
    return row
  })

  return { rows, members }
}
