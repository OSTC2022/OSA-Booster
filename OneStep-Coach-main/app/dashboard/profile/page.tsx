import { requireDashboardProfile } from '@/lib/auth/dashboard-user'
import { getMyProfileSettings } from '@/lib/actions/profile-settings'
import { isAdultPortalUser } from '@/lib/member-portal-routes'
import { ProfileEditPage } from '@/components/dashboard/profile-edit-page'

export default async function DashboardProfilePage() {
  const profile = await requireDashboardProfile()
  const settings = await getMyProfileSettings()
  const isPortalUser = isAdultPortalUser(profile.role)

  return (
    <div className="space-y-6 pt-12 lg:pt-0">
      <ProfileEditPage
        user={profile}
        backHref={isPortalUser ? '/dashboard/my' : '/dashboard'}
        backLabel={isPortalUser ? '홈' : '대시보드'}
        memberGender={settings?.gender ?? null}
        showMemberGender={isPortalUser}
        portalStatusMessage={settings?.portal_status_message ?? ''}
        portalStatusMessageColor={settings?.portal_status_message_color}
        showPortalStatusMessage={isPortalUser}
        hasLinkedMember={settings?.has_linked_member ?? false}
      />
    </div>
  )
}
