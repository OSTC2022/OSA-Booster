import { format, parseISO, subDays } from 'date-fns'
import { ko } from 'date-fns/locale'
import { computeAttendanceRankAtDate } from '@/lib/running-league/attendance-history'
import { buildAttendanceLeaderboard } from '@/lib/running-league/attendance-leaderboard'
import { computeMileageRankAtDate } from '@/lib/running-league/mileage-rank-history'
import {
  buildMileageDistanceLeaderboard,
  formatMileageKmDisplay,
} from '@/lib/running-league/mileage-leaderboard'
import {
  isMileageLogRecognized,
  sumMemberMileageOnDate,
  type MileageRecognition,
} from '@/lib/running-league/mileage-recognition'
import type {
  RunningLeagueMileageLog,
  RunningLeagueParticipant,
} from '@/lib/types'
import {
  resolveChaseTargetMileageKm,
  resolveChaseTargetName,
} from '@/lib/running-league/chase-leaderboard'
import type { RankingView } from '@/lib/running-league/ranking-view'
import { DEFAULT_PORTAL_CHASE_LABEL } from '@/lib/running-league/portal-chase-label'

export type LeagueDailyHighlightKind =
  | 'daily_star'
  | 'rank_climber'
  | 'leader_streak'
  | 'league_pulse'
  | 'runner_up'
  | 'next_rank_hunt'
  | 'top_five_push'
  | 'logging_streak'
  | 'comeback_runner'
  | 'quiet_climber'
  | 'chase_pursuit'
  | 'chase_beater'
  | 'chase_pulse'

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

const MID_TIER_MIN_RANK = 4
const TOP_FIVE_RANK = 5
const COMEBACK_MIN_GAP_DAYS = 3
const MIN_LOGGING_STREAK = 2
const QUIET_CLIMBER_MIN_START_RANK = 5
const QUIET_CLIMBER_MAX_DELTA = 4

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
  mileageRecognition?: MileageRecognition | null,
): number {
  return sumMemberMileageOnDate(memberId, logs, date, mileageRecognition)
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
  mileageRecognition?: MileageRecognition | null,
): { memberId: string; memberName: string } | null {
  const board = buildMileageDistanceLeaderboard(
    participants,
    logsUpToDate(logs, asOfDate),
    mileageRecognition,
  )
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
  mileageRecognition?: MileageRecognition | null
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
    mileageRecognition: input.mileageRecognition,
  })
}

