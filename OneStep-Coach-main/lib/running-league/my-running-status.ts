import {
  formatMileageKmDisplay,
  type MileageDistanceLeaderboard,
  type MileageDistanceRankRow,
} from '@/lib/running-league/mileage-leaderboard'
import {
  isMileageLogRecognized,
  type MileageRecognition,
} from '@/lib/running-league/mileage-recognition'
import type { PortalRankingPeriod } from '@/lib/running-league/ranking-period'
import type { RunningLeagueMileageLog } from '@/lib/types'

export const MY_RUNNING_STATUS_PROJECTED_EXTRA_KM = 5

export type MyRunningStatusView = {
  memberId: string
  memberName: string
  periodLabel: string
  monthlyKm: number
  monthlyKmLabel: string
  /** null = 랭킹 미진입(이번 달 인정 거리 0) */
  rank: number | null
  rankedCount: number
  runCount: number
  /** 바로 위 순위까지 필요한 km (1위/단독이면 null) */
  gapToNextKm: number | null
  gapToNextLabel: string | null
  isFirstPlace: boolean
  hasMonthlyDistance: boolean
  /** 현재 기준 +Nkm 시 예상 순위 (기존보다 올라갈 때만) */
  projectedRankWithExtraKm: number | null
  projectedExtraKm: number
}

function roundKm(km: number): number {
  return Math.round(km * 10) / 10
}

function countMemberRuns(
  memberId: string,
  logs: ReadonlyArray<Pick<RunningLeagueMileageLog, 'member_id' | 'distance_km'>>,
  recognition: MileageRecognition | null | undefined,
): number {
  let count = 0
  for (const log of logs) {
    if (log.member_id !== memberId) continue
    if (!isMileageLogRecognized(log.distance_km, recognition)) continue
    count += 1
  }
  return count
}

/**
 * 다른 사람 거리 고정 가정.
 * 내 거리만 +extraKm 했을 때, 나보다 앞서는 인원 수 + 1 = 예상 순위.
 */
export function projectMileageRankWithExtraKm(
  ranked: ReadonlyArray<MileageDistanceRankRow>,
  memberId: string,
  extraKm: number,
): number | null {
  const myRow = ranked.find((row) => row.memberId === memberId)
  if (!myRow) return null

  const projectedKm = roundKm(myRow.mileageKm + extraKm)
  let ahead = 0
  for (const row of ranked) {
    if (row.memberId === memberId) continue
    if (row.mileageKm > projectedKm) {
      ahead += 1
      continue
    }
    if (row.mileageKm === projectedKm) {
      // 동점이면 기존 보드와 동일하게 이름 오름차순이 앞
      if (row.memberName.localeCompare(myRow.memberName, 'ko') < 0) ahead += 1
    }
  }
  return ahead + 1
}

export function buildMyRunningStatusView(input: {
  memberId: string | null | undefined
  memberName: string
  mileageLeaderboard: MileageDistanceLeaderboard | null | undefined
  mileageLogs: ReadonlyArray<RunningLeagueMileageLog> | null | undefined
  rankingPeriod: PortalRankingPeriod | null | undefined
  mileageRecognition?: MileageRecognition | null
}): MyRunningStatusView | null {
  const memberId = input.memberId?.trim()
  if (!memberId) return null

  const leaderboard = input.mileageLeaderboard
  const ranked = leaderboard?.ranked ?? []
  const myRow = ranked.find((row) => row.memberId === memberId) ?? null
  const unranked = leaderboard?.unranked.find((row) => row.memberId === memberId)

  const monthlyKm = myRow ? myRow.mileageKm : 0
  const hasMonthlyDistance = monthlyKm > 0
  const rank = myRow?.rank ?? null
  const rankedCount = ranked.length
  const isFirstPlace = rank === 1

  let gapToNextKm: number | null = null
  if (myRow) {
    const myIndex = ranked.findIndex((row) => row.memberId === memberId)
    if (myIndex > 0) {
      const above = ranked[myIndex - 1]
      const gap = roundKm(above.mileageKm - myRow.mileageKm)
      if (gap > 0) gapToNextKm = gap
    }
  }

  const runCount = countMemberRuns(
    memberId,
    input.mileageLogs ?? [],
    input.mileageRecognition,
  )

  const memberName =
    myRow?.memberName?.trim() ||
    unranked?.memberName?.trim() ||
    input.memberName.trim() ||
    '회원'

  let projectedRankWithExtraKm: number | null = null
  if (myRow && ranked.length > 0) {
    const projected = projectMileageRankWithExtraKm(
      ranked,
      memberId,
      MY_RUNNING_STATUS_PROJECTED_EXTRA_KM,
    )
    if (projected != null && projected < myRow.rank) {
      projectedRankWithExtraKm = projected
    }
  }

  return {
    memberId,
    memberName,
    periodLabel: input.rankingPeriod?.label ?? '이번 달',
    monthlyKm,
    monthlyKmLabel: formatMileageKmDisplay(monthlyKm),
    rank,
    rankedCount,
    runCount,
    gapToNextKm,
    gapToNextLabel: gapToNextKm != null ? formatMileageKmDisplay(gapToNextKm) : null,
    isFirstPlace,
    hasMonthlyDistance,
    projectedRankWithExtraKm,
    projectedExtraKm: MY_RUNNING_STATUS_PROJECTED_EXTRA_KM,
  }
}

export function formatProjectedRankHint(status: MyRunningStatusView): string | null {
  if (status.rank == null || status.projectedRankWithExtraKm == null) return null
  if (status.projectedRankWithExtraKm >= status.rank) return null
  return `현재 기준 ${status.projectedExtraKm}km 추가 시 예상 ${status.projectedRankWithExtraKm}위`
}
