'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Award, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  setMyAchievementShowcase,
  type MemberAchievementsHome,
} from '@/lib/actions/achievements'
import type { AchievementProgressView } from '@/lib/running-league/achievements'
import { MAX_SHOWCASE_BADGES } from '@/lib/running-league/achievements'
import { MEMBER_PORTAL_CARD_CLASS } from '@/lib/running-league/member-portal-layout'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

type MemberAchievementsCardProps = {
  home: MemberAchievementsHome | null | undefined
  memberLinked?: boolean
  readOnly?: boolean
  className?: string
}

function formatUnlockedDate(value: string | null): string {
  if (!value) return ''
  const key = value.slice(0, 10)
  const [y, m, d] = key.split('-')
  if (!y || !m || !d) return key
  return `${y}.${m}.${d}`
}

function BadgeRow({
  item,
  locked,
}: {
  item: AchievementProgressView
  locked?: boolean
}) {
  return (
    <div
      className={cn(
        'rounded-lg border px-2.5 py-2',
        locked
          ? 'border-orange-500/10 bg-black/15'
          : 'border-orange-500/20 bg-black/25',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className={cn('text-sm font-semibold', locked ? 'text-zinc-300' : 'text-orange-50')}>
          {item.icon_key} {item.title}
        </p>
        {item.unlocked ? (
          <span className="shrink-0 text-[11px] tabular-nums text-zinc-500">
            {formatUnlockedDate(item.unlockedAt)}
          </span>
        ) : locked ? (
          <span className="shrink-0 text-[11px] text-zinc-500">미획득</span>
        ) : null}
      </div>
      <p className="mt-0.5 text-[11px] text-zinc-500">{item.description}</p>
      {item.unavailable ? (
        <p className="mt-1 text-[11px] text-zinc-500">{item.unavailableReason}</p>
      ) : null}
      {!item.unlocked && item.progressKind === 'ratio' && item.progressLabel ? (
        <div className="mt-2">
          <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
            <div
              className="h-full rounded-full bg-orange-500/70"
              style={{ width: `${item.progressPercent ?? 0}%` }}
            />
          </div>
          <p className="mt-1 text-[11px] tabular-nums text-zinc-400">{item.progressLabel}</p>
        </div>
      ) : null}
    </div>
  )
}

export function MemberAchievementsCard({
  home,
  memberLinked = true,
  readOnly = false,
  className,
}: MemberAchievementsCardProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [draftShowcase, setDraftShowcase] = useState<string[]>([])

  const linked = home && !('unlinked' in home) ? home : null

  const grouped = useMemo(() => {
    if (!linked) return []
    const map = new Map<string, AchievementProgressView[]>()
    for (const item of linked.items) {
      const list = map.get(item.category) ?? []
      list.push(item)
      map.set(item.category, list)
    }
    return [...map.entries()]
  }, [linked])

  function openDetail() {
    if (!linked) return
    setDraftShowcase(linked.showcase.map((row) => row.code))
    setOpen(true)
  }

  function toggleShowcase(code: string) {
    if (readOnly) return
    setDraftShowcase((prev) => {
      if (prev.includes(code)) return prev.filter((c) => c !== code)
      if (prev.length >= MAX_SHOWCASE_BADGES) {
        toast.error(`대표 배지는 최대 ${MAX_SHOWCASE_BADGES}개입니다.`)
        return prev
      }
      return [...prev, code]
    })
  }

  function saveShowcase() {
    startTransition(async () => {
      const result = await setMyAchievementShowcase(draftShowcase)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success('대표 배지를 저장했습니다.')
      router.refresh()
    })
  }

  if (!memberLinked || (home && 'unlinked' in home && home.unlinked)) {
    return (
      <section className={cn(MEMBER_PORTAL_CARD_CLASS, 'px-3 py-3 sm:px-4', className)}>
        <div className="flex items-center gap-2">
          <Award className="h-4 w-4 shrink-0 text-orange-400" aria-hidden />
          <h2 className="text-sm font-semibold text-orange-100 sm:text-base">나의 배지</h2>
        </div>
        <p className="mt-2 text-sm text-zinc-400">
          러닝 회원 정보가 연결되어 있지 않아 배지를 표시할 수 없습니다.
        </p>
      </section>
    )
  }

  if (home == null || !linked) {
    return (
      <section className={cn(MEMBER_PORTAL_CARD_CLASS, 'px-3 py-3 sm:px-4', className)}>
        <div className="flex items-center gap-2">
          <Award className="h-4 w-4 shrink-0 text-orange-400" aria-hidden />
          <h2 className="text-sm font-semibold text-orange-100 sm:text-base">나의 배지</h2>
        </div>
        <Skeleton className="mt-3 h-20 rounded-lg bg-zinc-800/80" />
      </section>
    )
  }

  return (
    <>
      <section className={cn(MEMBER_PORTAL_CARD_CLASS, 'px-3 py-3 sm:px-4', className)}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Award className="h-4 w-4 shrink-0 text-orange-400" aria-hidden />
            <div>
              <h2 className="text-sm font-semibold text-orange-100 sm:text-base">나의 배지</h2>
              <p className="text-[11px] tabular-nums text-zinc-500">
                {linked.unlockedCount} / {linked.totalCount} 획득
              </p>
            </div>
          </div>
        </div>

        {!linked.tableReady ? (
          <p className="mt-2 text-xs text-zinc-500">
            배지 저장을 위해 <code className="text-zinc-400">add-achievements.sql</code> 적용이
            필요합니다. 진행률은 미리 볼 수 있습니다.
          </p>
        ) : null}

        {linked.showcase.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {linked.showcase.map((row) => (
              <span
                key={row.code}
                className="rounded-md border border-orange-500/25 bg-orange-500/10 px-2 py-1 text-xs text-orange-100"
              >
                {row.icon_key} {row.title}
              </span>
            ))}
          </div>
        ) : null}

        {linked.recent.length > 0 ? (
          <div className="mt-3 space-y-1.5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
              최근 획득
            </p>
            {linked.recent.map((row) => (
              <div
                key={row.code}
                className="flex items-center justify-between gap-2 rounded-lg border border-orange-500/15 bg-black/25 px-2.5 py-1.5"
              >
                <span className="truncate text-sm text-orange-50">
                  {row.icon_key} {row.title}
                </span>
                <span className="shrink-0 text-[11px] tabular-nums text-zinc-500">
                  {formatUnlockedDate(row.unlockedAt)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-zinc-400">러닝을 기록하면 배지가 해금됩니다.</p>
        )}

        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="mt-2 h-8 w-full text-xs text-orange-200 hover:bg-orange-500/10 hover:text-orange-100"
          onClick={openDetail}
        >
          전체 보기
        </Button>
      </section>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent mobileSheet className="max-h-[85vh] overflow-hidden sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              나의 배지 · {linked.unlockedCount}/{linked.totalCount}
            </DialogTitle>
            <DialogDescription>
              획득한 배지는 영구 보관됩니다. 대표 배지는 최대 {MAX_SHOWCASE_BADGES}개까지 선택할 수
              있습니다.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[55vh] space-y-4 overflow-y-auto pr-1">
            {grouped.map(([category, items]) => (
              <div key={category}>
                <p className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground">
                  {category}
                </p>
                <ul className="space-y-2">
                  {items.map((item) => (
                    <li key={item.code}>
                      <BadgeRow item={item} locked={!item.unlocked} />
                      {item.unlocked && !readOnly ? (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => toggleShowcase(item.code)}
                          className="mt-1 text-[11px] text-orange-300 hover:underline"
                        >
                          {draftShowcase.includes(item.code)
                            ? '대표 배지 해제'
                            : '대표 배지로 설정'}
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          {!readOnly ? (
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
                닫기
              </Button>
              <Button type="button" size="sm" disabled={pending} onClick={saveShowcase}>
                {pending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                대표 배지 저장
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}
