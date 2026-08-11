import { addDays, format, parseISO } from 'date-fns'
import { formatMileageKmDisplay } from '@/lib/running-league/mileage-leaderboard'
import {
  isMileageLogRecognized,
  type MileageRecognition,
} from '@/lib/running-league/mileage-recognition'
import { getKstDateKey } from '@/lib/member-backup/kst-date'
import { toMileageLogDateKey } from '@/lib/running-league/attendance-leaderboard'

export const TEAM_CODES = ['RED', 'BLUE'] as const
export type TeamCode = (typeof TEAM_CODES)[number]

export const BATTLE_STATUSES = ['draft', 'active', 'ended', 'archived'] as const
export type BattleStatus = (typeof BATTLE_STATUSES)[number]

export const ASSIGNMENT_MODES = ['balanced', 'random'] as const
export type AssignmentMode = (typeof ASSIGNMENT_MODES)[number]

export const SCORING_MODES = ['average_distance', 'total_distance'] as const
export type ScoringMode = (typeof SCORING_MODES)[number]

export type BattleWinner = TeamCode | 'TIED' | null

export type TeamBattleDefinition = {
  id: string
  title: string
  description: string | null
  start_at: string
  end_at: string
  status: BattleStatus
  assignment_mode: AssignmentMode
  scoring_mode: ScoringMode
  created_by: string | null
  created_at?: string
  updated_at?: string
}

export type TeamBattleMemberRow = {
  id?: string
  battle_id: string
  member_id: string
  member_name?: string
  team_code: TeamCode
  baseline_distance: number
  assigned_at?: string
}

export type BaselineMember = {
  memberId: string
  memberName: string
  baselineKm: number
}

export type TeamAssignment = {
  memberId: string
  memberName: string
  teamCode: TeamCode
  baselineKm: number
}

export type MemberBattleContribution = {
  memberId: string
  memberName: string
  teamCode: TeamCode
  distanceKm: number
  runCount: number
  participated: boolean
  baselineKm: number
}

export type TeamBattleStats = {
  teamCode: TeamCode
  memberCount: number
  participantCount: number
  totalDistanceKm: number
  averageDistanceKm: number
  participationRate: number
  topRunners: MemberBattleContribution[]
  members: MemberBattleContribution[]
  baselineTotalKm: number
}

export type TeamBattleScoreboard = {
  battle: TeamBattleDefinition
  red: TeamBattleStats
  blue: TeamBattleStats
  winner: BattleWinner
  leadLabel: string | null
  scoreLabel: string
  displayStatus: 'upcoming' | 'active' | 'ended'
  countdownLabel: string
  myTeam: TeamCode | null
  myContributionKm: number | null
  myContributionShare: number | null
  myUnlinked: boolean
  tableReady: boolean
}

function roundKm(km: number): number {
  return Math.round(km * 10) / 10
}

export function isTeamCode(value: string): value is TeamCode {
  return (TEAM_CODES as readonly string[]).includes(value)
}

export function isBattleStatus(value: string): value is BattleStatus {
  return (BATTLE_STATUSES as readonly string[]).includes(value)
}

export function isAssignmentMode(value: string): value is AssignmentMode {
  return (ASSIGNMENT_MODES as readonly string[]).includes(value)
}

export function isScoringMode(value: string): value is ScoringMode {
  return (SCORING_MODES as readonly string[]).includes(value)
}

/** 배틀 시작일 이전 최근 4주 (start-28 ~ start-1) */
export function getBaselineDateRange(battleStartAt: string): { start: string; end: string } {
  const startKey = battleStartAt.slice(0, 10)
  const end = format(addDays(parseISO(startKey), -1), 'yyyy-MM-dd')
  const start = format(addDays(parseISO(startKey), -28), 'yyyy-MM-dd')
  return { start, end }
}

export function sumMemberDistanceInRange(
  memberId: string,
  logs: ReadonlyArray<{ member_id: string; distance_km: number; logged_at: string }>,
  start: string,
  end: string,
  recognition?: MileageRecognition | null,
): { distanceKm: number; runCount: number } {
  let distanceKm = 0
  let runCount = 0
  for (const log of logs) {
    if (log.member_id !== memberId) continue
    const key = toMileageLogDateKey(String(log.logged_at ?? ''))
    if (!key || key < start || key > end) continue
    if (!isMileageLogRecognized(log.distance_km, recognition)) continue
    distanceKm += Number(log.distance_km ?? 0)
    runCount += 1
  }
  return { distanceKm: roundKm(distanceKm), runCount }
}