function resolveLeaderAtDate(input: {
  rankingView: HighlightView
  participants: ReadonlyArray<RunningLeagueParticipant>
  logs: ReadonlyArray<RunningLeagueMileageLog>
  asOfDate: string
  periodStart: string
  periodEnd: string
  mileageRecognition?: MileageRecognition | null
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
  return mileageLeaderAtDate(
    input.participants,
    input.logs,
    input.asOfDate,
    input.mileageRecognition,
  )
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
  mileageRecognition?: MileageRecognition | null
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
    const km = sumMileageOnDate(
      participant.member_id,
      input.logs,
      input.spotlightDate,
      input.mileageRecognition,
    )
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
  mileageRecognition?: MileageRecognition | null
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
      mileageRecognition: input.mileageRecognition,
    })
    const after = resolveRankAtDate({
      rankingView: input.rankingView,
      memberId,
      participants: input.participants,
      logs: input.logs,
      asOfDate: input.spotlightDate,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      mileageRecognition: input.mileageRecognition,
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
  mileageRecognition?: MileageRecognition | null
}): LeagueDailyHighlight | null {
  const leaderToday = resolveLeaderAtDate({
    rankingView: input.rankingView,
    participants: input.participants,
    logs: input.logs,
    asOfDate: input.spotlightDate,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    mileageRecognition: input.mileageRecognition,
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
      mileageRecognition: input.mileageRecognition,
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
  mileageRecognition?: MileageRecognition | null
}): LeagueDailyHighlight | null {
  const activeMemberIds = new Set<string>()
  let totalKm = 0

  for (const log of input.logs) {
    if (log.logged_at !== input.spotlightDate) continue
    if (
      input.rankingView !== 'attendance' &&
      !isMileageLogRecognized(log.distance_km, input.mileageRecognition)
    ) {
      continue
    }
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
  mileageRecognition?: MileageRecognition | null
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
    input.mileageRecognition,
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

function computeLoggingStreakEndingOn(
  memberId: string,
  logs: ReadonlyArray<RunningLeagueMileageLog>,
  spotlightDate: string,
  periodStart: string,
): number {
  let streak = 0
  let cursor = parseISO(spotlightDate)

  while (true) {
    const dateKey = format(cursor, 'yyyy-MM-dd')
    if (dateKey < periodStart) break
    if (!memberLoggedOnDate(memberId, logs, dateKey)) break
    streak += 1
    cursor = subDays(cursor, 1)
  }

  return streak
}

function resolveComebackGapDays(
  memberId: string,
  logs: ReadonlyArray<RunningLeagueMileageLog>,
  spotlightDate: string,
  periodStart: string,
): number | null {
  if (!memberLoggedOnDate(memberId, logs, spotlightDate)) return null

  const memberDates = collectActivityDates(
    logs.filter((log) => log.member_id === memberId),
    periodStart,
    spotlightDate,
  ).filter((date) => date < spotlightDate)

  if (memberDates.length === 0) return null

  const previousDate = memberDates.at(-1)!
  const gapDays = Math.round(
    (parseISO(spotlightDate).getTime() - parseISO(previousDate).getTime()) / 86_400_000,
  )
  return gapDays >= COMEBACK_MIN_GAP_DAYS ? gapDays : null
}

function buildNextRankHuntHighlight(input: {
  rankingView: HighlightView
  participants: ReadonlyArray<RunningLeagueParticipant>
  logs: ReadonlyArray<RunningLeagueMileageLog>
  spotlightDate: string
  periodStart: string
  periodEnd: string
  mileageRecognition?: MileageRecognition | null
}): LeagueDailyHighlight | null {
  const rankLabel = resolveRankLabel(input.rankingView)
  const dateLabel = formatShortDate(input.spotlightDate)

  if (input.rankingView === 'attendance') {
    const board = buildAttendanceLeaderboard(
      input.participants,
      logsUpToDate(input.logs, input.spotlightDate),
      input.periodStart,
      input.periodEnd,
    )
    let best: {
      memberId: string
      memberName: string
      rank: number
      gapDays: number
      aboveRank: number
    } | null = null

    for (let index = MID_TIER_MIN_RANK - 1; index < board.ranked.length; index += 1) {
      const row = board.ranked[index]
      const above = board.ranked[index - 1]
      if (!above) continue
      const gapDays = above.attendanceDays - row.attendanceDays
      if (gapDays <= 0) continue
      if (!best || gapDays < best.gapDays) {
        best = {
          memberId: row.memberId,
          memberName: row.memberName,
          rank: row.rank,
          gapDays,
          aboveRank: above.rank,
        }
      }
    }

    if (!best) return null

    return {
      id: `next-rank-hunt-${best.memberId}`,
      kind: 'next_rank_hunt',
      categoryLabel: '한 칸 위 추격',
      memberId: best.memberId,
      memberName: best.memberName,
      headline: `${best.gapDays}일 차이`,
      detail: `${best.rank}위 → ${best.aboveRank}위 · ${dateLabel}`,
      description: `${best.memberName} 회원이 출석 ${best.rank}위입니다. 바로 위 ${best.aboveRank}위와 ${best.gapDays}일 차이로 추격 중입니다.`,
      spotlightDate: input.spotlightDate,
    }
  }

  const board = buildMileageDistanceLeaderboard(
    input.participants,
    logsUpToDate(input.logs, input.spotlightDate),
    input.mileageRecognition,
  )

  let best: {
    memberId: string
    memberName: string
    rank: number
    gapKm: number
    aboveRank: number
  } | null = null

  for (let index = MID_TIER_MIN_RANK - 1; index < board.ranked.length; index += 1) {
    const row = board.ranked[index]
    const above = board.ranked[index - 1]
    if (!above) continue
    const gapKm = Math.round((above.mileageKm - row.mileageKm) * 10) / 10
    if (gapKm <= 0) continue
    if (!best || gapKm < best.gapKm) {
      best = {
        memberId: row.memberId,
        memberName: row.memberName,
        rank: row.rank,
        gapKm,
        aboveRank: above.rank,
      }
    }
  }

  if (!best) return null

  const chaseNote =
    input.rankingView === 'chase'
      ? ' 이겨라 챌린지에서도 한 단계 올라갈 기회입니다.'
      : ''

  return {
    id: `next-rank-hunt-${best.memberId}`,
    kind: 'next_rank_hunt',
    categoryLabel: '한 칸 위 추격',
    memberId: best.memberId,
    memberName: best.memberName,
    headline: `${formatMileageKmDisplay(best.gapKm)} 차이`,
    detail: `${best.rank}위 → ${best.aboveRank}위 · ${dateLabel}`,
    description: `${best.memberName} 회원이 ${rankLabel} ${best.rank}위입니다. 바로 위 ${best.aboveRank}위와 ${formatMileageKmDisplay(best.gapKm)} 차이로 추격 중입니다.${chaseNote}`,
    spotlightDate: input.spotlightDate,
  }
}

function buildTopFivePushHighlight(input: {
  rankingView: HighlightView
  participants: ReadonlyArray<RunningLeagueParticipant>
  logs: ReadonlyArray<RunningLeagueMileageLog>
  spotlightDate: string
  periodStart: string
  periodEnd: string
  mileageRecognition?: MileageRecognition | null
}): LeagueDailyHighlight | null {
  const rankLabel = resolveRankLabel(input.rankingView)
  const dateLabel = formatShortDate(input.spotlightDate)

  if (input.rankingView === 'attendance') {
    const board = buildAttendanceLeaderboard(
      input.participants,
      logsUpToDate(input.logs, input.spotlightDate),
      input.periodStart,
      input.periodEnd,
    )
    const cutoff = board.ranked[TOP_FIVE_RANK - 1]
    if (!cutoff) return null

    let best: {
      memberId: string
      memberName: string
      rank: number
      gapDays: number
    } | null = null

    for (const row of board.ranked) {
      if (row.rank <= TOP_FIVE_RANK) continue
      const gapDays = cutoff.attendanceDays - row.attendanceDays
      if (gapDays <= 0) continue
      if (!best || gapDays < best.gapDays) {
        best = {
          memberId: row.memberId,
          memberName: row.memberName,
          rank: row.rank,
          gapDays,
        }
      }
    }

    if (!best) return null

    return {
      id: `top-five-push-${best.memberId}`,
      kind: 'top_five_push',
      categoryLabel: 'TOP5 도전',
      memberId: best.memberId,
      memberName: best.memberName,
      headline: `${best.gapDays}일 더 필요`,
      detail: `현재 ${best.rank}위 · ${dateLabel}`,
      description: `${best.memberName} 회원이 출석 ${best.rank}위입니다. TOP ${TOP_FIVE_RANK} 진입까지 ${best.gapDays}일이 더 필요합니다.`,
      spotlightDate: input.spotlightDate,
    }
  }

  const board = buildMileageDistanceLeaderboard(
    input.participants,
    logsUpToDate(input.logs, input.spotlightDate),
    input.mileageRecognition,
  )
  const cutoff = board.ranked[TOP_FIVE_RANK - 1]
  if (!cutoff) return null

  let best: {
    memberId: string
    memberName: string
    rank: number
    gapKm: number
  } | null = null

  for (const row of board.ranked) {
    if (row.rank <= TOP_FIVE_RANK) continue
    const gapKm = Math.round((cutoff.mileageKm - row.mileageKm) * 10) / 10
    if (gapKm <= 0) continue
    if (!best || gapKm < best.gapKm) {
      best = {
        memberId: row.memberId,
        memberName: row.memberName,
        rank: row.rank,
        gapKm,
      }
    }
  }

  if (!best) return null

  const chaseNote =
    input.rankingView === 'chase'
      ? ' 술래를 넘어서는 중위권 주자입니다.'
      : ''

  return {
    id: `top-five-push-${best.memberId}`,
    kind: 'top_five_push',
    categoryLabel: 'TOP5 도전',
    memberId: best.memberId,
    memberName: best.memberName,
    headline: `${formatMileageKmDisplay(best.gapKm)} 더 필요`,
    detail: `현재 ${best.rank}위 · ${dateLabel}`,
    description: `${best.memberName} 회원이 ${rankLabel} ${best.rank}위입니다. TOP ${TOP_FIVE_RANK} 진입까지 ${formatMileageKmDisplay(best.gapKm)}가 더 필요합니다.${chaseNote}`,
    spotlightDate: input.spotlightDate,
  }
}

function buildLoggingStreakHighlight(input: {
  rankingView: HighlightView
  participants: ReadonlyArray<RunningLeagueParticipant>
  logs: ReadonlyArray<RunningLeagueMileageLog>
  spotlightDate: string
  periodStart: string
  periodEnd: string
  mileageRecognition?: MileageRecognition | null
}): LeagueDailyHighlight | null {
  const rankLabel = resolveRankLabel(input.rankingView)
  const dateLabel = formatShortDate(input.spotlightDate)

  let best: {
    memberId: string
    memberName: string
    streak: number
    rank: number | null
  } | null = null

  for (const participant of input.participants) {
    const memberId = participant.member_id
    const streak = computeLoggingStreakEndingOn(
      memberId,
      input.logs,
      input.spotlightDate,
      input.periodStart,
    )
    if (streak < MIN_LOGGING_STREAK) continue

    const rank = resolveRankAtDate({
      rankingView: input.rankingView,
      memberId,
      participants: input.participants,
      logs: input.logs,
      asOfDate: input.spotlightDate,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      mileageRecognition: input.mileageRecognition,
    })
    if (rank == null || rank < MID_TIER_MIN_RANK) continue

    const memberName = resolveParticipantName(participant)
    if (
      !best ||
      streak > best.streak ||
      (streak === best.streak && (rank ?? 999) < (best.rank ?? 999))
    ) {
      best = { memberId, memberName, streak, rank }
    }
  }

  if (!best) return null

  return {
    id: `logging-streak-${best.memberId}`,
    kind: 'logging_streak',
    categoryLabel: '연속 기록',
    memberId: best.memberId,
    memberName: best.memberName,
    headline: `${best.streak}일 연속`,
    detail: `${rankLabel} ${best.rank}위 · ${dateLabel}`,
    description: `${best.memberName} 회원이 ${best.streak}일 연속 기록을 이어가고 있습니다. 중위권이지만 꾸준한 페이스가 눈에 띕니다.`,
    spotlightDate: input.spotlightDate,
  }
}

function buildComebackRunnerHighlight(input: {
  rankingView: HighlightView
  participants: ReadonlyArray<RunningLeagueParticipant>
  logs: ReadonlyArray<RunningLeagueMileageLog>
  spotlightDate: string
  periodStart: string
  periodEnd: string
  mileageRecognition?: MileageRecognition | null
}): LeagueDailyHighlight | null {
  const rankLabel = resolveRankLabel(input.rankingView)
  const dateLabel = formatShortDate(input.spotlightDate)

  let best: {
    memberId: string
    memberName: string
    gapDays: number
    rank: number | null
  } | null = null

  for (const participant of input.participants) {
    const memberId = participant.member_id
    const gapDays = resolveComebackGapDays(
      memberId,
      input.logs,
      input.spotlightDate,
      input.periodStart,
    )
    if (gapDays == null) continue

    const rank = resolveRankAtDate({
      rankingView: input.rankingView,
      memberId,
      participants: input.participants,
      logs: input.logs,
      asOfDate: input.spotlightDate,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      mileageRecognition: input.mileageRecognition,
    })
    if (rank != null && rank < MID_TIER_MIN_RANK) continue

    const memberName = resolveParticipantName(participant)
    if (
      !best ||
      gapDays > best.gapDays ||
      (gapDays === best.gapDays && (rank ?? 999) > (best.rank ?? 0))
    ) {
      best = { memberId, memberName, gapDays, rank }
    }
  }

  if (!best) return null

  return {
    id: `comeback-runner-${best.memberId}`,
    kind: 'comeback_runner',
    categoryLabel: '복귀 러너',
    memberId: best.memberId,
    memberName: best.memberName,
    headline: `${best.gapDays}일 만에 복귀`,
    detail: `${rankLabel} ${best.rank ?? '-'}위 · ${dateLabel}`,
    description: `${best.memberName} 회원이 ${best.gapDays}일 만에 다시 기록을 남겼습니다. 하위권·중위권에서도 다시 뛰어올 기회가 열렸습니다.`,
    spotlightDate: input.spotlightDate,
  }
}

function buildQuietClimberHighlight(input: {
  rankingView: HighlightView
  participants: ReadonlyArray<RunningLeagueParticipant>
  logs: ReadonlyArray<RunningLeagueMileageLog>
  spotlightDate: string
  periodStart: string
  periodEnd: string
  mileageRecognition?: MileageRecognition | null
}): LeagueDailyHighlight | null {
  const previousDateKey = format(subDays(parseISO(input.spotlightDate), 1), 'yyyy-MM-dd')
  if (previousDateKey < input.periodStart) return null

  const rankLabel = resolveRankLabel(input.rankingView)
  const dateLabel = formatShortDate(input.spotlightDate)

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
      mileageRecognition: input.mileageRecognition,
    })
    const after = resolveRankAtDate({
      rankingView: input.rankingView,
      memberId,
      participants: input.participants,
      logs: input.logs,
      asOfDate: input.spotlightDate,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      mileageRecognition: input.mileageRecognition,
    })
    if (before == null || after == null || before <= after) continue
    if (before < QUIET_CLIMBER_MIN_START_RANK) continue

    const delta = before - after
    if (delta > QUIET_CLIMBER_MAX_DELTA) continue

    const memberName = resolveParticipantName(participant)
    if (!best || delta > best.delta || (delta === best.delta && after > best.after)) {
      best = { memberId, memberName, delta, before, after }
    }
  }

  if (!best) return null

  return {
    id: `quiet-climber-${best.memberId}`,
    kind: 'quiet_climber',
    categoryLabel: '중위권 상승',
    memberId: best.memberId,
    memberName: best.memberName,
    headline: `↑ ${best.delta}`,
    detail: `${best.before}위 → ${best.after}위 · ${dateLabel}`,
    description: `${best.memberName} 회원이 ${rankLabel} 랭킹에서 ${best.before}위에서 ${best.after}위로 ${best.delta}계단 올랐습니다. 상위권은 아니지만 중후위 그룹의 움직임이 포착됐습니다.`,
    spotlightDate: input.spotlightDate,
  }
}

