import type { RunningLeagueParticipant } from '@/lib/types'

export const PORTAL_STATUS_MESSAGE_MAX_LENGTH = 10
export const DEFAULT_PORTAL_STATUS_MESSAGE_COLOR = '#d9f99d'

const PORTAL_STATUS_MESSAGE_COLOR_RE = /^#[0-9a-fA-F]{6}$/

export type MemberPortalStatusMessage = {
  message: string
  color: string
}

export function normalizePortalStatusMessage(
  value: string | null | undefined,
): string | null {
  const trimmed = value?.trim().slice(0, PORTAL_STATUS_MESSAGE_MAX_LENGTH) ?? ''
  return trimmed || null
}

export function normalizePortalStatusMessageColor(
  value: string | null | undefined,
): string {
  const trimmed = value?.trim() ?? ''
  if (PORTAL_STATUS_MESSAGE_COLOR_RE.test(trimmed)) {
    return trimmed.toLowerCase()
  }
  return DEFAULT_PORTAL_STATUS_MESSAGE_COLOR
}

export function formatPortalStatusMessageBracket(
  message: string | null | undefined,
): string | null {
  return normalizePortalStatusMessage(message)
}

export function resolvePortalStatusMessageColor(
  color: string | null | undefined,
): string {
  return normalizePortalStatusMessageColor(color)
}

export function buildMemberPortalStatusMessageMap(
  participants: ReadonlyArray<Pick<RunningLeagueParticipant, 'member_id' | 'member'>>,
): Map<string, MemberPortalStatusMessage> {
  const map = new Map<string, MemberPortalStatusMessage>()

  for (const participant of participants) {
    const message = normalizePortalStatusMessage(participant.member?.portal_status_message)
    if (!message) continue

    map.set(participant.member_id, {
      message,
      color: normalizePortalStatusMessageColor(
        participant.member?.portal_status_message_color,
      ),
    })
  }

  return map
}

export type PortalStatusMemberFields = {
  portal_status_message?: string | null
  portal_status_message_color?: string | null
}

export function mergePortalStatusFieldsIntoParticipants(
  participants: ReadonlyArray<RunningLeagueParticipant>,
  statusByMemberId: ReadonlyMap<string, PortalStatusMemberFields>,
): RunningLeagueParticipant[] {
  if (statusByMemberId.size === 0) return [...participants]

  return participants.map((participant) => {
    const status = statusByMemberId.get(participant.member_id)
    if (!status || !participant.member) return participant

    return {
      ...participant,
      member: {
        ...participant.member,
        portal_status_message:
          status.portal_status_message ?? participant.member.portal_status_message ?? null,
        portal_status_message_color:
          status.portal_status_message_color ??
          participant.member.portal_status_message_color ??
          null,
      },
    }
  })
}
