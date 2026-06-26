import { buildMileageDistanceLeaderboard } from '@/lib/running-league/mileage-leaderboard'
import { buildAttendanceLeaderboard } from '@/lib/running-league/attendance-leaderboard'
import type { PortalRankingPeriod } from '@/lib/running-league/ranking-period'
import {
  buildPbDistanceLeaderboard,
  type PbDistanceLeaderboard,
  type PbLeaderboardDistance,
} from '@/lib/running-league/pb-leaderboard'
import { filterParticipantsByGender, type RankingGenderFilter } from '@/lib/running-league/ranking-gender'
import { buildLeaderboard, type RunningLeagueRankRow } from '@/lib/running-league/scoring'
import type { MileageDistanceLeaderboard } from '@/lib/running-league/mileage-leaderboard'
import type { AttendanceLeaderboard } from '@/lib/running-league/attendance-leaderboard'
import type { MemberRunningLeagueRankingBundle } from '@/lib/actions/running-league'
import { expandPortalPbRecordsWithNotesHistory } from '@/lib/running-league/pb-portal-history'
import type { RunningLeagueRecord } from '@/lib/types'

export type FilteredPortalRankings = {
  pbByDistance: Record<PbLeaderboardDistance, PbDistanceLeaderboard>
  mileageLeaderboard: MileageDistanceLeaderboard
  attendanceLeaderboard: AttendanceLeaderboard
  scoreLeaderboard: RunningLeagueRankRow[]
}

function portalPbRecordsForRanking(records: ReadonlyArray<RunningLeagueRecord>) {
  return expandPortalPbRecordsWithNotesHistory(
    records.filter((row) => row.record_phase === 'other' || row.record_phase === 'pb_history'),
  )
}

/** PB 추이 그래프용 — 포털 PB·이력·스냅샷(notes 포함) */
export function filterPortalPbTrendRecords(records: ReadonlyArray<RunningLeagueRecord>) {
  return portalPbRecordsForRanking(records)
}

export function buildFilteredPortalRankings(
  bundle: MemberRunningLeagueRankingBundle | null,
  genderFilter: RankingGenderFilter,
): FilteredPortalRankings | null {
  if (!bundle) return null

  const participants = filterParticipantsByGender(bundle.participants, genderFilter)
  const pbRecords = portalPbRecordsForRanking(bundle.pbRecords)
  const { start, end } = bundle.rankingPeriod

  return {
    pbByDistance: {
      '5km': buildPbDistanceLeaderboard(participants, pbRecords, '5km'),
      '10km': buildPbDistanceLeaderboard(participants, pbRecords, '10km'),
      half: buildPbDistanceLeaderboard(participants, pbRecords, 'half'),
      full: buildPbDistanceLeaderboard(participants, pbRecords, 'full'),
    },
    mileageLeaderboard: buildMileageDistanceLeaderboard(participants, bundle.mileageLogs),
    attendanceLeaderboard: buildAttendanceLeaderboard(
      participants,
      bundle.mileageLogs,
      start,
      end,
    ),
    scoreLeaderboard: buildLeaderboard(participants),
  }
}
