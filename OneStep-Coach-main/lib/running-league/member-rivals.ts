import { formatMileageKmDisplay } from '@/lib/running-league/mileage-leaderboard'
import type { MileageDistanceRankRow } from '@/lib/running-league/mileage-leaderboard'

/** 앱 거리 표시 단위 (0.1km) — 동점 vs 추월 구분 */
export const RIVAL_DISTANCE_INCREMENT_KM = 0.1

export type RivalCompareStatus = 'ahead' | 'behind' | 'tied' | 'both_empty'

export type RivalCandidate = {
  memberId: string
  memberName: string
  mileageKm: number
  rank: number | null
  /** 나와의 절대 거리 차이 */
  absDiffKm: number
}

export type RivalComparison = {
  userMemberId: string
  userName: string
  userDistanceKm: number
  userDistanceLabel: string
  userRank: number | null
  rivalMemberId: string
  rivalName: string
  rivalDistanceKm: number
  rivalDistanceLabel: string
  rivalRank: number | null
  /** |user - rival| rounded 0.1 */
  differenceKm: number
  differenceLabel: string
  status: RivalCompareStatus
  /** 동점까지 필요한 거리 (behind일 때만 > 0) */
  distanceToTieKm: number
  distanceToTieLabel: string
  /** 추월까지 필요한 거리 (behind일 때만 > 0, tie + 0.1) */
  distanceToPassKm: number
  distanceToPassLabel: string
  hint: string
  periodLabel: string
}

function roundKm(km: number): number {
  return Math.round(km * 10) / 10
}

export type BoardMemberRow = {
  memberId: string
  memberName: string
  mileageKm: number
  rank: number | null
}

/** ranked + unranked → 통일된 후보 목록 (거리 0 포함) */
export function flattenMileageBoardMembers(input: {
  ranked: ReadonlyArray<MileageDistanceRankRow>
  unranked?: ReadonlyArray<{ memberId: string; memberName: string }>
}): BoardMemberRow[] {
  const rows: BoardMemberRow[] = input.ranked.map((row) => ({
    memberId: row.memberId,
    memberName: row.memberName,
    mileageKm: row.mileageKm,
    rank: row.rank,
  }))
  for (const row of input.unranked ?? []) {
    if (rows.some((r) => r.memberId === row.memberId)) continue
    rows.push({
      memberId: row.memberId,
      memberName: row.memberName,
      mileageKm: 0,
      rank: null,
    })
  }
  return rows
}

export function findBoardMember(
  members: ReadonlyArray<BoardMemberRow>,
  memberId: string,
): BoardMemberRow | null {
  return members.find((row) => row.memberId === memberId) ?? null
}

export function buildRivalComparison(input: {
  user: BoardMemberRow
  rival: BoardMemberRow
  periodLabel: string
}): RivalComparison {
  const userDistanceKm = roundKm(input.user.mileageKm)
  const rivalDistanceKm = roundKm(input.rival.mileageKm)
  const differenceKm = roundKm(Math.abs(userDistanceKm - rivalDistanceKm))

  let status: RivalCompareStatus
  if (userDistanceKm === 0 && rivalDistanceKm === 0) {
    status = 'both_empty'
  } else if (userDistanceKm === rivalDistanceKm) {
    status = 'tied'
  } else if (userDistanceKm > rivalDistanceKm) {
    status = 'ahead'
  } else {
    status = 'behind'
  }

  const distanceToTieKm = status === 'behind' ? differenceKm : 0
  const distanceToPassKm =
    status === 'behind' ? roundKm(differenceKm + RIVAL_DISTANCE_INCREMENT_KM) : 0

  let hint: string
  if (status === 'both_empty') {
    hint = '이번 달 아직 두 사람 모두 기록이 없습니다.'
  } else if (status === 'tied') {
    hint = '현재 라이벌과 동점입니다.'
  } else if (status === 'ahead') {
    hint = `라이벌보다 ${formatMileageKmDisplay(differenceKm)} 앞서고 있습니다.`
  } else {
    hint = `${formatMileageKmDisplay(distanceToPassKm)} 더 달리면 추월할 수 있습니다.`
  }

  return {
    userMemberId: input.user.memberId,
    userName: input.user.memberName,
    userDistanceKm,
    userDistanceLabel: formatMileageKmDisplay(userDistanceKm),
    userRank: input.user.rank,
    rivalMemberId: input.rival.memberId,
    rivalName: input.rival.memberName,
    rivalDistanceKm,
    rivalDistanceLabel: formatMileageKmDisplay(rivalDistanceKm),
    rivalRank: input.rival.rank,
    differenceKm,
    differenceLabel: formatMileageKmDisplay(differenceKm),
    status,
    distanceToTieKm,
    distanceToTieLabel: formatMileageKmDisplay(distanceToTieKm),
    distanceToPassKm,
    distanceToPassLabel: formatMileageKmDisplay(distanceToPassKm),
    hint,
    periodLabel: input.periodLabel,
  }
}

/**
 * 현재 월 거리가 가장 가까운 회원 상위 N명 추천.
 * 자기 자신 제외. 기존 mileage leaderboard 한 번으로 계산 (N+1 없음).
 */
export function getRecommendedRivals(
  members: ReadonlyArray<BoardMemberRow>,
  userMemberId: string,
  limit = 3,
): RivalCandidate[] {
  const user = findBoardMember(members, userMemberId)
  const userKm = user?.mileageKm ?? 0

  if (!user && members.length === 0) return []

  // 본인 월간 0km이고 전원 0이면 억지 추천 대신 빈 배열
  const othersWithDistance = members.filter(
    (row) => row.memberId !== userMemberId && row.mileageKm > 0,
  )
  if (userKm === 0 && othersWithDistance.length === 0) {
    return []
  }

  const pool =
    userKm === 0
      ? othersWithDistance
      : members.filter((row) => row.memberId !== userMemberId)

  const scored = pool.map((row) => ({
    memberId: row.memberId,
    memberName: row.memberName,
    mileageKm: row.mileageKm,
    rank: row.rank,
    absDiffKm: roundKm(Math.abs(row.mileageKm - userKm)),
  }))

  scored.sort((a, b) => {
    if (a.absDiffKm !== b.absDiffKm) return a.absDiffKm - b.absDiffKm
    if (a.mileageKm !== b.mileageKm) return b.mileageKm - a.mileageKm
    return a.memberName.localeCompare(b.memberName, 'ko')
  })

  return scored.slice(0, limit)
}

export function filterRivalCandidatesByQuery(
  candidates: ReadonlyArray<RivalCandidate | BoardMemberRow>,
  query: string,
  excludeMemberId: string,
): Array<BoardMemberRow & { absDiffKm?: number }> {
  const q = query.trim().toLowerCase()
  return candidates
    .filter((row) => row.memberId !== excludeMemberId)
    .filter((row) => {
      if (!q) return true
      return row.memberName.toLowerCase().includes(q)
    })
    .map((row) => ({
      memberId: row.memberId,
      memberName: row.memberName,
      mileageKm: row.mileageKm,
      rank: row.rank,
      absDiffKm: 'absDiffKm' in row ? row.absDiffKm : undefined,
    }))
}
