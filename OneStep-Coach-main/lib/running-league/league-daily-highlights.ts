import { format, parseISO, subDays } from 'date-fns'
import { ko } from 'date-fns/locale'
import { computeAttendanceRankAtDate } from '@/lib/running-league/attendance-history'
import { buildAttendanceLeaderboard } from '@/lib/running-league/attendance-leaderboard'
import { computeMileageRankAtDate } from '@/lib/running-league/mileage-rank-history'
import {
  buildMileageDistanceLeaderboard,
  formatMileageKmDisplay,
} from '@/lib/running-league/mileage-leaderboard'
import type {
  RunningLeagueMileageLog,
  RunningLeagueParticipant,
} from '@/lib/types'
import type { RankingView } from '@/lib/running-league/ranking-view'

export type LeagueDailyHighlightKind =
  | 'daily_star'
  | 'rank_climber'
  | 'leader_streak'
  | 'league_pulse'
  | 'runner_up'

export type LeagueDailyHighlight = {
  id: string
  kind: LeagueDailyHighlightKind
  categoryLabel: string
  memberId?: string
  memberName?: string
  headline: string
  detail: string
  description: string
  spotlightDate: string
}

export type LeagueDailyHighlightsSnapshot = {
  spotlightDate: string
  spotlightDateLabel: string
  highlights: LeagueDailyHighlight[]
}

type HighlightView = Extract<RankingView, 'mileage' | 'attendance' | 'chase'>

function formatShortDate(value: string): string {
  try {
    return format(parseISO(value), 'M/d', { locale: ko })
  } catch {
    return value
  }
}

function resolveParticipantName(participant: RunningLeagueParticipant | undefined): string {
  return participant?.member?.name?.trim() || '회원'
}

function clampDateToPeriod(date: string, periodStart: string, periodEnd: string): string {
  if (date < periodStart) return periodStart
  if (date > periodEnd) return periodEnd
  return date
}

function collectActivityDates(
  logs: ReadonlyArray<RunningLeagueMileageLog>,
  periodStart: string,
  periodEnd: string,
): string[] {
  const dates = new Set<string>()
  for (const log of logs) {
    if (log.logged_at < periodStart || log.logged_at > periodEnd) continue
    dates.add(log.logged_at)
  }
  return [...dates].sort()
}

function resolveSpotlightDate(
  logs: ReadonlyArray<RunningLeagueMileageLog>,
  periodStart: string,
  periodEnd: string,
  today: string,
): string {
  const clampedToday = clampDateToPeriod(today, periodStart, periodEnd)
  if (logs.some((log) => log.logged_at === clampedToday)) return clampedToday

  const logDates = collectActivityDates(logs, periodStart, periodEnd)
  return logDates.at(-1) ?? clampedToday
}

function logsUpToDate(
  logs: ReadonlyArray<RunningLeagueMileageLog>,
  asOfDate: string,
): RunningLeagueMileageLog[] {
  return logs.filter((log) => log.logged_at <= asOfDate)
}

function sumMileageOnDate(
  memberId: string,
  logs: ReadonlyArray<RunningLeagueMileageLog>,
  date: string,
): number {
  let total = 0
  for (const log of logs) {
    if (log.member_id !== memberId || log.logged_at !== date) continue
    total += Number(log.distance_km ?? 0)
  }
  return Math.round(total * 10) / 10
}

function memberLoggedOnDate(
  memberId: string,
  logs: ReadonlyArray<RunningLeagueMileageLog>,
  date: string,
): boolean {
  return logs.some((log) => log.member_id === memberId && log.logged_at === date)
}

function mileageLeaderAtDate(
  participants: ReadonlyArray<RunningLeagueParticipant>,
  logs: ReadonlyArray<RunningLeagueMileageLog>,
  asOfDate: string,
): { memberId: string; memberName: string } | null {
  const board = buildMileageDistanceLeaderboard(participants, logsUpToDate(logs, asOfDate))
  const leader = board.ranked[0]
  if (!leader) return null
  return { memberId: leader.memberId, memberName: leader.memberName }
}

function attendanceLeaderAtDate(
  participants: ReadonlyArray<RunningLeagueParticipant>,
  logs: ReadonlyArray<RunningLeagueMileageLog>,
  asOfDate: string,
  periodStart: string,
  periodEnd: string,
): { memberId: string; memberName: string } | null {
  const board = buildAttendanceLeaderboard(
    participants,
    logsUpToDate(logs, asOfDate),
    periodStart,
    periodEnd,
  )
  const leader = board.ranked[0]
  if (!leader) return null
  return { memberId: leader.memberId, memberName: leader.memberName }
}

