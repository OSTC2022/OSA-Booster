'use client'

import { useState } from 'react'
import { Crown, Sparkles, TrendingUp, Trophy, Users } from 'lucide-react'
import { formatRankingMemberName } from '@/lib/running-league/mask-member-name'
import type { LeagueDailyHighlight } from '@/lib/running-league/league-daily-highlights'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

function highlightIcon(kind: LeagueDailyHighlight['kind']) {
  switch (kind) {
    case 'daily_star':
      return Sparkles
    case 'rank_climber':
      return TrendingUp
    case 'leader_streak':
      return Crown
    case 'league_pulse':
      return Users
    case 'runner_up':
      return Trophy
    default:
      return Sparkles
  }
}

function highlightIconClass(kind: LeagueDailyHighlight['kind']) {
  switch (kind) {
    case 'daily_star':
      return 'text-amber-300'
    case 'rank_climber':
      return 'text-emerald-400'
    case 'leader_streak':
      return 'text-yellow-300'
    case 'league_pulse':
      return 'text-sky-300'
    case 'runner_up':
      return 'text-lime-300'
    default:
      return 'text-lime-300'
  }
}

function DailyHighlightCard({
  item,
  highlightMemberId,
  onOpenDetail,
}: {
  item: LeagueDailyHighlight
  highlightMemberId?: string | null
  onOpenDetail: (item: LeagueDailyHighlight) => void
}) {
  const Icon = highlightIcon(item.kind)
  const isMe = highlightMemberId != null && item.memberId === highlightMemberId

  return (
    <button
      type="button"
      onClick={() => onOpenDetail(item)}
      className={cn(
        'flex min-w-0 flex-col gap-0.5 rounded-lg border px-3 py-2.5 text-left transition-colors',
        isMe
          ? 'border-lime-400/40 bg-lime-500/12 hover:bg-lime-500/16'
          : 'border-lime-500/15 bg-black/30 hover:border-lime-500/30 hover:bg-black/40',
      )}
    >
      <div className="flex items-center gap-1.5 text-[10px] font-medium text-zinc-400">
        <Icon className={cn('h-3.5 w-3.5 shrink-0', highlightIconClass(item.kind))} aria-hidden />
        <span className="truncate">{item.categoryLabel}</span>
      </div>
      {item.memberName ? (
        <span className="truncate text-sm font-semibold text-lime-50">
          {formatRankingMemberName(item.memberName, { isMe })}
          {isMe ? <span className="ml-1 text-[10px] font-medium text-lime-300">나</span> : null}
        </span>
      ) : (
        <span className="truncate text-sm font-semibold text-lime-50">{item.headline}</span>
      )}
      <span
        className={cn(
          'truncate text-xs font-medium tabular-nums',
          item.kind === 'rank_climber' ? 'text-emerald-400' : 'text-lime-200/90',
        )}
      >
        {item.memberName ? item.headline : item.detail}
      </span>
      <span className="truncate text-[11px] text-zinc-500">
        {item.memberName ? item.detail : '자세히 보기'}
      </span>
    </button>
  )
}

function HighlightDetailDialog({
  item,
  open,
  onOpenChange,
  highlightMemberId,
  onMemberSelect,
}: {
  item: LeagueDailyHighlight | null
  open: boolean
  onOpenChange: (open: boolean) => void
  highlightMemberId?: string | null
  onMemberSelect?: (memberId: string, memberName: string) => void
}) {
  if (!item) return null

  const Icon = highlightIcon(item.kind)
  const isMe = highlightMemberId != null && item.memberId === highlightMemberId

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent mobileSheet className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lime-100">
            <Icon className={cn('h-4 w-4 shrink-0', highlightIconClass(item.kind))} aria-hidden />
            {item.categoryLabel}
          </DialogTitle>
          <DialogDescription className="text-left text-zinc-400">
            {formatShortDateLabel(item.spotlightDate)} 기준 하이라이트
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          {item.memberName ? (
            <p className="text-lg font-semibold text-lime-50">
              {formatRankingMemberName(item.memberName, { isMe })}
              {isMe ? <span className="ml-2 text-sm font-medium text-lime-300">나</span> : null}
            </p>
          ) : null}
          <p
            className={cn(
              'text-base font-semibold tabular-nums',
              item.kind === 'rank_climber' ? 'text-emerald-400' : 'text-lime-200',
            )}
          >
            {item.headline}
          </p>
          <p className="text-sm leading-relaxed text-zinc-300">{item.description}</p>
          <p className="text-xs text-zinc-500">{item.detail}</p>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          {item.memberId ? (
            <Button
              type="button"
              onClick={() => {
                onMemberSelect?.(item.memberId!, item.memberName ?? '회원')
                onOpenChange(false)
              }}
            >
              회원 그래프 보기
            </Button>
          ) : null}
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            닫기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function formatShortDateLabel(value: string): string {
  try {
    const date = new Date(`${value}T00:00:00`)
    return `${date.getMonth() + 1}/${date.getDate()}`
  } catch {
    return value
  }
}

export function MemberLeagueMomentumStrip({
  dailyHighlights,
  highlightMemberId,
  onMemberSelect,
  rankingPeriodLabel,
  className,
}: {
  dailyHighlights: {
    spotlightDateLabel: string
    highlights: LeagueDailyHighlight[]
  } | null
  highlightMemberId?: string | null
  onMemberSelect?: (memberId: string, memberName: string) => void
  rankingPeriodLabel?: string
  className?: string
}) {
  const [detailItem, setDetailItem] = useState<LeagueDailyHighlight | null>(null)

  if (!dailyHighlights || dailyHighlights.highlights.length === 0) return null

  return (
    <>
      <div
        className={cn(
          'rounded-xl border border-lime-500/20 bg-gradient-to-br from-black/50 to-lime-500/[0.06] p-3 sm:p-4',
          className,
        )}
      >
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-lime-300/80">
          리그 하이라이트
          <span className="ml-1.5 font-normal normal-case text-zinc-500">
            · {dailyHighlights.spotlightDateLabel}
            {rankingPeriodLabel ? ` · ${rankingPeriodLabel}` : ''}
          </span>
        </p>

        <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {dailyHighlights.highlights.map((item) => (
            <DailyHighlightCard
              key={item.id}
              item={item}
              highlightMemberId={highlightMemberId}
              onOpenDetail={setDetailItem}
            />
          ))}
        </div>
      </div>

      <HighlightDetailDialog
        item={detailItem}
        open={detailItem != null}
        onOpenChange={(open) => {
          if (!open) setDetailItem(null)
        }}
        highlightMemberId={highlightMemberId}
        onMemberSelect={onMemberSelect}
      />
    </>
  )
}
