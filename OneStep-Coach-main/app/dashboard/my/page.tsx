import { redirect } from 'next/navigation'
import { getMemberPortalData } from '@/lib/actions/member-portal'
import { getCenterRunningTrainingScheduleForMember } from '@/lib/actions/center-running-training-schedule'
import { getMemberRunningLeagueHome } from '@/lib/actions/running-league'
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
  const [data, runningLeagueHome, centerTrainingSchedule, centerSettings, marathonBundle, noticeBoardPosts] =
    await Promise.all([
      getMemberPortalData(),
      isAdultPortal ? getMemberRunningLeagueHome() : Promise.resolve(null),
      isAdultPortal ? getCenterRunningTrainingScheduleForMember() : Promise.resolve(null),
      getCenterSettings(),
      isAdultPortal
        ? listPortalMarathonRacesForMember()
        : Promise.resolve({ races: [], tableReady: true }),
      isAdultPortal ? getPublishedCenterBoardPosts('notice') : Promise.resolve([]),
    ])

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
