'use client'

import { MemberRunningLeagueRankings } from '@/components/dashboard/member-running-league-rankings'
import { MemberPortalBrandHeader } from '@/components/dashboard/member-portal-brand-header'
import { AttendanceRouletteWheel } from '@/components/dashboard/attendance-roulette-wheel'
import { MemberRunningLeagueTrainingSchedule } from '@/components/dashboard/member-running-league-training-schedule'
import { MemberPortalNoticePanel } from '@/components/dashboard/member-portal-notice-panel'
import type { MemberRunningLeagueHome } from '@/lib/actions/running-league'
import type { CenterRunningTrainingScheduleBundle } from '@/lib/actions/center-running-training-schedule'
import { resolveAdultPortalBrand } from '@/lib/adult-portal-brand'
import type { CenterSettings } from '@/lib/types'
import { MEMBER_PORTAL_SHELL_CLASS } from '@/lib/running-league/member-portal-layout'
import { cn } from '@/lib/utils'

type AdultRunningPortalAdminViewProps = {
  runningLeagueHome: MemberRunningLeagueHome
  centerTrainingSchedule: CenterRunningTrainingScheduleBundle
  chaseMemberId?: string | null
  chaseLabel?: string | null
  adultPortalNotice?: string | null
  adultPortalBrand?: Pick<
    CenterSettings,
    | 'adult_portal_brand_eyebrow'
    | 'adult_portal_brand_title'
    | 'adult_portal_brand_eyebrow_color'
    | 'adult_portal_brand_title_color'
    | 'adult_portal_brand_eyebrow_size'
    | 'adult_portal_brand_title_size'
    | 'adult_portal_brand_eyebrow_weight'
    | 'adult_portal_brand_title_weight'
    | 'adult_portal_brand_hidden'
  > | null
}

export function AdultRunningPortalAdminView({
  runningLeagueHome,
  centerTrainingSchedule,
  chaseMemberId = null,
  chaseLabel = null,
  adultPortalNotice = null,
  adultPortalBrand = null,
}: AdultRunningPortalAdminViewProps) {
  const portalBrand = resolveAdultPortalBrand(adultPortalBrand)
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
            runningLeagueHome.rankingBundle ? (
              <AttendanceRouletteWheel
                rankingBundle={runningLeagueHome.rankingBundle}
                canSpin
              />
            ) : null
          }
        />
        <MemberPortalNoticePanel notice={adultPortalNotice} />
        <MemberRunningLeagueTrainingSchedule
          days={trainingScheduleDays}
          tableReady={trainingScheduleReady}
          canParticipate={false}
          readOnly
          embedded
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
