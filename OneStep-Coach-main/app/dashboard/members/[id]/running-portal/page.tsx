import { notFound } from 'next/navigation'
import { getMemberPortalDataForStaff } from '@/lib/actions/member-portal'
import { getCenterRunningTrainingScheduleForMember } from '@/lib/actions/center-running-training-schedule'
import { getMemberRunningLeagueHomeForStaff } from '@/lib/actions/running-league'
import { getCenterSettings } from '@/lib/actions/center-settings'
import { getMemberLinkedProfileRole } from '@/lib/actions/member-account'
import { resolveAdultPortalBrand } from '@/lib/adult-portal-brand'
import { requireMemberViewer } from '@/lib/auth/member-access'
import { MemberRunningPortalAdminBanner } from '@/components/dashboard/member-running-portal-admin-banner'
import { MemberMyPage } from '@/app/dashboard/my/member-my-page'

export const dynamic = 'force-dynamic'

export default async function MemberRunningPortalPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireMemberViewer()
  const { id } = await params

  const linkedRole = await getMemberLinkedProfileRole(id)
  if (linkedRole !== 'adult_member') notFound()

  const [data, runningLeagueHome, centerTrainingSchedule, centerSettings] = await Promise.all([
    getMemberPortalDataForStaff(id),
    getMemberRunningLeagueHomeForStaff(id),
    getCenterRunningTrainingScheduleForMember(),
    getCenterSettings(),
  ])

  if (!data) notFound()

  return (
    <div className="space-y-4">
      <MemberRunningPortalAdminBanner
        memberId={id}
        memberName={data.member.name}
        current="home"
      />
      <MemberMyPage
        data={data}
        role="adult_member"
        runningLeagueHome={runningLeagueHome}
        centerTrainingSchedule={centerTrainingSchedule}
        adminPreview
        runningLeagueHref={`/dashboard/members/${id}/running-portal/league`}
        adultPortalBlindMemberUsage={centerSettings.adult_portal_blind_member_usage ?? false}
        adultPortalBrand={resolveAdultPortalBrand(centerSettings)}
        adultPortalNotice={centerSettings.adult_portal_notice}
      />
    </div>
  )
}
