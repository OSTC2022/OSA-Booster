import type { MileageDistanceLeaderboard } from '@/lib/running-league/mileage-leaderboard'

export type ChaseRankingHeaderSummary = {
  memberId: string
  memberName: string
  rank: number
  gapLabel: string
}

function resolveMemberMileageKm(
  leaderboard: MileageDistanceLeaderboard,
  memberId: string,
): number {
  const ranked = leaderboard.ranked.find((row) => row.memberId === memberId)
  if (ranked) return ranked.mileageKm
  return 0
}

function resolveMemberMileageRow(
  leaderboard: MileageDistanceLeaderboard,
  memberId: string,
) {
  return (
    leaderboard.ranked.find((row) => row.memberId === memberId) ??
    leaderboard.unranked.find((row) => row.memberId === memberId) ??
    null
  )
}

export function formatMileageGapVsViewer(viewerKm: number, targetKm: number): string {
  const delta = Math.round((targetKm - viewerKm) * 10) / 10
  if (delta === 0) return '나와 동일'
  const formatted = Number.isInteger(delta) ? String(delta) : delta.toFixed(1)
  return delta > 0 ? `나보다 +${formatted}km` : `나보다 ${formatted}km`
}

export function buildChaseRankingHeaderSummary(input: {
  chaseMemberId: string | null | undefined
  selectedMemberId?: string | null
  chaseLeaderboard: MileageDistanceLeaderboard
  mileageLeaderboard: MileageDistanceLeaderboard
  viewerMemberId?: string | null
}): ChaseRankingHeaderSummary | null {
  const chaseMemberId = input.chaseMemberId?.trim() || null
  if (!chaseMemberId) return null

  const targetMemberId = input.selectedMemberId?.trim() || chaseMemberId

  const chaseRow = input.chaseLeaderboard.ranked.find((row) => row.memberId === targetMemberId)
  const mileageRow = resolveMemberMileageRow(input.mileageLeaderboard, targetMemberId)

  if (!chaseRow && !mileageRow && targetMemberId !== chaseMemberId) return null

  const memberName = chaseRow?.memberName ?? mileageRow?.memberName ?? '회원'
  const rank =
    chaseRow?.rank ??
    (mileageRow && 'rank' in mileageRow ? mileageRow.rank : input.chaseLeaderboard.ranked.length + 1)
  const targetKm = chaseRow?.mileageKm ?? resolveMemberMileageKm(input.mileageLeaderboard, targetMemberId)

  let gapLabel: string
  if (input.viewerMemberId && input.viewerMemberId === targetMemberId) {
    gapLabel = '내 기록'
  } else if (input.viewerMemberId) {
    const viewerKm = resolveMemberMileageKm(input.mileageLeaderboard, input.viewerMemberId)
    gapLabel = formatMileageGapVsViewer(viewerKm, targetKm)
  } else {
    gapLabel = '기록 비교 불가'
  }

  return {
    memberId: targetMemberId,
    memberName,
    rank,
    gapLabel,
  }
}
