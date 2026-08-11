'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  listMyGarminReviewIssues,
  resolveMyGarminChangeIssue,
  resolveMyGarminDuplicateIssue,
  resolveMyGarminSourceIssue,
  type GarminReviewIssue,
} from '@/lib/actions/garmin-reconciliation'

function formatKoDate(isoDate: string | null): string {
  if (!isoDate) return '—'
  try {
    const d = new Date(`${isoDate.slice(0, 10)}T12:00:00+09:00`)
    return new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul',
      month: 'long',
      day: 'numeric',
    }).format(d)
  } catch {
    return isoDate
  }
}

function issueTitle(issue: GarminReviewIssue): string {
  switch (issue.issueType) {
    case 'POSSIBLE_DUPLICATE':
      return '중복 가능성이 있는 기록'
    case 'SOURCE_ACTIVITY_DELETED':
      return 'Garmin에서 찾을 수 없는 기록'
    case 'ACTIVITY_NO_LONGER_RUNNING':
      return '러닝이 아닌 활동으로 변경됨'
    case 'SOURCE_CHANGED_AFTER_FINALIZATION':
      return '확정 시즌 기간 기록 변경'
    case 'DATE_BOUNDARY_CHANGED':
    case 'WEEK_BOUNDARY_CHANGED':
      return '날짜 경계가 바뀐 기록'
    case 'SOURCE_CHANGED':
      return 'Garmin 기록 변경 검토'
    default:
      return '검토가 필요한 기록'
  }
}

type MemberGarminReviewPanelProps = {
  openCountHint?: number
  onResolved?: () => void
}

