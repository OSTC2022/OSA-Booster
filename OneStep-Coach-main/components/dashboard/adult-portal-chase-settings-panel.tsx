'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Target } from 'lucide-react'
import { toast } from 'sonner'
import { updateCenterSettings } from '@/lib/actions/center-settings'
import type { MemberRunningLeagueRankingBundle } from '@/lib/actions/running-league'
import { resolveChaseTargetName } from '@/lib/running-league/chase-leaderboard'
import { resolvePortalChaseLabel } from '@/lib/running-league/portal-chase-label'
import { PortalChaseBadge } from '@/components/dashboard/portal-ranking-badges'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { CenterSettings } from '@/lib/types'

type AdultPortalChaseSettingsPanelProps = {
  centerSettings: CenterSettings
  rankingBundle: MemberRunningLeagueRankingBundle | null
}

const NONE_VALUE = '__none__'

export function AdultPortalChaseSettingsPanel({
  centerSettings,
  rankingBundle,
}: AdultPortalChaseSettingsPanelProps) {
  const router = useRouter()
  const [isSaving, setIsSaving] = useState(false)
  const [chaseMemberId, setChaseMemberId] = useState(
    centerSettings.adult_portal_chase_member_id?.trim() || NONE_VALUE,
  )
  const [chaseLabel, setChaseLabel] = useState(centerSettings.adult_portal_chase_label?.trim() ?? '')

  useEffect(() => {
    setChaseMemberId(centerSettings.adult_portal_chase_member_id?.trim() || NONE_VALUE)
  }, [centerSettings.adult_portal_chase_member_id])

  useEffect(() => {
    setChaseLabel(centerSettings.adult_portal_chase_label?.trim() ?? '')
  }, [centerSettings.adult_portal_chase_label])

  const participantOptions = useMemo(() => {
    const participants = rankingBundle?.participants ?? []
    return [...participants]
      .map((participant) => ({
        memberId: participant.member_id,
        memberName: participant.member?.name?.trim() || '회원',
      }))
      .sort((a, b) => a.memberName.localeCompare(b.memberName, 'ko'))
  }, [rankingBundle?.participants])

  const previewName = resolveChaseTargetName(
    rankingBundle?.participants ?? [],
    chaseMemberId === NONE_VALUE ? null : chaseMemberId,
  )
  const previewBadgeLabel = resolvePortalChaseLabel(chaseLabel)

  async function handleSave() {
    setIsSaving(true)
    const result = await updateCenterSettings({
      adult_portal_chase_member_id: chaseMemberId === NONE_VALUE ? null : chaseMemberId,
      adult_portal_chase_label: chaseLabel.trim() || null,
    })
    setIsSaving(false)

    if (result.error) {
      toast.error('저장 실패', { description: result.error })
      return
    }

    toast.success('이겨라 설정이 저장되었습니다.')
    router.refresh()
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Target className="h-4 w-4 text-red-400" />
          이겨라 이벤트
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          마일리지 챌린지 술래 1명을 지정합니다. 이겨라 탭에서만 이름 옆 배지가 표시되고 그래프는
          빨간색으로 강조됩니다.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="chase-member">술래 회원</Label>
          <Select value={chaseMemberId} onValueChange={setChaseMemberId}>
            <SelectTrigger id="chase-member">
              <SelectValue placeholder="회원 선택" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE_VALUE}>지정 안 함</SelectItem>
              {participantOptions.map((option) => (
                <SelectItem key={option.memberId} value={option.memberId}>
                  {option.memberName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="chase-label">이름 옆 배지 문구</Label>
          <Input
            id="chase-label"
            value={chaseLabel}
            onChange={(event) => setChaseLabel(event.target.value)}
            placeholder="이겨라"
            maxLength={12}
          />
          <p className="text-xs text-muted-foreground">
            비워 두면 기본값 &quot;이겨라&quot;가 사용됩니다. 이겨라 탭에서만 표시됩니다.
          </p>
        </div>
        {previewName ? (
          <p className="flex flex-wrap items-center gap-1.5 text-sm text-zinc-400">
            <span>미리보기:</span>
            <span className="font-medium text-red-300">{previewName}</span>
            <PortalChaseBadge label={previewBadgeLabel} />
          </p>
        ) : (
          <p className="text-sm text-zinc-500">술래를 지정하면 이겨라 탭 랭킹에 반영됩니다.</p>
        )}
        <Button type="button" onClick={handleSave} disabled={isSaving}>
          {isSaving ? '저장 중…' : '저장'}
        </Button>
      </CardContent>
    </Card>
  )
}
