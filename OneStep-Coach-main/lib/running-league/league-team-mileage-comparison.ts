import type { LeagueMileageComparisonChart } from '@/lib/running-league/league-mileage-comparison'
import {
  sumMemberMileageUpToDate,
  type MileageRecognition,
} from '@/lib/running-league/mileage-recognition'
import type {
  PortalMileageTeam,
  PortalMileageTeamMember,
} from '@/lib/running-league/mileage-team-leaderboard'
import type { RunningLeagueMileageLog } from '@/lib/types'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'

function formatChartDate(value: string): string {
  try {
    return format(parseISO(value.slice(0, 10)), 'M/d', { locale: ko })
  } catch {
    return value
  }
}

function formatChartMonthLabel(value: string): string {
  try {
    return format(parseISO(value.slice(0, 10)), 'yy.M', { locale: ko })
  } catch {
    return value.slice(0, 7)
  }
}

function toMileageDateKey(value: string): string {
  const trimmed = value.trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10)
  return trimmed
}

function downsampleDates(sorted: string[], maxPoints: number): string[] {
  if (sorted.length <= maxPoints) return sorted
  const last = sorted.length - 1
  const picked = new Set<string>()
  for (let i = 0; i < maxPoints; i++) {
    const idx = Math.round((i * last) / (maxPoints - 1))
    picked.add(sorted[idx]!)
  }
  return [...picked].sort()
}

function collectDates(logs: ReadonlyArray<RunningLeagueMileageLog>, maxPoints = 36): string[] {
  const dates = new Set<string>()
  for (const log of logs) {
    const key = toMileageDateKey(log.logged_at)
    if (key) dates.add(key)
  }
  const sorted = [...dates].sort()
  if (sorted.length <= maxPoints) return sorted

  const monthLast = new Map<string, string>()
  for (const date of sorted) {
    monthLast.set(date.slice(0, 7), date)
  }
  const monthEnds = [...monthLast.values()].sort()
  const recentDaily = sorted.slice(-Math.min(12, maxPoints))
  const merged = [...new Set([...monthEnds, ...recentDaily])].sort()
  if (merged.length <= maxPoints) return merged
  return downsampleDates(merged, maxPoints)
}

function chartLabelForDate(date: string, allDates: string[]): string {
  const months = new Set(allDates.map((d) => d.slice(0, 7)))
  if (months.size >= 3) {
    const isMonthEnd = allDates.filter((d) => d.slice(0, 7) === date.slice(0, 7)).at(-1) === date
    if (isMonthEnd) return formatChartMonthLabel(date)
  }
  return formatChartDate(date)
}

/** 팀별 누적 마일리지 비교 그래프 (이력 로그 포함) */
export function buildLeagueTeamMileageComparisonChart(input: {
  teams: ReadonlyArray<PortalMileageTeam>
  memberships: ReadonlyArray<PortalMileageTeamMember>
  logs: ReadonlyArray<RunningLeagueMileageLog>
  mileageRecognition?: MileageRecognition | null
}): LeagueMileageComparisonChart | null {
  const activeTeams = input.teams.filter((team) => team.is_active)
  if (activeTeams.length === 0) return null

  const dates = collectDates(input.logs)
  if (dates.length === 0) return null

  const membersByTeam = new Map<string, string[]>()
  for (const membership of input.memberships) {
    const list = membersByTeam.get(membership.team_id) ?? []
    list.push(membership.member_id)
    membersByTeam.set(membership.team_id, list)
  }

  const members = activeTeams.map((team) => ({
    memberId: team.id,
    memberName: team.name,
    isSelected: false,
  }))

  const rows = dates.map((date) => {
    const row: LeagueMileageComparisonChart['rows'][number] = {
      date,
      label: chartLabelForDate(date, dates),
    }
    for (const team of activeTeams) {
      const memberIds = membersByTeam.get(team.id) ?? []
      const total = memberIds.reduce((sum, memberId) => {
        return (
          sum +
          sumMemberMileageUpToDate(
            memberId,
            input.logs,
            date,
            input.mileageRecognition,
          )
        )
      }, 0)
      row[`km_${team.id}`] = Math.round(total * 10) / 10
    }
    return row
  })

  return { rows, members }
}