function resolveRankAtDate(input: {
  rankingView: HighlightView
  memberId: string
  participants: ReadonlyArray<RunningLeagueParticipant>
  logs: ReadonlyArray<RunningLeagueMileageLog>
  asOfDate: string
  periodStart: string
  periodEnd: string
}): number | null {
  if (input.rankingView === 'attendance') {
    return computeAttendanceRankAtDate({
      memberId: input.memberId,
      participants: input.participants,
      logs: input.logs,
      asOfDate: input.asOfDate,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
    })
  }

  return computeMileageRankAtDate({
    memberId: input.memberId,
    participants: input.participants,
    logs: input.logs,
    asOfDate: input.asOfDate,
  })
}

function resolveLeaderAtDate(input: {
  rankingView: HighlightView
  participants: ReadonlyArray<RunningLeagueParticipant>
  logs: ReadonlyArray<RunningLeagueMileageLog>
  asOfDate: string
  periodStart: string
  periodEnd: string
}): { memberId: string; memberName: string } | null {
  if (input.rankingView === 'attendance') {
    return attendanceLeaderAtDate(
      input.participants,
      input.logs,
      input.asOfDate,
      input.periodStart,
      input.periodEnd,
    )
  }
  return mileageLeaderAtDate(input.participants, input.logs, input.asOfDate)
}

function resolveRankLabel(rankingView: HighlightView): string {
  if (rankingView === 'attendance') return '출석'
  if (rankingView === 'chase') return '이겨라'
  return '마일리지'
}

function buildDailyStarHighlight(input: {
  rankingView: HighlightView
  participants: ReadonlyArray<RunningLeagueParticipant>
  logs: ReadonlyArray<RunningLeagueMileageLog>
  spotlightDate: string
  periodStart: string
  periodEnd: string
}): LeagueDailyHighlight | null {
  const dateLabel = formatShortDate(input.spotlightDate)
  const rankLabel = resolveRankLabel(input.rankingView)

  if (input.rankingView === 'attendance') {
    const attendees = input.participants
      .filter((participant) =>
        memberLoggedOnDate(participant.member_id, input.logs, input.spotlightDate),
      )
      .map((participant) => ({
        memberId: participant.member_id,
        memberName: resolveParticipantName(participant),
        rank: resolveRankAtDate({
          rankingView: input.rankingView,
          memberId: participant.member_id,
          participants: input.participants,
          logs: input.logs,
          asOfDate: input.spotlightDate,
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
        }),
      }))
      .filter((row) => row.rank != null)
      .sort(
        (a, b) =>
          (a.rank ?? 999) - (b.rank ?? 999) ||
          a.memberName.localeCompare(b.memberName, 'ko'),
      )

    const best = attendees[0]
    if (!best) return null

    return {
      id: `daily-star-${best.memberId}`,
      kind: 'daily_star',
      categoryLabel: '오늘의 스타',
      memberId: best.memberId,
      memberName: best.memberName,
      headline: `${attendees.length}명 출석`,
      detail: `${dateLabel} · 출석 랭킹 ${best.rank}위`,
      description: `${dateLabel}에 출석한 ${attendees.length}명 가운데 ${best.memberName} 회원이 출석 랭킹 ${best.rank}위로 가장 눈에 띄는 활약을 보였습니다.`,
      spotlightDate: input.spotlightDate,
    }
  }

  let best: { memberId: string; memberName: string; km: number } | null = null
  for (const participant of input.participants) {
    const km = sumMileageOnDate(participant.member_id, input.logs, input.spotlightDate)
    if (km <= 0) continue
    const memberName = resolveParticipantName(participant)
    if (!best || km > best.km || (km === best.km && memberName.localeCompare(best.memberName, 'ko') < 0)) {
      best = { memberId: participant.member_id, memberName, km }
    }
  }
  if (!best) return null

  const chaseNote =
    input.rankingView === 'chase'
      ? ' 이겨라 챌린지에서도 가장 뜨거운 하루였습니다.'
      : ''

  return {
    id: `daily-star-${best.memberId}`,
    kind: 'daily_star',
    categoryLabel: '오늘의 스타',
    memberId: best.memberId,
    memberName: best.memberName,
    headline: formatMileageKmDisplay(best.km),
    detail: `${dateLabel} · 가장 뜨거운 하루`,
    description: `${dateLabel}에 ${formatMileageKmDisplay(best.km)}를 기록해 ${rankLabel} 기준 그날 최다 활동 회원입니다.${chaseNote}`,
    spotlightDate: input.spotlightDate,
  }
}

