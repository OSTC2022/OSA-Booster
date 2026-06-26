export type MonthlyLessonAttendanceRow = {
  lesson_date: string
  attendance_status: string
}

export type MonthlyAttendanceSummary = {
  attendedCount: number
  scheduledCount: number
  attendanceRate: number | null
}

const ATTENDED_STATUSES = new Set(['present', 'makeup'])

function countElapsedDaysInMonth(
  monthStart: string,
  monthEnd: string,
  referenceDateKey: string,
): number {
  const endKey =
    referenceDateKey < monthStart
      ? monthStart
      : referenceDateKey > monthEnd
        ? monthEnd
        : referenceDateKey
  if (endKey < monthStart) return 0

  const startMs = Date.parse(`${monthStart}T00:00:00`)
  const endMs = Date.parse(`${endKey}T00:00:00`)
  return Math.floor((endMs - startMs) / 86_400_000) + 1
}

export function buildMonthlyAttendanceSummary(
  lessons: ReadonlyArray<MonthlyLessonAttendanceRow>,
  monthStart: string,
  monthEnd: string,
): MonthlyAttendanceSummary {
  const inMonth = lessons.filter(
    (lesson) => lesson.lesson_date >= monthStart && lesson.lesson_date <= monthEnd,
  )

  const scheduled = inMonth.filter((lesson) => lesson.attendance_status !== 'cancelled')
  const attended = scheduled.filter((lesson) =>
    ATTENDED_STATUSES.has(lesson.attendance_status),
  )

  const scheduledCount = scheduled.length
  const attendedCount = attended.length
  const attendanceRate =
    scheduledCount > 0 ? Math.round((attendedCount / scheduledCount) * 100) : null

  return {
    attendedCount,
    scheduledCount,
    attendanceRate,
  }
}

/** 마일리지 챌린지 — 해당 날짜에 러닝 기록을 올린 날 = 출석 1회 */
export function buildMonthlyMileageAttendanceSummary(
  logs: ReadonlyArray<{ member_id: string; logged_at: string }>,
  memberId: string,
  monthStart: string,
  monthEnd: string,
  referenceDateKey = new Date().toISOString().slice(0, 10),
): MonthlyAttendanceSummary {
  const attendedDays = new Set<string>()

  for (const log of logs) {
    if (log.member_id !== memberId) continue
    const dateKey = log.logged_at.trim().slice(0, 10)
    if (!dateKey || dateKey < monthStart || dateKey > monthEnd) continue
    attendedDays.add(dateKey)
  }

  const attendedCount = attendedDays.size
  const scheduledCount = countElapsedDaysInMonth(monthStart, monthEnd, referenceDateKey)
  const attendanceRate =
    scheduledCount > 0 ? Math.round((attendedCount / scheduledCount) * 100) : null

  return {
    attendedCount,
    scheduledCount,
    attendanceRate,
  }
}

export function formatMonthlyAttendanceLabel(summary: MonthlyAttendanceSummary): string {
  return `${summary.attendedCount}일`
}

export function formatMonthlyAttendanceSubline(
  summary: MonthlyAttendanceSummary,
  monthLabel: string,
): string {
  if (summary.scheduledCount === 0) {
    return `${monthLabel} 기록 업로드일 기준`
  }
  if (summary.attendanceRate == null) {
    return `${monthLabel} 출석 기록`
  }
  return `출석률 ${summary.attendanceRate}% · 그날 기록 업로드 시 1회`
}
