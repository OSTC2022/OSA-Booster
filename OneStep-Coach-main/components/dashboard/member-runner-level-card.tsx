'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Star } from 'lucide-react'
import type { MemberRewardHome } from '@/lib/actions/rewards'
import { RUN_POINT_SHOP_PATH } from '@/lib/running-league/run-point-shop'
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

type MemberRunnerLevelCardProps = {
  home: MemberRewardHome | { unlinked: true } | null | undefined
  memberLinked?: boolean
  className?: string
}

function formatSigned(amount: number, currency: string): string {
  const sign = amount >= 0 ? '+' : ''
  const unit = currency === 'POINT' ? 'P' : 'XP'
  return `${sign}${amount} ${unit}`
}

function ledgerTitle(row: { source_type: string; description: string; currency: string }): string {
  if (row.source_type === 'RAFFLE_ENTRY') return row.description || 'RUN EVENT 응모'
  if (row.source_type === 'RAFFLE_REFUND') return row.description || 'RUN EVENT 환급'
  return row.description
}

export function MemberRunnerLevelCard({
  home,
  memberLinked = true,
  className,
}: MemberRunnerLevelCardProps) {
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState<'ALL' | 'XP' | 'POINT'>('ALL')

  const linked = home && !('unlinked' in home) ? home : null

  const filtered = useMemo(() => {
    if (!linked) return []
    if (filter === 'ALL') return linked.recent
    return linked.recent.filter((row) => row.currency === filter)
  }, [linked, filter])

  if (!memberLinked || (home && 'unlinked' in home && home.unlinked)) {
    return (
      <section className={cn(MEMBER_PORTAL_CARD_CLASS, 'px-3 py-3 sm:px-4', className)}>
        <div className="flex items-center gap-2">
          <Star className="h-4 w-4 shrink-0 text-orange-400" aria-hidden />
          <h2 className="text-sm font-semibold text-orange-100 sm:text-base">RUNNER LEVEL</h2>
        </div>
        <p className="mt-2 text-sm text-zinc-400">러닝 회원 정보가 연결되어 있지 않습니다.</p>
      </section>
    )
  }

  if (home == null || !linked) {
    return (
      <section className={cn(MEMBER_PORTAL_CARD_CLASS, 'px-3 py-3 sm:px-4', className)}>
        <div className="flex items-center gap-2">
          <Star className="h-4 w-4 shrink-0 text-orange-400" aria-hidden />
          <h2 className="text-sm font-semibold text-orange-100 sm:text-base">RUNNER LEVEL</h2>
        </div>
        <Skeleton className="mt-3 h-24 rounded-lg bg-zinc-800/80" />
      </section>
    )
  }

  const { level } = linked

  return (
    <>
      <section className={cn(MEMBER_PORTAL_CARD_CLASS, 'px-3 py-3 sm:px-4', className)}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Star className="h-4 w-4 shrink-0 text-orange-400" aria-hidden />
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-orange-100 sm:text-base">
                Lv.{level.level} {level.title}
              </h2>
              <p className="text-[11px] tabular-nums text-zinc-500">
                {level.totalXp.toLocaleString('ko-KR')} XP
              </p>
            </div>
          </div>
          <Link
            href={RUN_POINT_SHOP_PATH}
            className="shrink-0 rounded-md border border-orange-500/20 bg-black/25 px-2 py-1 text-right transition hover:border-orange-400/50 hover:bg-orange-500/15 active:scale-[0.98]"
            aria-label="RUN POINT SHOP 열기"
          >
            <p className="text-[10px] uppercase tracking-wide text-zinc-500">RUN POINT</p>
            <p className="text-sm font-bold tabular-nums text-orange-100">
              {linked.totalPoints.toLocaleString('ko-KR')} P
            </p>
          </Link>
        </div>

        {!linked.tableReady ? (
          <p className="mt-2 text-xs text-zinc-500">
            XP/포인트 저장을 위해 <code className="text-zinc-400">add-member-reward-ledger.sql</code>{' '}
            적용이 필요합니다.
          </p>
        ) : null}

        <div className="mt-3">
          <div
            className="h-2 overflow-hidden rounded-full bg-zinc-800"
            role="progressbar"
            aria-valuenow={level.progressPercent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="레벨 진행률"
          >
            <div
              className="h-full rounded-full bg-orange-500/80 transition-[width]"
              style={{ width: `${level.progressPercent}%` }}
            />
          </div>
          <p className="mt-1.5 text-[11px] text-zinc-400">
            {level.isMaxLevel
              ? 'MAX LEVEL'
              : `다음 레벨까지 ${level.xpToNext?.toLocaleString('ko-KR') ?? 0} XP`}
            <span className="text-zinc-600"> · {level.progressPercent}%</span>
          </p>
        </div>

        {linked.leveledUp && linked.previousLevel != null ? (
          <p className="mt-2 text-xs font-medium text-orange-200">
            LEVEL UP! Lv.{level.level} {level.title}
          </p>
        ) : null}

        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-9 w-full text-xs text-orange-200 hover:bg-orange-500/10 hover:text-orange-100"
            onClick={() => setOpen(true)}
          >
            내역 보기
          </Button>
          <Button
            asChild
            size="sm"
            className="h-9 w-full bg-orange-500 text-xs font-semibold text-[#1c1917] hover:bg-orange-400"
          >
            <Link href={RUN_POINT_SHOP_PATH}>RUN POINT 사용하기</Link>
          </Button>
        </div>
      </section>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent mobileSheet className="max-h-[85vh] overflow-hidden sm:max-w-md">
          <DialogHeader>
            <DialogTitle>보상 내역</DialogTitle>
            <DialogDescription>
              XP는 성장 경험치, RUN POINT는 이벤트 응모에 사용하는 포인트입니다.
            </DialogDescription>
          </DialogHeader>
          <div className="mb-2 grid grid-cols-3 gap-1 rounded-lg bg-muted/40 p-1">
            {([
              ['ALL', '전체'],
              ['XP', 'XP'],
              ['POINT', 'RUN POINT'],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                className={cn(
                  'rounded-md px-2 py-1.5 text-xs font-medium',
                  filter === value ? 'bg-background shadow-sm' : 'text-muted-foreground',
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="max-h-[50vh] space-y-1.5 overflow-y-auto pr-1">
            {filtered.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">내역이 없습니다.</p>
            ) : (
              filtered.map((row) => (
                <div
                  key={row.id}
                  className="flex items-start justify-between gap-2 rounded-md border border-border/50 px-2.5 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{ledgerTitle(row)}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {row.created_at.slice(0, 10)} · {row.source_type}
                    </p>
                  </div>
                  <span
                    className={cn(
                      'shrink-0 text-sm font-semibold tabular-nums',
                      row.amount >= 0 ? 'text-orange-600 dark:text-orange-300' : 'text-destructive',
                    )}
                  >
                    {formatSigned(row.amount, row.currency)}
                  </span>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
