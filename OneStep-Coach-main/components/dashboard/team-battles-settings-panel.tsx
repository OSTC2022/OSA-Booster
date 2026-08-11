'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Plus, Trash2, Users } from 'lucide-react'
import { toast } from 'sonner'
import {
  activateTeamBattle,
  archiveTeamBattle,
  confirmTeamBattleAssignment,
  deleteDraftTeamBattle,
  endTeamBattle,
  getTeamBattleAdminDetail,
  previewTeamBattleAssignment,
  upsertTeamBattle,
  type TeamBattleCandidate,
} from '@/lib/actions/team-battles'
import {
  type AssignmentMode,
  type ScoringMode,
  type TeamAssignment,
  type TeamBattleDefinition,
} from '@/lib/running-league/team-battle'
import { formatMileageKmDisplay } from '@/lib/running-league/mileage-leaderboard'
import { getKstDateKey } from '@/lib/member-backup/kst-date'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { cn } from '@/lib/utils'

type Draft = {
  id?: string
  title: string
  description: string
  start_at: string
  end_at: string
  assignment_mode: AssignmentMode
  scoring_mode: ScoringMode
}

function emptyDraft(): Draft {
  const today = getKstDateKey()
  return {
    title: '',
    description: '',
    start_at: today,
    end_at: today,
    assignment_mode: 'balanced',
    scoring_mode: 'average_distance',
  }
}

function toDraft(battle: TeamBattleDefinition): Draft {
  return {
    id: battle.id,
    title: battle.title,
    description: battle.description ?? '',
    start_at: battle.start_at,
    end_at: battle.end_at,
    assignment_mode: battle.assignment_mode,
    scoring_mode: battle.scoring_mode,
  }
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'DRAFT',
  active: 'ACTIVE',
  ended: 'ENDED',
  archived: 'ARCHIVED',
}

type Props = {
  initialBattles: TeamBattleDefinition[]
  candidates: TeamBattleCandidate[]
  tableReady: boolean
  loadError?: string | null
}

