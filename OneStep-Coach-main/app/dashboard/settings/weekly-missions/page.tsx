import { redirect } from 'next/navigation'
import { requireDashboardProfile } from '@/lib/auth/dashboard-user'
import { canAccessSettingsArea } from '@/lib/operator-access'
import { listWeeklyMissionsAdmin } from '@/lib/actions/weekly-missions'
import { WeeklyMissionsSettingsPanel } from '@/components/dashboard/weekly-missions-settings-panel'

export const dynamic = 'force-dynamic'

export default async function WeeklyMissionsSettingsPage() {
  const user = await requireDashboardProfile()
  if (!canAccessSettingsArea(user.role)) redirect('/unauthorized')

  const result = await listWeeklyMissionsAdmin()

  if ('error' in result) {
    return (
      <WeeklyMissionsSettingsPanel
        initialMissions={[]}
        tableReady={false}
        loadError={result.error}
      />
    )
  }

  return (
    <WeeklyMissionsSettingsPanel
      initialMissions={result.missions}
      tableReady={result.tableReady}
    />
  )
}