function resolveChaseLabel(chaseLabel?: string | null): string {
  const trimmed = chaseLabel?.trim()
  return trimmed || DEFAULT_PORTAL_CHASE_LABEL
}

function buildChasePursuitHighlight(input: {
  participants: ReadonlyArray<RunningLeagueParticipant>
  logs: ReadonlyArray<RunningLeagueMileageLog>
  spotlightDate: string
  chaseMemberId: string
  chaseLabel?: string | null
  mileageRecognition?: MileageRecognition | null
}): LeagueDailyHighlight | null {
  const board = buildMileageDistanceLeaderboard(
    input.participants,
    logsUpToDate(input.logs, input.spotlightDate),
    input.mileageRecognition,
  )
  const chaseKm = resolveChaseTargetMileageKm(board, input.chaseMemberId, input.participants)
  if (chaseKm == null) return null

  const chaseName = resolveChaseTargetName(input.participants, input.chaseMemberId) ?? '술래'
  const chaseLabel = resolveChaseLabel(input.chaseLabel)
  const dateLabel = formatShortDate(input.spotlightDate)

  let best: {
    memberId: string
    memberName: string
    gapKm: number
    rank: number
  } | null = null

  for (const row of board.ranked) {
    if (row.memberId === input.chaseMemberId) continue
    if (row.mileageKm >= chaseKm) continue

    const gapKm = Math.round((chaseKm - row.mileageKm) * 10) / 10
    if (gapKm <= 0) continue

    if (!best || gapKm < best.gapKm || (gapKm === best.gapKm && row.rank < best.rank)) {
      best = {
        memberId: row.memberId,
        memberName: row.memberName,
        gapKm,
        rank: row.rank,
      }
    }
  }

  if (!best) return null

  return {
    id: `chase-pursuit-${best.memberId}`,
    kind: 'chase_pursuit',
    categoryLabel: '술래 추격',
    memberId: best.memberId,
    memberName: best.memberName,
    headline: `${formatMileageKmDisplay(best.gapKm)} 남음`,
    detail: `마일리지 ${best.rank}위 · ${dateLabel}`,
    description: `${best.memberName} 회원이 ${chaseName}(${formatMileageKmDisplay(chaseKm)})를 향해 가장 가깝게 추격 중입니다. ${formatMileageKmDisplay(best.gapKm)}만 더 달리면 ${chaseLabel}에서 술래를 넘길 수 있습니다.`,
    spotlightDate: input.spotlightDate,
  }
}