export function calculateBaselinesFromLogs(
  members: ReadonlyArray<{ memberId: string; memberName: string }>,
  logs: ReadonlyArray<{ member_id: string; distance_km: number; logged_at: string }>,
  battleStartAt: string,
  recognition?: MileageRecognition | null,
): BaselineMember[] {
  const range = getBaselineDateRange(battleStartAt)
  return members.map((member) => {
    const { distanceKm } = sumMemberDistanceInRange(
      member.memberId,
      logs,
      range.start,
      range.end,
      recognition,
    )
    return {
      memberId: member.memberId,
      memberName: member.memberName,
      baselineKm: distanceKm,
    }
  })
}

/**
 * Greedy balanced assignment:
 * sort by baseline desc, assign to team with lower baseline sum,
 * keeping headcount difference ≤ 1.
 */
export function assignBalancedTeams(members: ReadonlyArray<BaselineMember>): TeamAssignment[] {
  const sorted = [...members].sort((a, b) => {
    if (b.baselineKm !== a.baselineKm) return b.baselineKm - a.baselineKm
    return a.memberName.localeCompare(b.memberName, 'ko')
  })

  const red: TeamAssignment[] = []
  const blue: TeamAssignment[] = []
  let redSum = 0
  let blueSum = 0

  for (const member of sorted) {
    const redCount = red.length
    const blueCount = blue.length
    let team: TeamCode

    if (redCount < blueCount) {
      team = 'RED'
    } else if (blueCount < redCount) {
      team = 'BLUE'
    } else if (redSum <= blueSum) {
      team = 'RED'
    } else {
      team = 'BLUE'
    }

    const row: TeamAssignment = {
      memberId: member.memberId,
      memberName: member.memberName,
      teamCode: team,
      baselineKm: member.baselineKm,
    }
    if (team === 'RED') {
      red.push(row)
      redSum = roundKm(redSum + member.baselineKm)
    } else {
      blue.push(row)
      blueSum = roundKm(blueSum + member.baselineKm)
    }
  }

  return [...red, ...blue]
}

/** Fisher–Yates shuffle copy, then alternate RED/BLUE for |diff| ≤ 1 */
export function assignRandomTeams(
  members: ReadonlyArray<BaselineMember>,
  random: () => number = Math.random,
): TeamAssignment[] {
  const shuffled = [...members]
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }

  const redTarget = Math.ceil(shuffled.length / 2)
  return shuffled.map((member, index) => ({
    memberId: member.memberId,
    memberName: member.memberName,
    teamCode: (index < redTarget ? 'RED' : 'BLUE') as TeamCode,
    baselineKm: member.baselineKm,
  }))
}

export function validateBattleRosterSize(count: number): string | null {
  if (count <= 0) return '참여 회원을 선택해주세요.'
  if (count === 1) return '팀전은 최소 2명이 필요합니다.'
  return null
}

function emptyTeamStats(teamCode: TeamCode): TeamBattleStats {
  return {
    teamCode,
    memberCount: 0,
    participantCount: 0,
    totalDistanceKm: 0,
    averageDistanceKm: 0,
    participationRate: 0,
    topRunners: [],
    members: [],
    baselineTotalKm: 0,
  }
}

export function buildTeamStats(
  teamCode: TeamCode,
  roster: ReadonlyArray<TeamBattleMemberRow>,
  contributions: ReadonlyArray<MemberBattleContribution>,
): TeamBattleStats {
  const teamRoster = roster.filter((row) => row.team_code === teamCode)
  const teamMembers = [...contributions]
    .filter((row) => row.teamCode === teamCode)
    .sort((a, b) => {
      if (b.distanceKm !== a.distanceKm) return b.distanceKm - a.distanceKm
      return a.memberName.localeCompare(b.memberName, 'ko')
    })

  const memberCount = teamRoster.length
  const totalDistanceKm = roundKm(
    teamMembers.reduce((sum, row) => sum + row.distanceKm, 0),
  )
  const participantCount = teamMembers.filter((row) => row.participated).length
  const averageDistanceKm =
    memberCount > 0 ? roundKm(totalDistanceKm / memberCount) : 0
  const participationRate =
    memberCount > 0 ? Math.round((participantCount / memberCount) * 1000) / 10 : 0
  const baselineTotalKm = roundKm(
    teamRoster.reduce((sum, row) => sum + Number(row.baseline_distance ?? 0), 0),
  )

  return {
    teamCode,
    memberCount,
    participantCount,
    totalDistanceKm,
    averageDistanceKm,
    participationRate,
    topRunners: teamMembers.slice(0, 3),
    members: teamMembers,
    baselineTotalKm,
  }
}

export function resolveBattleWinner(
  red: TeamBattleStats,
  blue: TeamBattleStats,
  scoringMode: ScoringMode,
): BattleWinner {
  if (red.memberCount === 0 && blue.memberCount === 0) return null

  const primaryRed =
    scoringMode === 'total_distance' ? red.totalDistanceKm : red.averageDistanceKm
  const primaryBlue =
    scoringMode === 'total_distance' ? blue.totalDistanceKm : blue.averageDistanceKm

  if (primaryRed > primaryBlue) return 'RED'
  if (primaryBlue > primaryRed) return 'BLUE'

  if (red.participationRate > blue.participationRate) return 'RED'
  if (blue.participationRate > red.participationRate) return 'BLUE'

  if (red.totalDistanceKm > blue.totalDistanceKm) return 'RED'
  if (blue.totalDistanceKm > red.totalDistanceKm) return 'BLUE'

  return 'TIED'
}

