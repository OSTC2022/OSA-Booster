'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Swords, Users } from 'lucide-react'
import { toast } from 'sonner'
import { updateCenterSettings } from '@/lib/actions/center-settings'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import type { CenterSettings } from '@/lib/types'
import { cn } from '@/lib/utils'

export function AdultPortalCompetitionModeSettingsPanel({
  centerSettings,
  teamCount = 0,
}: {
  centerSettings: CenterSettings
  teamCount?: number
}) {
  const router = useRouter()
  const [isSaving, setIsSaving] = useState(false)
  const [showIndividual, setShowIndividual] = useState(
    centerSettings.adult_portal_ranking_show_individual !== false,
  )
  const [showTeam, setShowTeam] = useState(
    centerSettings.adult_portal_ranking_show_team === true,
  )

  useEffect(() => {
    setShowIndividual(centerSettings.adult_portal_ranking_show_individual !== false)
  }, [centerSettings.adult_portal_ranking_show_individual])

  useEffect(() => {
    setShowTeam(centerSettings.adult_portal_ranking_show_team === true)
  }, [centerSettings.adult_portal_ranking_show_team])

  async function handleSave() {
    if (!showIndividual && !showTeam) {
      toast.error('개인전 또는 팀전 중 하나 이상 선택해주세요.')
      return
    }

    setIsSaving(true)
    const result = await updateCenterSettings({
      adult_portal_ranking_show_individual: showIndividual,
      adult_portal_ranking_show_team: showTeam,
    })
    setIsSaving(false)

    if (result.error) {
      toast.error('저장 실패', { description: result.error })
      return
    }

    toast.success('랭킹 모드가 저장되었습니다.')
    router.refresh()
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Swords className="h-4 w-4 text-orange-400" />
          랭킹 모드 (개인전 · 팀전)
        </CardTitle>
        <CardDescription>
          중복 선택 가능합니다. 선택한 모드만 회원 포털 랭킹 탭·그래프에 표시됩니다. 팀 수는 아래
          팀전 설정에서 추가·삭제합니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label
            className={cn(
              'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors',
              showIndividual
                ? 'border-orange-500/40 bg-orange-500/10'
                : 'border-border bg-muted/10',
            )}
          >
            <Checkbox
              checked={showIndividual}
              onCheckedChange={(value) => setShowIndividual(value === true)}
              className="mt-0.5"
            />
            <span className="space-y-1">
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <Users className="h-3.5 w-3.5 text-orange-300" />
                개인전
              </span>
              <span className="block text-xs text-muted-foreground">
                월 마일리지 · 출석 · 이겨라 · 순위(PB)
              </span>
            </span>
          </label>

          <label
            className={cn(
              'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors',
              showTeam
                ? 'border-orange-500/40 bg-orange-500/10'
                : 'border-border bg-muted/10',
            )}
          >
            <Checkbox
              checked={showTeam}
              onCheckedChange={(value) => setShowTeam(value === true)}
              className="mt-0.5"
            />
            <span className="space-y-1">
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <Swords className="h-3.5 w-3.5 text-orange-300" />
                팀전
              </span>
              <span className="block text-xs text-muted-foreground">
                팀 합산 마일리지 · 멤버별 거리
                {teamCount > 0 ? ` · 현재 ${teamCount}팀` : ' · 팀을 먼저 추가하세요'}
              </span>
            </span>
          </label>
        </div>

        <p className="text-xs text-muted-foreground">
          {showIndividual && showTeam
            ? '개인전·팀전 탭이 모두 표시됩니다.'
            : showTeam
              ? '팀전 UI만 표시됩니다.'
              : '개인전 UI만 표시됩니다.'}
        </p>

        <Button type="button" onClick={() => void handleSave()} disabled={isSaving}>
          {isSaving ? '저장 중…' : '저장'}
        </Button>
      </CardContent>
    </Card>
  )
}
