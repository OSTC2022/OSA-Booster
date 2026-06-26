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

function isChaseBeaterRow(row: MileageDistanceRankRow, chaseRow: MileageDistanceRankRow): boolean {
  if (row.memberId === chaseRow.memberId) return false
  if (row.mileageKm > chaseRow.mileageKm) return true
  if (row.mileageKm < chaseRow.mileageKm) return false
  return row.rank < chaseRow.rank
}

/** 술래보다 마일리지가 많은 회원 + 술래 본인(이겨라 라벨용) */
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

  const beaters = mileageLeaderboard.ranked.filter((row) => isChaseBeaterRow(row, chaseRow))

  return {
    ranked: [...beaters, chaseRow],
    unranked: [],
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
