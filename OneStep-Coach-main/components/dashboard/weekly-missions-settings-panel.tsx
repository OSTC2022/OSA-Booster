'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  deleteWeeklyMission,
  setWeeklyMissionActive,
  upsertWeeklyMission,
} from '@/lib/actions/weekly-missions'
import {
  unitForMissionType,
  type WeeklyMissionDefinition,
  type WeeklyMissionType,
  WEEKLY_MISSION_TYPES,
} from '@/lib/running-league/weekly-missions'
import { getCurrentWeekRange } from '@/lib/running-league/week-range'
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
  mission_type: WeeklyMissionType
  target_value: string
  start_at: string
  end_at: string
  is_active: boolean
  reward_points: string
  sort_order: string
}

const TYPE_LABELS: Record<WeeklyMissionType, string> = {
  distance: '거리 (DISTANCE)',
  run_count: '러닝 횟수 (RUN_COUNT)',
  attendance_count: '출석 일수 (ATTENDANCE)',
}

function emptyDraft(): Draft {
  const week = getCurrentWeekRange()
  return {
    title: '',
    description: '',
    mission_type: 'distance',
    target_value: '20',
    start_at: week.start,
    end_at: week.end,
    is_active: true,
    reward_points: '0',
    sort_order: '0',
  }
}

function toDraft(mission: WeeklyMissionDefinition): Draft {
  return {
    id: mission.id,
    title: mission.title,
    description: mission.description ?? '',
    mission_type: mission.mission_type,
    target_value: String(mission.target_value),
    start_at: mission.start_at,
    end_at: mission.end_at,
    is_active: mission.is_active,
    reward_points: String(mission.reward_points),
    sort_order: String(mission.sort_order),
  }
}

type Props = {
  initialMissions: WeeklyMissionDefinition[]
  tableReady: boolean
  loadError?: string | null
}