export function resolveBattleDisplayStatus(
  battle: Pick<TeamBattleDefinition, 'status' | 'start_at' | 'end_at'>,
  asOfDateKey = getKstDateKey(),
): 'upcoming' | 'active' | 'ended' {
  if (battle.status === 'ended' || battle.status === 'archived') return 'ended'
  if (asOfDateKey > battle.end_at) return 'ended'
  if (asOfDateKey < battle.start_at) return 'upcoming'
  if (battle.status === 'active') return 'active'
  // draft before start
  if (asOfDateKey < battle.start_at) return 'upcoming'
  return 'upcoming'
}

export function formatBattleCountdown(
  battle: Pick<TeamBattleDefinition, 'start_at' | 'end_at' | 'status'>,
  asOfDateKey = getKstDateKey(),
): string {
  const display = resolveBattleDisplayStatus(battle, asOfDateKey)
  if (display === 'ended') return '종료'
  if (display === 'upcoming') {
    const start = parseISO(battle.start_at)
    return `${format(start, 'M월 d일')} 시작`
  }
  if (asOfDateKey === battle.end_at) return '오늘 종료'
  const days = Math.max(
    0,
    Math.round(
      (parseISO(battle.end_at).getTime() - parseISO(asOfDateKey).getTime()) /
        (24 * 60 * 60 * 1000),
    ),
  )
  if (days <= 0) return '오늘 종료'
  return `D-${days}`
}

export function buildTeamBattleScoreboard(input: {
  battle: TeamBattleDefinition
  roster: ReadonlyArray<TeamBattleMemberRow>
  logs: ReadonlyArray<{ member_id: string; distance_km: number; logged_at: string }>
  recognition?: MileageRecognition | null
  viewerMemberId?: string | null
  asOfDateKey?: string
  tableReady?: boolean
}): TeamBattleScoreboard {
  const asOf = input.asOfDateKey ?? getKstDateKey()
  const endCap = asOf < input.battle.end_at ? asOf : input.battle.end_at
  const start = input.battle.start_at

  const contributions: MemberBattleContribution[] = input.roster.map((row) => {
    const { distanceKm, runCount } = sumMemberDistanceInRange(
      row.member_id,
      input.logs,
      start,
      endCap,
      input.recognition,
    )
    return {
      memberId: row.member_id,
      memberName: row.member_name?.trim() || '회원',
      teamCode: row.team_code,
      distanceKm,
      runCount,
      participated: runCount > 0,
      baselineKm: Number(row.baseline_distance ?? 0),
    }
  })

  const red = buildTeamStats('RED', input.roster, contributions)
  const blue = buildTeamStats('BLUE', input.roster, contributions)
  const winner = resolveBattleWinner(red, blue, input.battle.scoring_mode)
  const displayStatus = resolveBattleDisplayStatus(input.battle, asOf)
  const countdownLabel = formatBattleCountdown(input.battle, asOf)

  const scoreLabel =
    input.battle.scoring_mode === 'total_distance' ? '총거리' : '평균거리'

  let leadLabel: string | null = null
  if (winner === 'RED' || winner === 'BLUE') {
    const lead =
      input.battle.scoring_mode === 'total_distance'
        ? Math.abs(red.totalDistanceKm - blue.totalDistanceKm)
        : Math.abs(red.averageDistanceKm - blue.averageDistanceKm)
    leadLabel = `${winner} TEAM +${formatMileageKmDisplay(lead)}`
  } else if (winner === 'TIED') {
    leadLabel = '현재 동점'
  }

  const viewerId = input.viewerMemberId?.trim() || null
  const mine = viewerId
    ? contributions.find((row) => row.memberId === viewerId) ?? null
    : null
  const myTeam = mine?.teamCode ?? null
  const myContributionKm = mine?.distanceKm ?? (viewerId ? 0 : null)
  let myContributionShare: number | null = null
  if (mine) {
    const teamTotal = mine.teamCode === 'RED' ? red.totalDistanceKm : blue.totalDistanceKm
    myContributionShare =
      teamTotal > 0 ? Math.round((mine.distanceKm / teamTotal) * 1000) / 10 : 0
  }

  return {
    battle: input.battle,
    red,
    blue,
    winner,
    leadLabel,
    scoreLabel,
    displayStatus,
    countdownLabel,
    myTeam,
    myContributionKm,
    myContributionShare,
    myUnlinked: !viewerId,
    tableReady: input.tableReady !== false,
  }
}