export function TeamBattlesSettingsPanel({
  initialBattles,
  candidates,
  tableReady,
  loadError = null,
}: Props) {
  const router = useRouter()
  const [battles, setBattles] = useState(initialBattles)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [preview, setPreview] = useState<{
    assignments: TeamAssignment[]
    redBaseline: number
    blueBaseline: number
    redCount: number
    blueCount: number
    mode: AssignmentMode
  } | null>(null)
  const [detailLabel, setDetailLabel] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const sortedBattles = useMemo(
    () =>
      [...battles].sort((a, b) => b.start_at.localeCompare(a.start_at) || a.title.localeCompare(b.title, 'ko')),
    [battles],
  )

  function refresh() {
    router.refresh()
  }

  function openCreate() {
    setDraft(emptyDraft())
    setSelectedIds([])
    setPreview(null)
    setDetailLabel(null)
  }

  function openEdit(battle: TeamBattleDefinition) {
    if (battle.status !== 'draft') {
      toast.error('DRAFT 배틀만 수정할 수 있습니다.')
      return
    }
    setDraft(toDraft(battle))
    setSelectedIds([])
    setPreview(null)
    setDetailLabel(null)
    startTransition(async () => {
      const detail = await getTeamBattleAdminDetail(battle.id)
      if ('error' in detail) {
        toast.error(detail.error)
        return
      }
      setSelectedIds(detail.roster.map((row) => row.member_id))
      setDetailLabel(
        `편성 ${detail.roster.length}명 · RED ${detail.scoreboard.red.memberCount} / BLUE ${detail.scoreboard.blue.memberCount}`,
      )
    })
  }

  function toggleMember(memberId: string) {
    setSelectedIds((prev) =>
      prev.includes(memberId) ? prev.filter((id) => id !== memberId) : [...prev, memberId],
    )
    setPreview(null)
  }

  function toggleAll() {
    if (selectedIds.length === candidates.length) {
      setSelectedIds([])
    } else {
      setSelectedIds(candidates.map((c) => c.memberId))
    }
    setPreview(null)
  }

  function saveBattle() {
    if (!draft) return
    startTransition(async () => {
      const result = await upsertTeamBattle({
        id: draft.id,
        title: draft.title,
        description: draft.description,
        start_at: draft.start_at,
        end_at: draft.end_at,
        assignment_mode: draft.assignment_mode,
        scoring_mode: draft.scoring_mode,
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setBattles((prev) => {
        const others = prev.filter((b) => b.id !== result.battle.id)
        return [result.battle, ...others]
      })
      setDraft({ ...draft, id: result.battle.id })
      toast.success(draft.id ? '배틀을 수정했습니다.' : '배틀을 생성했습니다.')
      refresh()
    })
  }

  function runPreview() {
    if (!draft?.id) {
      toast.error('먼저 배틀을 저장해주세요.')
      return
    }
    startTransition(async () => {
      const result = await previewTeamBattleAssignment({
        battleId: draft.id!,
        memberIds: selectedIds,
        mode: draft.assignment_mode,
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setPreview({
        assignments: result.assignments,
        redBaseline: result.redBaseline,
        blueBaseline: result.blueBaseline,
        redCount: result.redCount,
        blueCount: result.blueCount,
        mode: draft.assignment_mode,
      })
    })
  }

  function confirmPreview() {
    if (!draft?.id || !preview) return
    startTransition(async () => {
      const result = await confirmTeamBattleAssignment({
        battleId: draft.id!,
        assignmentMode: preview.mode,
        assignments: preview.assignments.map((row) => ({
          memberId: row.memberId,
          teamCode: row.teamCode,
          baselineKm: row.baselineKm,
        })),
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success('팀 편성을 확정했습니다.')
      setDetailLabel(
        `편성 ${preview.assignments.length}명 · RED ${preview.redCount} / BLUE ${preview.blueCount}`,
      )
      setPreview(null)
      refresh()
    })
  }

  function activate(battleId: string) {
    if (!window.confirm('배틀을 ACTIVE로 전환할까요? 이후 팀 재편성이 잠깁니다.')) return
    startTransition(async () => {
      const result = await activateTeamBattle(battleId)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success('배틀을 활성화했습니다.')
      setBattles((prev) =>
        prev.map((b) => (b.id === battleId ? { ...b, status: 'active' as const } : b)),
      )
      setDraft(null)
      refresh()
    })
  }

  function endBattle(battleId: string) {
    if (!window.confirm('배틀을 종료할까요?')) return
    startTransition(async () => {
      const result = await endTeamBattle(battleId)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success('배틀을 종료했습니다.')
      setBattles((prev) =>
        prev.map((b) => (b.id === battleId ? { ...b, status: 'ended' as const } : b)),
      )
      refresh()
    })
  }

  function archive(battleId: string) {
    startTransition(async () => {
      const result = await archiveTeamBattle(battleId)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success('배틀을 보관했습니다.')
      setBattles((prev) => prev.filter((b) => b.id !== battleId))
      refresh()
    })
  }

  function removeDraft(battleId: string) {
    if (!window.confirm('DRAFT 배틀을 삭제할까요?')) return
    startTransition(async () => {
      const result = await deleteDraftTeamBattle(battleId)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success('배틀을 삭제했습니다.')
      setBattles((prev) => prev.filter((b) => b.id !== battleId))
      if (draft?.id === battleId) setDraft(null)
      refresh()
    })
  }

  const redPreview = preview?.assignments.filter((a) => a.teamCode === 'RED') ?? []
  const bluePreview = preview?.assignments.filter((a) => a.teamCode === 'BLUE') ?? []

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4" aria-hidden />
            팀 배틀 관리
          </CardTitle>
          <CardDescription>
            RED / BLUE 기간 대항전. 점수는 러닝 기록에서 실시간 집계하며 별도 점수 컬럼을 두지 않습니다.
          </CardDescription>
        </div>
        <Button type="button" size="sm" onClick={openCreate} disabled={pending || !tableReady}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          새 배틀
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {loadError ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {loadError}
          </p>
        ) : null}
        {!tableReady ? (
          <p className="text-sm text-muted-foreground">
            테이블 준비 전입니다. <code>supabase/add-team-battles.sql</code> 을 실행하세요.
          </p>
        ) : null}

        <ul className="space-y-2">
          {sortedBattles.length === 0 ? (
            <li className="text-sm text-muted-foreground">등록된 배틀이 없습니다.</li>
          ) : (
            sortedBattles.map((battle) => (
              <li
                key={battle.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{battle.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {STATUS_LABEL[battle.status] ?? battle.status} · {battle.start_at} ~{' '}
                    {battle.end_at} ·{' '}
                    {battle.scoring_mode === 'total_distance' ? '총거리' : '평균거리'} ·{' '}
                    {battle.assignment_mode === 'random' ? '랜덤' : '균형'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {battle.status === 'draft' ? (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() => openEdit(battle)}
                      >
                        편집·편성
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        disabled={pending}
                        onClick={() => activate(battle.id)}
                      >
                        활성화
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() => removeDraft(battle.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  ) : null}
                  {battle.status === 'active' ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => endBattle(battle.id)}
                    >
                      종료
                    </Button>
                  ) : null}
                  {battle.status === 'ended' ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => archive(battle.id)}
                    >
                      보관
                    </Button>
                  ) : null}
                </div>
              </li>
            ))
          )}
        </ul>

        {draft ? (
          <div className="space-y-4 rounded-lg border border-border bg-muted/20 p-3 sm:p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold">{draft.id ? '배틀 편집' : '배틀 생성'}</p>
              <Button type="button" size="sm" variant="ghost" onClick={() => setDraft(null)}>
                닫기
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="tb-title">배틀 이름</Label>
                <Input
                  id="tb-title"
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  placeholder="SUMMER BATTLE"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="tb-desc">설명</Label>
                <Input
                  id="tb-desc"
                  value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  placeholder="선택 사항"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tb-start">시작일</Label>
                <Input
                  id="tb-start"
                  type="date"
                  value={draft.start_at}
                  onChange={(e) => setDraft({ ...draft, start_at: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tb-end">종료일</Label>
                <Input
                  id="tb-end"
                  type="date"
                  value={draft.end_at}
                  onChange={(e) => setDraft({ ...draft, end_at: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>팀 편성</Label>
                <Select
                  value={draft.assignment_mode}
                  onValueChange={(value) =>
                    setDraft({ ...draft, assignment_mode: value as AssignmentMode })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="balanced">균형 자동 편성</SelectItem>
                    <SelectItem value="random">완전 랜덤</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>점수 방식</Label>
                <Select
                  value={draft.scoring_mode}
                  onValueChange={(value) =>
                    setDraft({ ...draft, scoring_mode: value as ScoringMode })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="average_distance">1인 평균거리</SelectItem>
                    <SelectItem value="total_distance">팀 총거리</SelectItem>
                  </SelectContent>
                </Select>
                {draft.scoring_mode === 'total_distance' ? (
                  <p className="text-[11px] text-muted-foreground">
                    총거리는 팀 인원 차이에 영향을 받습니다. 기본은 평균거리를 권장합니다.
                  </p>
                ) : null}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" disabled={pending} onClick={saveBattle}>
                {pending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                저장
              </Button>
              {detailLabel ? (
                <p className="self-center text-xs text-muted-foreground">{detailLabel}</p>
              ) : null}
            </div>

            {draft.id ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">참여 회원 ({selectedIds.length})</p>
                  <Button type="button" size="sm" variant="outline" onClick={toggleAll}>
                    {selectedIds.length === candidates.length ? '전체 해제' : '전체 선택'}
                  </Button>
                </div>
                <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-border/60 p-2">
                  {candidates.length === 0 ? (
                    <p className="py-4 text-center text-sm text-muted-foreground">
                      러닝 리그 참가자가 없습니다.
                    </p>
                  ) : (
                    candidates.map((c) => {
                      const checked = selectedIds.includes(c.memberId)
                      return (
                        <label
                          key={c.memberId}
                          className={cn(
                            'flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted/50',
                            checked && 'bg-muted/40',
                          )}
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => toggleMember(c.memberId)}
                          />
                          <span className="truncate">{c.memberName}</span>
                        </label>
                      )
                    })
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="outline" disabled={pending} onClick={runPreview}>
                    편성 미리보기
                  </Button>
                  {preview ? (
                    <>
                      <Button type="button" size="sm" variant="outline" disabled={pending} onClick={runPreview}>
                        다시 편성
                      </Button>
                      <Button type="button" size="sm" disabled={pending} onClick={confirmPreview}>
                        편성 확정
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">저장 후 참여 회원을 선택하고 팀을 편성하세요.</p>
            )}

            {preview ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-md border border-red-500/30 bg-red-500/5 p-2.5">
                  <p className="text-sm font-semibold text-red-600 dark:text-red-300">
                    RED TEAM · {preview.redCount}명 · Baseline{' '}
                    {formatMileageKmDisplay(preview.redBaseline)}
                  </p>
                  <ul className="mt-1 max-h-40 space-y-0.5 overflow-y-auto text-xs">
                    {redPreview.map((row) => (
                      <li key={row.memberId} className="flex justify-between gap-2">
                        <span className="truncate">{row.memberName}</span>
                        <span className="tabular-nums text-muted-foreground">
                          {formatMileageKmDisplay(row.baselineKm)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-md border border-sky-500/30 bg-sky-500/5 p-2.5">
                  <p className="text-sm font-semibold text-sky-700 dark:text-sky-300">
                    BLUE TEAM · {preview.blueCount}명 · Baseline{' '}
                    {formatMileageKmDisplay(preview.blueBaseline)}
                  </p>
                  <ul className="mt-1 max-h-40 space-y-0.5 overflow-y-auto text-xs">
                    {bluePreview.map((row) => (
                      <li key={row.memberId} className="flex justify-between gap-2">
                        <span className="truncate">{row.memberName}</span>
                        <span className="tabular-nums text-muted-foreground">
                          {formatMileageKmDisplay(row.baselineKm)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
                <p className="sm:col-span-2 text-xs text-muted-foreground">
                  Baseline 차이{' '}
                  {formatMileageKmDisplay(Math.abs(preview.redBaseline - preview.blueBaseline))} ·{' '}
                  {preview.mode === 'random' ? '랜덤' : '균형'} 편성
                </p>
              </div>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