export function MemberGarminReviewPanel({
  openCountHint = 0,
  onResolved,
}: MemberGarminReviewPanelProps) {
  const [issues, setIssues] = useState<GarminReviewIssue[]>([])
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [loaded, setLoaded] = useState(false)

  const refresh = useCallback(async () => {
    const result = await listMyGarminReviewIssues()
    if (result.ok) {
      setIssues(result.issues)
      setLoaded(true)
    }
  }, [])

  useEffect(() => {
    if (openCountHint > 0 || open) {
      void refresh()
    }
  }, [openCountHint, open, refresh])

  const count = loaded ? issues.length : openCountHint
  if (count <= 0 && loaded) return null
  if (count <= 0 && !openCountHint) return null

  const confirmAndRun = (message: string, action: () => Promise<void>) => {
    if (!window.confirm(message)) return
    startTransition(async () => {
      await action()
      await refresh()
      onResolved?.()
    })
  }

  const resolveDuplicate = (
    issue: GarminReviewIssue,
    resolution: 'KEEP_MANUAL' | 'USE_GARMIN' | 'ALLOW_BOTH',
  ) => {
    const messages = {
      KEEP_MANUAL: 'Garmin 기록은 추가하지 않고 현재 수동 기록을 유지합니다.',
      USE_GARMIN: '기존 수동 기록을 Garmin 기록으로 변경합니다.',
      ALLOW_BOTH: '두 기록을 서로 다른 러닝으로 인정하여 모두 마일리지에 포함합니다.',
    } as const
    confirmAndRun(messages[resolution], async () => {
      const result = await resolveMyGarminDuplicateIssue(issue.id, resolution)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success('검토가 반영되었습니다.')
    })
  }

  return (
    <div className="rounded-lg border border-amber-500/25 bg-amber-950/20 px-2.5 py-2">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-amber-200/80">검토 필요한 기록</p>
          <p className="text-sm font-medium text-amber-50">{count}건</p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={() => setOpen((v) => !v)}>
          {open ? '닫기' : '기록 확인'}
        </Button>
      </div>

      {open ? (
        <ul className="mt-3 space-y-3">
          {issues.map((issue) => (
            <li
              key={issue.id}
              className="rounded-md border border-white/10 bg-black/25 p-2.5 text-sm text-zinc-200"
            >
              <p className="font-medium text-sky-50">{issueTitle(issue)}</p>
              {issue.issueType === 'SOURCE_CHANGED_AFTER_FINALIZATION' ? (
                <p className="mt-1 text-xs text-amber-200/90">
                  이 기록은 확정된 시즌에 포함되어 있을 수 있습니다. 원본 기록을 수정해도 시즌 최종
                  결과(Hall of Fame 등)는 변경되지 않습니다.
                </p>
              ) : null}

              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <div className="rounded border border-sky-500/20 bg-sky-950/30 p-2">
                  <p className="text-[10px] uppercase tracking-wide text-sky-300">GARMIN</p>
                  <p className="mt-1 text-zinc-100">
                    {formatKoDate(issue.proposedLoggedAt)}
                    {issue.proposedActivityTime ? ` · ${issue.proposedActivityTime.slice(0, 5)}` : ''}
                  </p>
                  <p className="text-zinc-100">
                    {issue.proposedDistanceKm.toFixed(2)} km
                    {issue.proposedDuration ? ` · ${issue.proposedDuration}` : ''}
                  </p>
                  <p className="mt-0.5 text-[10px] text-zinc-500">
                    ID {issue.externalActivityIdMasked}
                    {issue.confidence === 'LOW' ? ' · 신뢰도 낮음' : ''}
                  </p>
                </div>
                {issue.existingLogId ? (
                  <div className="rounded border border-white/10 bg-zinc-900/50 p-2">
                    <p className="text-[10px] uppercase tracking-wide text-zinc-400">
                      기존 {issue.existingSource === 'GARMIN' ? 'Garmin' : '수동'} 기록
                    </p>
                    <p className="mt-1 text-zinc-100">
                      {formatKoDate(issue.existingLoggedAt)}
                      {issue.existingActivityTime
                        ? ` · ${String(issue.existingActivityTime).slice(0, 5)}`
                        : ''}
                    </p>
                    <p className="text-zinc-100">
                      {issue.existingDistanceKm != null
                        ? `${issue.existingDistanceKm.toFixed(2)} km`
                        : '—'}
                      {issue.existingDuration ? ` · ${issue.existingDuration}` : ''}
                    </p>
                  </div>
                ) : null}
              </div>

              {issue.issueType === 'POSSIBLE_DUPLICATE' ? (
                <div className="mt-3 flex flex-col gap-2">
                  <p className="text-xs text-zinc-400">이 두 기록은 같은 러닝인가요?</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={pending}
                    className="w-full justify-center"
                    onClick={() => resolveDuplicate(issue, 'KEEP_MANUAL')}
                  >
                    기존 수동 기록 유지
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={pending}
                    className="w-full justify-center"
                    onClick={() => resolveDuplicate(issue, 'USE_GARMIN')}
                  >
                    Garmin 기록으로 교체
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    className="w-full justify-center"
                    onClick={() => resolveDuplicate(issue, 'ALLOW_BOTH')}
                  >
                    서로 다른 러닝입니다
                  </Button>
                </div>
              ) : null}

              {issue.issueType === 'SOURCE_ACTIVITY_DELETED' ||
              issue.issueType === 'ACTIVITY_NO_LONGER_RUNNING' ? (
                <div className="mt-3 flex flex-col gap-2">
                  <p className="text-xs text-zinc-400">
                    {issue.issueType === 'ACTIVITY_NO_LONGER_RUNNING'
                      ? 'Garmin에서 해당 활동 유형이 러닝이 아닌 것으로 변경되었습니다.'
                      : '이 기록을 원스텝 마일리지에 계속 유지하시겠습니까?'}
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    disabled={pending}
                    className="w-full"
                    onClick={() =>
                      confirmAndRun('원스텝 기록을 유지합니다.', async () => {
                        const r = await resolveMyGarminSourceIssue(issue.id, 'KEEP_LOCAL')
                        if (!r.ok) toast.error(r.error)
                        else toast.success('기록을 유지했습니다.')
                      })
                    }
                  >
                    원스텝 기록 유지
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    disabled={pending}
                    className="w-full"
                    onClick={() =>
                      confirmAndRun(
                        '마일리지에서 이 기록을 제거합니다. 이미 지급된 XP/업적은 회수되지 않습니다.',
                        async () => {
                          const r = await resolveMyGarminSourceIssue(issue.id, 'REMOVE_LOCAL')
                          if (!r.ok) toast.error(r.error)
                          else toast.success('마일리지에서 제거했습니다.')
                        },
                      )
                    }
                  >
                    마일리지에서 제거
                  </Button>
                </div>
              ) : null}

              {[
                'SOURCE_CHANGED',
                'SOURCE_CHANGED_AFTER_FINALIZATION',
                'DATE_BOUNDARY_CHANGED',
                'WEEK_BOUNDARY_CHANGED',
              ].includes(issue.issueType) ? (
                <div className="mt-3 flex flex-col gap-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={pending}
                    className="w-full"
                    onClick={() =>
                      confirmAndRun('현재 원스텝 기록을 유지합니다.', async () => {
                        const r = await resolveMyGarminChangeIssue(issue.id, 'KEEP_LOCAL')
                        if (!r.ok) toast.error(r.error)
                        else toast.success('기존 기록을 유지했습니다.')
                      })
                    }
                  >
                    원스텝 기록 유지
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={pending}
                    className="w-full"
                    onClick={() =>
                      confirmAndRun(
                        'Garmin 값으로 원본 마일리지 기록을 업데이트합니다. (시즌 스냅샷은 변경되지 않습니다)',
                        async () => {
                          const r = await resolveMyGarminChangeIssue(issue.id, 'APPLY_GARMIN')
                          if (!r.ok) toast.error(r.error)
                          else toast.success('Garmin 값으로 반영했습니다.')
                        },
                      )
                    }
                  >
                    Garmin 값으로 반영
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
