import { redirect } from 'next/navigation'
import { getAdultRunningPortalAdminPreview } from '@/lib/actions/running-league'
import { getCenterRunningTrainingScheduleAdminPreview } from '@/lib/actions/center-running-training-schedule'
import { getCenterSettings } from '@/lib/actions/center-settings'
import { requireDashboardProfile } from '@/lib/auth/dashboard-user'
import { AdultRunningPortalAdminView } from '@/components/dashboard/adult-running-portal-admin-view'
import { AdultRunningPortalSettingsBanner } from '@/components/dashboard/adult-running-portal-settings-banner'
import { AdultPortalBlindSettingsPanel } from '@/components/dashboard/adult-portal-blind-settings-panel'
import { AdultPortalBrandSettingsPanel } from '@/components/dashboard/adult-portal-brand-settings-panel'
import { AdultPortalRankingPeriodSettingsPanel } from '@/components/dashboard/adult-portal-ranking-period-settings-panel'
import { AdultPortalChaseSettingsPanel } from '@/components/dashboard/adult-portal-chase-settings-panel'
import { AdultPortalNoticeSettingsPanel } from '@/components/dashboard/adult-portal-notice-settings-panel'

export const dynamic = 'force-dynamic'

export default async function AdultRunningPortalSettingsPage() {
  const user = await requireDashboardProfile()
  if (user.role !== 'admin') redirect('/unauthorized')

  const [runningLeagueHome, centerTrainingSchedule, centerSettings] = await Promise.all([
    getAdultRunningPortalAdminPreview(),
    getCenterRunningTrainingScheduleAdminPreview(),
    getCenterSettings(),
  ])

  return (
    <div className="space-y-4">
      <AdultRunningPortalSettingsBanner />
      <AdultPortalBlindSettingsPanel centerSettings={centerSettings} />
      <AdultPortalBrandSettingsPanel centerSettings={centerSettings} />
      <AdultPortalNoticeSettingsPanel centerSettings={centerSettings} />
      <AdultPortalRankingPeriodSettingsPanel centerSettings={centerSettings} />
      <AdultPortalChaseSettingsPanel
        centerSettings={centerSettings}
        rankingBundle={runningLeagueHome.rankingBundle}
      />
      <AdultRunningPortalAdminView
        runningLeagueHome={runningLeagueHome}
        centerTrainingSchedule={centerTrainingSchedule}
        chaseMemberId={centerSettings.adult_portal_chase_member_id}
        chaseLabel={centerSettings.adult_portal_chase_label}
        adultPortalNotice={centerSettings.adult_portal_notice}
        adultPortalBrand={centerSettings}
      />
    </div>
  )
}
