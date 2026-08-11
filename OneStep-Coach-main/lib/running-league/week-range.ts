import { addDays, format, parseISO } from 'date-fns'
import { getKstDateKey } from '@/lib/member-backup/kst-date'

export type WeekRange = {
  /** yyyy-MM-dd (Asia/Seoul 월요일) */
  start: string
  /** yyyy-MM-dd (Asia/Seoul 일요일) */
  end: string
  /** 예: 8/10 ~ 8/16 */
  shortLabel: string
  /** 예: 2026년 8월 10일 ~ 16일 */
  label: string
}

function formatShortRange(start: string, end: string): string {
  const s = parseISO(start)
  const e = parseISO(end)
  return `${format(s, 'M/d')} ~ ${format(e, 'M/d')}`
}

function formatFullRange(start: string, end: string): string {
  const s = parseISO(start)
  const e = parseISO(end)
  return `${format(s, 'yyyy년 M월 d일')} ~ ${format(e, 'd일')}`
}

/**
 * 주간 미션 기간: Asia/Seoul 월요일 00:00 ~ 일요일 23:59:59
 * DATE 컬럼 비교용으로 start/end는 yyyy-MM-dd 키만 반환한다.
 */
export function getCurrentWeekRange(asOf = new Date()): WeekRange {
  return getWeekRangeForDateKey(getKstDateKey(asOf))
}

/** 특정 yyyy-MM-dd(Asia/Seoul 달력일)가 속한 월~일 주 */
export function getWeekRangeForDateKey(dateKey: string): WeekRange {
  const key = dateKey.trim().slice(0, 10)
  const anchor = parseISO(key)
  // parseISO는 로컬 자정 — 요일은 KST 달력 키 기준이므로 문자열로 요일 산출
  const weekday = getIsoWeekdayForDateKey(key)
  const daysFromMonday = weekday - 1
  const monday = addDays(anchor, -daysFromMonday)
  const sunday = addDays(monday, 6)
  const start = format(monday, 'yyyy-MM-dd')
  const end = format(sunday, 'yyyy-MM-dd')
  return {
    start,
    end,
    shortLabel: formatShortRange(start, end),
    label: formatFullRange(start, end),
  }
}

/** deltaWeeks: -1 = 지난주, +1 = 다음주 */
export function shiftWeekRange(week: WeekRange, deltaWeeks: number): WeekRange {
  const monday = addDays(parseISO(week.start), deltaWeeks * 7)
  return getWeekRangeForDateKey(format(monday, 'yyyy-MM-dd'))
}

/** Mon=1 … Sun=7 for a calendar date key (no timezone shift) */
function getIsoWeekdayForDateKey(dateKey: string): number {
  // Use UTC noon of the calendar date so weekday matches the civil date
  const [y, m, d] = dateKey.split('-').map(Number)
  const utcNoon = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
  const day = utcNoon.getUTCDay() // 0=Sun … 6=Sat
  return day === 0 ? 7 : day
}

export function isDateKeyInRange(
  dateKey: string,
  start: string,
  end: string,
): boolean {
  const key = dateKey.trim().slice(0, 10)
  if (!key) return false
  return key >= start && key <= end
}
