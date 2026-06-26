'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Megaphone } from 'lucide-react'
import { toast } from 'sonner'
import { updateCenterSettings } from '@/lib/actions/center-settings'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { CenterSettings } from '@/lib/types'

type AdultPortalNoticeSettingsPanelProps = {
  centerSettings: CenterSettings
}

export function AdultPortalNoticeSettingsPanel({
  centerSettings,
}: AdultPortalNoticeSettingsPanelProps) {
  const router = useRouter()
  const [isSaving, setIsSaving] = useState(false)
  const [notice, setNotice] = useState(centerSettings.adult_portal_notice?.trim() ?? '')

  useEffect(() => {
    setNotice(centerSettings.adult_portal_notice?.trim() ?? '')
  }, [centerSettings.adult_portal_notice])

  async function handleSave() {
    setIsSaving(true)
    const result = await updateCenterSettings({
      adult_portal_notice: notice.trim() || null,
    })
    setIsSaving(false)

    if (result.error) {
      toast.error('저장 실패', { description: result.error })
      return
    }

    toast.success('공지사항이 저장되었습니다.')
    router.refresh()
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Megaphone className="h-4 w-4 text-lime-400" />
          공지사항
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          성인 러닝 포털 훈련 스케줄 위에 표시됩니다. 게임 룰·이벤트 안내·주의사항 등을
          작성하세요. 회원 화면에서는 기본적으로 접혀 있습니다.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="adult-portal-notice">공지 내용</Label>
          <Textarea
            id="adult-portal-notice"
            value={notice}
            onChange={(event) => setNotice(event.target.value)}
            placeholder={`예)\n· 마일리지는 당월 1일~말일까지 집계됩니다.\n· 이겨라 이벤트: 술래의 마일리지를 넘기면 랭킹에 표시됩니다.\n· 주 2회 이상 참여를 권장합니다.`}
            rows={8}
            className="min-h-[160px] resize-y font-mono text-sm leading-relaxed"
          />
          <p className="text-xs text-muted-foreground">
            줄바꿈이 그대로 반영됩니다. 비워 두면 회원 포털에 공지 영역이 표시되지 않습니다.
          </p>
        </div>
        <Button type="button" onClick={handleSave} disabled={isSaving}>
          {isSaving ? '저장 중…' : '저장'}
        </Button>
      </CardContent>
    </Card>
  )
}
