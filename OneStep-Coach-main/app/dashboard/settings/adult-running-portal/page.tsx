import { redirect } from 'next/navigation'
import { getAdultRunningPortalAdminPreview } from '@/lib/actions/running-league'
import { getCenterRunningTrainingScheduleAdminPreview } from '@/lib/actions/center-running-training-schedule'
import { getCenterSettings } from '@/lib/actions/center-settings'
import { requireDashboardProfile } from '@/lib/auth/dashboard-user'
import { canAccessSettingsArea } from '@/lib/operator-access'
import { AdultRunningPortalAdminView } from '@/components/dashboard/adult-running-portal-admin-view'
import { AdultRunningPortalSettingsBanner } from '@/components/dashboard/adult-running-portal-settings-banner'
import { AdultPortalBlindSettingsPanel } from '@/components/dashboard/adult-portal-blind-settings-panel'
import { AdultPortalBrandSettingsPanel } from '@/components/dashboard/adult-portal-brand-settings-panel'
import { AdultPortalRankingPeriodSettingsPanel } from '@/components/dashboard/adult-portal-ranking-period-settings-panel'
import { AdultPortalChaseSettingsPanel } from '@/components/dashboard/adult-portal-chase-settings-panel'
import { AdultPortalMileageMinimumSettingsPanel } from '@/components/dashboard/adult-portal-mileage-minimum-settings-panel'
import { AdultPortalAnimalTierHalfSettingsPanel } from '@/components/dashboard/adult-portal-animal-tier-half-settings-panel'
import { AdultPortalNoticeSettingsPanel } from '@/components/dashboard/adult-portal-notice-settings-panel'
import { AdultPortalRankingResetPanel } from '@/components/dashboard/adult-portal-ranking-reset-panel'
import { AdultPortalCompetitionModeSettingsPanel } from '@/components/dashboard/adult-portal-competition-mode-settings-panel'
import { PortalMileageTeamsSettingsPanel } from '@/components/dashboard/portal-mileage-teams-settings-panel'
import { PortalMarathonRacesSettingsPanel } from '@/components/dashboard/portal-marathon-races-settings-panel'
import { getPortalMileageTeamsAdmin } from '@/lib/actions/portal-mileage-teams'
import { listPortalMarathonRacesAdmin } from '@/lib/actions/portal-marathon-races'
import { getMemberWeeklyMissionsHome, listWeeklyMissionsAdmin } from '@/lib/actions/weekly-missions'
import { getMemberRunningStreakHome } from '@/lib/actions/running-streak'
import { getMemberRivalHome } from '@/lib/actions/member-rivals'
import {
  getMemberTeamBattleHome,
  listTeamBattleMemberCandidates,
  listTeamBattlesAdmin,
} from '@/lib/actions/team-battles'
import { getMemberMvpHome } from '@/lib/actions/mvp'
import { getMemberAchievementsHome } from '@/lib/actions/achievements'
import { getMemberRewardHome } from '@/lib/actions/rewards'
import { getMemberRaffleHome, listRafflesAdmin } from '@/lib/actions/raffles'
import { getCenterBoardPostsForAdmin } from '@/lib/actions/center-board'
import { WeeklyMissionsSettingsPanel } from '@/components/dashboard/weekly-missions-settings-panel'
import { TeamBattlesSettingsPanel } from '@/components/dashboard/team-battles-settings-panel'
import { RaffleEventsSettingsPanel } from '@/components/dashboard/raffle-events-settings-panel'
import { GarminSyncAdminPanel } from '@/components/dashboard/garmin-sync-admin-panel'

export const dynamic = 'force-dynamic'

