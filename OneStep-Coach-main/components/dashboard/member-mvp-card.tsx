'use client'

import { useState } from 'react'
import { Trophy } from 'lucide-react'
import {
  summarizeMvpWinnersLabel,
  type MvpCategoryResult,
  type MvpHomeView,
  type MvpPeriod,
  type MvpPeriodBoard,
} from '@/lib/running-league/mvp'
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

type MemberMvpCardProps = {
  home: MvpHomeView | { unlinked: true } | null | undefined
  memberLinked?: boolean
  className?: string
}

function CategoryRow({
  category,
  provisional,
}: {
  category: MvpCategoryResult
  provisional: boolean
}) {
  if (!category.available) {
    return (
      <div className="rounded-lg border border-orange-500/10 bg-black/20 px-2.5 py-2">
        <p className="text-sm font-semibold text-orange-50">
          {category.icon} {category.label}
        </p>
        <p className="mt-0.5 text-[11px] text-zinc-500">{category.unavailableReason}</p>
      </div>
    )
  }

  const winners = category.winners
  const empty = winners.length === 0

  return (
    <div className="rounded-lg border border-orange-500/15 bg-black/25 px-2.5 py-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-orange-50">
            {category.icon} {category.label}
          </p>
          {provisional ? (
            <p className="text-[10px] text-zinc-500">현재 기준</p>
          ) : null}
        </div>
        {!empty ? (
          <p className="shrink-0 text-xs font-semibold tabular-nums text-orange-100">
            {winners[0].valueLabel}
          </p>
        ) : null}
      </div>
      <p className="mt-1 truncate text-sm text-zinc-300">
        {empty ? '아직 없음' : summarizeMvpWinnersLabel(winners)}
      </p>
    </div>
  )
}

function BoardBody({ board }: { board: MvpPeriodBoard }) {
  return (
    <div className="mt-3 space-y-2">
      {board.myTitles.length > 0 ? (
        <div className="rounded-lg border border-orange-400/25 bg-orange-500/10 px-2.5 py-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-orange-300/90">
            내 칭호
          </p>
          <ul className="mt-1 space-y-0.5">
            {board.myTitles.map((title) => (
              <li key={title} className="text-sm text-orange-50">
                {title}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-[11px] text-zinc-500">이번 기간 MVP에 도전해보세요.</p>
      )}
      {board.categories.map((category) => (
        <CategoryRow key={category.category} category={category} provisional={board.provisional} />
      ))}
    </div>
  )
}

export function MemberMvpCard({
  home,
  memberLinked = true,
  className,
}: MemberMvpCardProps) {
  const [period, setPeriod] = useState<MvpPeriod>('weekly')
  const [detailOpen, setDetailOpen] = useState(false)

  if (!memberLinked || (home && 'unlinked' in home && home.unlinked)) {
    return (
      <section className={cn(MEMBER_PORTAL_CARD_CLASS, 'px-3 py-3 sm:px-4', className)}>
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 shrink-0 text-orange-400" aria-hidden />
          <h2 className="text-sm font-semibold text-orange-100 sm:text-base">RUNNING MVP</h2>
        </div>
        <p className="mt-2 text-sm text-zinc-400">
          러닝 회원 정보가 연결되어 있지 않아 MVP를 계산할 수 없습니다.
        </p>
      </section>
    )
  }

  if (home == null || 'unlinked' in home) {
    return (
      <section className={cn(MEMBER_PORTAL_CARD_CLASS, 'px-3 py-3 sm:px-4', className)}>
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 shrink-0 text-orange-400" aria-hidden />
          <h2 className="text-sm font-semibold text-orange-100 sm:text-base">RUNNING MVP</h2>
        </div>
        <Skeleton className="mt-3 h-40 rounded-lg bg-zinc-800/80" />
      </section>
    )
  }

  const board = period === 'weekly' ? home.weekly : home.monthly

  return (
    <>
      <section className={cn(MEMBER_PORTAL_CARD_CLASS, 'px-3 py-3 sm:px-4', className)}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Trophy className="h-4 w-4 shrink-0 text-orange-400" aria-hidden />
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-orange-100 sm:text-base">RUNNING MVP</h2>
              <p className="text-[11px] text-zinc-500">
                {board.rangeLabel} · 현재 기준
              </p>
            </div>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-1 rounded-lg bg-black/30 p-1">
          {([
            ['weekly', '이번 주'],
            ['monthly', '이번 달'],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setPeriod(value)}
              className={cn(
                'rounded-md px-2 py-1.5 text-xs font-medium transition',
                period === value
                  ? 'bg-orange-500/20 text-orange-100'
                  : 'text-zinc-400 hover:text-zinc-200',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <BoardBody board={board} />

        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="mt-2 h-8 w-full text-xs text-orange-200 hover:bg-orange-500/10 hover:text-orange-100"
          onClick={() => setDetailOpen(true)}
        >
          TOP 3 · 내 순위 보기
        </Button>
      </section>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent mobileSheet className="max-h-[85vh] overflow-hidden sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {board.periodLabel} MVP · {board.rangeLabel}
            </DialogTitle>
            <DialogDescription>현재 기준 순위입니다. 기간 종료 전 변경될 수 있습니다.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[55vh] space-y-4 overflow-y-auto pr-1">
            {board.categories.map((category) => (
              <div key={category.category}>
                <p className="mb-1.5 text-sm font-semibold text-foreground">
                  {category.icon} {category.label}
                </p>
                {!category.available ? (
                  <p className="text-xs text-muted-foreground">{category.unavailableReason}</p>
                ) : category.top.length === 0 ? (
                  <p className="text-xs text-muted-foreground">아직 수상자가 없습니다.</p>
                ) : (
                  <ul className="space-y-1">
                    {category.top.map((row, index) => (
                      <li
                        key={row.memberId}
                        className="flex items-center justify-between gap-2 rounded-md border border-border/50 px-2.5 py-1.5 text-sm"
                      >
                        <span className="min-w-0 truncate">
                          {index + 1}. {row.memberName}
                        </span>
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                          {row.valueLabel}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {category.myRank != null ? (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    내 순위 {category.myRank}위
                    {category.myValueLabel ? ` · ${category.myValueLabel}` : ''}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
