import { redirect } from 'next/navigation'
import { getMemberPortalData } from '@/lib/actions/member-portal'
import { getCenterRunningTrainingScheduleForMember } from '@/lib/actions/center-running-training-schedule'
import { getMemberRunningLeagueHome } from '@/lib/actions/running-league'
import { getCenterSettings } from '@/lib/actions/center-settings'
import { getDashboardProfile } from '@/lib/auth/dashboard-user'
import { resolveAdultPortalBrand } from '@/lib/adult-portal-brand'
import { MemberPortalUnavailable } from '@/components/dashboard/member-portal-unavailable'
import { isMemberPortalRole } from '@/lib/member-portal-routes'
import { MemberMyPage } from './member-my-page'

export default async function MyDashboardPage() {
  const profile = await getDashboardProfile()
  const [data, runningLeagueHome, centerTrainingSchedule, centerSettings] = await Promise.all([
    getMemberPortalData(),
    profile?.role === 'adult_member' ? getMemberRunningLeagueHome() : Promise.resolve(null),
    profile?.role === 'adult_member'
      ? getCenterRunningTrainingScheduleForMember()
      : Promise.resolve(null),
    getCenterSettings(),
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
        profile?.role === 'adult_member' &&
        (centerSettings.adult_portal_blind_member_usage ?? false)
      }
      adultPortalBrand={
        profile?.role === 'adult_member' ? resolveAdultPortalBrand(centerSettings) : null
      }
      adultPortalNotice={
        profile?.role === 'adult_member' ? centerSettings.adult_portal_notice : null
      }
    />
  )
}