export default async function AdultRunningPortalSettingsPage() {
  const user = await requireDashboardProfile()
  if (!canAccessSettingsArea(user.role)) redirect('/unauthorized')

  const runningLeagueHome = await getAdultRunningPortalAdminPreview()
  const previewMemberId = runningLeagueHome.participant?.member_id ?? null

  const [
    weeklyMissions,
    runningStreak,
    weeklyMissionsAdmin,
    teamBattlesAdmin,
    teamBattleCandidates,
    teamBattleHome,
    mvpHome,
    achievementsHome,
    rewardHome,
    raffleHome,
    rafflesAdmin,
    centerTrainingSchedule,
    centerSettings,
    mileageTeams,
    marathonRaces,
    noticeBoardPosts,
  ] = await Promise.all([
    getMemberWeeklyMissionsHome(previewMemberId),
    getMemberRunningStreakHome(previewMemberId),
    listWeeklyMissionsAdmin(),
    listTeamBattlesAdmin(),
    listTeamBattleMemberCandidates(),
    getMemberTeamBattleHome(previewMemberId),
    getMemberMvpHome(previewMemberId),
    getMemberAchievementsHome(previewMemberId),
    getMemberRewardHome(previewMemberId),
    getMemberRaffleHome(previewMemberId),
    listRafflesAdmin(),
    getCenterRunningTrainingScheduleAdminPreview(),
    getCenterSettings(),
    getPortalMileageTeamsAdmin(),
    listPortalMarathonRacesAdmin(),
    getCenterBoardPostsForAdmin('notice', 'adult'),
  ])

  const rivalHome = previewMemberId
    ? await getMemberRivalHome({
        memberId: previewMemberId,
        memberName: runningLeagueHome.participant?.member?.name ?? '회원',
        runningLeagueHome,
      })
    : { unlinked: true as const }

  return (
    <div className="space-y-4">
      <AdultRunningPortalSettingsBanner />
      <AdultPortalBlindSettingsPanel centerSettings={centerSettings} />
      <AdultPortalBrandSettingsPanel centerSettings={centerSettings} />
      <AdultPortalNoticeSettingsPanel centerSettings={centerSettings} />
      {'error' in marathonRaces ? (
        <PortalMarathonRacesSettingsPanel
          initialRaces={[]}
          tableReady={false}
          loadError={marathonRaces.error}
        />
      ) : (
        <PortalMarathonRacesSettingsPanel
          initialRaces={marathonRaces.races}
          tableReady={marathonRaces.tableReady}
        />
      )}
      {'error' in weeklyMissionsAdmin ? (
        <WeeklyMissionsSettingsPanel
          initialMissions={[]}
          tableReady={false}
          loadError={weeklyMissionsAdmin.error}
        />
      ) : (
        <WeeklyMissionsSettingsPanel
          initialMissions={weeklyMissionsAdmin.missions}
          tableReady={weeklyMissionsAdmin.tableReady}
        />
      )}
      {'error' in teamBattlesAdmin ? (
        <TeamBattlesSettingsPanel
          initialBattles={[]}
          candidates={'error' in teamBattleCandidates ? [] : teamBattleCandidates.candidates}
          tableReady={false}
          loadError={teamBattlesAdmin.error}
        />
      ) : (
        <TeamBattlesSettingsPanel
          initialBattles={teamBattlesAdmin.battles}
          candidates={'error' in teamBattleCandidates ? [] : teamBattleCandidates.candidates}
          tableReady={teamBattlesAdmin.tableReady}
          loadError={'error' in teamBattleCandidates ? teamBattleCandidates.error : null}
        />
      )}
      <RaffleEventsSettingsPanel
        initialEvents={rafflesAdmin.events}
        tableReady={rafflesAdmin.tableReady}
        loadError={rafflesAdmin.error}
      />
      <AdultPortalRankingPeriodSettingsPanel centerSettings={centerSettings} />
      <AdultPortalMileageMinimumSettingsPanel centerSettings={centerSettings} />
      <AdultPortalAnimalTierHalfSettingsPanel centerSettings={centerSettings} />
      <AdultPortalChaseSettingsPanel
        centerSettings={centerSettings}
        rankingBundle={runningLeagueHome.rankingBundle}
      />
      <AdultPortalCompetitionModeSettingsPanel
        centerSettings={centerSettings}
        teamCount={'error' in mileageTeams ? 0 : mileageTeams.teams.filter((t) => t.is_active).length}
      />
      {(user.role === 'admin' || user.role === 'operator') ? (
        <GarminSyncAdminPanel />
      ) : null}
      {'error' in mileageTeams ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          팀전 설정을 불러오지 못했습니다: {mileageTeams.error}
        </p>
      ) : (
        <PortalMileageTeamsSettingsPanel
          initialTeams={mileageTeams.teams}
          initialMemberships={mileageTeams.memberships}
          rankingBundle={runningLeagueHome.rankingBundle}
        />
      )}
      {(user.role === 'admin' || user.role === 'operator') ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/20 px-4 py-3">
          <p className="text-sm text-muted-foreground">
            집계 기간 <span className="font-medium text-foreground">{runningLeagueHome.rankingPeriod.label}</span>
            의 마일리지·출석·이겨라를 비우고 새로 시작할 수 있습니다.
          </p>
          <AdultPortalRankingResetPanel rankingPeriod={runningLeagueHome.rankingPeriod} />
        </div>
      ) : null}
      <AdultRunningPortalAdminView
        runningLeagueHome={runningLeagueHome}
        runningStreak={runningStreak}
        rivalHome={rivalHome}
        weeklyMissions={weeklyMissions}
        teamBattleHome={teamBattleHome}
        mvpHome={mvpHome}
        achievementsHome={achievementsHome}
        rewardHome={rewardHome}
        raffleHome={raffleHome}
        centerTrainingSchedule={centerTrainingSchedule}
        chaseMemberId={centerSettings.adult_portal_chase_member_id}
        chaseLabel={centerSettings.adult_portal_chase_label}
        adultPortalNotice={centerSettings.adult_portal_notice}
        noticeBoardPosts={noticeBoardPosts.filter((post) => post.is_published)}
        adultPortalBrand={centerSettings}
        marathonRaces={'error' in marathonRaces ? [] : marathonRaces.races}
        marathonTableReady={'error' in marathonRaces ? false : marathonRaces.tableReady}
      />
    </div>
  )
}
