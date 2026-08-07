'use client'

import { useMemo, useState, useTransition } from 'react'
import { Loader2, Plus, Trophy, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  deleteHallOfFameEntry,
  importFullPbIntoHallOfFame,
  upsertHallOfFameEntry,
} from '@/lib/actions/hall-of-fame'
import type { HallOfFameEntry } from '@/lib/hall-of-fame'
import { cn } from '@/lib/utils'

type Draft = {
  id?: string
  display_name: string
  time_text: string
  race_name: string
  measured_at: string
  notes: string
  is_published: boolean
}

const EMPTY_DRAFT: Draft = {
  display_name: '',
  time_text: '',
  race_name: '풀코스',
  measured_at: '',
  notes: '',
  is_published: true,
}

export function HallOfFameSettingsPanel({
  initialEntries,
}: {
  initialEntries: HallOfFameEntry[]
}) {
  const [entries, setEntries] = useState(initialEntries)
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [pending, startTransition] = useTransition()

  const sorted = useMemo(
    () => [...entries].sort((a, b) => a.time_seconds - b.time_seconds),
    [entries],
  )

  function startEdit(entry: HallOfFameEntry) {
    setDraft({
      id: entry.id,
      display_name: entry.display_name,
      time_text: entry.time_text,
      race_name: entry.race_name ?? '',
      measured_at: entry.measured_at ?? '',
      notes: entry.notes ?? '',
      is_published: entry.is_published,
    })
  }

  function handleSave() {
    startTransition(async () => {
      const result = await upsertHallOfFameEntry({
        id: draft.id,
        display_name: draft.display_name,
        time_text: draft.time_text,
        race_name: draft.race_name,
        measured_at: draft.measured_at,
        notes: draft.notes,
        is_published: draft.is_published,
      })
      if (result.error) {
        toast.error('저장 실패', { description: result.error })
        return
      }
      if (result.entry) {
        setEntries((prev) => {
          const without = prev.filter((row) => row.id !== result.entry!.id)
          return [...without, result.entry!]
        })
      }
      setDraft(EMPTY_DRAFT)
      toast.success(draft.id ? '수정되었습니다.' : '추가되었습니다.')
    })
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      const result = await deleteHallOfFameEntry(id)
      if (result.error) {
        toast.error('삭제 실패', { description: result.error })
        return
      }
      setEntries((prev) => prev.filter((row) => row.id !== id))
      if (draft.id === id) setDraft(EMPTY_DRAFT)
      toast.success('삭제되었습니다.')
    })
  }

  function handleImport() {
    startTransition(async () => {
      const result = await importFullPbIntoHallOfFame()
      if (result.error) {
        toast.error('가져오기 실패', { description: result.error })
        return
      }
      toast.success(`${result.imported ?? 0}명을 가져왔습니다.`)
      window.location.reload()
    })
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-primary" />
            명예의 전당 (풀코스)
          </CardTitle>
          <CardDescription>
            로그인 화면 우측 상단 S를 누르면 공개됩니다. 기록이 빠른 순서로
            표시됩니다. 최근 3시간 내 등록은 비공개여도 자동 공개됩니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>이름</Label>
              <Input
                value={draft.display_name}
                onChange={(e) => setDraft((d) => ({ ...d, display_name: e.target.value }))}
                placeholder="홍길동"
                disabled={pending}
              />
            </div>
            <div className="space-y-2">
              <Label>풀코스 기록</Label>
              <Input
                value={draft.time_text}
                onChange={(e) => setDraft((d) => ({ ...d, time_text: e.target.value }))}
                placeholder="3:28:55"
                disabled={pending}
              />
            </div>
            <div className="space-y-2">
              <Label>대회명 (선택)</Label>
              <Input
                value={draft.race_name}
                onChange={(e) => setDraft((d) => ({ ...d, race_name: e.target.value }))}
                placeholder="서울마라톤"
                disabled={pending}
              />
            </div>
            <div className="space-y-2">
              <Label>기록일 (선택)</Label>
              <Input
                type="date"
                value={draft.measured_at}
                onChange={(e) => setDraft((d) => ({ ...d, measured_at: e.target.value }))}
                disabled={pending}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>메모 (선택)</Label>
            <Input
              value={draft.notes}
              onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
              disabled={pending}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Checkbox
              checked={draft.is_published}
              onCheckedChange={(checked) =>
                setDraft((d) => ({ ...d, is_published: checked === true }))
              }
              disabled={pending}
            />
            로그인 화면에 공개
          </label>
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={pending} onClick={handleSave}>
              {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              {draft.id ? '수정 저장' : '추가'}
            </Button>
            {draft.id ? (
              <Button
                type="button"
                variant="ghost"
                disabled={pending}
                onClick={() => setDraft(EMPTY_DRAFT)}
              >
                새 입력으로
              </Button>
            ) : null}
            <Button type="button" variant="secondary" disabled={pending} onClick={handleImport}>
              러닝리그 풀코스 PB 가져오기
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">등록 목록 (빠른 순)</CardTitle>
        </CardHeader>
        <CardContent>
          {sorted.length === 0 ? (
            <p className="text-sm text-muted-foreground">등록된 기록이 없습니다.</p>
          ) : (
            <ul className="space-y-2">
              {sorted.map((entry, index) => (
                <li
                  key={entry.id}
                  className={cn(
                    'flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3 py-2.5',
                    !entry.is_published && 'opacity-50',
                  )}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">
                      <span className="mr-2 text-primary">{index + 1}</span>
                      {entry.display_name}
                      <span className="ml-2 font-mono text-primary">{entry.time_text}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {[entry.race_name, entry.measured_at, entry.is_published ? null : '비공개']
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => startEdit(entry)}
                    >
                      수정
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => handleDelete(entry.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
