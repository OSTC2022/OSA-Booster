import type { RunningLeagueParticipant } from '@/lib/types'

export function buildPortalCoachMemberIds(
  participants: ReadonlyArray<RunningLeagueParticipant>,
): Set<string> {
  return new Set(
    participants
      .filter((participant) => participant.member?.portal_coach)
      .map((participant) => participant.member_id),
  )
}

export function isPortalCoachMember(
  memberId: string,
  portalCoachMemberIds: ReadonlySet<string>,
): boolean {
  return portalCoachMemberIds.has(memberId)
}
