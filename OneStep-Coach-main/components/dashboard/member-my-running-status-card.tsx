'use client'

import { Activity, TrendingUp } from 'lucide-react'
import {
  buildMyRunningStatusView,
  formatProjectedRankHint,
} from '@/lib/running-league/my-running-status'
import type { MemberRunningLeagueHome } from '@/lib/actions/running-league'
import { MEMBER_PORTAL_CARD_CLASS } from '@/lib/running-league/member-portal-layout'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

type MemberMyRunningStatusCardProps = {
  memberId: string | null | undefined
  memberName: string
  runningLeagueHome: MemberRunningLeagueHome | null | undefined
  /** 회원 연결 자체가 없을 때 */
  memberLinked?: boolean
  className?: string
}

function StatCell({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint?: string | null
}) {
  return (
    <div className="min-w-0 rounded-lg border border-orange-500/15 bg-black/25 px-2.5 py-2 sm:px-3">
      <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500 sm:text-[11px]">
        {label}
      </p>
      <p className="mt-0.5 truncate text-base font-bold tabular-nums text-orange-50 sm:text-lg">
        {value}
      </p>
      {hint ? <p className="mt-0.5 truncate text-[10px] text-zinc-500">{hint}</p> : null}
    </div>
  )
}

export function MemberMyRunningStatusCard({
  memberId,
  memberName,
  runningLeagueHome,
  memberLinked = true,
  className,
}: MemberMyRunningStatusCardProps) {
  if (!memberLinked || !memberId) {
    return (
      <section className={cn(MEMBER_PORTAL_CARD_CLASS, 'px-3 py-3 sm:px-4', className)}>
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 shrink-0 text-orange-400" aria-hidden />
          <h2 className="text-sm font-semibold text-orange-100 sm:text-base">내 러닝 현황</h2>
        </div>
        <p className="mt-2 text-sm text-zinc-400">러닝 회원 정보가 연결되어 있지 않습니다.</p>
      </section>
    )
  }

  if (!runningLeagueHome) {
    return (
      <section className={cn(MEMBER_PORTAL_CARD_CLASS, 'px-3 py-3 sm:px-4', className)}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 shrink-0 text-orange-400" aria-hidden />
            <h2 className="text-sm font-semibold text-orange-100 sm:text-base">내 러닝 현황</h2>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Skeleton className="h-14 rounded-lg bg-zinc-800/80" />
          <Skeleton className="h-14 rounded-lg bg-zinc-800/80" />
          <Skeleton className="h-14 rounded-lg bg-zinc-800/80" />
        </div>
      </section>
    )
  }

  if (!runningLeagueHome.tableReady) {
    return (
      <section className={cn(MEMBER_PORTAL_CARD_CLASS, 'px-3 py-3 sm:px-4', className)}>
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 shrink-0 text-orange-400" aria-hidden />
          <h2 className="text-sm font-semibold text-orange-100 sm:text-base">내 러닝 현황</h2>
        </div>
        <p className="mt-2 text-sm text-zinc-500">러닝 현황을 준비 중입니다.</p>
      </section>
    )
  }

  const status = buildMyRunningStatusView({
    memberId,
    memberName,
    mileageLeaderboard: runningLeagueHome.mileageLeaderboard,
    mileageLogs: runningLeagueHome.mileageLogs,
    rankingPeriod: runningLeagueHome.rankingPeriod,
    mileageRecognition: runningLeagueHome.rankingBundle?.mileageRecognition ?? null,
  })

  if (!status) {
    return (
      <section className={cn(MEMBER_PORTAL_CARD_CLASS, 'px-3 py-3 sm:px-4', className)}>
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 shrink-0 text-orange-400" aria-hidden />
          <h2 className="text-sm font-semibold text-orange-100 sm:text-base">내 러닝 현황</h2>
        </div>
        <p className="mt-2 text-sm text-zinc-400">러닝 회원 정보가 연결되어 있지 않습니다.</p>
      </section>
    )
  }

  const rankLabel =
    status.rank != null
      ? `${status.rank}위 / ${status.rankedCount}명`
      : status.rankedCount > 0
        ? `- / ${status.rankedCount}명`
        : '-'

  const projectedHint = formatProjectedRankHint(status)

  let footer: string
  if (status.isFirstPlace) {
    footer =
      status.rankedCount <= 1 ? '이번 달 현재 1위입니다' : '현재 1위입니다 🏆'
  } else if (status.gapToNextLabel) {
    footer = `다음 순위까지 ${status.gapToNextLabel}`
  } else if (status.rank != null) {
    footer = '바로 위 순위와 거리가 같습니다'
  } else if (!status.hasMonthlyDistance) {
    footer = '첫 러닝 기록을 등록해보세요.'
  } else {
    footer = '이번 달 기록을 등록하면 랭킹에 참여할 수 있습니다.'
  }

  return (
    <section className={cn(MEMBER_PORTAL_CARD_CLASS, 'px-3 py-3 sm:px-4', className)}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 shrink-0 text-orange-400" aria-hidden />
            <h2 className="text-sm font-semibold text-orange-100 sm:text-base">내 러닝 현황</h2>
          </div>
          <p className="mt-1 truncate text-base font-bold text-zinc-50 sm:text-lg">
            {status.memberName}
          </p>
        </div>
        <p className="shrink-0 pt-0.5 text-xs tabular-nums text-zinc-500 sm:text-sm">
          {status.periodLabel}
        </p>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <StatCell label="이번 달" value={status.monthlyKmLabel} />
        <StatCell label="현재 순위" value={rankLabel} />
        <StatCell label="러닝" value={`${status.runCount}회`} />
      </div>

      <div className="mt-2.5 flex items-start gap-1.5 rounded-md border border-orange-500/10 bg-orange-500/5 px-2.5 py-2">
        <TrendingUp className="mt-0.5 h-3.5 w-3.5 shrink-0 text-orange-300" aria-hidden />
        <div className="min-w-0 space-y-0.5">
          <p className="text-xs leading-snug text-orange-100/90 sm:text-[13px]">{footer}</p>
          {projectedHint ? (
            <p className="text-[11px] leading-snug text-zinc-500">{projectedHint}</p>
          ) : null}
        </div>
      </div>
    </section>
  )
}
