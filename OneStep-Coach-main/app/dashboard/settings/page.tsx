import { redirect } from 'next/navigation'
import { listPendingAccounts } from '@/lib/actions/auth-registration'
import {
  listInstructorsForSettings,
  listRegisteredAccounts,
} from '@/lib/actions/settings-accounts'
import { requireDashboardProfile } from '@/lib/auth/dashboard-user'
import { canAccessSettingsArea } from '@/lib/operator-access'
import { AccountRoleManagement } from './account-role-management'

export default async function SettingsPage() {
  const user = await requireDashboardProfile()
  if (!canAccessSettingsArea(user.role)) redirect('/unauthorized')

  const operatorMode = user.role === 'operator'

  const [accounts, instructors, pending] = operatorMode
    ? await Promise.all([
        Promise.resolve([]),
        listInstructorsForSettings(),
        listPendingAccounts(),
      ])
    : await Promise.all([
        listRegisteredAccounts(),
        listInstructorsForSettings(),
        listPendingAccounts(),
      ])

  return (
    <AccountRoleManagement
      initialAccounts={accounts}
      initialInstructors={instructors}
      initialPending={pending}
      operatorMode={operatorMode}
    />
  )
}
