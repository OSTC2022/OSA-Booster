'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarRange } from 'lucide-react'
import { toast } from 'sonner'
import { updateCenterSettings } from '@/lib/actions/center-settings'
import { resolvePortalRankingPeriod } from '@/lib/running-league/ranking-period'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { CenterSettings } from '@/lib/types'

type AdultPortalRankingPeriodSettingsPanelProps = {
  centerSettings: CenterSettings
}

function toInputDate(value: string | null | undefined): string {
  const trimmed = value?.trim()
  if (!trimmed) return ''
  return trimmed.slice(0, 10)
}

export function AdultPortalRankingPeriodSettingsPanel({
  centerSettings,
}: AdultPortalRankingPeriodSettingsPanelProps) {
  const router = useRouter()
  const [isSaving, setIsSaving] = useState(false)
  const [startDate, setStartDate] = useState(
    toInputDate(centerSettings.adult_portal_ranking_period_start),
  )
  const [endDate, setEndDate] = useState(
    toInputDate(centerSettings.adult_portal_ranking_period_end),
  )

  const previewPeriod = useMemo(
    () =>
      resolvePortalRankingPeriod({
        adult_portal_ranking_period_start: startDate || null,
        adult_portal_ranking_period_end: endDate || null,
      }),
    [endDate, startDate],
  )

  async function handleSave() {
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
      adult_portal_ranking_period_start: trimmedStart || null,
      adult_portal_ranking_period_end: trimmedEnd || null,
    })
    setIsSaving(false)

    if (result.error) {
      toast.error('저장 실패', { description: result.error })
      return
    }

    toast.success('마일리지·출석 집계 기간이 저장되었습니다.')
    router.refresh()
  }

  function handleResetToCalendarMonth() {
    setStartDate('')
    setEndDate('')
  }

  return (
    <Card className="border-border/70">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarRange className="h-4 w-4 text-muted-foreground" />
          마일리지·출석 집계 기간
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          PB 랭킹은 기간과 무관합니다. 마일리지·출석만 아래 기간으로 집계됩니다.
          비워두면 당월 1일~말일을 사용합니다.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="ranking-period-start">시작일</Label>
            <Input
              id="ranking-period-start"
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ranking-period-end">종료일</Label>
            <Input
              id="ranking-period-end"
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </div>
        </div>

        <div className="rounded-lg border border-dashed border-lime-500/25 bg-lime-500/5 px-3 py-2.5 text-sm">
          <p className="font-medium text-foreground">미리보기: {previewPeriod.label}</p>
          <p className="mt-1 text-xs text-muted-foreground">{previewPeriod.resetHint}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={handleSave} disabled={isSaving}>
            {isSaving ? '저장 중…' : '기간 저장'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handleResetToCalendarMonth}
            disabled={isSaving}
          >
            당월 1일~말일로 초기화
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
