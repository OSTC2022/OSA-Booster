import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import { currentMonthDateRange } from '@/lib/running-league/month-range'
import type { CenterSettings } from '@/lib/types'

export type PortalRankingPeriod = {
  start: string
  end: string
  label: string
  shortLabel: string
  isCustom: boolean
  resetHint: string
}

function normalizeDateKey(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  if (!trimmed) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed
  const parsed = parseISO(trimmed)
  if (Number.isNaN(parsed.getTime())) return null
  return format(parsed, 'yyyy-MM-dd')
}

function formatCustomPeriodLabel(start: string, end: string): string {
  const startDate = parseISO(start)
  const endDate = parseISO(end)
  const sameYear = startDate.getFullYear() === endDate.getFullYear()

  if (sameYear && startDate.getMonth() === endDate.getMonth()) {
    return `${format(startDate, 'M월 d일', { locale: ko })}~${format(endDate, 'd일', { locale: ko })}`
  }
  if (sameYear) {
    return `${format(startDate, 'M/d', { locale: ko })}~${format(endDate, 'M/d', { locale: ko })}`
  }
  return `${format(startDate, 'yyyy.M.d', { locale: ko })}~${format(endDate, 'yyyy.M.d', { locale: ko })}`
}

function formatCalendarMonthLabel(reference: Date): string {
  return format(reference, 'yyyy년 M월', { locale: ko })
}

export function resolvePortalRankingPeriod(
  settings?: Pick<
    CenterSettings,
    'adult_portal_ranking_period_start' | 'adult_portal_ranking_period_end'
  > | null,
  reference = new Date(),
): PortalRankingPeriod {
  const start = normalizeDateKey(settings?.adult_portal_ranking_period_start)
  const end = normalizeDateKey(settings?.adult_portal_ranking_period_end)

  if (start && end && start <= end) {
    const label = formatCustomPeriodLabel(start, end)
    return {
      start,
      end,
      label,
      shortLabel: label,
      isCustom: true,
      resetHint: `집계 기간 ${format(parseISO(end), 'M월 d일', { locale: ko })}까지`,
    }
  }

  const monthRange = currentMonthDateRange(reference)
  const label = formatCalendarMonthLabel(reference)
  return {
    start: monthRange.start,
    end: monthRange.end,
    label,
    shortLabel: label,
    isCustom: false,
    resetHint: `매월 1일(${format(new Date(reference.getFullYear(), reference.getMonth() + 1, 1), 'M월 d일', { locale: ko })})에 새로 시작`,
  }
}

export function formatPortalRankingPeriodLabel(period: PortalRankingPeriod): string {
  return period.label
}
