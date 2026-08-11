'use client'

import { useMemo, useState } from 'react'
import { Flame } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { formatMileageKmDisplay } from '@/lib/running-league/mileage-leaderboard'
import { MEMBER_PORTAL_CARD_CLASS } from '@/lib/running-league/member-portal-layout'
import type { TeamBattleScoreboard, TeamCode } from '@/lib/running-league/team-battle'
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

type MemberTeamBattleCardProps = {
  home:
    | { scoreboard: TeamBattleScoreboard | null; tableReady: boolean }
    | null
    | undefined
  memberLinked?: boolean
  className?: string
}

function formatBattleRange(startAt: string, endAt: string): string {
  try {
    return `${format(parseISO(startAt), 'M.d')} ~ ${format(parseISO(endAt), 'M.d')}`
  } catch {
    return `${startAt} ~ ${endAt}`
  }
}

function displayStatusLabel(status: TeamBattleScoreboard['displayStatus']): string {
  if (status === 'upcoming') return '예정'
  if (status === 'ended') return '종료'
  return '진행중'
}

function teamPrimaryKm(scoreboard: TeamBattleScoreboard, team: TeamCode): number {
  const stats = team === 'RED' ? scoreboard.red : scoreboard.blue
  return scoreboard.battle.scoring_mode === 'total_distance'
    ? stats.totalDistanceKm
    : stats.averageDistanceKm
}

