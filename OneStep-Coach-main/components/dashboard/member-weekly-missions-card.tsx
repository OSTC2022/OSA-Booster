'use client'

import { CheckCircle2, Target } from 'lucide-react'
import { MEMBER_PORTAL_CARD_CLASS } from '@/lib/running-league/member-portal-layout'
import type { WeeklyMissionProgressItem, WeeklyMissionsView } from '@/lib/running-league/weekly-missions'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

type MemberWeeklyMissionsCardProps = {
  view: WeeklyMissionsView | { unlinked: true } | null | undefined
  memberLinked?: boolean
  className?: string
}

function MissionItem({ mission }: { mission: WeeklyMissionProgressItem }) {
  return (
    <div
      className={cn(
        'rounded-lg border px-2.5 py-2 sm:px-3',
        mission.completed
          ? 'border-orange-400/35 bg-orange-500/10'
          : 'border-orange-500/15 bg-black/25',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 text-sm font-semibold leading-snug text-orange-50">
          {mission.title}
        </p>
        {mission.completed ? (
          <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-orange-300">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
            완료
          </span>
        ) : null}
      </div>
      {mission.description ? (
        <p className="mt-0.5 truncate text-[11px] text-zinc-500">{mission.description}</p>
      ) : null}

      <div className="mt-2 flex items-center gap-2">
        <div
          className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-zinc-800"
          role="progressbar"
          aria-valuenow={mission.progressPercent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${mission.title} 진행률 ${mission.progressPercent}%`}
        >
          <div
            className={cn(
              'h-full rounded-full transition-[width] duration-300',
              mission.completed ? 'bg-orange-400' : 'bg-orange-500/80',
            )}
            style={{ width: `${mission.progressPercent}%` }}
          />
        </div>
        <p className="shrink-0 text-xs tabular-nums text-zinc-300 sm:text-[13px]">
          <span className="font-semibold text-orange-100">{mission.currentLabel}</span>
          <span className="text-zinc-500"> / {mission.targetLabel}</span>
        </p>
      </div>
    </div>
  )
}

export function MemberWeeklyMissionsCard({
  view,
  memberLinked = true,
  className,
}: MemberWeeklyMissionsCardProps) {
  if (!memberLinked || (view && 'unlinked' in view && view.unlinked)) {
    return (
      <section className={cn(MEMBER_PORTAL_CARD_CLASS, 'px-3 py-3 sm:px-4', className)}>
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 shrink-0 text-orange-400" aria-hidden />
          <h2 className="text-sm font-semibold text-orange-100 sm:text-base">이번 주 미션</h2>
        </div>
        <p className="mt-2 text-sm text-zinc-400">
          러닝 회원 정보가 연결되어 있지 않아 주간 미션을 계산할 수 없습니다.
        </p>
      </section>
    )
  }

  if (view == null) {
    return (
      <section className={cn(MEMBER_PORTAL_CARD_CLASS, 'px-3 py-3 sm:px-4', className)}>
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 shrink-0 text-orange-400" aria-hidden />
          <h2 className="text-sm font-semibold text-orange-100 sm:text-base">이번 주 미션</h2>
        </div>
        <div className="mt-3 space-y-2">
          <Skeleton className="h-16 rounded-lg bg-zinc-800/80" />
          <Skeleton className="h-16 rounded-lg bg-zinc-800/80" />
          <Skeleton className="h-16 rounded-lg bg-zinc-800/80" />
        </div>
      </section>
    )
  }

  if ('unlinked' in view) {
    return null
  }

  if (view.missions.length === 0) {
    return (
      <section className={cn(MEMBER_PORTAL_CARD_CLASS, 'px-3 py-3 sm:px-4', className)}>
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 shrink-0 text-orange-400" aria-hidden />
          <h2 className="text-sm font-semibold text-orange-100 sm:text-base">이번 주 미션</h2>
        </div>
        <p className="mt-2 text-sm text-zinc-400">이번 주 등록된 미션이 없습니다.</p>
      </section>
    )
  }

  return (
    <section className={cn(MEMBER_PORTAL_CARD_CLASS, 'px-3 py-3 sm:px-4', className)}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 shrink-0 text-orange-400" aria-hidden />
            <h2 className="text-sm font-semibold text-orange-100 sm:text-base">이번 주 미션</h2>
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            {view.completedCount} / {view.totalCount} 완료
            {view.source === 'default' ? (
              <span className="text-zinc-600"> · 기본 미션</span>
            ) : null}
          </p>
        </div>
        <p className="shrink-0 pt-0.5 text-xs tabular-nums text-zinc-500 sm:text-sm">
          {view.week.shortLabel}
        </p>
      </div>

      <div className="mt-3 space-y-2">
        {view.missions.map((mission) => (
          <MissionItem key={mission.id} mission={mission} />
        ))}
      </div>
    </section>
  )
}
