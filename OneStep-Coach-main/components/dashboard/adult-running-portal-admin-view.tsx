'use client'

import { MemberRunningLeagueRankings } from '@/components/dashboard/member-running-league-rankings'
import { MemberPortalBrandHeader } from '@/components/dashboard/member-portal-brand-header'
import { AttendanceRouletteWheel } from '@/components/dashboard/attendance-roulette-wheel'
import { ChaseLadderGame } from '@/components/dashboard/chase-ladder-game'
import { MemberPortalInfoAccordion } from '@/components/dashboard/member-portal-info-accordion'
import type { MemberRunningLeagueHome } from '@/lib/actions/running-league'
import type { CenterRunningTrainingScheduleBundle } from '@/lib/actions/center-running-training-schedule'
import { resolveAdultPortalBrand } from '@/lib/adult-portal-brand'
import type { AdultPortalBrandConfig } from '@/lib/adult-portal-brand'
import type { PortalMarathonRaceView } from '@/lib/portal-marathon-races'
import type { CenterBoardPost } from '@/lib/types'
import { MEMBER_PORTAL_SHELL_CLASS } from '@/lib/running-league/member-portal-layout'
import { cn } from '@/lib/utils'

type AdultRunningPortalAdminViewProps = {
  runningLeagueHome: MemberRunningLeagueHome
  centerTrainingSchedule: CenterRunningTrainingScheduleBundle
  chaseMemberId?: string | null
  chaseLabel?: string | null
  adultPortalNotice?: string | null
  noticeBoardPosts?: CenterBoardPost[]
  adultPortalBrand?: AdultPortalBrandConfig | null
  marathonRaces?: PortalMarathonRaceView[]
  marathonTableReady?: boolean
}

export function AdultRunningPortalAdminView({
  runningLeagueHome,
  centerTrainingSchedule,
  chaseMemberId = null,
  chaseLabel = null,
  adultPortalNotice = null,
  noticeBoardPosts = [],
  adultPortalBrand = null,
  marathonRaces = [],
  marathonTableReady = true,
}: AdultRunningPortalAdminViewProps) {
  const portalBrand = adultPortalBrand ?? resolveAdultPortalBrand(null)
  const trainingScheduleDays = centerTrainingSchedule.days ?? []
  const trainingScheduleReady = centerTrainingSchedule.tableReady ?? true
  const resolvedChaseMemberId =
    chaseMemberId?.trim() || runningLeagueHome.chaseMemberId?.trim() || null
  const resolvedChaseLabel = chaseLabel?.trim() || runningLeagueHome.chaseLabel?.trim() || null

  return (
    <div className="mx-auto w-full max-w-[1120px]">
      <section className={cn(MEMBER_PORTAL_SHELL_CLASS, 'flex flex-col gap-2.5 sm:gap-4')}>
        <MemberPortalBrandHeader
          brand={portalBrand}
          action={
            <div className="flex items-center gap-1.5">
              <ChaseLadderGame
                rankingBundle={runningLeagueHome.rankingBundle}
                chaseMemberId={resolvedChaseMemberId}
                chaseLabel={resolvedChaseLabel}
                canManageExclusions
              />
              <AttendanceRouletteWheel
                rankingBundle={runningLeagueHome.rankingBundle}
                canSpin
              />
            </div>
          }
        />
        <MemberPortalInfoAccordion
          notice={adultPortalNotice}
          boardPosts={noticeBoardPosts}
          trainingDays={trainingScheduleDays}
          trainingTableReady={trainingScheduleReady}
          marathonRaces={marathonRaces}
          marathonTableReady={marathonTableReady}
          canParticipate={false}
          readOnly
        />
        <MemberRunningLeagueRankings
          pb5kLeaderboard={runningLeagueHome.pb5kLeaderboard}
          pb10kLeaderboard={runningLeagueHome.pb10kLeaderboard}
          pbHalfLeaderboard={runningLeagueHome.pbHalfLeaderboard}
          pbFullLeaderboard={runningLeagueHome.pbFullLeaderboard}
          mileageLeaderboard={runningLeagueHome.mileageLeaderboard}
          scoreLeaderboard={runningLeagueHome.scoreLeaderboard}
          rankingBundle={runningLeagueHome.rankingBundle}
          participant={runningLeagueHome.participant}
          pbRecords={runningLeagueHome.pbRecords}
          mileageLogs={runningLeagueHome.mileageLogs}
          tableReady={runningLeagueHome.tableReady}
          readOnly
          rankingsError={runningLeagueHome.rankingsError}
          rankingPeriod={runningLeagueHome.rankingPeriod}
          chaseMemberId={resolvedChaseMemberId}
          chaseLabel={resolvedChaseLabel}
          showBrandHeader={false}
          showPortalShell={false}
          canManageMemberLogs
        />
      </section>
    </div>
  )
}
