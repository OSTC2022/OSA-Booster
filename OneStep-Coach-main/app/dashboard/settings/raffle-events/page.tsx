import { redirect } from 'next/navigation'
import { requireDashboardProfile } from '@/lib/auth/dashboard-user'
import { canAccessSettingsArea } from '@/lib/operator-access'
import { listRafflesAdmin } from '@/lib/actions/raffles'
import { RaffleEventsSettingsPanel } from '@/components/dashboard/raffle-events-settings-panel'

export const dynamic = 'force-dynamic'

export default async function RaffleEventsSettingsPage() {
  const user = await requireDashboardProfile()
  if (!canAccessSettingsArea(user.role)) redirect('/unauthorized')

  const result = await listRafflesAdmin()

  return (
    <RaffleEventsSettingsPanel
      initialEvents={result.events}
      tableReady={result.tableReady}
      loadError={result.error}
    />
  )
}
