import { redirect } from 'next/navigation'
import { getMemberPortalData } from '@/lib/actions/member-portal'
import { getCenterRunningTrainingScheduleForMember } from '@/lib/actions/center-running-training-schedule'
import { getMemberRunningLeagueHome } from '@/lib/actions/running-league'
import { getMemberWeeklyMissionsHome } from '@/lib/actions/weekly-missions'
import { getMemberRunningStreakHome } from '@/lib/actions/running-streak'
import { getMemberRivalHome } from '@/lib/actions/member-rivals'
import { getMemberTeamBattleHome } from '@/lib/actions/team-battles'
import { getMemberMvpHome } from '@/lib/actions/mvp'
import { getMemberAchievementsHome } from '@/lib/actions/achievements'
import { getMemberRewardHome } from '@/lib/actions/rewards'
import { getMemberRaffleHome } from '@/lib/actions/raffles'
import { getMyGarminConnectionStatus } from '@/lib/actions/garmin-connections'
import { getCenterSettings } from '@/lib/actions/center-settings'
import { listPortalMarathonRacesForMember } from '@/lib/actions/portal-marathon-races'
import { getPublishedCenterBoardPosts } from '@/lib/actions/center-board'
import { getDashboardProfile } from '@/lib/auth/dashboard-user'
import { resolveAdultPortalBrand } from '@/lib/adult-portal-brand'
import { MemberPortalUnavailable } from '@/components/dashboard/member-portal-unavailable'
import { isAdultPortalUser, isMemberPortalRole } from '@/lib/member-portal-routes'
import { MemberMyPage } from './member-my-page'

export default async function MyDashboardPage() {
  const profile = await getDashboardProfile()
  const isAdultPortal = profile ? isAdultPortalUser(profile.role) : false
  const [data, runningLeagueHome, runningStreak, weeklyMissions, centerTrainingSchedule, centerSettings, marathonBundle, noticeBoardPosts] =
    await Promise.all([
      getMemberPortalData(),
      isAdultPortal ? getMemberRunningLeagueHome() : Promise.resolve(null),
      isAdultPortal ? getMemberRunningStreakHome() : Promise.resolve(null),
      isAdultPortal ? getMemberWeeklyMissionsHome() : Promise.resolve(null),
      isAdultPortal ? getCenterRunningTrainingScheduleForMember() : Promise.resolve(null),
      getCenterSettings(),
      isAdultPortal
        ? listPortalMarathonRacesForMember()
        : Promise.resolve({ races: [], tableReady: true }),
      isAdultPortal ? getPublishedCenterBoardPosts('notice') : Promise.resolve([]),
    ])

  const rivalHome =
    isAdultPortal && data
      ? await getMemberRivalHome({
          memberId: data.member.id,
          memberName: data.member.name,
          runningLeagueHome,
        })
      : null

  const teamBattleHome =
    isAdultPortal && data
      ? await getMemberTeamBattleHome(data.member.id)
      : null

  const mvpHome =
    isAdultPortal && data ? await getMemberMvpHome(data.member.id) : null

  const achievementsHome =
    isAdultPortal && data ? await getMemberAchievementsHome(data.member.id) : null

  const rewardHome =
    isAdultPortal && data ? await getMemberRewardHome(data.member.id) : null

  const raffleHome =
    isAdultPortal && data ? await getMemberRaffleHome(data.member.id) : null

  const garminConnection =
    isAdultPortal && data
      ? await getMyGarminConnectionStatus().then((r) => (r.ok ? r.connection : null))
      : null

  if (!data) {
    if (profile?.role === 'admin' || profile?.role === 'instructor') {
      redirect('/dashboard')
    }
    if (profile && isMemberPortalRole(profile.role)) {
      return <MemberPortalUnavailable userName={profile.full_name} />
    }
    redirect('/auth/login')
  }

  return (
    <MemberMyPage
      data={data}
      role={profile?.role}
      runningLeagueHome={runningLeagueHome}
      runningStreak={runningStreak}
      rivalHome={rivalHome}
      weeklyMissions={weeklyMissions}
      teamBattleHome={teamBattleHome}
      mvpHome={mvpHome}
      achievementsHome={achievementsHome}
      rewardHome={rewardHome}
      raffleHome={raffleHome}
      garminConnection={garminConnection}
      centerTrainingSchedule={centerTrainingSchedule}
      adultPortalBlindMemberUsage={
        isAdultPortal && (centerSettings.adult_portal_blind_member_usage ?? false)
      }
      adultPortalBrand={isAdultPortal ? resolveAdultPortalBrand(centerSettings) : null}
      adultPortalNotice={isAdultPortal ? centerSettings.adult_portal_notice : null}
      noticeBoardPosts={isAdultPortal ? noticeBoardPosts : []}
      marathonRaces={isAdultPortal ? marathonBundle.races : []}
      marathonTableReady={isAdultPortal ? marathonBundle.tableReady : true}
    />
  )
}
