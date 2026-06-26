import { formatCurrentMonthRankingLabel } from '@/lib/running-league/month-range'

export type RankingView = 'mileage' | 'attendance' | 'chase' | 'pb'

export const RANKING_VIEW_OPTIONS: Array<{ value: RankingView; label: string }> = [
  { value: 'mileage', label: '월 마일리지' },
  { value: 'attendance', label: '출석' },
  { value: 'chase', label: '이겨라' },
  { value: 'pb', label: '순위(PB)' },
]

export function getRankingViewShortLabel(view: RankingView): string {
  if (view === 'pb') return '순위(PB)'
  if (view === 'attendance') return '출석'
  if (view === 'chase') return '이겨라'
  return '마일리지'
}

export function getRankingViewDescription(
  view: RankingView,
  periodLabel = formatCurrentMonthRankingLabel(),
): string {
  if (view === 'pb') {
    return '거리별 PB · 5km / 10km / Half / Full · 기록이 짧을수록 상위 (초 단위 오름차순)'
  }
  if (view === 'attendance') {
    return `${periodLabel} 마일리지 기록 업로드일 기준 · 그날 기록을 올리면 출석 1회`
  }
  if (view === 'chase') {
    return `${periodLabel} 마일리지로 술래를 이긴 회원 · 추첨 상품 후보`
  }
  return `${periodLabel} 누적 거리 · 많을수록 상위 (내림차순)`
}

export const MILEAGE_RANKING_SORT_HINT = '이번 달 누적 거리 기준 · 내림차순 정렬'
export const ATTENDANCE_RANKING_SORT_HINT =
  '이번 달 러닝 기록을 올린 날 수 기준 · 많을수록 상위'
