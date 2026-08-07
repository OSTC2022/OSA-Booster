import { redirect } from 'next/navigation'
import { requireDashboardProfile } from '@/lib/auth/dashboard-user'
import { isOperatorRole } from '@/lib/operator-access'
import { getMyOperatorContactSettings } from '@/lib/actions/operator-contact'
import { OperatorContactSettingsPanel } from '@/components/settings/operator-contact-settings-panel'

export default async function OperatorContactSettingsPage() {
  const user = await requireDashboardProfile()
  if (!isOperatorRole(user.role) && user.role !== 'admin') {
    redirect('/unauthorized')
  }

  const settings = await getMyOperatorContactSettings()
  if ('error' in settings) {
    return (
      <p className="text-sm text-destructive">{settings.error}</p>
    )
  }

  return (
    <OperatorContactSettingsPanel
      userId={user.id}
      initialKakaoId={settings.kakao_id}
      initialInstagramId={settings.instagram_id}
      initialKakaoQrUrl={settings.kakao_qr_url}
    />
  )
}