export function MemberTeamBattleCard({
  home,
  memberLinked = true,
  className,
}: MemberTeamBattleCardProps) {
  const [detailOpen, setDetailOpen] = useState(false)
  const scoreboard = home?.scoreboard ?? null

  const periodLabel = useMemo(() => {
    if (!scoreboard) return ''
    return formatBattleRange(scoreboard.battle.start_at, scoreboard.battle.end_at)
  }, [scoreboard])

  if (!memberLinked) {
    return (
      <section className={cn(MEMBER_PORTAL_CARD_CLASS, 'px-3 py-3 sm:px-4', className)}>
        <div className="flex items-center gap-2">
          <Flame className="h-4 w-4 shrink-0 text-orange-400" aria-hidden />
          <h2 className="text-sm font-semibold text-orange-100 sm:text-base">TEAM BATTLE</h2>
        </div>
        <p className="mt-2 text-sm text-zinc-400">
          러닝 회원 정보가 연결되어 있지 않아 팀 배틀을 표시할 수 없습니다.
        </p>
      </section>
    )
  }

  if (home == null) {
    return (
      <section className={cn(MEMBER_PORTAL_CARD_CLASS, 'px-3 py-3 sm:px-4', className)}>
        <div className="flex items-center gap-2">
          <Flame className="h-4 w-4 shrink-0 text-orange-400" aria-hidden />
          <h2 className="text-sm font-semibold text-orange-100 sm:text-base">TEAM BATTLE</h2>
        </div>
        <Skeleton className="mt-3 h-28 rounded-lg bg-zinc-800/80" />
      </section>
    )
  }

  if (!home.tableReady) {
    return (
      <section className={cn(MEMBER_PORTAL_CARD_CLASS, 'px-3 py-3 sm:px-4', className)}>
        <div className="flex items-center gap-2">
          <Flame className="h-4 w-4 shrink-0 text-orange-400" aria-hidden />
          <h2 className="text-sm font-semibold text-orange-100 sm:text-base">TEAM BATTLE</h2>
        </div>
        <p className="mt-2 text-xs text-zinc-500">
          팀 배틀을 위해 <code className="text-zinc-400">add-team-battles.sql</code> 적용이
          필요합니다.
        </p>
      </section>
    )
  }

  if (!scoreboard) {
    return (
      <section className={cn(MEMBER_PORTAL_CARD_CLASS, 'px-3 py-3 sm:px-4', className)}>
        <div className="flex items-center gap-2">
          <Flame className="h-4 w-4 shrink-0 text-orange-400" aria-hidden />
          <h2 className="text-sm font-semibold text-orange-100 sm:text-base">TEAM BATTLE</h2>
        </div>
        <p className="mt-2 text-sm text-zinc-400">현재 진행 중인 팀 배틀이 없습니다.</p>
      </section>
    )
  }

  const redKm = teamPrimaryKm(scoreboard, 'RED')
  const blueKm = teamPrimaryKm(scoreboard, 'BLUE')
  const scoreUnit = scoreboard.scoreLabel

  return (
    <>
      <section className={cn(MEMBER_PORTAL_CARD_CLASS, 'px-3 py-3 sm:px-4', className)}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Flame className="h-4 w-4 shrink-0 text-orange-400" aria-hidden />
              <h2 className="truncate text-sm font-semibold text-orange-100 sm:text-base">
                {scoreboard.battle.title}
              </h2>
            </div>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              TEAM BATTLE · {periodLabel} · {displayStatusLabel(scoreboard.displayStatus)}
            </p>
          </div>
          <p className="shrink-0 text-xs font-semibold tabular-nums text-orange-200/90">
            {scoreboard.countdownLabel}
          </p>
        </div>

        <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <div
            className={cn(
              'rounded-lg border px-2.5 py-2 text-center',
              scoreboard.myTeam === 'RED'
                ? 'border-red-400/40 bg-red-500/10'
                : 'border-orange-500/15 bg-black/25',
            )}
          >
            <p className="text-[11px] font-semibold tracking-wide text-red-300">RED TEAM</p>
            <p className="mt-0.5 text-base font-bold tabular-nums text-orange-50">
              {formatMileageKmDisplay(redKm)}
            </p>
            <p className="text-[10px] text-zinc-500">{scoreUnit}</p>
          </div>
          <p className="text-xs font-semibold tracking-wide text-zinc-500">VS</p>
          <div
            className={cn(
              'rounded-lg border px-2.5 py-2 text-center',
              scoreboard.myTeam === 'BLUE'
                ? 'border-sky-400/40 bg-sky-500/10'
                : 'border-orange-500/15 bg-black/25',
            )}
          >
            <p className="text-[11px] font-semibold tracking-wide text-sky-300">BLUE TEAM</p>
            <p className="mt-0.5 text-base font-bold tabular-nums text-orange-50">
              {formatMileageKmDisplay(blueKm)}
            </p>
            <p className="text-[10px] text-zinc-500">{scoreUnit}</p>
          </div>
        </div>

        {scoreboard.leadLabel ? (
          <p className="mt-2 text-center text-xs font-medium text-orange-100/90">
            {scoreboard.leadLabel}
          </p>
        ) : null}

        <div className="mt-2 grid grid-cols-2 gap-2 text-center text-[11px] text-zinc-400">
          <p>
            참여율 RED{' '}
            <span className="tabular-nums text-zinc-200">{scoreboard.red.participationRate}%</span>
          </p>
          <p>
            참여율 BLUE{' '}
            <span className="tabular-nums text-zinc-200">{scoreboard.blue.participationRate}%</span>
          </p>
        </div>

        <div className="mt-3 space-y-1 rounded-lg border border-orange-500/15 bg-black/25 px-2.5 py-2 text-sm">
          {scoreboard.myTeam ? (
            <>
              <p className="text-orange-50">
                내 팀{' '}
                <span className="font-semibold">
                  {scoreboard.myTeam === 'RED' ? 'RED TEAM' : 'BLUE TEAM'}
                </span>
              </p>
              <p className="text-xs text-zinc-400">
                내 기여{' '}
                <span className="tabular-nums text-orange-100">
                  {formatMileageKmDisplay(scoreboard.myContributionKm ?? 0)}
                </span>
                {scoreboard.myContributionShare != null ? (
                  <span className="text-zinc-500">
                    {' '}
                    · 기여율 {scoreboard.myContributionShare}%
                  </span>
                ) : null}
              </p>
            </>
          ) : (
            <p className="text-xs text-zinc-400">이번 배틀 참가 명단에 없습니다.</p>
          )}
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {(['RED', 'BLUE'] as const).map((team) => {
            const stats = team === 'RED' ? scoreboard.red : scoreboard.blue
            return (
              <div key={team} className="rounded-lg border border-orange-500/10 bg-black/20 px-2 py-1.5">
                <p
                  className={cn(
                    'text-[11px] font-semibold',
                    team === 'RED' ? 'text-red-300' : 'text-sky-300',
                  )}
                >
                  {team} TOP 3
                </p>
                <ul className="mt-1 space-y-0.5">
                  {stats.topRunners.length === 0 ? (
                    <li className="text-[11px] text-zinc-500">기록 없음</li>
                  ) : (
                    stats.topRunners.map((runner, index) => (
                      <li
                        key={runner.memberId}
                        className="flex items-center justify-between gap-1 text-[11px] text-zinc-300"
                      >
                        <span className="min-w-0 truncate">
                          {index + 1}. {runner.memberName}
                        </span>
                        <span className="shrink-0 tabular-nums text-zinc-400">
                          {formatMileageKmDisplay(runner.distanceKm)}
                        </span>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            )
          })}
        </div>

        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="mt-2 h-8 w-full text-xs text-orange-200 hover:bg-orange-500/10 hover:text-orange-100"
          onClick={() => setDetailOpen(true)}
        >
          팀 상세보기
        </Button>
      </section>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent mobileSheet className="max-h-[85vh] overflow-hidden sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{scoreboard.battle.title}</DialogTitle>
            <DialogDescription>
              {periodLabel} · {scoreUnit} · {displayStatusLabel(scoreboard.displayStatus)}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[55vh] space-y-4 overflow-y-auto pr-1">
            {(['RED', 'BLUE'] as const).map((team) => {
              const stats = team === 'RED' ? scoreboard.red : scoreboard.blue
              return (
                <div key={team}>
                  <p
                    className={cn(
                      'mb-1.5 text-sm font-semibold',
                      team === 'RED' ? 'text-red-400' : 'text-sky-400',
                    )}
                  >
                    {team} TEAM ({stats.memberCount}명 · 참여 {stats.participantCount})
                  </p>
                  <ul className="space-y-1">
                    {stats.members.map((row) => (
                      <li
                        key={row.memberId}
                        className="flex items-center justify-between gap-2 rounded-md border border-border/50 px-2.5 py-1.5 text-sm"
                      >
                        <span className="min-w-0 truncate font-medium">{row.memberName}</span>
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                          {row.participated
                            ? `${formatMileageKmDisplay(row.distanceKm)} · ${row.runCount}회`
                            : '0km · 미참여'}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