function buildRankClimberHighlight(input: {
  rankingView: HighlightView
  participants: ReadonlyArray<RunningLeagueParticipant>
  logs: ReadonlyArray<RunningLeagueMileageLog>
  spotlightDate: string
  periodStart: string
  periodEnd: string
}): LeagueDailyHighlight | null {
  const previousDateKey = format(subDays(parseISO(input.spotlightDate), 1), 'yyyy-MM-dd')
  if (previousDateKey < input.periodStart) return null

  const rankLabel = resolveRankLabel(input.rankingView)
  let best: {
    memberId: string
    memberName: string
    delta: number
    before: number
    after: number
  } | null = null

  for (const participant of input.participants) {
    const memberId = participant.member_id
    const before = resolveRankAtDate({
      rankingView: input.rankingView,
      memberId,
      participants: input.participants,
      logs: input.logs,
      asOfDate: previousDateKey,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
    })
    const after = resolveRankAtDate({
      rankingView: input.rankingView,
      memberId,
      participants: input.participants,
      logs: input.logs,
      asOfDate: input.spotlightDate,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
    })
    if (before == null || after == null || before <= after) continue

    const delta = before - after
    const memberName = resolveParticipantName(participant)
    if (!best || delta > best.delta) {
      best = { memberId, memberName, delta, before, after }
    }
  }

  if (!best) return null

  return {
    id: `rank-climber-${best.memberId}`,
    kind: 'rank_climber',
    categoryLabel: '순위 급상승',
    memberId: best.memberId,
    memberName: best.memberName,
    headline: `↑ ${best.delta}`,
    detail: `${best.before}위 → ${best.after}위`,
    description: `${best.memberName} 회원이 ${rankLabel} 랭킹에서 전일 ${best.before}위에서 ${best.after}위로 ${best.delta}계단 올랐습니다.`,
    spotlightDate: input.spotlightDate,
  }
}

function buildLeaderStreakHighlight(input: {
  rankingView: HighlightView
  participants: ReadonlyArray<RunningLeagueParticipant>
  logs: ReadonlyArray<RunningLeagueMileageLog>
  spotlightDate: string
  periodStart: string
  periodEnd: string
}): LeagueDailyHighlight | null {
  const leaderToday = resolveLeaderAtDate({
    rankingView: input.rankingView,
    participants: input.participants,
    logs: input.logs,
    asOfDate: input.spotlightDate,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
  })
  if (!leaderToday) return null

  const rankLabel = resolveRankLabel(input.rankingView)
  let streak = 0
  let cursor = parseISO(input.spotlightDate)

  while (true) {
    const dateKey = format(cursor, 'yyyy-MM-dd')
    if (dateKey < input.periodStart) break

    const leader = resolveLeaderAtDate({
      rankingView: input.rankingView,
      participants: input.participants,
      logs: input.logs,
      asOfDate: dateKey,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
    })
    if (!leader || leader.memberId !== leaderToday.memberId) break

    streak += 1
    cursor = subDays(cursor, 1)
  }

  if (streak <= 0) return null

  return {
    id: `leader-streak-${leaderToday.memberId}`,
    kind: 'leader_streak',
    categoryLabel: '1위 방어',
    memberId: leaderToday.memberId,
    memberName: leaderToday.memberName,
    headline: streak === 1 ? '오늘 1위' : `${streak}일 연속 1위`,
    detail: formatShortDate(input.spotlightDate),
    description:
      streak === 1
        ? `${leaderToday.memberName} 회원이 ${formatShortDate(input.spotlightDate)} ${rankLabel} 랭킹 1위를 기록했습니다.`
        : `${leaderToday.memberName} 회원이 ${rankLabel} 1위를 ${streak}일 연속 유지 중입니다.`,
    spotlightDate: input.spotlightDate,
  }
}