function buildChaseBeaterHighlight(input: {
  participants: ReadonlyArray<RunningLeagueParticipant>
  logs: ReadonlyArray<RunningLeagueMileageLog>
  spotlightDate: string
  chaseMemberId: string
  chaseLabel?: string | null
  mileageRecognition?: MileageRecognition | null
}): LeagueDailyHighlight | null {
  const board = buildMileageDistanceLeaderboard(
    input.participants,
    logsUpToDate(input.logs, input.spotlightDate),
    input.mileageRecognition,
  )
  const chaseKm = resolveChaseTargetMileageKm(board, input.chaseMemberId, input.participants)
  if (chaseKm == null) return null

  const chaseName = resolveChaseTargetName(input.participants, input.chaseMemberId) ?? '술래'
  const chaseLabel = resolveChaseLabel(input.chaseLabel)
  const dateLabel = formatShortDate(input.spotlightDate)

  let best: {
    memberId: string
    memberName: string
    leadKm: number
    rank: number
  } | null = null

  for (const row of board.ranked) {
    if (row.memberId === input.chaseMemberId) continue
    if (row.mileageKm <= chaseKm) continue

    const leadKm = Math.round((row.mileageKm - chaseKm) * 10) / 10
    if (leadKm <= 0) continue

    if (!best || leadKm > best.leadKm || (leadKm === best.leadKm && row.rank < best.rank)) {
      best = {
        memberId: row.memberId,
        memberName: row.memberName,
        leadKm,
        rank: row.rank,
      }
    }
  }

  if (!best) return null

  return {
    id: `chase-beater-${best.memberId}`,
    kind: 'chase_beater',
    categoryLabel: '술래 넘김',
    memberId: best.memberId,
    memberName: best.memberName,
    headline: `${formatMileageKmDisplay(best.leadKm)} 앞섬`,
    detail: `마일리지 ${best.rank}위 · ${dateLabel}`,
    description: `${best.memberName} 회원이 ${chaseName}(${formatMileageKmDisplay(chaseKm)})를 ${formatMileageKmDisplay(best.leadKm)} 앞서고 있습니다. ${chaseLabel}에서 가장 앞선 주자입니다.`,
    spotlightDate: input.spotlightDate,
  }
}

