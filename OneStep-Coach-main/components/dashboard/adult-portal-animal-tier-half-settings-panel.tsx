'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { Rabbit } from 'lucide-react'
import { toast } from 'sonner'
import { updateCenterSettings } from '@/lib/actions/center-settings'
import {
  formatMileageAnimalTierThreshold,
  MILEAGE_ANIMAL_TIERS,
  resolveAnimalTierHalfThresholdsActive,
} from '@/lib/running-league/mileage-animal-tier'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import type { CenterSettings } from '@/lib/types'

type AdultPortalAnimalTierHalfSettingsPanelProps = {
  centerSettings: CenterSettings
}

function toInputDate(value: string | null | undefined): string {
  const trimmed = value?.trim()
  if (!trimmed) return ''
  return trimmed.slice(0, 10)
}

function formatTierRangeLabel(
  tier: (typeof MILEAGE_ANIMAL_TIERS)[number],
  index: number,
  halfThresholds: boolean,
): string {
  const minLabel = formatMileageAnimalTierThreshold(tier, halfThresholds)
  const higherTiers = MILEAGE_ANIMAL_TIERS.slice(0, index)
  const nextHigher = higherTiers[0]
  if (!nextHigher) {
    return `${tier.emoji} ${tier.label} ${minLabel}`
  }
  const maxKm =
    Math.round((effectiveDisplayKm(nextHigher.minKm, halfThresholds) - 0.1) * 10) / 10
  if (maxKm <= 0) {
    return `${tier.emoji} ${tier.label} ${minLabel}`
  }
  return `${tier.emoji} ${tier.label} ${minLabel.replace('~', '')}~${maxKm}km`
}

function effectiveDisplayKm(minKm: number, halfThresholds: boolean): number {
  if (!halfThresholds || minKm <= 0) return minKm
  return Math.round((minKm / 2) * 10) / 10
}

export function AdultPortalAnimalTierHalfSettingsPanel({
  centerSettings,
}: AdultPortalAnimalTierHalfSettingsPanelProps) {
  const router = useRouter()
  const [isSaving, setIsSaving] = useState(false)
  const enabled = centerSettings.adult_portal_animal_tier_half_enabled ?? false
  const [startDate, setStartDate] = useState(
    toInputDate(centerSettings.adult_portal_animal_tier_half_start),
  )
  const [endDate, setEndDate] = useState(
    toInputDate(centerSettings.adult_portal_animal_tier_half_end),
  )

  const previewActive = useMemo(
    () =>
      resolveAnimalTierHalfThresholdsActive({
        adult_portal_animal_tier_half_enabled: enabled,
        adult_portal_animal_tier_half_start: startDate || null,
        adult_portal_animal_tier_half_end: endDate || null,
      }),
    [enabled, endDate, startDate],
  )

  const tierPreview = useMemo(() => {
    const reversed = [...MILEAGE_ANIMAL_TIERS].reverse()
    return reversed.map((tier, index) =>
      formatTierRangeLabel(tier, MILEAGE_ANIMAL_TIERS.length - 1 - index, previewActive),
    )
  }, [previewActive])

  async function handleToggle(checked: boolean) {
    setIsSaving(true)
    const result = await updateCenterSettings({
      adult_portal_animal_tier_half_enabled: checked,
    })
    setIsSaving(false)

    if (result.error) {
      toast.error('저장 실패', { description: result.error })
      return
    }

    toast.success(
      checked
        ? '동물 등급 절반 이벤트가 켜졌습니다.'
        : '동물 등급 절반 이벤트가 꺼졌습니다.',
    )
    router.refresh()
  }

  async function handleSavePeriod() {
    const trimmedStart = startDate.trim()
    const trimmedEnd = endDate.trim()

    if ((trimmedStart && !trimmedEnd) || (!trimmedStart && trimmedEnd)) {
      toast.error('시작일과 종료일을 모두 입력하거나, 둘 다 비워주세요.')
      return
    }
    if (trimmedStart && trimmedEnd && trimmedStart > trimmedEnd) {
      toast.error('시작일은 종료일보다 이전이어야 합니다.')
      return
    }

    setIsSaving(true)
    const result = await updateCenterSettings({
      adult_portal_animal_tier_half_start: trimmedStart || null,
      adult_portal_animal_tier_half_end: trimmedEnd || null,
    })
    setIsSaving(false)

    if (result.error) {
      toast.error('저장 실패', { description: result.error })
      return
    }

    toast.success('동물 등급 절반 이벤트 기간이 저장되었습니다.')
    router.refresh()
  }

  const todayLabel = format(new Date(), 'yyyy-MM-dd')

  return (
    <Card className="border-border/70">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Rabbit className="h-4 w-4 text-muted-foreground" />
          동물 등급 절반 이벤트
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs leading-relaxed text-muted-foreground sm:text-sm">
          켜면 설정 기간 동안 동물 등급 기준 거리가 절반으로 적용됩니다. 실제 누적 마일리지는
          변하지 않고, 등급 판정만 완화됩니다. 예: 15km면 거북이(평소 30km), 꺼지면 다시
          병아리입니다.
        </p>

        <div className="flex flex-col gap-3 rounded-lg border border-border/60 bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium">절반 이벤트</p>
            <p className="text-xs text-muted-foreground">
              {enabled
                ? previewActive
                  ? `오늘(${todayLabel}) 기준 적용 중`
                  : '켜져 있으나 오늘은 기간 밖입니다'
                : '꺼져 있음 — 일반 등급 기준'}
            </p>
          </div>
          <div className="flex items-center gap-2.5 sm:shrink-0">
            <Label htmlFor="adult-portal-animal-tier-half-enabled" className="text-sm">
              {enabled ? '사용' : '미사용'}
            </Label>
            <Switch
              id="adult-portal-animal-tier-half-enabled"
              checked={enabled}
              disabled={isSaving}
              onCheckedChange={handleToggle}
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="adult-portal-animal-tier-half-start">시작일 (선택)</Label>
            <Input
              id="adult-portal-animal-tier-half-start"
              type="date"
              value={startDate}
              disabled={isSaving || !enabled}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="adult-portal-animal-tier-half-end">종료일 (선택)</Label>
            <Input
              id="adult-portal-animal-tier-half-end"
              type="date"
              value={endDate}
              disabled={isSaving || !enabled}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          시작·종료일을 비우면 켜져 있는 동안 항상 적용됩니다.
        </p>
        <Button
          type="button"
          variant="secondary"
          disabled={isSaving || !enabled}
          onClick={handleSavePeriod}
        >
          기간 저장
        </Button>

        <div className="rounded-lg border border-dashed border-border/70 bg-background/50 p-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            {previewActive ? '이벤트 적용 시 등급 구간' : '현재 미리보기 (이벤트 꺼짐)'}
          </p>
          <ul className="grid gap-1 text-xs text-foreground sm:grid-cols-2">
            {tierPreview.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  )
}
