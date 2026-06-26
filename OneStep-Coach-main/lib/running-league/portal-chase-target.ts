export const CHASE_TARGET_CHART_COLOR = '#ef4444'
export const CHASE_TARGET_CHART_STROKE_WIDTH = 3

export function isChaseTargetMember(
  memberId: string,
  chaseMemberId: string | null | undefined,
): boolean {
  return Boolean(chaseMemberId && memberId === chaseMemberId)
}
