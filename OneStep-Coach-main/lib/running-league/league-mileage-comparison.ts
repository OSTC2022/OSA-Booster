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

/** timestamptz / date 혼용 시 일자만 맞춰 비교 */
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

/**
 * 그래프 X축 날짜.
 * - 짧으면 일자 전부
 * - 길면 월말(해당 월 마지막 기록일) + 최근 일자로 누적 이력 유지
 */
function collectMileageSnapshotDates(
  logs: ReadonlyArray<RunningLeagueMileageLog>,
  maxPoints = 36,
): string[] {
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

function participantMileageKm(participant: RunningLeagueParticipant): number {
  const raw = Number(participant.mileage_km ?? 0)
  if (!Number.isFinite(raw) || raw <= 0) return 0
  return Math.round(raw * 10) / 10
}

function resolveMemberKmAtDate(input: {
  participant: RunningLeagueParticipant
  logs: ReadonlyArray<RunningLeagueMileageLog>
  asOfDate: string
  mileageRecognition?: MileageRecognition | null
  /** 로그 합이 0일 때 participant.mileage_km 폴백 (랭킹과 동일) */
  allowParticipantFallback: boolean
}): number {
  const fromLogs = sumMemberMileageUpToDate(
    input.participant.member_id,
    input.logs,
    input.asOfDate,
    input.mileageRecognition,
  )
  if (fromLogs > 0) return fromLogs
  if (input.allowParticipantFallback) return participantMileageKm(input.participant)
  return 0
}

function resolveRankedMembersAtLatest(input: {
  participants: ReadonlyArray<RunningLeagueParticipant>
  logs: ReadonlyArray<RunningLeagueMileageLog>
  latestDate: string
  maxMembers?: number
  mileageRecognition?: MileageRecognition | null
  allowParticipantFallback?: boolean
}): Array<{ memberId: string; memberName: string; km: number }> {
  const allowFallback = input.allowParticipantFallback !== false
  const rows = input.participants
    .map((participant) => {
      const km = resolveMemberKmAtDate({
        participant,
        logs: input.logs,
        asOfDate: input.latestDate,
        mileageRecognition: input.mileageRecognition,
        allowParticipantFallback: allowFallback,
      })
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

function buildSnapshotFromParticipants(input: {
  participants: ReadonlyArray<RunningLeagueParticipant>
  maxMembers?: number
}): LeagueMileageComparisonChart | null {
  const ranked = input.participants
    .map((participant) => ({
      memberId: participant.member_id,
      memberName: participant.member?.name?.trim() || '회원',
      km: participantMileageKm(participant),
    }))
    .filter((row) => row.km > 0)
    .sort((a, b) => b.km - a.km || a.memberName.localeCompare(b.memberName, 'ko'))

  const sliced =
    input.maxMembers == null ? ranked : ranked.slice(0, input.maxMembers)
  if (sliced.length === 0) return null

  const today = new Date().toISOString().slice(0, 10)
  const members: LeagueRankMemberSeries[] = sliced.map((row) => ({
    memberId: row.memberId,
    memberName: maskMemberNameForRanking(row.memberName),
    isSelected: false,
  }))

  const row: LeagueMileageComparisonRow = {
    date: today,
    label: '현재',
  }
  for (const member of sliced) {
    row[`km_${member.memberId}`] = member.km
  }

  return { rows: [row], members }
}

/** 전체 회원 마일리지 누적 비교 (이력 로그 전달 시 월 넘어가도 유지) */
export function buildLeagueMileageComparisonChart(input: {
  participants: ReadonlyArray<RunningLeagueParticipant>
  logs: ReadonlyArray<RunningLeagueMileageLog>
  maxMembers?: number
  mileageRecognition?: MileageRecognition | null
}): LeagueMileageComparisonChart | null {
  const dates = collectMileageSnapshotDates(input.logs)
  const maxMembers = input.maxMembers ?? input.participants.length

  if (dates.length === 0) {
    return buildSnapshotFromParticipants({
      participants: input.participants,
      maxMembers,
    })
  }

  const latestDate = dates[dates.length - 1]!
  const rankedMembers = resolveRankedMembersAtLatest({
    participants: input.participants,
    logs: input.logs,
    latestDate,
    maxMembers,
    mileageRecognition: input.mileageRecognition,
    // 이력이 있으면 로그 합만 사용 (스냅샷 km로 '현재' 1점으로 붕괴 방지)
    allowParticipantFallback: false,
  })
  if (rankedMembers.length === 0) {
    return buildSnapshotFromParticipants({
      participants: input.participants,
      maxMembers,
    })
  }

  const members: LeagueRankMemberSeries[] = rankedMembers.map((row) => ({
    memberId: row.memberId,
    memberName: maskMemberNameForRanking(row.memberName),
    isSelected: false,
  }))

  const participantById = new Map(
    input.participants.map((participant) => [participant.member_id, participant]),
  )

  const rows: LeagueMileageComparisonRow[] = dates.map((date) => {
    const row: LeagueMileageComparisonRow = {
      date,
      label: chartLabelForDate(date, dates),
    }
    for (const member of members) {
      const participant = participantById.get(member.memberId)
      row[`km_${member.memberId}`] = participant
        ? resolveMemberKmAtDate({
            participant,
            logs: input.logs,
            asOfDate: date,
            mileageRecognition: input.mileageRecognition,
            allowParticipantFallback: false,
          })
        : sumMemberMileageUpToDate(
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

/** 전체 회원 마일리지 순위 궤적 */
export function buildLeagueAggregateMileageRankComparisonChart(input: {
  participants: ReadonlyArray<RunningLeagueParticipant>
  logs: ReadonlyArray<RunningLeagueMileageLog>
  maxMembers?: number
  mileageRecognition?: MileageRecognition | null
}): LeagueRankComparisonChart | null {
  const mileageChart = buildLeagueMileageComparisonChart(input)
  if (!mileageChart || mileageChart.rows.length === 0) return null

  const members = mileageChart.members
  const rows: LeagueRankComparisonRow[] = mileageChart.rows.map((mileageRow) => {
    const row: LeagueRankComparisonRow = {
      date: mileageRow.date,
      label: mileageRow.label,
    }
    for (const member of members) {
      row[`rank_${member.memberId}`] = computeMileageRankAtDate({
        memberId: member.memberId,
        participants: input.participants,
        logs: input.logs,
        asOfDate: mileageRow.date,
        mileageRecognition: input.mileageRecognition,
      })
    }
    // 로그 기반 순위가 비면 행 km로 순위 산출
    const missing = members.every((member) => row[`rank_${member.memberId}`] == null)
    if (missing) {
      const ordered = [...members]
        .map((member) => ({
          memberId: member.memberId,
          km: Number(mileageRow[`km_${member.memberId}`] ?? 0),
        }))
        .sort((a, b) => b.km - a.km)
      ordered.forEach((item, index) => {
        row[`rank_${item.memberId}`] = item.km > 0 ? index + 1 : null
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
  if (
    participants.some(
      (participant) =>
        buildMemberMileageHistorySeries(participant.member_id, logs, mileageRecognition)
          .length > 0,
    )
  ) {
    return true
  }
  return participants.some((participant) => participantMileageKm(participant) > 0)
}

export type { MileageRankHistoryPoint }
