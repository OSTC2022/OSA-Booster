import type {
  MileageDistanceLeaderboard,
  MileageDistanceRankRow,
} from '@/lib/running-league/mileage-leaderboard'

type ChaseParticipantRef = {
  id: string
  member_id: string
  member?: { name?: string | null } | null
}

export type BuildChaseBeatMileageLeaderboardOptions = {
  /** 성별 필터 등과 무관하게 술래 마일리지·이름을 찾을 때 사용 */
  chaseMileageLeaderboard?: MileageDistanceLeaderboard
  chaseParticipants?: ReadonlyArray<ChaseParticipantRef>
}

function resolveChaseMileageRow(
  mileageLeaderboard: MileageDistanceLeaderboard,
  chaseMemberId: string,
  participants?: ReadonlyArray<ChaseParticipantRef>,
): MileageDistanceRankRow | null {
  const ranked = mileageLeaderboard.ranked.find((row) => row.memberId === chaseMemberId)
  if (ranked) return ranked

  const unranked = mileageLeaderboard.unranked.find((row) => row.memberId === chaseMemberId)
  if (unranked) {
    return {
      participantId: unranked.participantId,
      memberId: unranked.memberId,
      memberName: unranked.memberName,
      mileageKm: 0,
      rank: mileageLeaderboard.ranked.length + 1,
    }
  }

  const participant = participants?.find((row) => row.member_id === chaseMemberId)
  if (!participant) return null

  return {
    participantId: participant.id,
    memberId: participant.member_id,
    memberName: participant.member?.name?.trim() || '회원',
    mileageKm: 0,
    rank: mileageLeaderboard.ranked.length + 1,
  }
}

function insertChaseRowIfMissing(
  ranked: MileageDistanceRankRow[],
  chaseRow: MileageDistanceRankRow,
): MileageDistanceRankRow[] {
  if (ranked.some((row) => row.memberId === chaseRow.memberId)) {
    return ranked
  }

  const next = [...ranked]
  const insertAt = next.findIndex((row) => row.mileageKm < chaseRow.mileageKm)
  if (insertAt < 0) {
    next.push(chaseRow)
  } else {
    next.splice(insertAt, 0, chaseRow)
  }
  return next
}

/** 술래 마일리지(km) — 성별 필터와 무관하게 전체 보드에서 조회 */
export function resolveChaseTargetMileageKm(
  mileageLeaderboard: MileageDistanceLeaderboard,
  chaseMemberId: string | null | undefined,
  participants?: ReadonlyArray<ChaseParticipantRef>,
): number | null {
  if (!chaseMemberId) return null
  const chaseRow = resolveChaseMileageRow(mileageLeaderboard, chaseMemberId, participants)
  return chaseRow?.mileageKm ?? null
}

export function formatChaseGapLabel(memberKm: number, chaseKm: number): string | null {
  const delta = Math.round((memberKm - chaseKm) * 10) / 10
  if (delta === 0) return '술래와 동률'
  const formatted = Number.isInteger(Math.abs(delta))
    ? String(Math.abs(delta))
    : Math.abs(delta).toFixed(1)
  return delta > 0 ? `술래 +${formatted}km` : `술래 -${formatted}km`
}

/**
 * 이겨라 탭 — 마일리지 전체 순위(술래보다 뒤인 회원 포함).
 * 각 row.rank 는 월 마일리지 전체 순위입니다.
 */
export function buildChaseBeatMileageLeaderboard(
  mileageLeaderboard: MileageDistanceLeaderboard,
  chaseMemberId: string | null | undefined,
  participants?: ReadonlyArray<ChaseParticipantRef>,
  options?: BuildChaseBeatMileageLeaderboardOptions,
): MileageDistanceLeaderboard {
  if (!chaseMemberId) {
    return { ranked: [], unranked: [] }
  }

  const chaseLookupBoard = options?.chaseMileageLeaderboard ?? mileageLeaderboard
  const chaseLookupParticipants = options?.chaseParticipants ?? participants

  const chaseRow = resolveChaseMileageRow(
    chaseLookupBoard,
    chaseMemberId,
    chaseLookupParticipants,
  )
  if (!chaseRow) {
    return { ranked: [], unranked: [] }
  }

  return {
    ranked: insertChaseRowIfMissing([...mileageLeaderboard.ranked], chaseRow),
    unranked: mileageLeaderboard.unranked,
  }
}

export function resolveChaseTargetName(
  participants: ReadonlyArray<{ member_id: string; member?: { name?: string | null } | null }>,
  chaseMemberId: string | null | undefined,
): string | null {
  if (!chaseMemberId) return null
  const participant = participants.find((row) => row.member_id === chaseMemberId)
  return participant?.member?.name?.trim() || null
}
