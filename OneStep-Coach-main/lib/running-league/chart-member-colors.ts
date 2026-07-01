/** 집계 그래프 — 회원별 고유 색상 (차트·툴팁 공통) */

import {
  CHASE_TARGET_CHART_COLOR,
  isChaseTargetMember,
} from '@/lib/running-league/portal-chase-target'

/** 술래 전용 빨강(CHASE_TARGET_CHART_COLOR)과 겹치지 않도록 팔레트에서 제외 */
const CHASE_HUE_EXCLUSION = 28

function memberPaletteHue(index: number, total: number): number {
  if (total <= 1) return 168
  const usableArc = 360 - CHASE_HUE_EXCLUSION * 2
  const start = CHASE_HUE_EXCLUSION
  return Math.round(start + (index * usableArc) / Math.max(total - 1, 1)) % 360
}

export function memberChartColorAtIndex(index: number, total: number): string {
  if (total <= 0) return '#a3e635'
  const hue = memberPaletteHue(index, total)
  const saturation = 68 + (index % 2) * 6
  const lightness = 54 + (index % 3) * 4
  return `hsl(${hue} ${saturation}% ${lightness}%)`
}

export function buildMemberChartColorMap(memberIds: readonly string[]): Map<string, string> {
  const unique = [...new Set(memberIds)].sort((a, b) => a.localeCompare(b))
  const map = new Map<string, string>()
  unique.forEach((id, index) => {
    map.set(id, memberChartColorAtIndex(index, unique.length))
  })
  return map
}

export function getMemberChartColor(
  memberId: string,
  colorMap: Map<string, string>,
  chaseMemberId?: string | null,
): string {
  if (isChaseTargetMember(memberId, chaseMemberId)) return CHASE_TARGET_CHART_COLOR
  return colorMap.get(memberId) ?? '#a3e635'
}
