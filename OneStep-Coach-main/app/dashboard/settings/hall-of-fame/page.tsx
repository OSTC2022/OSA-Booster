import { getHallOfFameSettingsList } from '@/lib/actions/hall-of-fame'
import { HallOfFameSettingsPanel } from '@/components/settings/hall-of-fame-settings-panel'

export default async function HallOfFameSettingsPage() {
  const result = await getHallOfFameSettingsList()
  if ('error' in result) {
    return <p className="text-sm text-destructive">{result.error}</p>
  }

  return <HallOfFameSettingsPanel initialEntries={result.entries} />
}
