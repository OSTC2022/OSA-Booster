import type { RankingView } from '@/lib/running-league/ranking-view'
import { RANKING_VIEW_OPTIONS } from '@/lib/running-league/ranking-view'

export type RankingCompetitionModes = {
  showIndividual: boolean
  showTeam: boolean
}

export const DEFAULT_RANKING_COMPETITION_MODES: RankingCompetitionModes = {
  showIndividual: true,
  showTeam: false,
}

/** 둘 다 꺼져 있으면 개인전만 켜진 것으로 취급 */
export function resolveRankingCompetitionModes(input?: {
  showIndividual?: boolean | null
  showTeam?: boolean | null
} | null): RankingCompetitionModes {
  const showIndividual = input?.showIndividual !== false
  const showTeam = input?.showTeam === true
  if (!showIndividual && !showTeam) {
    return { showIndividual: true, showTeam: false }
  }
  return { showIndividual, showTeam }
}

export function getVisibleRankingViewOptions(
  modes: RankingCompetitionModes,
): Array<{ value: RankingView; label: string }> {
  const resolved = resolveRankingCompetitionModes(modes)
  // 개인전: 마일리지 → 출석 → 이겨라 → PB 순서 유지, 팀전은 맨 뒤
  return RANKING_VIEW_OPTIONS.filter((option) => {
    if (option.value === 'team') return resolved.showTeam
    return resolved.showIndividual
  })
}

export function defaultRankingViewForModes(modes: RankingCompetitionModes): RankingView {
  const options = getVisibleRankingViewOptions(modes)
  return options[0]?.value ?? 'mileage'
}

export function isRankingViewAllowed(
  view: RankingView,
  modes: RankingCompetitionModes,
): boolean {
  return getVisibleRankingViewOptions(modes).some((option) => option.value === view)
}