function buildChasePulseHighlight(input: {
  participants: ReadonlyArray<RunningLeagueParticipant>
  logs: ReadonlyArray<RunningLeagueMileageLog>
  spotlightDate: string
  chaseMemberId: string
  chaseLabel?: string | null
  mileageRecognition?: MileageRecognition | null
}): LeagueDailyHighlight | null {
  const board = buildMileageDistanceLeaderboard(
    input.participants,
    logsUpToDate(input.logs, input.spotlightDate),
    input.mileageRecognition,
  )
  const chaseKm = resolveChaseTargetMileageKm(board, input.chaseMemberId, input.participants)
  if (chaseKm == null) return null

  const chaseName = resolveChaseTargetName(input.participants, input.chaseMemberId) ?? '술래'
  const chaseLabel = resolveChaseLabel(input.chaseLabel)
  const dateLabel = formatShortDate(input.spotlightDate)
  const beaters = board.ranked.filter(
    (row) => row.memberId !== input.chaseMemberId && row.mileageKm > chaseKm,
  )

  return {
    id: `chase-pulse-${input.spotlightDate}`,
    kind: 'chase_pulse',
    categoryLabel: '이겨라 현황',
    memberId: input.chaseMemberId,
    memberName: chaseName,
    headline: beaters.length > 0 ? `${beaters.length}명이 추월` : '아직 추월자 없음',
    detail: `${formatMileageKmDisplay(chaseKm)} · ${dateLabel}`,
    description:
      beaters.length > 0
        ? `${dateLabel} 기준 ${chaseName}(${formatMileageKmDisplay(chaseKm)})를 넘긴 회원이 ${beaters.length}명입니다. ${chaseLabel} 판도를 확인해 보세요.`
        : `${dateLabel} 기준 아직 ${chaseName}(${formatMileageKmDisplay(chaseKm)})를 넘긴 회원은 없습니다. 누가 먼저 ${chaseLabel}에 성공할지 주목해 보세요.`,
    spotlightDate: input.spotlightDate,
  }
}