function buildLeaguePulseHighlight(input: {
  rankingView: HighlightView
  logs: ReadonlyArray<RunningLeagueMileageLog>
  spotlightDate: string
}): LeagueDailyHighlight | null {
  const activeMemberIds = new Set<string>()
  let totalKm = 0

  for (const log of input.logs) {
    if (log.logged_at !== input.spotlightDate) continue
    activeMemberIds.add(log.member_id)
    totalKm += Number(log.distance_km ?? 0)
  }

  if (activeMemberIds.size === 0) return null

  totalKm = Math.round(totalKm * 10) / 10
  const dateLabel = formatShortDate(input.spotlightDate)

  if (input.rankingView === 'attendance') {
    return {
      id: `league-pulse-${input.spotlightDate}`,
      kind: 'league_pulse',
      categoryLabel: '리그 소식',
      headline: `${activeMemberIds.size}명 출석`,
      detail: `${dateLabel} · 출석 기록`,
      description: `${dateLabel}에 ${activeMemberIds.size}명이 출석 기록을 남겼습니다. 리그 전체의 출석 흐름을 확인해 보세요.`,
      spotlightDate: input.spotlightDate,
    }
  }

  const chaseNote =
    input.rankingView === 'chase'
      ? ' 이겨라 챌린지도 함께 확인해 보세요.'
      : ''

  return {
    id: `league-pulse-${input.spotlightDate}`,
    kind: 'league_pulse',
    categoryLabel: '리그 소식',
    headline: `${activeMemberIds.size}명 활동`,
    detail: `합산 ${formatMileageKmDisplay(totalKm)} · ${dateLabel}`,
    description: `${dateLabel}에 ${activeMemberIds.size}명이 러닝 기록을 남겼고, 합산 ${formatMileageKmDisplay(totalKm)}가 집계되었습니다.${chaseNote}`,
    spotlightDate: input.spotlightDate,
  }
}

function buildRunnerUpHighlight(input: {
  rankingView: HighlightView
  participants: ReadonlyArray<RunningLeagueParticipant>
  logs: ReadonlyArray<RunningLeagueMileageLog>
  spotlightDate: string
  periodStart: string
  periodEnd: string
}): LeagueDailyHighlight | null {
  const rankLabel = resolveRankLabel(input.rankingView)

  if (input.rankingView === 'attendance') {
    const board = buildAttendanceLeaderboard(
      input.participants,
      logsUpToDate(input.logs, input.spotlightDate),
      input.periodStart,
      input.periodEnd,
    )
    const runnerUp = board.ranked[1]
    if (!runnerUp) return null

    return {
      id: `runner-up-${runnerUp.memberId}`,
      kind: 'runner_up',
      categoryLabel: '2위 주목',
      memberId: runnerUp.memberId,
      memberName: runnerUp.memberName,
      headline: `${runnerUp.attendanceDays}일`,
      detail: `출석 랭킹 2위 · ${formatShortDate(input.spotlightDate)}`,
      description: `${runnerUp.memberName} 회원이 출석 랭킹 2위(${runnerUp.attendanceDays}일)를 기록 중입니다. 1위 추격이 기대됩니다.`,
      spotlightDate: input.spotlightDate,
    }
  }

  const board = buildMileageDistanceLeaderboard(
    input.participants,
    logsUpToDate(input.logs, input.spotlightDate),
  )
  const runnerUp = board.ranked[1]
  if (!runnerUp) return null

  const chaseNote =
    input.rankingView === 'chase'
      ? ' 술래를 추격하는 핵심 인물입니다.'
      : ''

  return {
    id: `runner-up-${runnerUp.memberId}`,
    kind: 'runner_up',
    categoryLabel: '2위 주목',
    memberId: runnerUp.memberId,
    memberName: runnerUp.memberName,
    headline: formatMileageKmDisplay(runnerUp.mileageKm),
    detail: `${rankLabel} 2위 · ${formatShortDate(input.spotlightDate)}`,
    description: `${runnerUp.memberName} 회원이 ${rankLabel} 랭킹 2위(${formatMileageKmDisplay(runnerUp.mileageKm)})를 기록 중입니다.${chaseNote}`,
    spotlightDate: input.spotlightDate,
  }
}

export function buildLeagueDailyHighlights(input: {
  rankingView: HighlightView
  participants: ReadonlyArray<RunningLeagueParticipant>
  mileageLogs: ReadonlyArray<RunningLeagueMileageLog>
  periodStart: string
  periodEnd: string
  today?: string
  limit?: number
}): LeagueDailyHighlightsSnapshot {
  const today = input.today ?? format(new Date(), 'yyyy-MM-dd')
  const spotlightDate = resolveSpotlightDate(
    input.mileageLogs,
    input.periodStart,
    input.periodEnd,
    today,
  )

  const shared = {
    rankingView: input.rankingView,
    participants: input.participants,
    logs: input.mileageLogs,
    spotlightDate,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
  }

  const candidates = [
    buildDailyStarHighlight(shared),
    buildRankClimberHighlight(shared),
    buildLeaderStreakHighlight(shared),
    buildLeaguePulseHighlight({
      rankingView: input.rankingView,
      logs: input.mileageLogs,
      spotlightDate,
    }),
    buildRunnerUpHighlight(shared),
  ].filter((item): item is LeagueDailyHighlight => item != null)

  return {
    spotlightDate,
    spotlightDateLabel: formatShortDate(spotlightDate),
    highlights: candidates.slice(0, input.limit ?? 5),
  }
}
