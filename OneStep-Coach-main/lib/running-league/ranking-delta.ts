import type { PbLeaderboardDistance } from '@/lib/running-league/pb-leaderboard'
import { buildMemberAttendanceRankHistorySeries } from '@/lib/running-league/attendance-history'
import { buildMemberMileageRankHistorySeries } from '@/lib/running-league/mileage-rank-history'
import { buildMemberRankingHistorySeries } from '@/lib/running-league/ranking-history'
import type { RunningLeagueMileageLog, RunningLeagueParticipant, RunningLeagueRecord } from '@/lib/types'

export type RankDelta =
  | { kind: 'up'; amount: number }
  | { kind: 'down'; amount: number }
  | { kind: 'same' }

export const RANK_DELTA_SAME: RankDelta = { kind: 'same' }

/** 순위 숫자가 작을수록 상위 — previousRank 대비 currentRank 변화 */
export function resolveRankDelta(
  currentRank: number,
  previousRank: number | null | undefined,
): RankDelta {
  if (previousRank == null || previousRank === currentRank) {
    return RANK_DELTA_SAME
  }

  const delta = previousRank - currentRank
  if (delta > 0) return { kind: 'up', amount: delta }
  return { kind: 'down', amount: Math.abs(delta) }
}

function previousRankFromHistorySeries(ranks: ReadonlyArray<number | null>): number | null {
  const valid = ranks.filter((rank): rank is number => rank != null)
  if (valid.length < 2) return null
  return valid[valid.length - 2] ?? null
}

export function resolveMemberPbRankDelta(input: {
  memberId: string
  currentRank: number
  distance: PbLeaderboardDistance
  participants: ReadonlyArray<RunningLeagueParticipant>
  records: ReadonlyArray<RunningLeagueRecord>
}): RankDelta {
  const points = buildMemberRankingHistorySeries({
    memberId: input.memberId,
    distance: input.distance,
    participants: input.participants,
    records: input.records,
  })
  const previousRank = previousRankFromHistorySeries(points.map((point) => point.rank))
  return resolveRankDelta(input.currentRank, previousRank)
}

export function resolveMemberMileageRankDelta(input: {
  memberId: string
  currentRank: number
  participants: ReadonlyArray<RunningLeagueParticipant>
  logs: ReadonlyArray<RunningLeagueMileageLog>
}): RankDelta {
  const points = buildMemberMileageRankHistorySeries({
    memberId: input.memberId,
    participants: input.participants,
    logs: input.logs,
  })
  const previousRank = previousRankFromHistorySeries(points.map((point) => point.rank))
  return resolveRankDelta(input.currentRank, previousRank)
}

export function resolveMemberAttendanceRankDelta(input: {
  memberId: string
  currentRank: number
  participants: ReadonlyArray<RunningLeagueParticipant>
  logs: ReadonlyArray<RunningLeagueMileageLog>
  periodStart: string
  periodEnd: string
}): RankDelta {
  const points = buildMemberAttendanceRankHistorySeries({
    memberId: input.memberId,
    participants: input.participants,
    logs: input.logs,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
  })
  const previousRank = previousRankFromHistorySeries(points.map((point) => point.rank))
  return resolveRankDelta(input.currentRank, previousRank)
}

export function buildRankDeltaMap(
  rows: ReadonlyArray<{ memberId: string; rank: number }>,
  resolveForMember: (memberId: string, currentRank: number) => RankDelta,
): Map<string, RankDelta> {
  const map = new Map<string, RankDelta>()
  for (const row of rows) {
    map.set(row.memberId, resolveForMember(row.memberId, row.rank))
  }
  return map
}
