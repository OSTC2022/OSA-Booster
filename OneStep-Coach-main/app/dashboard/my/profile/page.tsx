import { redirect } from 'next/navigation'
import { getDashboardProfile } from '@/lib/auth/dashboard-user'
import { getMyProfileSettings } from '@/lib/actions/profile-settings'
import { isAdultPortalUser } from '@/lib/member-portal-routes'
import { ProfileEditPage } from '@/components/dashboard/profile-edit-page'

export default async function MemberProfilePage() {
  const profile = await getDashboardProfile()
  if (!profile) redirect('/auth/login')

  const settings = await getMyProfileSettings()

  return (
    <ProfileEditPage
      user={profile}
      backHref="/dashboard/my"
      backLabel="홈"
      memberGender={settings?.gender ?? null}
      showMemberGender={isAdultPortalUser(profile.role)}
      portalStatusMessage={settings?.portal_status_message ?? ''}
      portalStatusMessageColor={settings?.portal_status_message_color}
      showPortalStatusMessage={isAdultPortalUser(profile.role)}
      hasLinkedMember={settings?.has_linked_member ?? false}
    />
  )
}
