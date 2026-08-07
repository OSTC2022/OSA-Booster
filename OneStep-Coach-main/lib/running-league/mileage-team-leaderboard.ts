import {
  aggregateMonthlyMileageByMember,
  compareMileageDistanceDesc,
  formatMileageKmDisplay,
} from '@/lib/running-league/mileage-leaderboard'
import type { MileageRecognition } from '@/lib/running-league/mileage-recognition'
import type { RunningLeagueMileageLog } from '@/lib/types'

export type PortalMileageTeam = {
  id: string
  name: string
  color: string | null
  sort_order: number
  is_active: boolean
}

export type PortalMileageTeamMember = {
  team_id: string
  member_id: string
  member_name: string
}

export type TeamMileageMemberRow = {
  memberId: string
  memberName: string
  mileageKm: number
}

export type TeamMileageRankRow = {
  teamId: string
  teamName: string
  color: string | null
  mileageKm: number
  rank: number
  members: TeamMileageMemberRow[]
}

export type TeamMileageLeaderboard = {
  ranked: TeamMileageRankRow[]
}

const TEAM_COLORS = [
  '#ff6a2a',
  '#22d3ee',
  '#a78bfa',
  '#f472b6',
  '#84cc16',
  '#fbbf24',
  '#38bdf8',
  '#fb7185',
]

export function defaultTeamColor(index: number): string {
  return TEAM_COLORS[index % TEAM_COLORS.length]!
}

export function buildTeamMileageLeaderboard(input: {
  teams: ReadonlyArray<PortalMileageTeam>
  memberships: ReadonlyArray<PortalMileageTeamMember>
  logs: ReadonlyArray<Pick<RunningLeagueMileageLog, 'member_id' | 'distance_km'>>
  mileageRecognition?: MileageRecognition | null
}): TeamMileageLeaderboard {
  const activeTeams = input.teams.filter((team) => team.is_active)
  const memberKm = aggregateMonthlyMileageByMember(input.logs, input.mileageRecognition)

  const membersByTeam = new Map<string, PortalMileageTeamMember[]>()
  for (const membership of input.memberships) {
    const list = membersByTeam.get(membership.team_id) ?? []
    list.push(membership)
    membersByTeam.set(membership.team_id, list)
  }

  const rows: Array<Omit<TeamMileageRankRow, 'rank'>> = activeTeams.map((team) => {
    const members = (membersByTeam.get(team.id) ?? [])
      .map((membership) => ({
        memberId: membership.member_id,
        memberName: membership.member_name,
        mileageKm: memberKm.get(membership.member_id) ?? 0,
      }))
      .sort(
        (a, b) =>
          compareMileageDistanceDesc(a.mileageKm, b.mileageKm) ||
          a.memberName.localeCompare(b.memberName, 'ko'),
      )

    const mileageKm = Math.round(
      members.reduce((sum, row) => sum + row.mileageKm, 0) * 10,
    ) / 10

    return {
      teamId: team.id,
      teamName: team.name,
      color: team.color,
      mileageKm,
      members,
    }
  })

  rows.sort(
    (a, b) =>
      compareMileageDistanceDesc(a.mileageKm, b.mileageKm) ||
      a.teamName.localeCompare(b.teamName, 'ko'),
  )

  let rank = 0
  let previousKm: number | null = null
  const ranked = rows.map((row, index) => {
    if (previousKm === null || row.mileageKm !== previousKm) {
      rank = index + 1
      previousKm = row.mileageKm
    }
    return { ...row, rank }
  })

  return { ranked }
}

export { formatMileageKmDisplay }
