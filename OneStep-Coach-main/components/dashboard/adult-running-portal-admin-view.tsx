'use client'

import { MemberRunningLeagueRankings } from '@/components/dashboard/member-running-league-rankings'
import { MemberPortalBrandHeader } from '@/components/dashboard/member-portal-brand-header'
import { AttendanceRouletteWheel } from '@/components/dashboard/attendance-roulette-wheel'
import { ChaseLadderGame } from '@/components/dashboard/chase-ladder-game'
import { MemberPortalInfoAccordion } from '@/components/dashboard/member-portal-info-accordion'
import { MemberMyRunningStatusCard } from '@/components/dashboard/member-my-running-status-card'
import { MemberRunnerLevelCard } from '@/components/dashboard/member-runner-level-card'
import { MemberRunningStreakCard } from '@/components/dashboard/member-running-streak-card'
import { MemberRivalCard } from '@/components/dashboard/member-rival-card'
import { MemberWeeklyMissionsCard } from '@/components/dashboard/member-weekly-missions-card'
import { MemberTeamBattleCard } from '@/components/dashboard/member-team-battle-card'
import { MemberMvpCard } from '@/components/dashboard/member-mvp-card'
import { MemberAchievementsCard } from '@/components/dashboard/member-achievements-card'
import { MemberRaffleEventCard } from '@/components/dashboard/member-raffle-event-card'
import type { MemberRunningLeagueHome } from '@/lib/actions/running-league'
import type { MemberRivalHome } from '@/lib/actions/member-rivals'
import type { MemberMvpHome } from '@/lib/actions/mvp'
import type { MemberAchievementsHome } from '@/lib/actions/achievements'
import type { MemberRewardHomeResult } from '@/lib/actions/rewards'
import type { MemberRaffleHome } from '@/lib/actions/raffles'
import type { TeamBattleScoreboard } from '@/lib/running-league/team-battle'
import type { RunningStreakStatus } from '@/lib/running-league/running-streak'
import type { WeeklyMissionsView } from '@/lib/running-league/weekly-missions'
import type { CenterRunningTrainingScheduleBundle } from '@/lib/actions/center-running-training-schedule'
import { resolveAdultPortalBrand } from '@/lib/adult-portal-brand'
import type { AdultPortalBrandConfig } from '@/lib/adult-portal-brand'
import type { PortalMarathonRaceView } from '@/lib/portal-marathon-races'
import type { CenterBoardPost } from '@/lib/types'
import { MEMBER_PORTAL_SHELL_CLASS } from '@/lib/running-league/member-portal-layout'
import { cn } from '@/lib/utils'

type AdultRunningPortalAdminViewProps = {
  runningLeagueHome: MemberRunningLeagueHome
  runningStreak?: RunningStreakStatus | { unlinked: true } | null
  rivalHome?: MemberRivalHome | null
  weeklyMissions?: WeeklyMissionsView | { unlinked: true } | null
  teamBattleHome?: { scoreboard: TeamBattleScoreboard | null; tableReady: boolean } | null
  mvpHome?: MemberMvpHome | null
  achievementsHome?: MemberAchievementsHome | null
  rewardHome?: MemberRewardHomeResult | null
  raffleHome?: MemberRaffleHome | null
  centerTrainingSchedule: CenterRunningTrainingScheduleBundle
  chaseMemberId?: string | null
  chaseLabel?: string | null
  adultPortalNotice?: string | null
  noticeBoardPosts?: CenterBoardPost[]
  adultPortalBrand?: Parameters<typeof resolveAdultPortalBrand>[0] | AdultPortalBrandConfig | null
  marathonRaces?: PortalMarathonRaceView[]
  marathonTableReady?: boolean
}

export function AdultRunningPortalAdminView({
  runningLeagueHome,
  runningStreak = null,
  rivalHome = null,
  weeklyMissions = null,
  teamBattleHome = null,
  mvpHome = null,
  achievementsHome = null,
  rewardHome = null,
  raffleHome = null,
  centerTrainingSchedule,
  chaseMemberId = null,
  chaseLabel = null,
  adultPortalNotice = null,
  noticeBoardPosts = [],
  adultPortalBrand = null,
  marathonRaces = [],
  marathonTableReady = true,
}: AdultRunningPortalAdminViewProps) {
  const portalBrand = resolveAdultPortalBrand(adultPortalBrand ?? null)
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
        <MemberMyRunningStatusCard
          memberId={runningLeagueHome.participant?.member_id}
          memberName={runningLeagueHome.participant?.member?.name ?? '회원'}
          runningLeagueHome={runningLeagueHome}
          memberLinked={Boolean(runningLeagueHome.participant?.member_id)}
        />
        <MemberRunnerLevelCard
          home={
            rewardHome ??
            (runningLeagueHome.participant?.member_id ? null : { unlinked: true })
          }
          memberLinked={Boolean(runningLeagueHome.participant?.member_id)}
        />
        <MemberRaffleEventCard
          home={raffleHome}
          memberLinked={Boolean(runningLeagueHome.participant?.member_id)}
          readOnly
        />
        <MemberRunningStreakCard
          status={
            runningStreak ??
            (runningLeagueHome.participant?.member_id ? null : { unlinked: true })
          }
          memberLinked={Boolean(runningLeagueHome.participant?.member_id)}
        />
        <MemberRivalCard
          rivalHome={
            rivalHome ??
            (runningLeagueHome.participant?.member_id ? null : { unlinked: true })
          }
          memberLinked={Boolean(runningLeagueHome.participant?.member_id)}
          readOnly
        />
        <MemberWeeklyMissionsCard
          view={
            weeklyMissions ??
            (runningLeagueHome.participant?.member_id ? null : { unlinked: true })
          }
          memberLinked={Boolean(runningLeagueHome.participant?.member_id)}
        />
        <MemberTeamBattleCard
          home={teamBattleHome}
          memberLinked={Boolean(runningLeagueHome.participant?.member_id)}
        />
        <MemberMvpCard
          home={
            mvpHome ??
            (runningLeagueHome.participant?.member_id ? null : { unlinked: true })
          }
          memberLinked={Boolean(runningLeagueHome.participant?.member_id)}
        />
        <MemberAchievementsCard
          home={
            achievementsHome ??
            (runningLeagueHome.participant?.member_id ? null : { unlinked: true })
          }
          memberLinked={Boolean(runningLeagueHome.participant?.member_id)}
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
