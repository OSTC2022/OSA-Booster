'use client'

import { Flame } from 'lucide-react'
import type { RunningStreakStatus } from '@/lib/running-league/running-streak'
import { MEMBER_PORTAL_CARD_CLASS } from '@/lib/running-league/member-portal-layout'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

type MemberRunningStreakCardProps = {
  status: RunningStreakStatus | { unlinked: true } | null | undefined
  memberLinked?: boolean
  className?: string
}

export function MemberRunningStreakCard({
  status,
  memberLinked = true,
  className,
}: MemberRunningStreakCardProps) {
  if (!memberLinked || (status && 'unlinked' in status && status.unlinked)) {
    return (
      <section className={cn(MEMBER_PORTAL_CARD_CLASS, 'px-3 py-3 sm:px-4', className)}>
        <div className="flex items-center gap-2">
          <Flame className="h-4 w-4 shrink-0 text-orange-400" aria-hidden />
          <h2 className="text-sm font-semibold text-orange-100 sm:text-base">RUNNING STREAK</h2>
        </div>
        <p className="mt-2 text-sm text-zinc-400">
          러닝 회원 정보가 연결되어 있지 않아 STREAK를 계산할 수 없습니다.
        </p>
      </section>
    )
  }

  if (status == null) {
    return (
      <section className={cn(MEMBER_PORTAL_CARD_CLASS, 'px-3 py-3 sm:px-4', className)}>
        <div className="flex items-center gap-2">
          <Flame className="h-4 w-4 shrink-0 text-orange-400" aria-hidden />
          <h2 className="text-sm font-semibold text-orange-100 sm:text-base">RUNNING STREAK</h2>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Skeleton className="h-14 rounded-lg bg-zinc-800/80" />
          <Skeleton className="h-14 rounded-lg bg-zinc-800/80" />
        </div>
        <Skeleton className="mt-2 h-12 rounded-lg bg-zinc-800/80" />
      </section>
    )
  }

  if ('unlinked' in status) {
    return null
  }

  const headline =
    status.currentStreak > 0
      ? `🔥 ${status.currentStreak}주 연속`
      : '첫 STREAK에 도전해보세요'

  return (
    <section className={cn(MEMBER_PORTAL_CARD_CLASS, 'px-3 py-3 sm:px-4', className)}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Flame className="h-4 w-4 shrink-0 text-orange-400" aria-hidden />
          <h2 className="text-sm font-semibold text-orange-100 sm:text-base">RUNNING STREAK</h2>
        </div>
        <p className="shrink-0 pt-0.5 text-xs tabular-nums text-zinc-500 sm:text-sm">
          {status.week.shortLabel}
        </p>
      </div>

      <p className="mt-2 text-center text-lg font-bold text-orange-50 sm:text-xl" aria-live="polite">
        {headline}
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="min-w-0 rounded-lg border border-orange-500/15 bg-black/25 px-2.5 py-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500 sm:text-[11px]">
            현재 STREAK
          </p>
          <p className="mt-0.5 text-base font-bold tabular-nums text-orange-50 sm:text-lg">
            {status.currentStreak}주
          </p>
        </div>
        <div className="min-w-0 rounded-lg border border-orange-500/15 bg-black/25 px-2.5 py-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500 sm:text-[11px]">
            최고 기록
          </p>
          <p className="mt-0.5 text-base font-bold tabular-nums text-orange-50 sm:text-lg">
            {status.bestStreak > 0 ? `🏆 ${status.bestStreak}주` : '0주'}
          </p>
        </div>
      </div>

      <div className="mt-2.5 rounded-lg border border-orange-500/15 bg-black/25 px-2.5 py-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500 sm:text-[11px]">
            이번 주
          </p>
          <p className="text-xs tabular-nums text-zinc-300 sm:text-[13px]">
            <span className="font-semibold text-orange-100">{status.currentWeekRuns}회</span>
            <span className="text-zinc-500"> / {status.weeklyTarget}회</span>
          </p>
        </div>
        <div
          className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-800"
          role="progressbar"
          aria-valuenow={status.progressPercent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`이번 주 러닝 ${status.currentWeekRuns}회 / 목표 ${status.weeklyTarget}회`}
        >
          <div
            className={cn(
              'h-full rounded-full transition-[width] duration-300',
              status.currentWeekCompleted ? 'bg-orange-400' : 'bg-orange-500/80',
            )}
            style={{ width: `${status.progressPercent}%` }}
          />
        </div>
        <p className="mt-2 text-xs leading-snug text-orange-100/90 sm:text-[13px]">{status.hint}</p>
      </div>
    </section>
  )
}