export function WeeklyMissionsSettingsPanel({
  initialMissions,
  tableReady,
  loadError = null,
}: Props) {
  const router = useRouter()
  const [missions, setMissions] = useState(initialMissions)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [pending, startTransition] = useTransition()

  const sorted = useMemo(
    () =>
      [...missions].sort(
        (a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title, 'ko'),
      ),
    [missions],
  )

  function refresh() {
    router.refresh()
  }

  function openCreate() {
    setDraft(emptyDraft())
  }

  function openEdit(mission: WeeklyMissionDefinition) {
    setDraft(toDraft(mission))
  }

  function saveDraft() {
    if (!draft) return
    startTransition(async () => {
      const result = await upsertWeeklyMission({
        id: draft.id,
        title: draft.title,
        description: draft.description,
        mission_type: draft.mission_type,
        target_value: Number(draft.target_value),
        start_at: draft.start_at,
        end_at: draft.end_at,
        is_active: draft.is_active,
        reward_points: Number(draft.reward_points),
        sort_order: Number(draft.sort_order),
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setMissions((prev) => {
        const without = prev.filter((row) => row.id !== result.mission.id)
        return [...without, result.mission]
      })
      setDraft(null)
      toast.success(draft.id ? '미션을 수정했습니다.' : '미션을 추가했습니다.')
      refresh()
    })
  }

  function toggleActive(mission: WeeklyMissionDefinition) {
    startTransition(async () => {
      const next = !mission.is_active
      const result = await setWeeklyMissionActive(mission.id, next)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setMissions((prev) =>
        prev.map((row) => (row.id === mission.id ? { ...row, is_active: next } : row)),
      )
      toast.success(next ? '미션을 활성화했습니다.' : '미션을 비활성화했습니다.')
      refresh()
    })
  }

  function remove(mission: WeeklyMissionDefinition) {
    if (!window.confirm(`「${mission.title}」미션을 삭제할까요?`)) return
    startTransition(async () => {
      const result = await deleteWeeklyMission(mission.id)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setMissions((prev) => prev.filter((row) => row.id !== mission.id))
      toast.success('미션을 삭제했습니다.')
      refresh()
    })
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle>주간 미션 관리</CardTitle>
          <CardDescription>
            활성 미션이 이번 주와 겹치면 회원 포털에 표시됩니다. 없으면 기본 자동 미션(20km /
            러닝 3회 / 출석 2회)이 사용됩니다. 진행률은 실시간 계산되며 포인트는 지급되지
            않습니다.
          </CardDescription>
        </div>
        <Button type="button" size="sm" onClick={openCreate} disabled={!tableReady || pending}>
          <Plus className="mr-1 h-4 w-4" />
          미션 추가
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {loadError ? (
          <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {loadError}
          </p>
        ) : null}
        {!tableReady && !loadError ? (
          <p className="text-sm text-muted-foreground">
            테이블 준비 전입니다. <code>supabase/add-weekly-missions.sql</code> 을 실행하세요.
          </p>
        ) : null}

        {draft ? (
          <div className="space-y-3 rounded-lg border border-border p-3">
            <p className="text-sm font-medium">{draft.id ? '미션 수정' : '미션 추가'}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="wm-title">제목</Label>
                <Input
                  id="wm-title"
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  placeholder="이번 주 30km 도전"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="wm-desc">설명</Label>
                <Input
                  id="wm-desc"
                  value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  placeholder="선택"
                />
              </div>
              <div className="space-y-1.5">
                <Label>미션 종류</Label>
                <Select
                  value={draft.mission_type}
                  onValueChange={(value) =>
                    setDraft({
                      ...draft,
                      mission_type: value as WeeklyMissionType,
                      target_value:
                        value === 'distance'
                          ? draft.target_value || '20'
                          : value === 'run_count'
                            ? '3'
                            : '2',
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WEEKLY_MISSION_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {TYPE_LABELS[type]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  단위 자동: {unitForMissionType(draft.mission_type)}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wm-target">목표 수치</Label>
                <Input
                  id="wm-target"
                  type="number"
                  min={0.1}
                  step="0.1"
                  value={draft.target_value}
                  onChange={(e) => setDraft({ ...draft, target_value: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wm-start">시작일</Label>
                <Input
                  id="wm-start"
                  type="date"
                  value={draft.start_at}
                  onChange={(e) => setDraft({ ...draft, start_at: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wm-end">종료일</Label>
                <Input
                  id="wm-end"
                  type="date"
                  value={draft.end_at}
                  onChange={(e) => setDraft({ ...draft, end_at: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wm-sort">노출 순서</Label>
                <Input
                  id="wm-sort"
                  type="number"
                  value={draft.sort_order}
                  onChange={(e) => setDraft({ ...draft, sort_order: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wm-points">보상 포인트 (저장만, 지급 없음)</Label>
                <Input
                  id="wm-points"
                  type="number"
                  min={0}
                  value={draft.reward_points}
                  onChange={(e) => setDraft({ ...draft, reward_points: e.target.value })}
                />
              </div>
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <Checkbox
                  checked={draft.is_active}
                  onCheckedChange={(checked) =>
                    setDraft({ ...draft, is_active: checked === true })
                  }
                />
                활성
              </label>
            </div>
            <div className="flex gap-2">
              <Button type="button" onClick={saveDraft} disabled={pending}>
                {pending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                저장
              </Button>
              <Button type="button" variant="outline" onClick={() => setDraft(null)} disabled={pending}>
                취소
              </Button>
            </div>
          </div>
        ) : null}

        <ul className="space-y-2">
          {sorted.length === 0 ? (
            <li className="rounded-lg border border-dashed px-3 py-4 text-sm text-muted-foreground">
              등록된 관리자 미션이 없습니다. 회원에게는 기본 자동 미션이 표시됩니다.
            </li>
          ) : (
            sorted.map((mission) => (
              <li
                key={mission.id}
                className={cn(
                  'flex flex-col gap-2 rounded-lg border px-3 py-2 sm:flex-row sm:items-center sm:justify-between',
                  mission.is_active ? 'border-border' : 'border-border/60 opacity-70',
                )}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {mission.title}
                    {!mission.is_active ? (
                      <span className="ml-2 text-xs text-muted-foreground">비활성</span>
                    ) : null}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {TYPE_LABELS[mission.mission_type]} · 목표 {mission.target_value}
                    {mission.unit} · {mission.start_at} ~ {mission.end_at} · 순서{' '}
                    {mission.sort_order}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => toggleActive(mission)}
                    disabled={pending}
                  >
                    {mission.is_active ? '비활성' : '활성'}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => openEdit(mission)}
                    disabled={pending}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => remove(mission)}
                    disabled={pending}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </li>
            ))
          )}
        </ul>
      </CardContent>
    </Card>
  )
}
