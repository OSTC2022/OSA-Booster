import type { RankingView } from '@/lib/running-league/ranking-view'
import { isChaseTargetMember } from '@/lib/running-league/portal-chase-target'

export const DEFAULT_PORTAL_CHASE_LABEL = '이겨라'

export function resolvePortalChaseLabel(label?: string | null): string {
  const trimmed = label?.trim()
  return trimmed || DEFAULT_PORTAL_CHASE_LABEL
}

export function resolveChaseBadgeLabelForMember(
  rankingView: RankingView,
  memberId: string,
  chaseMemberId: string | null | undefined,
  chaseLabel?: string | null,
): string | null {
  if (rankingView !== 'chase') return null
  if (!isChaseTargetMember(memberId, chaseMemberId)) return null
  return resolvePortalChaseLabel(chaseLabel)
}
