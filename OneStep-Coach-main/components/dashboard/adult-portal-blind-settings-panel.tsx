'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { EyeOff } from 'lucide-react'
import { toast } from 'sonner'
import { updateCenterSettings } from '@/lib/actions/center-settings'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import type { CenterSettings } from '@/lib/types'

type AdultPortalBlindSettingsPanelProps = {
  centerSettings: CenterSettings
}

export function AdultPortalBlindSettingsPanel({
  centerSettings,
}: AdultPortalBlindSettingsPanelProps) {
  const router = useRouter()
  const [isSaving, setIsSaving] = useState(false)
  const blinded = centerSettings.adult_portal_blind_member_usage ?? false

  async function handleToggle(checked: boolean) {
    setIsSaving(true)
    const result = await updateCenterSettings({
      adult_portal_blind_member_usage: checked,
    })
    setIsSaving(false)

    if (result.error) {
      toast.error('저장 실패', { description: result.error })
      return
    }

    toast.success(
      checked
        ? '성인 회원 포털에서 센터 이용 정보가 숨겨집니다.'
        : '성인 회원 포털에서 센터 이용 정보가 다시 표시됩니다.',
    )
    router.refresh()
  }

  return (
    <Card className="border-border/70">
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="space-y-1">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <EyeOff className="h-4 w-4 text-muted-foreground" />
            센터 이용 정보 블라인드
          </p>
          <p className="text-xs leading-relaxed text-muted-foreground sm:text-sm">
            켜면 성인 회원 마이페이지에서{' '}
            <span className="text-foreground/90">내 회원 정보</span>,{' '}
            <span className="text-foreground/90">러닝 챌린지</span>,{' '}
            <span className="text-foreground/90">오늘 관리</span> 섹션이 보이지
            않습니다. 러닝 리그·훈련 일정은 그대로 노출됩니다.
          </p>
        </div>
        <div className="flex items-center gap-2.5 sm:shrink-0">
          <Label htmlFor="adult-portal-blind-member-usage" className="text-sm">
            {blinded ? '숨김' : '표시'}
          </Label>
          <Switch
            id="adult-portal-blind-member-usage"
            checked={blinded}
            disabled={isSaving}
            onCheckedChange={handleToggle}
          />
        </div>
      </CardContent>
    </Card>
  )
}
