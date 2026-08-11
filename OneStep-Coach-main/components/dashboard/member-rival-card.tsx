'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Swords, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { clearMyRival, setMyRival, type MemberRivalHome } from '@/lib/actions/member-rivals'
import { formatMileageKmDisplay } from '@/lib/running-league/mileage-leaderboard'
import { filterRivalCandidatesByQuery } from '@/lib/running-league/member-rivals'
import { MEMBER_PORTAL_CARD_CLASS } from '@/lib/running-league/member-portal-layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

type MemberRivalCardProps = {
  rivalHome: MemberRivalHome | null | undefined
  memberLinked?: boolean
  readOnly?: boolean
  className?: string
}

export function MemberRivalCard({
  rivalHome,
  memberLinked = true,
  readOnly = false,
  className,
}: MemberRivalCardProps) {
  const router = useRouter()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [pending, startTransition] = useTransition()

  const linkedHome =
    rivalHome && !('unlinked' in rivalHome) ? rivalHome : null

  const filteredCandidates = useMemo(() => {
    if (!linkedHome) return []
    return filterRivalCandidatesByQuery(
      linkedHome.candidates,
      query,
      linkedHome.memberId,
    )
  }, [linkedHome, query])

  const unlinked =
    !memberLinked || (rivalHome != null && 'unlinked' in rivalHome && rivalHome.unlinked)

  function openPicker() {
    if (readOnly || !linkedHome) return
    setQuery('')
    setPickerOpen(true)
  }

  function selectRival(rivalMemberId: string) {
    startTransition(async () => {
      const result = await setMyRival(rivalMemberId)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success('라이벌을 설정했습니다.')
      setPickerOpen(false)
      router.refresh()
    })
  }

  function removeRival() {
    if (!window.confirm('라이벌을 해제할까요?')) return
    startTransition(async () => {
      const result = await clearMyRival()
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success('라이벌을 해제했습니다.')
      setPickerOpen(false)
      router.refresh()
    })
  }

  if (unlinked) {
    return (
      <section className={cn(MEMBER_PORTAL_CARD_CLASS, 'px-3 py-3 sm:px-4', className)}>
        <div className="flex items-center gap-2">
          <Swords className="h-4 w-4 shrink-0 text-orange-400" aria-hidden />
          <h2 className="text-sm font-semibold text-orange-100 sm:text-base">MY RIVAL</h2>
        </div>
        <p className="mt-2 text-sm text-zinc-400">
          러닝 회원 정보가 연결되어 있지 않아 라이벌 기능을 사용할 수 없습니다.
        </p>
      </section>
    )
  }

  if (rivalHome == null || !linkedHome) {
    return (
      <section className={cn(MEMBER_PORTAL_CARD_CLASS, 'px-3 py-3 sm:px-4', className)}>
        <div className="flex items-center gap-2">
          <Swords className="h-4 w-4 shrink-0 text-orange-400" aria-hidden />
          <h2 className="text-sm font-semibold text-orange-100 sm:text-base">MY RIVAL</h2>
        </div>
        <Skeleton className="mt-3 h-24 rounded-lg bg-zinc-800/80" />
      </section>
    )
  }

  const comparison = linkedHome.comparison
  const hasRival = Boolean(linkedHome.rivalMemberId && comparison)
  const userKm =
    linkedHome.candidates.find((c) => c.memberId === linkedHome.memberId)?.mileageKm ?? 0

  return (
    <>
      <section className={cn(MEMBER_PORTAL_CARD_CLASS, 'px-3 py-3 sm:px-4', className)}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Swords className="h-4 w-4 shrink-0 text-orange-400" aria-hidden />
            <h2 className="text-sm font-semibold text-orange-100 sm:text-base">MY RIVAL</h2>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <p className="text-xs tabular-nums text-zinc-500">{linkedHome.periodLabel}</p>
            {!readOnly ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs text-orange-200 hover:bg-orange-500/10 hover:text-orange-100"
                onClick={openPicker}
                disabled={pending}
              >
                {hasRival ? '변경' : '선택'}
              </Button>
            ) : null}
          </div>
        </div>

        {!linkedHome.tableReady ? (
          <p className="mt-2 text-xs text-zinc-500">
            라이벌 저장을 위해 <code className="text-zinc-400">add-member-rivals.sql</code> 적용이
            필요합니다. 추천·비교는 현재 월 랭킹으로 미리 볼 수 있습니다.
          </p>
        ) : null}

        {hasRival && comparison ? (
          <div className="mt-3 space-y-2.5">
            <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[1fr_auto_1fr]">
              <div className="min-w-0 rounded-lg border border-orange-500/15 bg-black/25 px-2.5 py-2 text-center sm:text-left">
                <p className="truncate text-sm font-semibold text-orange-50">{comparison.userName}</p>
                <p className="mt-0.5 text-base font-bold tabular-nums text-orange-100">
                  {comparison.userDistanceLabel}
                </p>
                {comparison.userRank != null ? (
                  <p className="text-[11px] text-zinc-500">{comparison.userRank}위</p>
                ) : null}
              </div>
              <p className="text-center text-xs font-semibold tracking-wide text-zinc-500">VS</p>
              <div className="min-w-0 rounded-lg border border-orange-500/15 bg-black/25 px-2.5 py-2 text-center sm:text-right">
                <p className="truncate text-sm font-semibold text-orange-50">{comparison.rivalName}</p>
                <p className="mt-0.5 text-base font-bold tabular-nums text-orange-100">
                  {comparison.rivalDistanceLabel}
                </p>
                {comparison.rivalRank != null ? (
                  <p className="text-[11px] text-zinc-500">{comparison.rivalRank}위</p>
                ) : null}
              </div>
            </div>
            {comparison.status !== 'both_empty' && comparison.status !== 'tied' ? (
              <p className="text-center text-xs text-zinc-400">
                현재 차이 {comparison.differenceLabel}
              </p>
            ) : null}
            <p className="text-center text-xs leading-snug text-orange-100/90 sm:text-[13px]">
              {comparison.hint}
            </p>
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            <p className="text-sm text-zinc-400">라이벌을 선택해보세요</p>
            {linkedHome.recommendations.length > 0 ? (
              <div className="space-y-1.5">
                <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                  추천 라이벌
                </p>
                <ul className="space-y-1.5">
                  {linkedHome.recommendations.map((row) => {
                    const signed = Math.round((row.mileageKm - userKm) * 10) / 10
                    const signedLabel =
                      signed === 0
                        ? '동거리'
                        : signed > 0
                          ? `+${formatMileageKmDisplay(signed)}`
                          : formatMileageKmDisplay(signed)
                    return (
                      <li key={row.memberId}>
                        <button
                          type="button"
                          disabled={readOnly || pending || !linkedHome.tableReady}
                          onClick={() => selectRival(row.memberId)}
                          className="flex w-full items-center justify-between gap-2 rounded-lg border border-orange-500/15 bg-black/25 px-2.5 py-2 text-left transition hover:border-orange-400/40 disabled:opacity-60"
                        >
                          <span className="min-w-0 truncate text-sm font-medium text-orange-50">
                            {row.memberName}
                          </span>
                          <span className="shrink-0 text-xs tabular-nums text-zinc-400">
                            {formatMileageKmDisplay(row.mileageKm)}
                            {row.rank != null ? ` · ${row.rank}위` : ''} · {signedLabel}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ) : (
              <p className="text-xs text-zinc-500">
                이번 달 기록을 등록하면 비슷한 라이벌을 추천해드릴 수 있습니다.
              </p>
            )}
            {!readOnly ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="border-orange-500/30 text-orange-100"
                onClick={openPicker}
                disabled={pending || !linkedHome.tableReady}
              >
                라이벌 직접 선택
              </Button>
            ) : null}
          </div>
        )}
      </section>

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent mobileSheet className="max-h-[85vh] overflow-hidden sm:max-w-md">
          <DialogHeader>
            <DialogTitle>라이벌 선택</DialogTitle>
            <DialogDescription>
              현재 월({linkedHome.periodLabel}) 거리 기준으로 비교합니다. 본인은 선택할 수 없습니다.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="이름 검색"
            className="mb-2"
          />
          <div className="max-h-[45vh] space-y-1 overflow-y-auto pr-1">
            {filteredCandidates.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">검색 결과가 없습니다.</p>
            ) : (
              filteredCandidates.map((row) => (
                <button
                  key={row.memberId}
                  type="button"
                  disabled={pending}
                  onClick={() => selectRival(row.memberId)}
                  className="flex w-full items-center justify-between gap-2 rounded-md border border-border/60 px-3 py-2 text-left hover:bg-muted/40"
                >
                  <span className="min-w-0 truncate text-sm font-medium">{row.memberName}</span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {formatMileageKmDisplay(row.mileageKm)}
                    {row.rank != null ? ` · ${row.rank}위` : ''}
                  </span>
                </button>
              ))
            )}
          </div>
          <DialogFooter className="flex-row justify-between gap-2 sm:justify-between">
            {hasRival ? (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={removeRival}
                disabled={pending}
              >
                {pending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                라이벌 해제
              </Button>
            ) : (
              <span />
            )}
            <Button type="button" variant="outline" size="sm" onClick={() => setPickerOpen(false)}>
              닫기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
