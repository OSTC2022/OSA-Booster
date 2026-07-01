'use client'

import { useMemo, type ReactNode } from 'react'
import { MemberRankingCharts, type GraphChartTab } from '@/components/dashboard/member-ranking-charts'
import { buildLeagueAggregateRankComparisonChart } from '@/lib/running-league/league-rank-comparison'
import {
  buildLeagueAggregateMileageRankComparisonChart,
  buildLeagueMileageComparisonChart,
} from '@/lib/running-league/league-mileage-comparison'
import { buildLeagueAttendanceComparisonChart } from '@/lib/running-league/league-attendance-comparison'
import { buildLeagueChaseComparisonChart } from '@/lib/running-league/league-chase-comparison'
import { buildLeaguePbRecordComparisonChart } from '@/lib/running-league/league-pb-record-comparison'
import { filterPortalPbTrendRecords } from '@/lib/running-league/ranking-hub'
import type { PbLeaderboardDistance } from '@/lib/running-league/pb-leaderboard'
import { filterParticipantsByGender, type RankingGenderFilter } from '@/lib/running-league/ranking-gender'
import type { RankingView } from '@/lib/running-league/ranking-view'
import type { MemberRunningLeagueRankingBundle } from '@/lib/actions/running-league'
import { MEMBER_PORTAL_GRAPH_PANEL_CLASS } from '@/lib/running-league/member-portal-layout'
import { cn } from '@/lib/utils'

interface PortalAggregateGraphPanelProps {
  rankingView: RankingView
  genderFilter: RankingGenderFilter
  pbDistance: PbLeaderboardDistance
  rankingBundle: MemberRunningLeagueRankingBundle | null
  graphChartTab: GraphChartTab
  onGraphChartTabChange: (tab: GraphChartTab) => void
  chaseMemberId?: string | null
  mobileFilterSlot?: ReactNode
  className?: string
}

export function PortalAggregateGraphPanel({
  rankingView,
  genderFilter,
  pbDistance,
  rankingBundle,
  graphChartTab,
  onGraphChartTabChange,
  chaseMemberId = null,
  mobileFilterSlot = null,
  className,
}: PortalAggregateGraphPanelProps) {
  const filteredParticipants = useMemo(() => {
    if (!rankingBundle) return []
    return filterParticipantsByGender(rankingBundle.participants, genderFilter)
  }, [genderFilter, rankingBundle])

  const portalPbRecords = useMemo(
    () => (rankingBundle ? filterPortalPbTrendRecords(rankingBundle.pbRecords) : []),
    [rankingBundle],
  )

  const comparisonChart = useMemo(() => {
    if (!rankingBundle) return null
    if (rankingView === 'pb') {
      return buildLeagueAggregateRankComparisonChart({
        distance: pbDistance,
        participants: filteredParticipants,
        records: portalPbRecords,
      })
    }
    if (rankingView === 'attendance') return null
    if (rankingView === 'chase') {
      return buildLeagueAggregateMileageRankComparisonChart({
        participants: filteredParticipants,
        logs: rankingBundle.mileageLogs,
        maxMembers: filteredParticipants.length,
        mileageRecognition: rankingBundle.mileageRecognition,
      })
    }
    return buildLeagueAggregateMileageRankComparisonChart({
      participants: filteredParticipants,
      logs: rankingBundle.mileageLogs,
      maxMembers: filteredParticipants.length,
      mileageRecognition: rankingBundle.mileageRecognition,
    })
  }, [filteredParticipants, pbDistance, portalPbRecords, rankingBundle, rankingView])

  const mileageComparisonChart = useMemo(() => {
    if (!rankingBundle) return null
    return buildLeagueMileageComparisonChart({
      participants: filteredParticipants,
      logs: rankingBundle.mileageLogs,
      maxMembers: filteredParticipants.length,
      mileageRecognition: rankingBundle.mileageRecognition,
    })
  }, [filteredParticipants, rankingBundle])

  const attendanceComparisonChart = useMemo(() => {
    if (!rankingBundle) return null
    const { start, end } = rankingBundle.rankingPeriod
    return buildLeagueAttendanceComparisonChart({
      participants: filteredParticipants,
      logs: rankingBundle.mileageLogs,
      periodStart: start,
      periodEnd: end,
    })
  }, [filteredParticipants, rankingBundle])

  const chaseComparisonChart = useMemo(() => {
    if (!rankingBundle || !chaseMemberId) return null
    return buildLeagueChaseComparisonChart({
      participants: rankingBundle.participants,
      logs: rankingBundle.mileageLogs,
      chaseMemberId,
      maxMembers: rankingBundle.participants.length,
      mileageRecognition: rankingBundle.mileageRecognition,
    })
  }, [chaseMemberId, rankingBundle])

  const pbRecordComparisonChart = useMemo(() => {
    if (!rankingBundle || rankingView !== 'pb') return null
    return buildLeaguePbRecordComparisonChart({
      distance: pbDistance,
      participants: filteredParticipants,
      records: portalPbRecords,
    })
  }, [filteredParticipants, pbDistance, portalPbRecords, rankingBundle, rankingView])

  return (
    <div className={cn(MEMBER_PORTAL_GRAPH_PANEL_CLASS, className)}>
      {mobileFilterSlot}
      <div className="space-y-2 p-2.5">
        <p className="text-center text-[11px] text-zinc-500">
          전체 회원 그래프 · 랭킹에서 이름을 누르면 개인 그래프로 전환됩니다
        </p>
        <MemberRankingCharts
          key={`aggregate-${rankingView}-${pbDistance}-${genderFilter}`}
          points={[]}
          mileagePoints={[]}
          mileageRankPoints={[]}
          comparisonChart={comparisonChart}
          mileageComparisonChart={mileageComparisonChart}
          chaseComparisonChart={chaseComparisonChart}
          attendanceComparisonChart={attendanceComparisonChart}
          pbRecordComparisonChart={pbRecordComparisonChart}
          mode={
            rankingView === 'pb'
              ? 'pb'
              : rankingView === 'attendance'
                ? 'attendance'
                : rankingView === 'chase'
                  ? 'chase'
                  : 'mileage'
          }
          aggregateMode
          compact
          activeTab={graphChartTab}
          onActiveTabChange={onGraphChartTabChange}
          chaseMemberId={chaseMemberId}
        />
      </div>
    </div>
  )
}
