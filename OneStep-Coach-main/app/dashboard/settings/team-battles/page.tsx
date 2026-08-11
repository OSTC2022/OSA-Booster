import { redirect } from 'next/navigation'
import { requireDashboardProfile } from '@/lib/auth/dashboard-user'
import { canAccessSettingsArea } from '@/lib/operator-access'
import {
  listTeamBattleMemberCandidates,
  listTeamBattlesAdmin,
} from '@/lib/actions/team-battles'
import { TeamBattlesSettingsPanel } from '@/components/dashboard/team-battles-settings-panel'

export const dynamic = 'force-dynamic'

export default async function TeamBattlesSettingsPage() {
  const user = await requireDashboardProfile()
  if (!canAccessSettingsArea(user.role)) redirect('/unauthorized')

  const [battlesResult, candidatesResult] = await Promise.all([
    listTeamBattlesAdmin(),
    listTeamBattleMemberCandidates(),
  ])

  if ('error' in battlesResult) {
    return (
      <TeamBattlesSettingsPanel
        initialBattles={[]}
        candidates={'error' in candidatesResult ? [] : candidatesResult.candidates}
        tableReady={false}
        loadError={battlesResult.error}
      />
    )
  }

  return (
    <TeamBattlesSettingsPanel
      initialBattles={battlesResult.battles}
      candidates={'error' in candidatesResult ? [] : candidatesResult.candidates}
      tableReady={battlesResult.tableReady}
      loadError={'error' in candidatesResult ? candidatesResult.error : null}
    />
  )
}
