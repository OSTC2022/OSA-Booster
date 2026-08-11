'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Plus } from 'lucide-react'
import { toast } from 'sonner'
import {
  executeRaffleDraw,
  getRaffleAdminDetail,
  listRafflesAdmin,
  setRaffleStatus,
  upsertRaffleEvent,
  type RaffleAdminListItem,
  type RaffleWinnerPublic,
} from '@/lib/actions/raffles'
import type { RaffleStatus } from '@/lib/running-league/raffle/types'
import {
  RaffleWeightedWheelDisc,
  useRaffleWheelSpin,
} from '@/components/dashboard/raffle-weighted-wheel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

type Draft = {
  id?: string
  title: string
  description: string
  prize_name: string
  prize_description: string
  ticket_cost_points: string
  max_entries_per_member: string
  start_at: string
  entry_end_at: string
  draw_at: string
  winner_count: string
}

function toLocalInputValue(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function emptyDraft(): Draft {
  const now = new Date()
  const end = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  return {
    title: '',
    description: '',
    prize_name: '',
    prize_description: '',
    ticket_cost_points: '5',
    max_entries_per_member: '20',
    start_at: toLocalInputValue(now.toISOString()),
    entry_end_at: toLocalInputValue(end.toISOString()),
    draw_at: toLocalInputValue(end.toISOString()),
    winner_count: '1',
  }
}

function fromEvent(event: RaffleAdminListItem): Draft {
  return {
    id: event.id,
    title: event.title,
    description: event.description ?? '',
    prize_name: event.prize_name,
    prize_description: event.prize_description ?? '',
    ticket_cost_points: String(event.ticket_cost_points),
    max_entries_per_member:
      event.max_entries_per_member == null ? '' : String(event.max_entries_per_member),
    start_at: toLocalInputValue(event.start_at),
    entry_end_at: toLocalInputValue(event.entry_end_at),
    draw_at: toLocalInputValue(event.draw_at),
    winner_count: String(event.winner_count),
  }
}

type Props = {
  initialEvents: RaffleAdminListItem[]
  tableReady: boolean
  loadError?: string | null
}

export function RaffleEventsSettingsPanel({
  initialEvents,
  tableReady,
  loadError = null,
}: Props) {
  const router = useRouter()
  const [events, setEvents] = useState(initialEvents)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [pending, startTransition] = useTransition()
  const [drawConfirmId, setDrawConfirmId] = useState<string | null>(null)
  const [drawResult, setDrawResult] = useState<{
    raffleId: string
    winners: RaffleWinnerPublic[]
    pool: Array<{ memberId: string; memberName: string; tickets: number }>
  } | null>(null)
  const { rotation, spinning, spinToWinner } = useRaffleWheelSpin()

  const sorted = useMemo(
    () =>
      [...events].sort(
        (a, b) =>
          (b.created_at ?? '').localeCompare(a.created_at ?? '') ||
          a.title.localeCompare(b.title, 'ko'),
      ),
    [events],
  )

  function refreshList() {
    startTransition(async () => {
      const result = await listRafflesAdmin()
      if (result.tableReady) setEvents(result.events)
      router.refresh()
    })
  }

  function saveDraft(openAfter: boolean) {
    if (!draft) return
    const maxRaw = draft.max_entries_per_member.trim()
    startTransition(async () => {
      const result = await upsertRaffleEvent({
        id: draft.id,
        title: draft.title,
        description: draft.description,
        prize_name: draft.prize_name,
        prize_description: draft.prize_description,
        ticket_cost_points: Number(draft.ticket_cost_points),
        max_entries_per_member: maxRaw === '' ? null : Number(maxRaw),
        start_at: new Date(draft.start_at).toISOString(),
        entry_end_at: new Date(draft.entry_end_at).toISOString(),
        draw_at: draft.draw_at ? new Date(draft.draw_at).toISOString() : null,
        winner_count: Number(draft.winner_count),
        status: openAfter ? 'OPEN' : 'DRAFT',
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(openAfter ? '이벤트를 공개했습니다.' : '저장했습니다.')
      setDraft(null)
      refreshList()
    })
  }

  function changeStatus(id: string, status: Extract<RaffleStatus, 'OPEN' | 'CLOSED' | 'CANCELLED'>) {
    startTransition(async () => {
      const result = await setRaffleStatus(id, status)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(
        status === 'OPEN' ? 'OPEN' : status === 'CLOSED' ? '응모 종료' : '취소 및 환불 완료',
      )
      refreshList()
    })
  }

  function runDraw(raffleId: string) {
    startTransition(async () => {
      setDrawConfirmId(null)
      const detail = await getRaffleAdminDetail(raffleId)
      if (!detail) {
        toast.error('이벤트를 불러오지 못했습니다.')
        return
      }
      const result = await executeRaffleDraw(raffleId)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success('추첨이 완료되었습니다.')
      const first = result.winners[0]
      setDrawResult({
        raffleId,
        winners: result.winners,
        pool: detail.pool,
      })
      if (first) {
        spinToWinner(detail.pool, first.memberId)
      }
      refreshList()
    })
  }

  if (!tableReady) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>추첨 이벤트 관리</CardTitle>
          <CardDescription>
            {loadError ?? 'supabase/add-raffle-events.sql 을 SQL Editor에서 실행해주세요.'}
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <div>
            <CardTitle>추첨 이벤트 관리</CardTitle>
            <CardDescription>
              RUN POINT로 추첨권 교환 · 가중 추첨 · 취소 시 전액 환불. 현금/결제 응모 없음.
            </CardDescription>
          </div>
          <Button type="button" size="sm" onClick={() => setDraft(emptyDraft())}>
            <Plus className="mr-1 h-4 w-4" />
            새 이벤트
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {sorted.length === 0 ? (
            <p className="text-sm text-muted-foreground">등록된 이벤트가 없습니다.</p>
          ) : (
            sorted.map((event) => (
              <div
                key={event.id}
                className={cn('rounded-lg border p-3', event.status === 'OPEN' && 'border-orange-500/40')}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{event.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {event.prize_name} · {event.ticket_cost_points}P/장 · 당첨 {event.winner_count}명 ·{' '}
                      {event.participantCount}명 / {event.totalTickets}장 · {event.status}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => setDraft(fromEvent(event))}>
                      수정
                    </Button>
                    {event.status === 'DRAFT' ? (
                      <Button type="button" size="sm" disabled={pending} onClick={() => changeStatus(event.id, 'OPEN')}>
                        OPEN
                      </Button>
                    ) : null}
                    {event.status === 'OPEN' ? (
                      <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={() => changeStatus(event.id, 'CLOSED')}>
                        응모 종료
                      </Button>
                    ) : null}
                    {event.status === 'CLOSED' ? (
                      <Button type="button" size="sm" disabled={pending} onClick={() => setDrawConfirmId(event.id)}>
                        추첨 시작
                      </Button>
                    ) : null}
                    {event.status !== 'DRAWN' && event.status !== 'CANCELLED' && event.status !== 'DRAWING' ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        disabled={pending}
                        onClick={() => changeStatus(event.id, 'CANCELLED')}
                      >
                        취소·환불
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Dialog open={draft != null} onOpenChange={(open) => !open && setDraft(null)}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{draft?.id ? '이벤트 수정' : '이벤트 생성'}</DialogTitle>
            <DialogDescription>
              OPEN 이후에는 추첨권 가격·당첨 인원·최대 응모·시작 시각이 잠깁니다.
            </DialogDescription>
          </DialogHeader>
          {draft ? (
            <div className="grid gap-3 py-2">
              <div className="grid gap-1">
                <Label>이벤트명</Label>
                <Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
              </div>
              <div className="grid gap-1">
                <Label>설명</Label>
                <Textarea
                  value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  rows={2}
                />
              </div>
              <div className="grid gap-1">
                <Label>경품명</Label>
                <Input
                  value={draft.prize_name}
                  onChange={(e) => setDraft({ ...draft, prize_name: e.target.value })}
                />
              </div>
              <div className="grid gap-1">
                <Label>경품 설명</Label>
                <Textarea
                  value={draft.prize_description}
                  onChange={(e) => setDraft({ ...draft, prize_description: e.target.value })}
                  rows={2}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="grid gap-1">
                  <Label>추첨권 가격 (P)</Label>
                  <Input
                    type="number"
                    min={1}
                    value={draft.ticket_cost_points}
                    onChange={(e) => setDraft({ ...draft, ticket_cost_points: e.target.value })}
                  />
                </div>
                <div className="grid gap-1">
                  <Label>1인 최대 응모 (빈칸=무제한)</Label>
                  <Input
                    type="number"
                    min={1}
                    value={draft.max_entries_per_member}
                    onChange={(e) => setDraft({ ...draft, max_entries_per_member: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid gap-1">
                <Label>당첨 인원</Label>
                <Input
                  type="number"
                  min={1}
                  value={draft.winner_count}
                  onChange={(e) => setDraft({ ...draft, winner_count: e.target.value })}
                />
              </div>
              <div className="grid gap-1">
                <Label>응모 시작</Label>
                <Input
                  type="datetime-local"
                  value={draft.start_at}
                  onChange={(e) => setDraft({ ...draft, start_at: e.target.value })}
                />
              </div>
              <div className="grid gap-1">
                <Label>응모 마감</Label>
                <Input
                  type="datetime-local"
                  value={draft.entry_end_at}
                  onChange={(e) => setDraft({ ...draft, entry_end_at: e.target.value })}
                />
              </div>
              <div className="grid gap-1">
                <Label>추첨 예정</Label>
                <Input
                  type="datetime-local"
                  value={draft.draw_at}
                  onChange={(e) => setDraft({ ...draft, draw_at: e.target.value })}
                />
              </div>
            </div>
          ) : null}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="ghost" disabled={pending} onClick={() => setDraft(null)}>
              닫기
            </Button>
            <Button type="button" variant="secondary" disabled={pending} onClick={() => saveDraft(false)}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'DRAFT 저장'}
            </Button>
            {!draft?.id ? (
              <Button type="button" disabled={pending} onClick={() => saveDraft(true)}>
                저장 후 OPEN
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={drawConfirmId != null} onOpenChange={(open) => !open && setDrawConfirmId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>추첨 시작</DialogTitle>
            <DialogDescription>
              응모권 가중치로 당첨자를 서버에서 선정합니다. 추첨 후 결과는 변경하지 않는 것을
              권장합니다. 동일 회원 중복 당첨은 불가합니다.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setDrawConfirmId(null)}>
              취소
            </Button>
            <Button
              type="button"
              disabled={pending || !drawConfirmId}
              onClick={() => drawConfirmId && runDraw(drawConfirmId)}
            >
              {pending ? '추첨 중…' : '추첨 실행'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={drawResult != null} onOpenChange={(open) => !open && setDrawResult(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>당첨 결과</DialogTitle>
            <DialogDescription>서버에서 확정된 결과입니다. 돌림판은 시각 효과입니다.</DialogDescription>
          </DialogHeader>
          {drawResult ? (
            <div className="space-y-3">
              <RaffleWeightedWheelDisc
                segments={drawResult.pool}
                targetWinnerMemberId={drawResult.winners[0]?.memberId ?? null}
                spinning={spinning}
                rotation={rotation}
              />
              <ul className="space-y-1 text-sm">
                {drawResult.winners.map((w) => (
                  <li key={`${w.memberId}-${w.winnerOrder}`}>
                    {w.winnerOrder}등 · {w.memberName} ({w.entrySnapshot}장)
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
