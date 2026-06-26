import type { RunningLeagueMileageLog, RunningLeagueParticipant } from '@/lib/types'
import { aggregateMonthlyMileageByMember } from '@/lib/running-league/mileage-leaderboard'

/** 마일리지 챌린지 — 해당 날짜에 러닝 기록을 올린 날 = 출석 1회 */
export interface AttendanceRankRow {
  participantId: string
  memberId: string
  memberName: string
  attendanceDays: number
  rank: number
}

export interface AttendanceLeaderboard {
  ranked: AttendanceRankRow[]
  unranked: Array<{
    participantId: string
    memberId: string
    memberName: string
  }>
}

export function toMileageLogDateKey(loggedAt: string): string {
  return loggedAt.trim().slice(0, 10)
}

/** 이번 달 회원별 출석일(기록 업로드일) 수 */
export function aggregateAttendanceDaysByMember(
  logs: ReadonlyArray<Pick<RunningLeagueMileageLog, 'member_id' | 'logged_at'>>,
  monthStart: string,
  monthEnd: string,
): Map<string, number> {
  const daySets = new Map<string, Set<string>>()

  for (const log of logs) {
    if (!log.member_id) continue
    const dateKey = toMileageLogDateKey(log.logged_at)
    if (!dateKey || dateKey < monthStart || dateKey > monthEnd) continue

    const bucket = daySets.get(log.member_id) ?? new Set<string>()
    bucket.add(dateKey)
    daySets.set(log.member_id, bucket)
  }

  const totals = new Map<string, number>()
  for (const [memberId, days] of daySets) {
    totals.set(memberId, days.size)
  }
  return totals
}

export function formatAttendanceDaysDisplay(days: number): string {
  return `${days}일`
}

function assignAttendanceRanks(
  rows: Array<Omit<AttendanceRankRow, 'rank'>>,
): AttendanceRankRow[] {
  let rank = 0
  let previousDays: number | null = null

  return rows.map((row, index) => {
    if (previousDays === null || row.attendanceDays !== previousDays) {
      rank = index + 1
      previousDays = row.attendanceDays
    }
    return { ...row, rank }
  })
}

export function buildAttendanceLeaderboard(
  participants: RunningLeagueParticipant[],
  monthlyLogs: RunningLeagueMileageLog[],
  monthStart: string,
  monthEnd: string,
): AttendanceLeaderboard {
  const attendanceDaysByMember = aggregateAttendanceDaysByMember(
    monthlyLogs,
    monthStart,
    monthEnd,
  )
  const monthlyDistanceByMember = aggregateMonthlyMileageByMember(monthlyLogs)
  const rankedCandidates: Array<Omit<AttendanceRankRow, 'rank'>> = []
  const unranked: AttendanceLeaderboard['unranked'] = []

  for (const participant of participants) {
    const memberId = participant.member_id
    const memberName = participant.member?.name?.trim() || '회원'
    const attendanceDays = attendanceDaysByMember.get(memberId) ?? 0

    if (attendanceDays <= 0) {
      unranked.push({
        participantId: participant.id,
        memberId,
        memberName,
      })
      continue
    }

    rankedCandidates.push({
      participantId: participant.id,
      memberId,
      memberName,
      attendanceDays,
    })
  }

  const sorted = [...rankedCandidates].sort((a, b) => {
    if (b.attendanceDays !== a.attendanceDays) {
      return b.attendanceDays - a.attendanceDays
    }
    const mileageA = monthlyDistanceByMember.get(a.memberId) ?? 0
    const mileageB = monthlyDistanceByMember.get(b.memberId) ?? 0
    if (mileageB !== mileageA) return mileageB - mileageA
    return a.memberName.localeCompare(b.memberName, 'ko')
  })

  return {
    ranked: assignAttendanceRanks(sorted),
    unranked: unranked.sort((a, b) => a.memberName.localeCompare(b.memberName, 'ko')),
  }
}
