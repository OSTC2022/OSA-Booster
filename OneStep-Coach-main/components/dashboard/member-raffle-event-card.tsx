'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Ticket } from 'lucide-react'
import { RUN_POINT_SHOP_PATH } from '@/lib/running-league/run-point-shop'
import { toast } from 'sonner'
import { enterRaffle, type MemberRaffleHome, type MemberRaffleCard } from '@/lib/actions/raffles'
import { MEMBER_PORTAL_CARD_CLASS } from '@/lib/running-league/member-portal-layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

type Props = {
  home: MemberRaffleHome | null | undefined
  memberLinked?: boolean
  readOnly?: boolean
  shopMode?: boolean
  className?: string
}

function statusLabel(card: MemberRaffleCard): string {
  if (card.isOpenForEntry) {
    if (card.daysUntilEntryEnd != null && card.daysUntilEntryEnd >= 0) {
      return `D-${card.daysUntilEntryEnd}`
    }
    return '진행 중'
  }
  if (card.event.status === 'DRAWN') return '추첨 완료'
  if (card.event.status === 'CANCELLED') return '취소'
  if (card.event.status === 'CLOSED') return '응모 마감'
  return card.event.status
}

function EventBody({
  card,
  readOnly,
  onEntered,
}: {
  card: MemberRaffleCard
  readOnly: boolean
  onEntered: () => void
}) {
  const [customCount, setCustomCount] = useState('1')
  const [confirmCount, setConfirmCount] = useState<number | null>(null)
  const [pending, startTransition] = useTransition()

  const cost = useMemo(() => {
    if (confirmCount == null) return 0
    return confirmCount * card.event.ticket_cost_points
  }, [confirmCount, card.event.ticket_cost_points])

  const max = card.event.max_entries_per_member
  const remaining =
    max == null ? null : Math.max(0, max - card.stats.myTickets)
  const unitCost = card.event.ticket_cost_points
  const shortageOne = Math.max(0, unitCost - card.pointBalance)
  const canAffordOne = unitCost <= 0 || card.pointBalance >= unitCost
  const canAffordFive = unitCost <= 0 || card.pointBalance >= unitCost * 5

  function requestEnter(count: number) {
    if (readOnly || !card.isOpenForEntry) return
    if (!Number.isInteger(count) || count <= 0) {
      toast.error('응모 장수를 확인해주세요.')
      return
    }
    if (remaining != null && count > remaining) {
      toast.error(`최대 ${max}장까지 응모할 수 있습니다.`)
      return
    }
    if (card.pointBalance < count * card.event.ticket_cost_points) {
      toast.error(
        `RUN POINT가 ${(count * card.event.ticket_cost_points - card.pointBalance).toLocaleString('ko-KR')}P 부족합니다.`,
      )
      return
    }
    setConfirmCount(count)
  }

  function confirmEnter() {
    if (confirmCount == null) return
    const count = confirmCount
    const key =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`
    startTransition(async () => {
      const result = await enterRaffle({
        raffleId: card.event.id,
        ticketCount: count,
        idempotencyKey: key,
      })
      setConfirmCount(null)
      if (!result.ok) {
        if (result.error === 'INSUFFICIENT_POINTS') {
          toast.error('RUN POINT가 부족합니다.')
        } else if (result.error === 'MAX_ENTRIES_EXCEEDED') {
          toast.error(`최대 ${max ?? ''}장까지 응모할 수 있습니다.`)
        } else if (result.error === 'ENTRY_CLOSED') {
          toast.error('응모가 마감되었습니다.')
        } else if (result.error === 'TABLE_MISSING') {
          toast.error('추첨 이벤트 테이블이 없습니다. SQL을 적용해주세요.')
        } else {
          toast.error('응모에 실패했습니다.')
        }
        return
      }
      toast.success(`${result.ticketCount}장 응모 완료 (−${result.pointsSpent}P)`)
      onEntered()
    })
  }

  return (
    <div className="mt-3 space-y-3">
      <div>
        <p className="text-xs text-zinc-500">경품</p>
        <p className="text-sm font-medium text-orange-100">{card.event.prize_name}</p>
        {card.event.prize_description ? (
          <p className="mt-0.5 text-xs text-zinc-400">{card.event.prize_description}</p>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <div className="rounded-md border border-zinc-800 bg-zinc-950/60 px-2 py-1.5">
          <p className="text-zinc-500">추첨권</p>
          <p className="font-semibold text-zinc-100">{card.event.ticket_cost_points} P / 1장</p>
        </div>
        <div className="rounded-md border border-zinc-800 bg-zinc-950/60 px-2 py-1.5">
          <p className="text-zinc-500">내 RUN POINT</p>
          <p className="font-semibold text-zinc-100">{card.pointBalance} P</p>
        </div>
        <div className="rounded-md border border-zinc-800 bg-zinc-950/60 px-2 py-1.5">
          <p className="text-zinc-500">내 응모</p>
          <p className="font-semibold text-zinc-100">{card.stats.myTickets}장</p>
        </div>
        <div className="rounded-md border border-zinc-800 bg-zinc-950/60 px-2 py-1.5">
          <p className="text-zinc-500">전체</p>
          <p className="font-semibold text-zinc-100">
            {card.stats.participantCount}명 / {card.stats.totalTickets}장
          </p>
        </div>
      </div>

      <p className="text-[11px] text-zinc-500">
        응모 수가 많을수록 당첨 가능성이 높아집니다. 응모 후 취소는 불가합니다.
      </p>

      {card.isOpenForEntry && !readOnly ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={pending || !canAffordOne || (remaining != null && remaining < 1)}
            onClick={() => requestEnter(1)}
          >
            +1장
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={pending || !canAffordFive || (remaining != null && remaining < 5)}
            onClick={() => requestEnter(5)}
          >
            +5장
          </Button>
          <div className="flex items-center gap-1">
            <Input
              type="number"
              min={1}
              max={remaining ?? undefined}
              value={customCount}
              onChange={(e) => setCustomCount(e.target.value)}
              className="h-8 w-16 bg-zinc-950 text-xs"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={
                pending ||
                card.pointBalance < unitCost * Math.max(1, Math.floor(Number(customCount) || 0))
              }
              onClick={() => requestEnter(Math.floor(Number(customCount)))}
            >
              응모
            </Button>
          </div>
          {max != null ? (
            <span className="text-[11px] text-zinc-500">최대 {max}장</span>
          ) : null}
          {!canAffordOne ? (
            <p className="w-full text-xs text-amber-200/90">
              RUN POINT가 {shortageOne.toLocaleString('ko-KR')}P 부족합니다.
            </p>
          ) : null}
        </div>
      ) : card.event.status === 'OPEN' ? (
        <p className="text-xs text-amber-200/90">응모 마감</p>
      ) : null}

      {card.event.status === 'DRAWN' && card.winners.length > 0 ? (
        <div className="rounded-md border border-orange-500/30 bg-orange-500/5 px-3 py-2">
          <p className="text-xs font-semibold text-orange-200">당첨 결과</p>
          <ul className="mt-1 space-y-0.5 text-sm text-zinc-100">
            {card.winners.map((w) => (
              <li key={`${w.memberId}-${w.winnerOrder}`}>
                {w.winnerOrder}등 · {w.memberName}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <Dialog open={confirmCount != null} onOpenChange={(open) => !open && setConfirmCount(null)}>
        <DialogContent className="max-w-sm border-zinc-800 bg-zinc-950">
          <DialogHeader>
            <DialogTitle>{confirmCount}장 응모</DialogTitle>
            <DialogDescription className="space-y-1 text-zinc-400">
              <span className="block">사용 포인트: {cost} P</span>
              <span className="block">현재: {card.pointBalance} P</span>
              <span className="block">응모 후: {card.pointBalance - cost} P</span>
              <span className="block text-zinc-500">응모 후에는 취소할 수 없습니다.</span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="ghost" disabled={pending} onClick={() => setConfirmCount(null)}>
              취소
            </Button>
            <Button type="button" disabled={pending} onClick={confirmEnter}>
              {pending ? '처리 중…' : '응모하기'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export function MemberRaffleEventCard({
  home,
  memberLinked = true,
  readOnly = false,
  shopMode = false,
  className,
}: Props) {
  const router = useRouter()
  const [showAll, setShowAll] = useState(shopMode)

  if (!memberLinked) {
    return (
      <section className={cn(MEMBER_PORTAL_CARD_CLASS, 'px-3 py-3 sm:px-4', className)}>
        <div className="flex items-center gap-2">
          <Ticket className="h-4 w-4 shrink-0 text-orange-400" aria-hidden />
          <h2 className="text-sm font-semibold text-orange-100 sm:text-base">RUN EVENT</h2>
        </div>
        <p className="mt-2 text-sm text-zinc-400">회원 정보가 연결되어 있지 않아 이벤트를 표시할 수 없습니다.</p>
      </section>
    )
  }

  if (home == null) {
    return (
      <section className={cn(MEMBER_PORTAL_CARD_CLASS, 'px-3 py-3 sm:px-4', className)}>
        <div className="flex items-center gap-2">
          <Ticket className="h-4 w-4 shrink-0 text-orange-400" aria-hidden />
          <h2 className="text-sm font-semibold text-orange-100 sm:text-base">RUN EVENT</h2>
        </div>
        <Skeleton className="mt-3 h-28 rounded-lg bg-zinc-800/80" />
      </section>
    )
  }

  if (!home.tableReady) {
    return (
      <section className={cn(MEMBER_PORTAL_CARD_CLASS, 'px-3 py-3 sm:px-4', className)}>
        <div className="flex items-center gap-2">
          <Ticket className="h-4 w-4 shrink-0 text-orange-400" aria-hidden />
          <h2 className="text-sm font-semibold text-orange-100 sm:text-base">RUN EVENT</h2>
        </div>
        <p className="mt-2 text-xs text-zinc-500">
          추첨 이벤트를 위해 <code className="text-zinc-400">add-raffle-events.sql</code> 적용이
          필요합니다.
        </p>
      </section>
    )
  }

  const featured = home.featured
  const list = showAll ? home.events : featured ? [featured] : []

  return (
    <section className={cn(MEMBER_PORTAL_CARD_CLASS, 'px-3 py-3 sm:px-4', className)}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Ticket className="h-4 w-4 shrink-0 text-orange-400" aria-hidden />
          <h2 className="text-sm font-semibold text-orange-100 sm:text-base">
            {shopMode ? 'RUN EVENT 응모' : 'RUN EVENT'}
          </h2>
        </div>
        {home.events.length > 1 && !shopMode ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-zinc-400"
            onClick={() => setShowAll((v) => !v)}
          >
            {showAll ? '대표만' : '전체 이벤트'}
          </Button>
        ) : null}
      </div>

      {featured && featured.isOpenForEntry && !shopMode ? (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-md border border-orange-500/20 bg-orange-500/5 px-2.5 py-2">
          <p className="text-xs text-zinc-300">
            {featured.event.title}
            {featured.stats.myTickets > 0 ? ` · 응모 ${featured.stats.myTickets}회` : ''}
          </p>
          <Link
            href={RUN_POINT_SHOP_PATH}
            className="inline-flex min-h-9 items-center rounded-md bg-orange-500 px-3 text-xs font-semibold text-[#1c1917] hover:bg-orange-400"
          >
            RUN POINT로 응모
          </Link>
        </div>
      ) : null}

      {list.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-400">
          {shopMode
            ? '현재 RUN POINT로 참여할 수 있는 이벤트가 없습니다.'
            : '진행 중인 추첨 이벤트가 없습니다.'}
        </p>
      ) : (
        <div className="mt-2 space-y-4">
          {list.map((card) => (
            <div key={card.event.id} className="rounded-lg border border-zinc-800/80 bg-zinc-950/40 p-3">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-semibold text-zinc-50">{card.event.title}</h3>
                <span className="shrink-0 rounded border border-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-300">
                  {statusLabel(card)}
                </span>
              </div>
              {card.event.description ? (
                <p className="mt-1 text-xs text-zinc-400">{card.event.description}</p>
              ) : null}
              <EventBody card={card} readOnly={readOnly} onEntered={() => router.refresh()} />
            </div>
          ))}
        </div>
      )}

      {home.pastEvents.filter((e) => e.event.status === 'DRAWN').length > 0 && showAll ? (
        <div className="mt-4 border-t border-zinc-800 pt-3">
          <p className="text-xs font-medium text-zinc-400">지난 이벤트</p>
          <ul className="mt-2 space-y-2">
            {home.pastEvents
              .filter((e) => e.event.status === 'DRAWN')
              .map((card) => (
                <li key={`past-${card.event.id}`} className="text-xs text-zinc-400">
                  <span className="font-medium text-zinc-200">{card.event.title}</span>
                  {' · '}
                  {card.event.prize_name}
                  {' · '}
                  {card.winners.map((w) => w.memberName).join(' / ') || '—'}
                </li>
              ))}
          </ul>
        </div>
      ) : null}
    </section>
  )
}
