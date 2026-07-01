import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import { maskMemberNameForRanking } from '@/lib/running-league/mask-member-name'
import { buildMemberMileageHistorySeries } from '@/lib/running-league/mileage-history'
import {
  sumMemberMileageUpToDate,
  type MileageRecognition,
} from '@/lib/running-league/mileage-recognition'
import {
  computeMileageRankAtDate,
  type MileageRankHistoryPoint,
} from '@/lib/running-league/mileage-rank-history'
import type {
  LeagueRankComparisonChart,
  LeagueRankComparisonRow,
  LeagueRankMemberSeries,
} from '@/lib/running-league/league-rank-comparison'
import type { RunningLeagueMileageLog, RunningLeagueParticipant } from '@/lib/types'

export type LeagueMileageComparisonRow = {
  date: string
  label: string
  [key: `km_${string}`]: number | null | undefined
}

export type LeagueMileageComparisonChart = {
  rows: LeagueMileageComparisonRow[]
  members: LeagueRankMemberSeries[]
}

function formatChartDate(value: string): string {
  try {
    return format(parseISO(value), 'M/d', { locale: ko })
  } catch {
    return value
  }
}

function collectMileageSnapshotDates(
  logs: ReadonlyArray<RunningLeagueMileageLog>,
  maxPoints = 12,
): string[] {
  const dates = new Set<string>()
  for (const log of logs) {
    dates.add(log.logged_at)
  }
  const sorted = [...dates].sort()
  if (sorted.length <= maxPoints) return sorted
  return sorted.slice(-maxPoints)
}

function resolveRankedMembersAtLatest(input: {
  participants: ReadonlyArray<RunningLeagueParticipant>
  logs: ReadonlyArray<RunningLeagueMileageLog>
  latestDate: string
  maxMembers?: number
  mileageRecognition?: MileageRecognition | null
}): Array<{ memberId: string; memberName: string; km: number }> {
  const rows = input.participants
    .map((participant) => {
      const km = sumMemberMileageUpToDate(
        participant.member_id,
        input.logs,
        input.latestDate,
        input.mileageRecognition,
      )
      return {
        memberId: participant.member_id,
        memberName: participant.member?.name?.trim() || '회원',
        km,
      }
    })
    .filter((row) => row.km > 0)
    .sort((a, b) => b.km - a.km || a.memberName.localeCompare(b.memberName, 'ko'))

  if (input.maxMembers == null) return rows
  return rows.slice(0, input.maxMembers)
}

/** 전체 회원 월 마일리지 누적 비교 */
export function buildLeagueMileageComparisonChart(input: {
  participants: ReadonlyArray<RunningLeagueParticipant>
  logs: ReadonlyArray<RunningLeagueMileageLog>
  maxMembers?: number
  mileageRecognition?: MileageRecognition | null
}): LeagueMileageComparisonChart | null {
  const dates = collectMileageSnapshotDates(input.logs)
  if (dates.length === 0) return null

  const latestDate = dates[dates.length - 1]
  const rankedMembers = resolveRankedMembersAtLatest({
    participants: input.participants,
    logs: input.logs,
    latestDate,
    maxMembers: input.maxMembers ?? input.participants.length,
    mileageRecognition: input.mileageRecognition,
  })
  if (rankedMembers.length === 0) return null

  const members: LeagueRankMemberSeries[] = rankedMembers.map((row) => ({
    memberId: row.memberId,
    memberName: maskMemberNameForRanking(row.memberName),
    isSelected: false,
  }))

  const rows: LeagueMileageComparisonRow[] = dates.map((date) => {
    const row: LeagueMileageComparisonRow = {
      date,
      label: formatChartDate(date),
    }
    for (const member of members) {
      row[`km_${member.memberId}`] = sumMemberMileageUpToDate(
        member.memberId,
        input.logs,
        date,
        input.mileageRecognition,
      )
    }
    return row
  })

  return { rows, members }
}

/** 전체 회원 월 마일리지 순위 궤적 */
export function buildLeagueAggregateMileageRankComparisonChart(input: {
  participants: ReadonlyArray<RunningLeagueParticipant>
  logs: ReadonlyArray<RunningLeagueMileageLog>
  maxMembers?: number
  mileageRecognition?: MileageRecognition | null
}): LeagueRankComparisonChart | null {
  const dates = collectMileageSnapshotDates(input.logs)
  if (dates.length === 0) return null

  const latestDate = dates[dates.length - 1]
  const rankedMembers = resolveRankedMembersAtLatest({
    participants: input.participants,
    logs: input.logs,
    latestDate,
    maxMembers: input.maxMembers ?? input.participants.length,
    mileageRecognition: input.mileageRecognition,
  })
  if (rankedMembers.length === 0) return null

  const members: LeagueRankMemberSeries[] = rankedMembers.map((row) => ({
    memberId: row.memberId,
    memberName: maskMemberNameForRanking(row.memberName),
    isSelected: false,
  }))

  const rows: LeagueRankComparisonRow[] = dates.map((date) => {
    const row: LeagueRankComparisonRow = {
      date,
      label: formatChartDate(date),
    }
    for (const member of members) {
      row[`rank_${member.memberId}`] = computeMileageRankAtDate({
        memberId: member.memberId,
        participants: input.participants,
        logs: input.logs,
        asOfDate: date,
        mileageRecognition: input.mileageRecognition,
      })
    }
    return row
  })

  return {
    rows,
    members,
    selectedMemberId: null,
  }
}

/** 집계 그래프용 — 개별 회원 마일리지 순위 시계열이 비어 있을 때 대체 */
export function hasAnyMileageRankHistory(
  participants: ReadonlyArray<RunningLeagueParticipant>,
  logs: ReadonlyArray<RunningLeagueMileageLog>,
  mileageRecognition?: MileageRecognition | null,
): boolean {
  return participants.some(
    (participant) =>
      buildMemberMileageHistorySeries(participant.member_id, logs, mileageRecognition).length > 0,
  )
}

export type { MileageRankHistoryPoint }