function buildChaseHighlights(input: {
  participants: ReadonlyArray<RunningLeagueParticipant>
  logs: ReadonlyArray<RunningLeagueMileageLog>
  spotlightDate: string
  chaseMemberId?: string | null
  chaseLabel?: string | null
  mileageRecognition?: MileageRecognition | null
}): LeagueDailyHighlight[] {
  const chaseMemberId = input.chaseMemberId?.trim()
  if (!chaseMemberId) return []

  const shared = {
    participants: input.participants,
    logs: input.logs,
    spotlightDate: input.spotlightDate,
    chaseMemberId,
    chaseLabel: input.chaseLabel,
    mileageRecognition: input.mileageRecognition,
  }

  const pursuit = buildChasePursuitHighlight(shared)
  const beater = buildChaseBeaterHighlight(shared)
  const pulse = buildChasePulseHighlight(shared)

  const highlights: LeagueDailyHighlight[] = []
  if (pursuit) highlights.push(pursuit)
  if (beater) highlights.push(beater)
  else if (pulse) highlights.push(pulse)
  return highlights
}

export function buildLeagueDailyHighlights(input: {
  rankingView: HighlightView
  participants: ReadonlyArray<RunningLeagueParticipant>
  mileageLogs: ReadonlyArray<RunningLeagueMileageLog>
  periodStart: string
  periodEnd: string
  today?: string
  limit?: number
  mileageRecognition?: MileageRecognition | null
  chaseMemberId?: string | null
  chaseLabel?: string | null
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
    mileageRecognition: input.mileageRecognition,
  }

  const candidates = [
    buildDailyStarHighlight(shared),
    buildRankClimberHighlight(shared),
    buildLeaderStreakHighlight(shared),
    buildLeaguePulseHighlight({
      rankingView: input.rankingView,
      logs: input.mileageLogs,
      spotlightDate,
      mileageRecognition: input.mileageRecognition,
    }),
    buildRunnerUpHighlight(shared),
    buildNextRankHuntHighlight(shared),
    buildTopFivePushHighlight(shared),
    buildLoggingStreakHighlight(shared),
    buildComebackRunnerHighlight(shared),
    buildQuietClimberHighlight(shared),
    ...buildChaseHighlights({
      participants: input.participants,
      logs: input.mileageLogs,
      spotlightDate,
      chaseMemberId: input.chaseMemberId,
      chaseLabel: input.chaseLabel,
      mileageRecognition: input.mileageRecognition,
    }),
  ].filter((item): item is LeagueDailyHighlight => item != null)

  return {
    spotlightDate,
    spotlightDateLabel: formatShortDate(spotlightDate),
    highlights: candidates.slice(0, input.limit ?? 12),
  }
}
