import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import { maskMemberNameForRanking } from '@/lib/running-league/mask-member-name'
import {
  sumMemberMileageUpToDate,
  type MileageRecognition,
} from '@/lib/running-league/mileage-recognition'
import type { LeagueMileageComparisonChart } from '@/lib/running-league/league-mileage-comparison'
import type { LeagueRankMemberSeries } from '@/lib/running-league/league-rank-comparison'
import type { RunningLeagueMileageLog, RunningLeagueParticipant } from '@/lib/types'

function formatChartDate(value: string): string {
  try {
    return format(parseISO(value), 'M/d', { locale: ko })
  } catch {
    return value
  }
}

function collectMileageSnapshotDates(
  logs: ReadonlyArray<RunningLeagueMileageLog>,
  memberIds: ReadonlySet<string>,
  maxPoints = 12,
): string[] {
  const dates = new Set<string>()
  for (const log of logs) {
    if (!memberIds.has(log.member_id)) continue
    dates.add(log.logged_at)
  }
  const sorted = [...dates].sort()
  if (sorted.length <= maxPoints) return sorted
  return sorted.slice(-maxPoints)
}

function resolveMileageRowsAtLatest(input: {
  participants: ReadonlyArray<RunningLeagueParticipant>
  logs: ReadonlyArray<RunningLeagueMileageLog>
  latestDate: string
  mileageRecognition?: MileageRecognition | null
}): Array<{ memberId: string; memberName: string; km: number }> {
  return input.participants
    .map((participant) => ({
      memberId: participant.member_id,
      memberName: participant.member?.name?.trim() || '회원',
      km: sumMemberMileageUpToDate(
        participant.member_id,
        input.logs,
        input.latestDate,
        input.mileageRecognition,
      ),
    }))
    .filter((row) => row.km > 0)
    .sort((a, b) => b.km - a.km || a.memberName.localeCompare(b.memberName, 'ko'))
}

function buildComparisonChart(input: {
  logs: ReadonlyArray<RunningLeagueMileageLog>
  memberRows: Array<{ memberId: string; memberName: string }>
  mileageRecognition?: MileageRecognition | null
}): LeagueMileageComparisonChart | null {
  if (input.memberRows.length === 0) return null

  const memberIds = new Set(input.memberRows.map((row) => row.memberId))
  const dates = collectMileageSnapshotDates(input.logs, memberIds)
  if (dates.length === 0) return null

  const members: LeagueRankMemberSeries[] = input.memberRows.map((row) => ({
    memberId: row.memberId,
    memberName: maskMemberNameForRanking(row.memberName),
    isSelected: false,
  }))

  const rows = dates.map((date) => {
    const row: LeagueMileageComparisonChart['rows'][number] = {
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

/** 전체 — 술래(빨간색) + 술래를 이긴 회원들의 마일리지 추이 */
export function buildLeagueChaseComparisonChart(input: {
  participants: ReadonlyArray<RunningLeagueParticipant>
  logs: ReadonlyArray<RunningLeagueMileageLog>
  chaseMemberId: string
  maxBeaters?: number
  mileageRecognition?: MileageRecognition | null
}): LeagueMileageComparisonChart | null {
  const ranked = resolveMileageRowsAtLatest({
    participants: input.participants,
    logs: input.logs,
    latestDate: [...input.logs.map((log) => log.logged_at)].sort().at(-1) ?? '',
    mileageRecognition: input.mileageRecognition,
  })

  const chaseParticipant = input.participants.find(
    (participant) => participant.member_id === input.chaseMemberId,
  )
  const latestDate = [...input.logs.map((log) => log.logged_at)].sort().at(-1) ?? ''
  const chaseRow =
    ranked.find((row) => row.memberId === input.chaseMemberId) ??
    (chaseParticipant
      ? {
          memberId: chaseParticipant.member_id,
          memberName: chaseParticipant.member?.name?.trim() || '회원',
          km: sumMemberMileageUpToDate(
            chaseParticipant.member_id,
            input.logs,
            latestDate,
            input.mileageRecognition,
          ),
        }
      : null)
  if (!chaseRow) return null

  const beaters = ranked.filter(
    (row) => row.memberId !== input.chaseMemberId && row.km > chaseRow.km,
  )
  const memberRows = [
    { memberId: chaseRow.memberId, memberName: chaseRow.memberName },
    ...beaters.slice(0, input.maxBeaters ?? 12).map((row) => ({
      memberId: row.memberId,
      memberName: row.memberName,
    })),
  ]

  return buildComparisonChart({
    logs: input.logs,
    memberRows,
    mileageRecognition: input.mileageRecognition,
  })
}

/** 개인 — 선택 회원 vs 술래 마일리지 격차 추이 */
export function buildMemberChaseComparisonChart(input: {
  participants: ReadonlyArray<RunningLeagueParticipant>
  logs: ReadonlyArray<RunningLeagueMileageLog>
  chaseMemberId: string
  memberId: string
  mileageRecognition?: MileageRecognition | null
}): LeagueMileageComparisonChart | null {
  const latestDate = [...input.logs.map((log) => log.logged_at)].sort().at(-1)
  if (!latestDate) return null

  const ranked = resolveMileageRowsAtLatest({
    participants: input.participants,
    logs: input.logs,
    latestDate,
    mileageRecognition: input.mileageRecognition,
  })
  const chaseParticipant = input.participants.find(
    (participant) => participant.member_id === input.chaseMemberId,
  )
  const chaseRow =
    ranked.find((row) => row.memberId === input.chaseMemberId) ??
    (chaseParticipant
      ? {
          memberId: chaseParticipant.member_id,
          memberName: chaseParticipant.member?.name?.trim() || '회원',
          km: sumMemberMileageUpToDate(
            chaseParticipant.member_id,
            input.logs,
            latestDate,
            input.mileageRecognition,
          ),
        }
      : null)
  const memberRow = ranked.find((row) => row.memberId === input.memberId)
  if (!chaseRow) return null

  const memberRows =
    memberRow && memberRow.memberId !== chaseRow.memberId
      ? [
          { memberId: chaseRow.memberId, memberName: chaseRow.memberName },
          { memberId: memberRow.memberId, memberName: memberRow.memberName },
        ]
      : [{ memberId: chaseRow.memberId, memberName: chaseRow.memberName }]

  return buildComparisonChart({
    logs: input.logs,
    memberRows,
    mileageRecognition: input.mileageRecognition,
  })
}
