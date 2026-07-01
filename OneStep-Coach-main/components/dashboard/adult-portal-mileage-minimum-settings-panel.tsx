'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Route } from 'lucide-react'
import { toast } from 'sonner'
import { updateCenterSettings } from '@/lib/actions/center-settings'
import { DEFAULT_MILEAGE_MIN_KM } from '@/lib/running-league/mileage-recognition'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import type { CenterSettings } from '@/lib/types'

type AdultPortalMileageMinimumSettingsPanelProps = {
  centerSettings: CenterSettings
}

function formatMinKmPreview(enabled: boolean, minKm: number): string {
  if (!enabled) return '모든 거리가 마일리지에 반영됩니다.'
  return `${minKm.toFixed(1)}km 이상 기록만 마일리지 랭킹·집계에 인정됩니다.`
}

export function AdultPortalMileageMinimumSettingsPanel({
  centerSettings,
}: AdultPortalMileageMinimumSettingsPanelProps) {
  const router = useRouter()
  const [isSaving, setIsSaving] = useState(false)
  const enabled = centerSettings.adult_portal_mileage_min_km_enabled ?? false
  const [minKmInput, setMinKmInput] = useState(
    String(centerSettings.adult_portal_mileage_min_km ?? DEFAULT_MILEAGE_MIN_KM),
  )

  const previewLabel = useMemo(() => {
    const parsed = Number(minKmInput)
    const minKm =
      Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 10) / 10 : DEFAULT_MILEAGE_MIN_KM
    return formatMinKmPreview(enabled, minKm)
  }, [enabled, minKmInput])

  async function handleToggle(checked: boolean) {
    setIsSaving(true)
    const result = await updateCenterSettings({
      adult_portal_mileage_min_km_enabled: checked,
    })
    setIsSaving(false)

    if (result.error) {
      toast.error('저장 실패', { description: result.error })
      return
    }

    toast.success(
      checked
        ? '마일리지 최소 거리 규칙이 적용됩니다.'
        : '마일리지 최소 거리 규칙이 해제되었습니다.',
    )
    router.refresh()
  }

  async function handleSaveMinKm() {
    const parsed = Number(minKmInput)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      toast.error('최소 거리는 0보다 큰 숫자로 입력해주세요.')
      return
    }

    const minKm = Math.round(parsed * 10) / 10
    setIsSaving(true)
    const result = await updateCenterSettings({
      adult_portal_mileage_min_km: minKm,
    })
    setIsSaving(false)

    if (result.error) {
      toast.error('저장 실패', { description: result.error })
      return
    }

    setMinKmInput(String(minKm))
    toast.success(`마일리지 인정 최소 거리가 ${minKm.toFixed(1)}km로 저장되었습니다.`)
    router.refresh()
  }

  return (
    <Card className="border-border/70">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Route className="h-4 w-4 text-muted-foreground" />
          마일리지 최소 거리
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs leading-relaxed text-muted-foreground sm:text-sm">
          켜면 설정한 거리 이상의 러닝 기록만 마일리지 랭킹·그래프·이겨라 집계에 반영됩니다.
          예: 3km 최소면 3.0km부터 인정되고, 그보다 짧은 기록은 제외됩니다.
        </p>

        <div className="flex flex-col gap-3 rounded-lg border border-border/60 bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium">최소 거리 규칙</p>
            <p className="text-xs text-muted-foreground">{previewLabel}</p>
          </div>
          <div className="flex items-center gap-2.5 sm:shrink-0">
            <Label htmlFor="adult-portal-mileage-min-enabled" className="text-sm">
              {enabled ? '사용' : '미사용'}
            </Label>
            <Switch
              id="adult-portal-mileage-min-enabled"
              checked={enabled}
              disabled={isSaving}
              onCheckedChange={handleToggle}
            />
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="grid flex-1 gap-1.5">
            <Label htmlFor="adult-portal-mileage-min-km">최소 거리 (km)</Label>
            <Input
              id="adult-portal-mileage-min-km"
              type="number"
              min={0.1}
              step={0.1}
              inputMode="decimal"
              value={minKmInput}
              disabled={isSaving || !enabled}
              onChange={(event) => setMinKmInput(event.target.value)}
            />
          </div>
          <Button
            type="button"
            variant="secondary"
            disabled={isSaving || !enabled}
            onClick={handleSaveMinKm}
          >
            거리 저장
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
