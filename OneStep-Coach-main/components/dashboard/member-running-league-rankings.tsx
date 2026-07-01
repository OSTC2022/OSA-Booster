'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { MemberMileageLogDialog } from '@/components/dashboard/member-mileage-log-dialog'
import { MemberRunningLeagueRankingsSkeleton } from '@/components/dashboard/member-running-league-rankings-skeleton'
import { MemberRunningPbDialog } from '@/components/dashboard/member-running-pb-panel'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  formatMileageKmDisplay,
  type MileageDistanceLeaderboard,
  type MileageDistanceRankRow,
} from '@/lib/running-league/mileage-leaderboard'
import { formatRankingMemberName } from '@/lib/running-league/mask-member-name'
import {
  formatAttendanceDaysDisplay,
  type AttendanceLeaderboard,
  type AttendanceRankRow,
} from '@/lib/running-league/attendance-leaderboard'
import {
  getAttendanceGapLabelForRow,
  getMileageGapLabelForRow,
  getPbGapLabelForRow,
} from '@/lib/running-league/competition-snapshot'
import {
  resolvePortalRankingPeriod,
  type PortalRankingPeriod,
} from '@/lib/running-league/ranking-period'
import type { LeagueMomentumMember } from '@/lib/running-league/league-momentum'
import { buildLeagueDailyHighlights } from '@/lib/running-league/league-daily-highlights'
import { buildMemberLeagueStatusSnapshot, type MemberLeagueStatusSnapshot } from '@/lib/running-league/league-status-summary'
import { formatScoreDisplay, type RunningLeagueRankRow } from '@/lib/running-league/scoring'
import { MemberRankingDetailPanel } from '@/components/dashboard/member-ranking-detail-panel'
import { PortalAggregateGraphPanel } from '@/components/dashboard/portal-aggregate-graph-panel'
import {
  graphChartTabForRankingView,
  rankingViewForGraphChartTab,
  type GraphChartTab,
} from '@/components/dashboard/member-ranking-charts'
import { MemberLeagueMomentumStrip } from '@/components/dashboard/member-league-momentum-strip'
import { MemberLeagueStatusCard } from '@/components/dashboard/member-league-status-card'
import { formatPbDistanceLabel, getPbDistanceAccentClass, getPbDistanceFilterDescription, PB_DISTANCE_LEGEND, PB_RANKING_DISTANCES } from '@/lib/running-league/pb-distance-labels'
import type { PbLeaderboardDistance } from '@/lib/running-league/pb-leaderboard'
import { buildFilteredPortalRankings } from '@/lib/running-league/ranking-hub'
import {
  buildRankDeltaMap,
  RANK_DELTA_SAME,
  resolveMemberAttendanceRankDelta,
  resolveMemberMileageRankDelta,
  resolveMemberPbRankDelta,
  type RankDelta,
} from '@/lib/running-league/ranking-delta'
import {
  RANKING_GENDER_FILTERS,
  countUnclassifiedParticipants,
  filterParticipantsByGender,
  getGenderFilterDescription,
  GENDER_FILTER_UNAVAILABLE_MESSAGE,
  GENDER_UNCLASSIFIED_HINT,
  formatRankingFullViewButtonLabel,
  getGenderFilterScopeLabel,
  isGenderFilterUnavailable,
  type RankingGenderFilter,
} from '@/lib/running-league/ranking-gender'
import {
  getRankingViewDescription,
  RANKING_VIEW_OPTIONS,
  type RankingView,
} from '@/lib/running-league/ranking-view'
import {
  RANKING_EMPTY_ATTENDANCE,
  RANKING_EMPTY_CHASE,
  RANKING_EMPTY_MILEAGE,
  RANKING_EMPTY_PB,
  RANKING_LOAD_ERROR_MESSAGE,
} from '@/lib/running-league/ranking-empty-states'
import type { MemberRunningLeagueRankingBundle, MemberMonthlyLessonRow } from '@/lib/actions/running-league'
import type { AdultPortalBrandConfig } from '@/lib/adult-portal-brand'
import type {
  PbDistanceLeaderboard,
  PbDistanceRankRow,
} from '@/lib/running-league/pb-leaderboard'
import type {
  RunningLeagueDistanceEvent,
  RunningLeagueMileageLog,
  RunningLeagueParticipant,
  RunningLeagueRecord,
} from '@/lib/types'
import { cn } from '@/lib/utils'
import { buildChaseBeatMileageLeaderboard } from '@/lib/running-league/chase-leaderboard'
import { buildPortalCoachMemberIds } from '@/lib/running-league/portal-coach-badges'
import { buildChaseRankingHeaderSummary } from '@/lib/running-league/chase-ranking-header'
import {
  resolveChaseBadgeLabelForMember,
  resolvePortalChaseLabel,
} from '@/lib/running-league/portal-chase-label'
import { PortalCoachBadge, PortalChaseBadge } from '@/components/dashboard/portal-ranking-badges'
import { RANKING_TOP_DISPLAY_COUNT } from '@/lib/running-league/ranking-portal-guards'
import {
  MEMBER_PORTAL_CARD_CLASS,
  MEMBER_PORTAL_SHELL_CLASS,
} from '@/lib/running-league/member-portal-layout'
import { MemberPortalBrandHeader } from '@/components/dashboard/member-portal-brand-header'

export { MemberPortalBrandHeader } from '@/components/dashboard/member-portal-brand-header'

function filterRankedBySearch<R extends { memberId: string; memberName: string }>(
  ranked: R[],
  query: string,
  highlightMemberId?: string | null,
): R[] {
  const q = query.trim().toLowerCase()
  if (!q) return ranked
  return ranked.filter((row) => {
    const isMe = highlightMemberId != null && row.memberId === highlightMemberId
    const label = formatRankingMemberName(row.memberName, { isMe }).toLowerCase()
    return label.includes(q) || row.memberName.toLowerCase().includes(q)
  })
}
const EMPTY_PB_LEADERBOARD: PbDistanceLeaderboard = { ranked: [], unranked: [] }
const EMPTY_ATTENDANCE_LEADERBOARD: AttendanceLeaderboard = { ranked: [], unranked: [] }
const FULL_VIEW_PAGE_SIZE = 25
const TOP_DISPLAY_COUNT = RANKING_TOP_DISPLAY_COUNT
const PORTAL_PB_DISTANCES = PB_RANKING_DISTANCES.filter((distance) => distance !== '5km')
const PORTAL_DEFAULT_PB_DISTANCE: PbLeaderboardDistance = '10km'

function RankingViewTabs({
  value,
  onChange,
  className,
  compact = false,
  periodLabel,
}: {
  value: RankingView
  onChange: (value: RankingView) => void
  className?: string
  compact?: boolean
  periodLabel: string
}) {
  return (
    <div className={cn('min-w-0', compact ? 'space-y-0' : 'space-y-2', className)}>
      <div className={cn(compact ? 'grid grid-cols-4 gap-1.5' : 'flex flex-wrap gap-2')}>
        {RANKING_VIEW_OPTIONS.map((item) => (
          <RankingFilterChip
            key={item.value}
            active={value === item.value}
            onClick={() => onChange(item.value)}
            compact={compact}
            className={compact ? 'w-full justify-center' : undefined}
          >
            {item.label}
          </RankingFilterChip>
        ))}
      </div>
      {!compact ? (
        <p className="text-xs text-zinc-500">{getRankingViewDescription(value, periodLabel)}</p>
      ) : null}
    </div>
  )
}

function GenderFilterTabs({
  value,
  onChange,
  className,
  compact = false,
}: {
  value: RankingGenderFilter
  onChange: (value: RankingGenderFilter) => void
  className?: string
  compact?: boolean
}) {
  return (
    <div className={cn('min-w-0', compact ? 'space-y-0' : 'space-y-2', className)}>
      <div className={cn(compact ? 'flex gap-1' : 'flex flex-wrap gap-2')}>
        {RANKING_GENDER_FILTERS.map((item) => (
          <RankingFilterChip
            key={item.value}
            active={value === item.value}
            onClick={() => onChange(item.value)}
            compact={compact}
            className={compact ? 'flex-1 justify-center px-2' : undefined}
          >
            {item.label}
          </RankingFilterChip>
        ))}
      </div>
      {!compact ? (
        <p className="text-xs text-zinc-500">{getGenderFilterDescription(value)}</p>
      ) : null}
    </div>
  )
}

function PbDistanceTabs({
  value,
  onChange,
  className,
  compact = false,
}: {
  value: PbLeaderboardDistance
  onChange: (value: PbLeaderboardDistance) => void
  className?: string
  compact?: boolean
}) {
  return (
    <div className={cn('min-w-0', compact ? 'space-y-0' : 'space-y-2', className)}>
      <div
        className={cn(
          compact
            ? 'flex gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
            : 'flex flex-wrap gap-2',
        )}
      >
        {PB_RANKING_DISTANCES.map((distance) => (
          <RankingFilterChip
            key={distance}
            active={value === distance}
            onClick={() => onChange(distance)}
            compact={compact}
            className={cn(
              compact ? 'shrink-0 text-xs' : 'text-xs sm:text-sm',
              getPbDistanceAccentClass(distance),
            )}
          >
            {formatPbDistanceLabel(distance)}
          </RankingFilterChip>
        ))}
      </div>
      {!compact ? (
        <>
          <p className="text-xs text-zinc-500">{getPbDistanceFilterDescription(value)}</p>
          <p className="text-[11px] text-zinc-600">{PB_DISTANCE_LEGEND}</p>
        </>
      ) : null}
    </div>
  )
}

function RankingFiltersPanel({
  rankingView,
  onRankingViewChange,
  genderFilter,
  onGenderFilterChange,
  pbDistance,
  onPbDistanceChange,
  genderFilterBlocked,
  unclassifiedCount,
  rankingPeriod,
  compact = false,
}: {
  rankingView: RankingView
  onRankingViewChange: (value: RankingView) => void
  genderFilter: RankingGenderFilter
  onGenderFilterChange: (value: RankingGenderFilter) => void
  pbDistance: PbLeaderboardDistance
  onPbDistanceChange: (value: PbLeaderboardDistance) => void
  genderFilterBlocked: boolean
  unclassifiedCount: number
  rankingPeriod: PortalRankingPeriod
  compact?: boolean
}) {
  return (
    <div className={cn(compact ? 'space-y-1.5' : 'space-y-4')}>
      <RankingViewTabs
        value={rankingView}
        onChange={onRankingViewChange}
        compact={compact}
        periodLabel={rankingPeriod.label}
      />
      <div className={cn(compact ? 'space-y-1.5' : 'space-y-4')}>
        <GenderFilterTabs
          value={genderFilter}
          onChange={onGenderFilterChange}
          compact={compact}
        />
        {rankingView === 'pb' ? (
          <PbDistanceTabs
            value={pbDistance}
            onChange={onPbDistanceChange}
            compact={compact}
          />
        ) : compact ? (
          <p className="text-[10px] text-zinc-500">{rankingPeriod.resetHint}</p>
        ) : null}
      </div>
      {(rankingView === 'mileage' || rankingView === 'attendance' || rankingView === 'chase') && !compact ? (
        <RankingPeriodBanner rankingPeriod={rankingPeriod} />
      ) : null}
      <GenderFilterNotice
        genderFilter={genderFilter}
        genderFilterBlocked={genderFilterBlocked}
        unclassifiedCount={unclassifiedCount}
        compact={compact}
      />
    </div>
  )
}

function InlineRankingFilterStrip({
  rankingView,
  onRankingViewChange,
  genderFilter,
  onGenderFilterChange,
  pbDistance,
  onPbDistanceChange,
  genderFilterBlocked,
  onGraphChartTabChange,
  pbDistances = PORTAL_PB_DISTANCES,
  className,
  bordered = true,
  showRecordActions = false,
  onAddMileage,
  onAddPb,
}: {
  rankingView: RankingView
  onRankingViewChange: (value: RankingView) => void
  genderFilter: RankingGenderFilter
  onGenderFilterChange: (value: RankingGenderFilter) => void
  pbDistance: PbLeaderboardDistance
  onPbDistanceChange: (value: PbLeaderboardDistance) => void
  genderFilterBlocked: boolean
  onGraphChartTabChange?: (tab: GraphChartTab) => void
  pbDistances?: readonly PbLeaderboardDistance[]
  className?: string
  bordered?: boolean
  showRecordActions?: boolean
  onAddMileage?: () => void
  onAddPb?: () => void
}) {
  const viewLabels: Record<RankingView, string> = {
    pb: '순위(PB)',
    mileage: '마일리지',
    attendance: '출석',
    chase: '이겨라',
  }

  return (
    <div className={cn(bordered && 'border-b border-lime-500/10', className)}>
      <div className="flex min-w-0 items-center gap-2 px-2.5 py-1.5 sm:px-3">
        <div
          className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto pr-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="toolbar"
          aria-label="랭킹 필터"
        >
        <div className="inline-flex min-w-max shrink-0 items-center gap-0.5 rounded-md border border-lime-500/20 bg-black/40 p-0.5">
          {RANKING_VIEW_OPTIONS.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => {
                onGraphChartTabChange?.(graphChartTabForRankingView(item.value))
                if (item.value === rankingView) {
                  if (item.value === 'pb' && pbDistance !== PORTAL_DEFAULT_PB_DISTANCE) {
                    onPbDistanceChange(PORTAL_DEFAULT_PB_DISTANCE)
                  }
                  return
                }
                onRankingViewChange(item.value)
                if (item.value === 'pb') {
                  onPbDistanceChange(PORTAL_DEFAULT_PB_DISTANCE)
                }
              }}
              className={cn(
                'shrink-0 whitespace-nowrap rounded px-1.5 py-1.5 text-[10px] font-medium leading-none [word-break:keep-all] sm:px-2 sm:text-[11px]',
                rankingView === item.value
                  ? 'bg-lime-500/25 text-lime-100'
                  : 'text-zinc-500 hover:text-zinc-300',
              )}
            >
              {viewLabels[item.value]}
            </button>
          ))}
        </div>

        <span className="shrink-0 text-[10px] text-zinc-700" aria-hidden>
          |
        </span>

        {RANKING_GENDER_FILTERS.map((item) => (
          <RankingFilterChip
            key={item.value}
            active={genderFilter === item.value}
            onClick={() => onGenderFilterChange(item.value)}
            inline
          >
            {item.label}
          </RankingFilterChip>
        ))}

        {rankingView === 'pb' ? (
          <>
            <span className="shrink-0 text-[10px] text-zinc-700" aria-hidden>
              |
            </span>
            {pbDistances.map((distance) => (
              <RankingFilterChip
                key={distance}
                active={pbDistance === distance}
                onClick={() => onPbDistanceChange(distance)}
                inline
                className={getPbDistanceAccentClass(distance)}
              >
                {formatPbDistanceLabel(distance)}
              </RankingFilterChip>
            ))}
          </>
        ) : null}
        </div>

        {showRecordActions && onAddMileage && onAddPb ? (
          <>
            <span className="hidden shrink-0 text-[10px] text-zinc-700 sm:inline" aria-hidden>
              |
            </span>
            <PortalGraphCompactActions
              onAddMileage={onAddMileage}
              onAddPb={onAddPb}
            />
          </>
        ) : null}
      </div>
    </div>
  )
}

function PortalGraphCompactActions({
  onAddMileage,
  onAddPb,
}: {
  onAddMileage: () => void
  onAddPb: () => void
}) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <Button
        type="button"
        size="sm"
        className="h-7 shrink-0 bg-lime-500 px-2 text-[10px] font-semibold text-black shadow-[0_0_10px_rgba(163,230,53,0.18)] hover:bg-lime-400 sm:h-8 sm:px-2.5 sm:text-[11px]"
        onClick={onAddMileage}
        aria-label="러닝 기록 추가"
      >
        <span className="whitespace-nowrap">기록 추가</span>
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-7 shrink-0 border-lime-500/30 bg-black/40 px-1.5 text-[9px] font-medium text-lime-200 hover:bg-lime-500/10 sm:h-8 sm:px-2 sm:text-[10px]"
        onClick={onAddPb}
        aria-label="PB 등록"
      >
        <span className="whitespace-nowrap">PB 등록</span>
      </Button>
    </div>
  )
}

function MobileGraphFilterStrip({
  rankingView,
  onRankingViewChange,
  genderFilter,
  onGenderFilterChange,
  pbDistance,
  onPbDistanceChange,
  genderFilterBlocked,
  onGraphChartTabChange,
  showRecordActions = false,
  onAddMileage,
  onAddPb,
}: {
  rankingView: RankingView
  onRankingViewChange: (value: RankingView) => void
  genderFilter: RankingGenderFilter
  onGenderFilterChange: (value: RankingGenderFilter) => void
  pbDistance: PbLeaderboardDistance
  onPbDistanceChange: (value: PbLeaderboardDistance) => void
  genderFilterBlocked: boolean
  onGraphChartTabChange: (tab: GraphChartTab) => void
  showRecordActions?: boolean
  onAddMileage?: () => void
  onAddPb?: () => void
}) {
  return (
    <InlineRankingFilterStrip
      rankingView={rankingView}
      onRankingViewChange={onRankingViewChange}
      genderFilter={genderFilter}
      onGenderFilterChange={onGenderFilterChange}
      pbDistance={pbDistance}
      onPbDistanceChange={onPbDistanceChange}
      genderFilterBlocked={genderFilterBlocked}
      onGraphChartTabChange={onGraphChartTabChange}
      showRecordActions={showRecordActions}
      onAddMileage={onAddMileage}
      onAddPb={onAddPb}
    />
  )
}

function GenderFilterNotice({
  genderFilter,
  genderFilterBlocked,
  unclassifiedCount,
  compact = false,
}: {
  genderFilter: RankingGenderFilter
  genderFilterBlocked: boolean
  unclassifiedCount: number
  compact?: boolean
}) {
  if (genderFilterBlocked) {
    if (compact) {
      return <p className="text-[10px] leading-snug text-amber-200">{GENDER_FILTER_UNAVAILABLE_MESSAGE}</p>
    }
    return (
      <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-100">
        {GENDER_FILTER_UNAVAILABLE_MESSAGE}
      </div>
    )
  }

  if (genderFilter !== 'all' && unclassifiedCount > 0) {
    if (compact) {
      return (
        <p className="text-[10px] text-zinc-500">성별 미등록 {unclassifiedCount}명</p>
      )
    }
    return (
      <div className="rounded-lg border border-zinc-700/80 bg-black/20 px-3 py-2.5 text-xs leading-relaxed text-zinc-400">
        {GENDER_UNCLASSIFIED_HINT}
        <span className="mt-1 block tabular-nums text-zinc-500">미등록 {unclassifiedCount}명</span>
      </div>
    )
  }

  return null
}

const rankingCardClass =
  'min-w-0 gap-0 overflow-hidden rounded-xl border border-lime-400/35 bg-zinc-950/90 py-0 shadow-[0_0_24px_rgba(163,230,53,0.04)]'
const rankingCardHeaderClass = 'border-b border-lime-500/20 bg-black/40 px-4 py-3.5 sm:px-5'
const rankingCardContentClass = 'min-w-0 px-4 py-4 sm:px-5 sm:py-4'

const RANK_MEDALS: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' }

function RankingFilterChip({
  active,
  onClick,
  children,
  className,
  compact = false,
  inline = false,
  disabled = false,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
  className?: string
  compact?: boolean
  inline?: boolean
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'shrink-0 rounded-full border transition-colors',
        inline
          ? 'min-h-7 px-2 py-0.5 text-[10px] leading-none'
          : compact
            ? 'min-h-8 px-2.5 py-1 text-xs'
            : 'min-h-9 px-3.5 py-1.5 text-sm',
        active
          ? 'border-lime-400/55 bg-lime-500/15 font-medium text-lime-100 shadow-[0_0_14px_rgba(163,230,53,0.1)]'
          : 'border-lime-500/20 bg-black/50 text-zinc-400 hover:border-lime-500/35 hover:text-zinc-200',
        disabled && 'pointer-events-none opacity-40',
        className,
      )}
    >
      {children}
    </button>
  )
}

function RankMedalDisplay({ rank }: { rank: number }) {
  const medal = RANK_MEDALS[rank]
  if (medal) {
    return (
      <span
        className="flex w-11 shrink-0 items-center justify-center text-[1.35rem] leading-none"
        aria-label={`${rank}위`}
        title={`${rank}위`}
      >
        {medal}
      </span>
    )
  }
  return (
    <span className="flex w-11 shrink-0 flex-col items-center justify-center leading-none">
      <span className="text-xl font-bold tabular-nums text-zinc-200">{rank}</span>
      <span className="text-[9px] font-semibold text-zinc-500">위</span>
    </span>
  )
}

function topRankRowAccent(rank: number) {
  if (rank === 1) return 'border-amber-400/25 bg-amber-500/[0.06]'
  if (rank === 2) return 'border-zinc-400/20 bg-zinc-500/[0.06]'
  if (rank === 3) return 'border-orange-400/20 bg-orange-500/[0.05]'
  return ''
}

interface MemberRunningLeagueRankingsProps {
  pb5kLeaderboard: PbDistanceLeaderboard
  pb10kLeaderboard: PbDistanceLeaderboard
  pbHalfLeaderboard?: PbDistanceLeaderboard
  pbFullLeaderboard?: PbDistanceLeaderboard
  mileageLeaderboard: MileageDistanceLeaderboard
  scoreLeaderboard?: RunningLeagueRankRow[]
  rankingBundle?: MemberRunningLeagueRankingBundle | null
  participant?: RunningLeagueParticipant | null
  pbRecords?: RunningLeagueRecord[]
  mileageLogs?: RunningLeagueMileageLog[]
  monthlyLessonRows?: MemberMonthlyLessonRow[]
  tableReady?: boolean
  readOnly?: boolean
  loading?: boolean
  rankingsError?: string | null
  highlightMemberId?: string | null
  runningLeagueDetailHref?: string
  className?: string
  brandHeaderAction?: ReactNode
  brandHeaderBelow?: ReactNode
  showBrandHeader?: boolean
  showPortalShell?: boolean
  portalBrand?: AdultPortalBrandConfig | null
  rankingPeriod?: PortalRankingPeriod
  chaseMemberId?: string | null
  chaseLabel?: string | null
  canManageMemberLogs?: boolean
}

type MemberRankSummary =
  | { kind: 'ranked'; rank: number; inTopDisplay: boolean }
  | { kind: 'unranked' }
  | null

type RankedRow =
  | PbDistanceRankRow
  | MileageDistanceRankRow
  | AttendanceRankRow
  | RunningLeagueRankRow

function RankingPeriodBanner({ rankingPeriod }: { rankingPeriod: PortalRankingPeriod }) {
  return (
    <div className="rounded-lg border border-lime-500/15 bg-lime-500/5 px-3 py-2 text-xs leading-relaxed text-zinc-400">
      <span className="font-medium text-lime-200/90">{rankingPeriod.label}</span>
      {' · '}
      마일리지·출석 랭킹 집계 기간 · {rankingPeriod.resetHint}
    </div>
  )
}

function SelfGapHint({ label }: { label: string | null }) {
  if (!label || label === '1위') return null
  return <p className="mt-0.5 truncate text-[11px] text-lime-300/80">{label}</p>
}

function getLeaderboardTotal(
  leaderboard: PbDistanceLeaderboard | MileageDistanceLeaderboard | AttendanceLeaderboard,
): number {
  return leaderboard.ranked.length + leaderboard.unranked.length
}

function resolveRankingEmptyState(view: RankingView, chaseMemberId?: string | null) {
  if (view === 'chase') {
    if (chaseMemberId) {
      return {
        title: '술래 회원을 랭킹에서 찾지 못했습니다.',
        description: '술래가 성인 러닝 리그에 참여 중인지 확인해주세요.',
      }
    }
    return RANKING_EMPTY_CHASE
  }
  if (view === 'pb') return RANKING_EMPTY_PB
  if (view === 'attendance') return RANKING_EMPTY_ATTENDANCE
  return RANKING_EMPTY_MILEAGE
}

function getMyRankSummary<T extends { memberId: string; rank: number }>(
  leaderboard: { ranked: T[]; unranked: Array<{ memberId: string }> },
  memberId?: string | null,
): MemberRankSummary {
  if (!memberId) return null
  const myRow = leaderboard.ranked.find((row) => row.memberId === memberId)
  if (myRow) {
    return { kind: 'ranked', rank: myRow.rank, inTopDisplay: myRow.rank <= TOP_DISPLAY_COUNT }
  }
  if (leaderboard.unranked.some((row) => row.memberId === memberId)) {
    return { kind: 'unranked' }
  }
  return null
}

function buildDisplayRows<T extends RankedRow>(
  ranked: T[],
  highlightMemberId?: string | null,
  showAllRanks = false,
): T[] {
  if (showAllRanks) return ranked

  const topRows = ranked.slice(0, TOP_DISPLAY_COUNT)
  if (!highlightMemberId) return topRows

  const myRow = ranked.find((row) => row.memberId === highlightMemberId)
  if (!myRow) return topRows
  if (topRows.some((row) => row.memberId === highlightMemberId)) return topRows

  return [...topRows, myRow]
}

function buildNeighborRankRows<T extends { memberId: string }>(
  ranked: T[],
  highlightMemberId?: string | null,
): T[] {
  if (ranked.length === 0) return []
  if (!highlightMemberId) return ranked.slice(0, Math.min(3, ranked.length))

  const myIndex = ranked.findIndex((row) => row.memberId === highlightMemberId)
  if (myIndex < 0) return ranked.slice(0, Math.min(3, ranked.length))

  const start = Math.max(0, myIndex - 1)
  const end = Math.min(ranked.length, myIndex + 2)
  return ranked.slice(start, end)
}

function RankingMemberNameCell({
  memberName,
  isMe,
  isSelected,
  chaseBadgeLabel = null,
  isPortalCoach = false,
}: {
  memberName: string
  isMe: boolean
  isSelected: boolean
  chaseBadgeLabel?: string | null
  isPortalCoach?: boolean
}) {
  return (
    <span className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
      <span
        className={cn(
          'min-w-0 shrink truncate font-medium',
          rankingMemberNameClass(isMe, isSelected, Boolean(chaseBadgeLabel)),
        )}
      >
        {formatRankingMemberName(memberName, { isMe })}
      </span>
      {chaseBadgeLabel || isPortalCoach ? (
        <span className="flex shrink-0 items-center gap-1">
          {chaseBadgeLabel ? <PortalChaseBadge label={chaseBadgeLabel} /> : null}
          {isPortalCoach ? <PortalCoachBadge /> : null}
        </span>
      ) : null}
    </span>
  )
}

function RankDeltaIndicator({ delta }: { delta: RankDelta }) {
  if (delta.kind === 'same') {
    return (
      <span
        className="flex w-9 shrink-0 justify-center text-[11px] font-semibold tabular-nums text-zinc-400"
        aria-label="순위 변동 없음"
      >
        -
      </span>
    )
  }

  if (delta.kind === 'up') {
    return (
      <span
        className="flex w-9 shrink-0 justify-center text-[11px] font-semibold tabular-nums text-emerald-400"
        aria-label={`${delta.amount}계단 상승`}
      >
        ↑ {delta.amount}
      </span>
    )
  }

  return (
    <span
      className="flex w-9 shrink-0 justify-center text-[11px] font-semibold tabular-nums text-red-400"
      aria-label={`${delta.amount}계단 하락`}
    >
      ↓ {delta.amount}
    </span>
  )
}

function RankingsLoadErrorState({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-5 text-center">
      <p className="text-sm font-medium text-amber-100">{RANKING_LOAD_ERROR_MESSAGE}</p>
      {onRetry ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3 border-amber-500/30 text-amber-100 hover:bg-amber-500/10"
          onClick={onRetry}
        >
          다시 시도
        </Button>
      ) : null}
    </div>
  )
}

function RankingEmptyState({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div className="rounded-lg border border-dashed border-lime-500/20 bg-black/20 px-4 py-5 text-center">
      <p className="text-sm font-medium text-zinc-200">{title}</p>
      <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">{description}</p>
    </div>
  )
}

function RankingCardAction({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <Button
      type="button"
      variant="outline"
      className="mt-4 min-h-10 w-full border-lime-500/30 bg-lime-500/5 text-sm text-lime-100 hover:bg-lime-500/10 hover:text-lime-50"
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </Button>
  )
}

function RankingPreview({
  rankingView,
  pbDistance,
  activePbLeaderboard,
  activeMileageLeaderboard,
  activeAttendanceLeaderboard,
  activeChaseLeaderboard,
  rankedCount,
  highlightMemberId,
  selectedMemberId,
  onMemberSelect,
  onOpenList,
  rankingsError,
  rankingBundle,
  genderFilter,
  leagueStatus,
  onRetry,
  rankingPeriod,
  chaseMemberId = null,
  chaseLabel = null,
}: {
  rankingView: RankingView
  pbDistance: PbLeaderboardDistance
  activePbLeaderboard: PbDistanceLeaderboard
  activeMileageLeaderboard: MileageDistanceLeaderboard
  activeAttendanceLeaderboard: AttendanceLeaderboard
  activeChaseLeaderboard: MileageDistanceLeaderboard
  rankedCount: number
  highlightMemberId?: string | null
  selectedMemberId?: string | null
  onMemberSelect?: (memberId: string, memberName: string) => void
  onOpenList?: () => void
  rankingsError?: string | null
  rankingBundle?: MemberRunningLeagueRankingBundle | null
  genderFilter: RankingGenderFilter
  leagueStatus?: MemberLeagueStatusSnapshot | null
  onRetry?: () => void
  rankingPeriod: PortalRankingPeriod
  chaseMemberId?: string | null
  chaseLabel?: string | null
}) {
  const previewRows =
    rankingView === 'pb'
      ? buildNeighborRankRows(activePbLeaderboard.ranked, highlightMemberId)
      : rankingView === 'attendance'
        ? buildNeighborRankRows(activeAttendanceLeaderboard.ranked, highlightMemberId)
        : rankingView === 'chase'
          ? buildNeighborRankRows(activeChaseLeaderboard.ranked, highlightMemberId)
        : buildNeighborRankRows(activeMileageLeaderboard.ranked, highlightMemberId)
  const viewLabel =
    rankingView === 'pb'
      ? formatPbDistanceLabel(pbDistance)
      : rankingView === 'attendance'
        ? '출석'
        : rankingView === 'chase'
          ? resolvePortalChaseLabel(chaseLabel)
        : rankingPeriod.label

  const chaseHeaderSummary = useMemo(() => {
    if (rankingView !== 'chase' || !chaseMemberId) return null
    return buildChaseRankingHeaderSummary({
      chaseMemberId,
      selectedMemberId,
      chaseLeaderboard: activeChaseLeaderboard,
      mileageLeaderboard: activeMileageLeaderboard,
      viewerMemberId: highlightMemberId,
    })
  }, [
    activeChaseLeaderboard,
    activeMileageLeaderboard,
    chaseMemberId,
    highlightMemberId,
    rankingView,
    selectedMemberId,
  ])
  const chaseTabLabel = resolvePortalChaseLabel(chaseLabel)

  const filteredParticipants = rankingBundle
    ? filterParticipantsByGender(rankingBundle.participants, genderFilter)
    : []

  function resolveRankDelta(memberId: string, currentRank: number): RankDelta {
    if (!rankingBundle) return RANK_DELTA_SAME

    if (rankingView === 'pb') {
      return resolveMemberPbRankDelta({
        memberId,
        currentRank,
        distance: pbDistance,
        participants: filteredParticipants,
        records: rankingBundle.pbRecords,
      })
    }

    if (rankingView === 'attendance') {
      const { start, end } = rankingBundle.rankingPeriod
      return resolveMemberAttendanceRankDelta({
        memberId,
        currentRank,
        participants: filteredParticipants,
        logs: rankingBundle.mileageLogs,
        periodStart: start,
        periodEnd: end,
      })
    }

    if (rankingView === 'mileage' || rankingView === 'chase') {
      return resolveMemberMileageRankDelta({
        memberId,
        currentRank,
        participants: filteredParticipants,
        logs: rankingBundle.mileageLogs,
        mileageRecognition: rankingBundle.mileageRecognition,
      })
    }

    return RANK_DELTA_SAME
  }

  return (
    <div className={MEMBER_PORTAL_CARD_CLASS}>
      <div className="flex items-center justify-between gap-2 border-b border-lime-500/15 px-3 py-2">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <span className="shrink-0 text-sm font-semibold text-lime-100">랭킹</span>
          {rankingView === 'pb' ? (
            <span
              className={cn(
                'truncate text-sm font-semibold',
                getPbDistanceAccentClass(pbDistance),
              )}
            >
              {formatPbDistanceLabel(pbDistance)}
            </span>
          ) : rankingView === 'attendance' ? (
            <>
              <span className="shrink-0 text-sm font-medium text-lime-300">출석</span>
              <span
                className="min-w-0 truncate text-[11px] font-normal text-lime-200/80 sm:text-xs"
                title="출석 횟수에 따라서 돌림판 추첨 확률 상승"
              >
                : 출석 횟수에 따라서 돌림판 추첨 확률 상승 ↑
              </span>
            </>
          ) : rankingView === 'chase' && chaseHeaderSummary ? (
            <>
              <span
                className="min-w-0 truncate text-sm font-semibold tabular-nums text-red-100"
                title={`${chaseHeaderSummary.rank}위-${chaseHeaderSummary.memberName}/${chaseHeaderSummary.gapLabel}`}
              >
                {chaseHeaderSummary.rank}위-{chaseHeaderSummary.memberName}
                <span className="font-normal text-red-200/80">
                  /{chaseHeaderSummary.gapLabel}
                </span>
              </span>
              <span className="shrink-0 text-sm font-medium text-red-300">{chaseTabLabel}</span>
            </>
          ) : viewLabel ? (
            <span
              className={cn(
                'truncate text-sm font-medium',
                rankingView === 'attendance'
                  ? 'text-lime-300'
                  : rankingView === 'chase'
                    ? 'text-red-300'
                    : 'text-zinc-400',
              )}
            >
              {viewLabel}
            </span>
          ) : null}
        </div>
        {onOpenList && !rankingsError ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 shrink-0 border-lime-500/30 bg-lime-500/5 px-2.5 text-[11px] text-lime-100 hover:bg-lime-500/10"
            onClick={onOpenList}
          >
            전체 랭킹
          </Button>
        ) : null}
      </div>
      <div className="space-y-1.5 p-2.5">
        {rankingsError ? (
          <RankingsLoadErrorState onRetry={onRetry} />
        ) : previewRows.length > 0 ? (
          <>
            <div className="space-y-1.5">
              {previewRows.map((row) => {
                const isMe = highlightMemberId != null && row.memberId === highlightMemberId
                const chaseBadgeLabel = resolveChaseBadgeLabelForMember(
                  rankingView,
                  row.memberId,
                  chaseMemberId,
                  chaseLabel,
                )
                if (rankingView === 'pb') {
                  return (
                    <PbRankingRow
                      key={row.participantId}
                      row={row as PbDistanceRankRow}
                      isMe={isMe}
                      distanceLabel={formatPbDistanceLabel(pbDistance)}
                      showDistanceLabel={false}
                      rankDelta={resolveRankDelta(row.memberId, row.rank)}
                      onMemberSelect={onMemberSelect}
                      isSelected={selectedMemberId === row.memberId}
                    />
                  )
                }
                if (rankingView === 'attendance') {
                  return (
                    <AttendanceRankingRow
                      key={row.participantId}
                      row={row as AttendanceRankRow}
                      isMe={isMe}
                      rankDelta={resolveRankDelta(row.memberId, row.rank)}
                      onMemberSelect={onMemberSelect}
                      isSelected={selectedMemberId === row.memberId}
                    />
                  )
                }
                if (rankingView === 'chase') {
                  return (
                    <MileageRankingRow
                      key={row.participantId}
                      row={row as MileageDistanceRankRow}
                      isMe={isMe}
                      chaseBadgeLabel={chaseBadgeLabel}
                      rankDelta={resolveRankDelta(row.memberId, row.rank)}
                      showPeriodLabel={false}
                      onMemberSelect={onMemberSelect}
                      isSelected={selectedMemberId === row.memberId}
                    />
                  )
                }
                return (
                  <MileageRankingRow
                    key={row.participantId}
                    row={row as MileageDistanceRankRow}
                    isMe={isMe}
                    rankDelta={resolveRankDelta(row.memberId, row.rank)}
                    showPeriodLabel={false}
                    onMemberSelect={onMemberSelect}
                    isSelected={selectedMemberId === row.memberId}
                  />
                )
              })}
            </div>
            {leagueStatus?.isSoloRanked ? (
              <p className="text-center text-[11px] font-medium text-lime-200/90">현재 리그 1위입니다</p>
            ) : leagueStatus && highlightMemberId ? (
              <p className="text-center text-[10px] text-zinc-400">
                {leagueStatus.rankHeadline}
                {leagueStatus.rankSubline ? ` · ${leagueStatus.rankSubline}` : ''}
              </p>
            ) : null}
          </>
        ) : (
          <RankingEmptyState
            title={resolveRankingEmptyState(rankingView, chaseMemberId).title}
            description={resolveRankingEmptyState(rankingView, chaseMemberId).description}
          />
        )}
      </div>
    </div>
  )
}

function MyRankFooter({
  summary,
  total,
  showSelfRow,
  gapHint,
}: {
  summary: MemberRankSummary
  total: number
  showSelfRow: boolean
  gapHint?: string | null
}) {
  if (!summary || total <= 0) return null
  if (summary.kind === 'ranked' && (summary.inTopDisplay || showSelfRow)) return null

  const value =
    summary.kind === 'ranked' ? `${summary.rank}위 / ${total}명` : `기록 없음 / ${total}명`

  return (
    <div className="rounded-lg border border-lime-500/30 bg-lime-500/10 px-3 py-2.5 text-sm">
      <span className="font-medium text-lime-200 tabular-nums text-lime-100">{value}</span>
      <SelfGapHint label={gapHint ?? null} />
    </div>
  )
}

function resolveMemberCurrentRank(
  memberId: string,
  rankingView: RankingView,
  pbLeaderboard: PbDistanceLeaderboard,
  mileageLeaderboard: MileageDistanceLeaderboard,
  attendanceLeaderboard: AttendanceLeaderboard,
  chaseLeaderboard: MileageDistanceLeaderboard,
): number | null {
  if (rankingView === 'pb') {
    return pbLeaderboard.ranked.find((row) => row.memberId === memberId)?.rank ?? null
  }
  if (rankingView === 'attendance') {
    return attendanceLeaderboard.ranked.find((row) => row.memberId === memberId)?.rank ?? null
  }
  if (rankingView === 'chase') {
    return chaseLeaderboard.ranked.find((row) => row.memberId === memberId)?.rank ?? null
  }
  return mileageLeaderboard.ranked.find((row) => row.memberId === memberId)?.rank ?? null
}

function rankingRowClass(isSelected: boolean) {
  if (isSelected) {
    return 'border-lime-400/55 bg-lime-500/14 ring-2 ring-lime-400/40 shadow-[0_0_16px_rgba(163,230,53,0.12)]'
  }
  return 'border-white/5 bg-black/20 hover:bg-black/30 hover:ring-1 hover:ring-lime-500/15'
}

function rankingMemberNameClass(
  isMe: boolean,
  isSelected: boolean,
  hasChaseBadge = false,
) {
  if (hasChaseBadge) return 'text-red-300'
  if (isMe) return 'text-lime-400'
  if (isSelected) return 'text-lime-50'
  return 'text-foreground'
}

function rankingValueClass(isSelected: boolean) {
  return isSelected ? 'text-lime-300' : 'text-lime-400/90'
}

function PbRankingRow({
  row,
  isMe,
  isPortalCoach = false,
  chaseBadgeLabel = null,
  distanceLabel,
  rankDelta = RANK_DELTA_SAME,
  onMemberSelect,
  isSelected,
  scrollAnchor = false,
  showDistanceLabel = true,
}: {
  row: PbDistanceRankRow
  isMe: boolean
  isPortalCoach?: boolean
  chaseBadgeLabel?: string | null
  distanceLabel: string
  rankDelta?: RankDelta
  onMemberSelect?: (memberId: string, memberName: string) => void
  isSelected?: boolean
  scrollAnchor?: boolean
  showDistanceLabel?: boolean
}) {
  const isRowSelected = Boolean(isSelected)

  return (
    <button
      type="button"
      id={scrollAnchor ? `rank-row-${row.memberId}` : undefined}
      onClick={() => onMemberSelect?.(row.memberId, row.memberName)}
      aria-pressed={isSelected}
      aria-current={isSelected ? 'true' : undefined}
      data-selected-member={isSelected ? 'true' : undefined}
      className={cn(
        'flex min-w-0 w-full items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition-all duration-200',
        topRankRowAccent(row.rank),
        rankingRowClass(isRowSelected),
      )}
    >
      <RankDeltaIndicator delta={rankDelta} />
      <RankMedalDisplay rank={row.rank} />
      <RankingMemberNameCell
        memberName={row.memberName}
        isMe={isMe}
        isSelected={isRowSelected}
        chaseBadgeLabel={chaseBadgeLabel}
        isPortalCoach={isPortalCoach}
      />
      {showDistanceLabel ? (
        <span className="shrink-0 text-xs text-zinc-500">{distanceLabel}</span>
      ) : null}
      <span
        className={cn('shrink-0 font-semibold tabular-nums', rankingValueClass(isRowSelected))}
      >
        {row.timeText}
      </span>
      {isSelected ? <ChevronRight className="h-4 w-4 shrink-0 text-lime-400" aria-hidden /> : null}
    </button>
  )
}

function MileageRankingRow({
  row,
  isMe,
  isPortalCoach = false,
  chaseBadgeLabel = null,
  rankDelta = RANK_DELTA_SAME,
  onMemberSelect,
  isSelected,
  scrollAnchor = false,
  showPeriodLabel = true,
}: {
  row: MileageDistanceRankRow
  isMe: boolean
  isPortalCoach?: boolean
  chaseBadgeLabel?: string | null
  rankDelta?: RankDelta
  onMemberSelect?: (memberId: string, memberName: string) => void
  isSelected?: boolean
  scrollAnchor?: boolean
  showPeriodLabel?: boolean
}) {
  const isRowSelected = Boolean(isSelected)

  return (
    <button
      type="button"
      id={scrollAnchor ? `rank-row-${row.memberId}` : undefined}
      onClick={() => onMemberSelect?.(row.memberId, row.memberName)}
      aria-pressed={isSelected}
      aria-current={isSelected ? 'true' : undefined}
      data-selected-member={isSelected ? 'true' : undefined}
      className={cn(
        'flex min-w-0 w-full items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition-all duration-200',
        topRankRowAccent(row.rank),
        rankingRowClass(isRowSelected),
      )}
    >
      <RankDeltaIndicator delta={rankDelta} />
      <RankMedalDisplay rank={row.rank} />
      <RankingMemberNameCell
        memberName={row.memberName}
        isMe={isMe}
        isSelected={isRowSelected}
        chaseBadgeLabel={chaseBadgeLabel}
        isPortalCoach={isPortalCoach}
      />
      {showPeriodLabel ? (
        <span className="shrink-0 text-xs text-zinc-500">이번 달</span>
      ) : null}
      <span
        className={cn('shrink-0 font-semibold tabular-nums', rankingValueClass(isRowSelected))}
      >
        {formatMileageKmDisplay(row.mileageKm)}
      </span>
      {isSelected ? <ChevronRight className="h-4 w-4 shrink-0 text-lime-400" aria-hidden /> : null}
    </button>
  )
}

function AttendanceRankingRow({
  row,
  isMe,
  isPortalCoach = false,
  chaseBadgeLabel = null,
  rankDelta = RANK_DELTA_SAME,
  onMemberSelect,
  isSelected,
  scrollAnchor = false,
  showPeriodLabel = true,
}: {
  row: AttendanceRankRow
  isMe: boolean
  isPortalCoach?: boolean
  chaseBadgeLabel?: string | null
  rankDelta?: RankDelta
  onMemberSelect?: (memberId: string, memberName: string) => void
  isSelected?: boolean
  scrollAnchor?: boolean
  showPeriodLabel?: boolean
}) {
  const isRowSelected = Boolean(isSelected)

  return (
    <button
      type="button"
      id={scrollAnchor ? `rank-row-${row.memberId}` : undefined}
      onClick={() => onMemberSelect?.(row.memberId, row.memberName)}
      aria-pressed={isSelected}
      aria-current={isSelected ? 'true' : undefined}
      data-selected-member={isSelected ? 'true' : undefined}
      className={cn(
        'flex min-w-0 w-full items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition-all duration-200',
        topRankRowAccent(row.rank),
        rankingRowClass(isRowSelected),
      )}
    >
      <RankDeltaIndicator delta={rankDelta} />
      <RankMedalDisplay rank={row.rank} />
      <RankingMemberNameCell
        memberName={row.memberName}
        isMe={isMe}
        isSelected={isRowSelected}
        chaseBadgeLabel={chaseBadgeLabel}
        isPortalCoach={isPortalCoach}
      />
      {showPeriodLabel ? (
        <span className="shrink-0 text-xs text-zinc-500">이번 달</span>
      ) : null}
      <span
        className={cn('shrink-0 font-semibold tabular-nums', rankingValueClass(isRowSelected))}
      >
        {formatAttendanceDaysDisplay(row.attendanceDays)}
      </span>
      {isSelected ? <ChevronRight className="h-4 w-4 shrink-0 text-lime-400" aria-hidden /> : null}
    </button>
  )
}

function PbRankingList({
  leaderboard,
  highlightMemberId,
  onMemberSelect,
  selectedMemberId,
  showAllRanks = false,
  pbDistance,
  rankingBundle = null,
  genderFilter = 'all',
  showDistanceLabel = true,
}: {
  leaderboard: PbDistanceLeaderboard
  highlightMemberId?: string | null
  onMemberSelect?: (memberId: string, memberName: string) => void
  selectedMemberId?: string | null
  showAllRanks?: boolean
  pbDistance: PbLeaderboardDistance
  rankingBundle?: MemberRunningLeagueRankingBundle | null
  genderFilter?: RankingGenderFilter
  showDistanceLabel?: boolean
}) {
  const { ranked, unranked } = leaderboard
  const total = getLeaderboardTotal(leaderboard)
  const mySummary = getMyRankSummary(leaderboard, highlightMemberId)
  const displayRows = buildDisplayRows(ranked, highlightMemberId, showAllRanks)
  const showSelfRow =
    !showAllRanks &&
    highlightMemberId != null &&
    displayRows.some(
      (row) => row.memberId === highlightMemberId && row.rank > TOP_DISPLAY_COUNT,
    )
  const hasRankingData = ranked.length > 0
  const showUnrankedSection =
    hasRankingData && unranked.some((row) => row.memberId !== highlightMemberId)
  const distanceLabel = formatPbDistanceLabel(pbDistance)

  const filteredParticipants = useMemo(
    () =>
      rankingBundle
        ? filterParticipantsByGender(rankingBundle.participants, genderFilter)
        : [],
    [genderFilter, rankingBundle],
  )
  const portalCoachMemberIds = useMemo(
    () => buildPortalCoachMemberIds(rankingBundle?.participants ?? []),
    [rankingBundle?.participants],
  )

  const rankDeltaMap = useMemo(() => {
    if (!rankingBundle) return new Map<string, RankDelta>()
    return buildRankDeltaMap(displayRows, (memberId, currentRank) =>
      resolveMemberPbRankDelta({
        memberId,
        currentRank,
        distance: pbDistance,
        participants: filteredParticipants,
        records: rankingBundle.pbRecords,
      }),
    )
  }, [displayRows, filteredParticipants, pbDistance, rankingBundle])

  const myRow = highlightMemberId
    ? ranked.find((row) => row.memberId === highlightMemberId)
    : undefined
  const myGapLabel = myRow ? getPbGapLabelForRow(myRow, ranked) : null

  if (!hasRankingData) {
    return (
      <div className="space-y-3">
        <RankingEmptyState
          title={RANKING_EMPTY_PB.title}
          description={RANKING_EMPTY_PB.description}
        />
        <MyRankFooter summary={mySummary} total={total} showSelfRow={false} />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {displayRows.map((row) => {
          const isMe = highlightMemberId != null && row.memberId === highlightMemberId
          return (
            <PbRankingRow
              key={row.participantId}
              row={row}
              isMe={isMe}
              isPortalCoach={portalCoachMemberIds.has(row.memberId)}
              distanceLabel={distanceLabel}
              rankDelta={rankDeltaMap.get(row.memberId) ?? RANK_DELTA_SAME}
              onMemberSelect={onMemberSelect}
              isSelected={selectedMemberId === row.memberId}
              scrollAnchor={isMe}
              showDistanceLabel={showDistanceLabel}
            />
          )
        })}
      </div>

      {showUnrankedSection ? (
        <div className="space-y-2 border-t border-lime-500/10 pt-3">
          <p className="text-xs font-medium text-zinc-500">기록 없음</p>
          {unranked
            .filter((row) => row.memberId !== highlightMemberId)
            .map((row) => {
              const isPortalCoach = portalCoachMemberIds.has(row.memberId)
              return (
              <div
                key={row.participantId}
                className="flex items-center justify-between rounded-lg border border-dashed border-zinc-700/80 bg-black/10 px-3 py-2 text-sm text-zinc-500"
              >
                <RankingMemberNameCell
                  memberName={row.memberName}
                  isMe={highlightMemberId != null && row.memberId === highlightMemberId}
                  isSelected={false}
                  isPortalCoach={isPortalCoach}
                />
                <span className="shrink-0 text-xs">기록 없음</span>
              </div>
            )})}
        </div>
      ) : null}

      <MyRankFooter
        summary={mySummary}
        total={total}
        showSelfRow={showSelfRow}
        gapHint={myGapLabel}
      />
    </div>
  )
}

function MileageRankingList({
  leaderboard,
  highlightMemberId,
  onMemberSelect,
  selectedMemberId,
  showAllRanks = false,
  portalCoachMemberIds = new Set<string>(),
  showChaseBadges = false,
  chaseMemberId = null,
  chaseLabel = null,
  rankingBundle = null,
  genderFilter = 'all',
}: {
  leaderboard: MileageDistanceLeaderboard
  highlightMemberId?: string | null
  onMemberSelect?: (memberId: string, memberName: string) => void
  selectedMemberId?: string | null
  showAllRanks?: boolean
  portalCoachMemberIds?: ReadonlySet<string>
  showChaseBadges?: boolean
  chaseMemberId?: string | null
  chaseLabel?: string | null
  rankingBundle?: MemberRunningLeagueRankingBundle | null
  genderFilter?: RankingGenderFilter
}) {
  const { ranked, unranked } = leaderboard
  const total = getLeaderboardTotal(leaderboard)
  const mySummary = getMyRankSummary(leaderboard, highlightMemberId)
  const displayRows = buildDisplayRows(ranked, highlightMemberId, showAllRanks)
  const showSelfRow =
    !showAllRanks &&
    highlightMemberId != null &&
    displayRows.some(
      (row) => row.memberId === highlightMemberId && row.rank > TOP_DISPLAY_COUNT,
    )
  const hasRankingData = ranked.length > 0
  const showUnrankedSection =
    hasRankingData && unranked.some((row) => row.memberId !== highlightMemberId)

  const filteredParticipants = useMemo(
    () =>
      rankingBundle
        ? filterParticipantsByGender(rankingBundle.participants, genderFilter)
        : [],
    [genderFilter, rankingBundle],
  )

  const rankDeltaMap = useMemo(() => {
    if (!rankingBundle) return new Map<string, RankDelta>()
    return buildRankDeltaMap(displayRows, (memberId, currentRank) =>
      resolveMemberMileageRankDelta({
        memberId,
        currentRank,
        participants: filteredParticipants,
        logs: rankingBundle.mileageLogs,
        mileageRecognition: rankingBundle.mileageRecognition,
      }),
    )
  }, [displayRows, filteredParticipants, rankingBundle])

  const myRow = highlightMemberId
    ? ranked.find((row) => row.memberId === highlightMemberId)
    : undefined
  const myGapLabel = myRow ? getMileageGapLabelForRow(myRow, ranked) : null

  if (!hasRankingData) {
    return (
      <div className="space-y-3">
        <RankingEmptyState
          title={RANKING_EMPTY_MILEAGE.title}
          description={RANKING_EMPTY_MILEAGE.description}
        />
        <MyRankFooter summary={mySummary} total={total} showSelfRow={showSelfRow} />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {displayRows.map((row) => {
          const isMe = highlightMemberId != null && row.memberId === highlightMemberId
          const chaseBadgeLabel = showChaseBadges
            ? resolveChaseBadgeLabelForMember('chase', row.memberId, chaseMemberId, chaseLabel)
            : null
          return (
            <MileageRankingRow
              key={row.participantId}
              row={row}
              isMe={isMe}
              isPortalCoach={portalCoachMemberIds.has(row.memberId)}
              chaseBadgeLabel={chaseBadgeLabel}
              rankDelta={rankDeltaMap.get(row.memberId) ?? RANK_DELTA_SAME}
              onMemberSelect={onMemberSelect}
              isSelected={selectedMemberId === row.memberId}
              scrollAnchor={isMe}
              showPeriodLabel={!showAllRanks}
            />
          )
        })}
      </div>

      {showUnrankedSection ? (
        <div className="space-y-2 border-t border-lime-500/10 pt-3">
          <p className="text-xs font-medium text-zinc-500">기록 없음</p>
          {unranked
            .filter((row) => row.memberId !== highlightMemberId)
            .map((row) => {
              const isPortalCoach = portalCoachMemberIds.has(row.memberId)
              const chaseBadgeLabel = showChaseBadges
                ? resolveChaseBadgeLabelForMember('chase', row.memberId, chaseMemberId, chaseLabel)
                : null
              return (
              <div
                key={row.participantId}
                className="flex items-center gap-2 rounded-lg border border-dashed border-zinc-700/80 bg-black/10 px-3 py-2 text-sm text-zinc-500"
              >
                <div className="flex min-w-0 flex-1 items-center gap-1.5">
                  <RankingMemberNameCell
                    memberName={row.memberName}
                    isMe={highlightMemberId != null && row.memberId === highlightMemberId}
                    isSelected={false}
                    chaseBadgeLabel={chaseBadgeLabel}
                    isPortalCoach={isPortalCoach}
                  />
                </div>
                <span className="shrink-0 text-xs tabular-nums">{formatMileageKmDisplay(0)}</span>
              </div>
            )})}
        </div>
      ) : null}

      <MyRankFooter
        summary={mySummary}
        total={total}
        showSelfRow={showSelfRow}
        gapHint={myGapLabel}
      />
    </div>
  )
}

function AttendanceRankingList({
  leaderboard,
  highlightMemberId,
  onMemberSelect,
  selectedMemberId,
  showAllRanks = false,
  portalCoachMemberIds = new Set<string>(),
  rankingBundle = null,
  genderFilter = 'all',
}: {
  leaderboard: AttendanceLeaderboard
  highlightMemberId?: string | null
  onMemberSelect?: (memberId: string, memberName: string) => void
  selectedMemberId?: string | null
  showAllRanks?: boolean
  portalCoachMemberIds?: ReadonlySet<string>
  rankingBundle?: MemberRunningLeagueRankingBundle | null
  genderFilter?: RankingGenderFilter
}) {
  const { ranked, unranked } = leaderboard
  const total = getLeaderboardTotal(leaderboard)
  const mySummary = getMyRankSummary(leaderboard, highlightMemberId)
  const displayRows = buildDisplayRows(ranked, highlightMemberId, showAllRanks)
  const showSelfRow =
    !showAllRanks &&
    highlightMemberId != null &&
    displayRows.some(
      (row) => row.memberId === highlightMemberId && row.rank > TOP_DISPLAY_COUNT,
    )
  const hasRankingData = ranked.length > 0
  const showUnrankedSection =
    hasRankingData && unranked.some((row) => row.memberId !== highlightMemberId)

  const filteredParticipants = useMemo(
    () =>
      rankingBundle
        ? filterParticipantsByGender(rankingBundle.participants, genderFilter)
        : [],
    [genderFilter, rankingBundle],
  )

  const rankDeltaMap = useMemo(() => {
    if (!rankingBundle) return new Map<string, RankDelta>()
    const { start, end } = rankingBundle.rankingPeriod
    return buildRankDeltaMap(displayRows, (memberId, currentRank) =>
      resolveMemberAttendanceRankDelta({
        memberId,
        currentRank,
        participants: filteredParticipants,
        logs: rankingBundle.mileageLogs,
        periodStart: start,
        periodEnd: end,
      }),
    )
  }, [displayRows, filteredParticipants, rankingBundle])

  const myRow = highlightMemberId
    ? ranked.find((row) => row.memberId === highlightMemberId)
    : undefined
  const myGapLabel = myRow ? getAttendanceGapLabelForRow(myRow, ranked) : null

  if (!hasRankingData) {
    return (
      <div className="space-y-3">
        <RankingEmptyState
          title={RANKING_EMPTY_ATTENDANCE.title}
          description={RANKING_EMPTY_ATTENDANCE.description}
        />
        <MyRankFooter summary={mySummary} total={total} showSelfRow={showSelfRow} />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {displayRows.map((row) => {
          const isMe = highlightMemberId != null && row.memberId === highlightMemberId
          return (
            <AttendanceRankingRow
              key={row.participantId}
              row={row}
              isMe={isMe}
              isPortalCoach={portalCoachMemberIds.has(row.memberId)}
              rankDelta={rankDeltaMap.get(row.memberId) ?? RANK_DELTA_SAME}
              onMemberSelect={onMemberSelect}
              isSelected={selectedMemberId === row.memberId}
              scrollAnchor={isMe}
              showPeriodLabel={!showAllRanks}
            />
          )
        })}
      </div>

      {showUnrankedSection ? (
        <div className="space-y-2 border-t border-lime-500/10 pt-3">
          <p className="text-xs font-medium text-zinc-500">출석 기록 없음</p>
          {unranked
            .filter((row) => row.memberId !== highlightMemberId)
            .map((row) => {
              const isPortalCoach = portalCoachMemberIds.has(row.memberId)
              return (
              <div
                key={row.participantId}
                className="flex items-center gap-2 rounded-lg border border-dashed border-zinc-700/80 bg-black/10 px-3 py-2 text-sm text-zinc-500"
              >
                <div className="flex min-w-0 flex-1 items-center gap-1.5">
                  <RankingMemberNameCell
                    memberName={row.memberName}
                    isMe={highlightMemberId != null && row.memberId === highlightMemberId}
                    isSelected={false}
                    isPortalCoach={isPortalCoach}
                  />
                </div>
                <span className="shrink-0 text-xs">0일</span>
              </div>
            )})}
        </div>
      ) : null}

      <MyRankFooter
        summary={mySummary}
        total={total}
        showSelfRow={showSelfRow}
        gapHint={myGapLabel}
      />
    </div>
  )
}

function ScoreRankingRow({
  row,
  isMe,
  isPortalCoach = false,
  onMemberSelect,
  isSelected,
}: {
  row: RunningLeagueRankRow
  isMe: boolean
  isPortalCoach?: boolean
  onMemberSelect?: (memberId: string, memberName: string) => void
  isSelected?: boolean
}) {
  const isRowSelected = Boolean(isSelected)

  return (
    <button
      type="button"
      onClick={() => onMemberSelect?.(row.memberId, row.memberName)}
      className={cn(
        'flex min-w-0 w-full items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors',
        topRankRowAccent(row.rank),
        rankingRowClass(isRowSelected),
      )}
    >
      <RankMedalDisplay rank={row.rank} />
      <RankingMemberNameCell
        memberName={row.memberName}
        isMe={isMe}
        isSelected={isRowSelected}
        isPortalCoach={isPortalCoach}
      />
      <span
        className={cn('shrink-0 font-semibold tabular-nums', rankingValueClass(isRowSelected))}
      >
        {formatScoreDisplay(row.totalScore)}점
      </span>
    </button>
  )
}

function ScoreRankingList({
  rows,
  highlightMemberId,
  onMemberSelect,
  selectedMemberId,
  portalCoachMemberIds = new Set<string>(),
}: {
  rows: RunningLeagueRankRow[]
  highlightMemberId?: string | null
  onMemberSelect?: (memberId: string, memberName: string) => void
  selectedMemberId?: string | null
  portalCoachMemberIds?: ReadonlySet<string>
}) {
  const total = rows.length
  const myRow = highlightMemberId
    ? rows.find((row) => row.memberId === highlightMemberId)
    : undefined
  const mySummary: MemberRankSummary = !highlightMemberId
    ? null
    : myRow
      ? { kind: 'ranked', rank: myRow.rank, inTopDisplay: myRow.rank <= TOP_DISPLAY_COUNT }
      : null
  const displayRows = buildDisplayRows(rows, highlightMemberId)
  const showSelfRow =
    highlightMemberId != null &&
    displayRows.some(
      (row) => row.memberId === highlightMemberId && row.rank > TOP_DISPLAY_COUNT,
    )

  if (rows.length === 0) {
    return (
      <RankingEmptyState
        title="아직 리그 총점이 집계되지 않았습니다."
        description="출석·목표·기록·마일리지·회복관리가 반영되면 순위가 표시됩니다."
      />
    )
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {displayRows.map((row) => {
          const isMe = highlightMemberId != null && row.memberId === highlightMemberId
          return (
            <ScoreRankingRow
              key={row.participantId}
              row={row}
              isMe={isMe}
              isPortalCoach={portalCoachMemberIds.has(row.memberId)}
              onMemberSelect={onMemberSelect}
              isSelected={selectedMemberId === row.memberId}
            />
          )
        })}
      </div>

      <MyRankFooter summary={mySummary} total={total} showSelfRow={showSelfRow} />
    </div>
  )
}

function RankingListCard({
  children,
  rankedCount,
  genderFilter = 'all',
  onViewAll,
  footerAction,
  aspirationSlot,
}: {
  children: ReactNode
  rankedCount: number
  genderFilter?: RankingGenderFilter
  onViewAll?: () => void
  footerAction?: ReactNode
  aspirationSlot?: ReactNode
}) {
  return (
    <Card className={cn(rankingCardClass, 'border-lime-400/40')}>
      <CardHeader className={rankingCardHeaderClass}>
        <CardTitle className="text-base text-lime-100">성인 러닝 리그 랭킹</CardTitle>
        <p className="text-sm text-zinc-400">기록과 마일리지로 회원들과 경쟁해보세요.</p>
      </CardHeader>
      <CardContent className={cn(rankingCardContentClass, 'space-y-3')}>
        {children}
        {aspirationSlot}
        {rankedCount > 0 && onViewAll ? (
          <Button
            type="button"
            variant="outline"
            className="min-h-10 w-full border-lime-500/30 bg-lime-500/5 text-sm text-lime-100 hover:bg-lime-500/10 hover:text-lime-50"
            onClick={onViewAll}
          >
            {formatRankingFullViewButtonLabel({ genderFilter, rankedCount })}
          </Button>
        ) : null}
        {footerAction}
      </CardContent>
    </Card>
  )
}

function FullRankingDialog({
  open,
  onOpenChange,
  rankingView,
  onRankingViewChange,
  genderFilter,
  onGenderFilterChange,
  pbDistance,
  onPbDistanceChange,
  activePbLeaderboard,
  activeMileageLeaderboard,
  activeAttendanceLeaderboard,
  activeChaseLeaderboard,
  highlightMemberId,
  selectedMemberId,
  onMemberSelect,
  rankingBundle,
  genderFilterBlocked,
  unclassifiedCount = 0,
  chaseMemberId = null,
  chaseLabel = null,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  rankingView: RankingView
  onRankingViewChange: (value: RankingView) => void
  genderFilter: RankingGenderFilter
  onGenderFilterChange: (value: RankingGenderFilter) => void
  pbDistance: PbLeaderboardDistance
  onPbDistanceChange: (value: PbLeaderboardDistance) => void
  activePbLeaderboard: PbDistanceLeaderboard
  activeMileageLeaderboard: MileageDistanceLeaderboard
  activeAttendanceLeaderboard: AttendanceLeaderboard
  activeChaseLeaderboard: MileageDistanceLeaderboard
  highlightMemberId?: string | null
  selectedMemberId?: string | null
  onMemberSelect?: (memberId: string, memberName: string) => void
  rankingBundle?: MemberRunningLeagueRankingBundle | null
  genderFilterBlocked?: boolean
  unclassifiedCount?: number
  chaseMemberId?: string | null
  chaseLabel?: string | null
}) {
  const [searchQuery, setSearchQuery] = useState('')
  const [page, setPage] = useState(1)
  const scrollPendingRef = useRef(false)

  const fullRanked = useMemo(() => {
    if (rankingView === 'pb') return activePbLeaderboard.ranked
    if (rankingView === 'attendance') return activeAttendanceLeaderboard.ranked
    if (rankingView === 'chase') return activeChaseLeaderboard.ranked
    return activeMileageLeaderboard.ranked
  }, [
    activeAttendanceLeaderboard.ranked,
    activeChaseLeaderboard.ranked,
    activeMileageLeaderboard.ranked,
    activePbLeaderboard.ranked,
    rankingView,
  ])
  const searchedRanked = useMemo(
    () =>
      filterRankedBySearch(
        fullRanked as Array<{ memberId: string; memberName: string; rank: number }>,
        searchQuery,
        highlightMemberId,
      ),
    [fullRanked, highlightMemberId, searchQuery],
  )
  const totalPages = Math.max(1, Math.ceil(searchedRanked.length / FULL_VIEW_PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const paginatedRanked = useMemo(() => {
    if (searchedRanked.length <= FULL_VIEW_PAGE_SIZE) return searchedRanked
    const start = (safePage - 1) * FULL_VIEW_PAGE_SIZE
    return searchedRanked.slice(start, start + FULL_VIEW_PAGE_SIZE)
  }, [safePage, searchedRanked])

  const paginatedPbLeaderboard = useMemo(
    () => ({
      ranked:
        rankingView === 'pb'
          ? (paginatedRanked as unknown as PbDistanceRankRow[])
          : [],
      unranked: [] as PbDistanceLeaderboard['unranked'],
    }),
    [paginatedRanked, rankingView],
  )
  const paginatedMileageLeaderboard = useMemo(
    () => ({
      ranked:
        rankingView === 'mileage' || rankingView === 'chase'
          ? (paginatedRanked as unknown as MileageDistanceRankRow[])
          : [],
      unranked: [] as MileageDistanceLeaderboard['unranked'],
    }),
    [paginatedRanked, rankingView],
  )
  const paginatedAttendanceLeaderboard = useMemo(
    () => ({
      ranked:
        rankingView === 'attendance'
          ? (paginatedRanked as unknown as AttendanceRankRow[])
          : [],
      unranked: [] as AttendanceLeaderboard['unranked'],
    }),
    [paginatedRanked, rankingView],
  )

  const myRankIndex =
    highlightMemberId != null
      ? searchedRanked.findIndex((row) => row.memberId === highlightMemberId)
      : -1
  const myRank = myRankIndex >= 0 ? searchedRanked[myRankIndex] : null
  const showPagination = searchedRanked.length > FULL_VIEW_PAGE_SIZE

  const rankingLabel =
    rankingView === 'pb'
      ? `${formatPbDistanceLabel(pbDistance)} 랭킹`
      : rankingView === 'attendance'
        ? '출석 랭킹'
        : rankingView === 'chase'
          ? '이겨라 랭킹'
        : '월 마일리지 랭킹'
  const genderScopeLabel = getGenderFilterScopeLabel(genderFilter)

  useEffect(() => {
    if (!open) {
      setSearchQuery('')
      setPage(1)
      scrollPendingRef.current = false
    }
  }, [open])

  useEffect(() => {
    setPage(1)
    scrollPendingRef.current = false
  }, [rankingView, genderFilter, pbDistance, searchQuery])

  useEffect(() => {
    if (!scrollPendingRef.current || !highlightMemberId) return
    scrollPendingRef.current = false
    const timer = window.setTimeout(() => {
      document
        .getElementById(`rank-row-${highlightMemberId}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 50)
    return () => window.clearTimeout(timer)
  }, [safePage, highlightMemberId, paginatedRanked])

  function jumpToMyRank() {
    if (!highlightMemberId || myRankIndex < 0) return
    if (showPagination) {
      scrollPendingRef.current = true
      setPage(Math.floor(myRankIndex / FULL_VIEW_PAGE_SIZE) + 1)
      return
    }
    document
      .getElementById(`rank-row-${highlightMemberId}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent mobileSheet className="flex max-h-[min(92dvh,780px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="border-b border-lime-500/15 px-4 py-3 text-left sm:px-6">
          <DialogTitle className="text-base text-lime-100">랭킹 모아보기</DialogTitle>
          <DialogDescription className="text-xs text-zinc-500">
            {rankingLabel}
            {genderFilter !== 'all' ? ` · ${genderScopeLabel}` : ''} · 총 {searchedRanked.length}명
            {searchQuery.trim() && fullRanked.length !== searchedRanked.length
              ? ` (검색 ${searchedRanked.length}/${fullRanked.length})`
              : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 border-b border-lime-500/10 px-4 py-2.5 sm:px-6">
          <InlineRankingFilterStrip
            rankingView={rankingView}
            onRankingViewChange={onRankingViewChange}
            genderFilter={genderFilter}
            onGenderFilterChange={onGenderFilterChange}
            pbDistance={pbDistance}
            onPbDistanceChange={onPbDistanceChange}
            genderFilterBlocked={Boolean(genderFilterBlocked)}
            pbDistances={PORTAL_PB_DISTANCES}
            bordered={false}
            className="px-0 py-0"
          />
          <GenderFilterNotice
            genderFilter={genderFilter}
            genderFilterBlocked={Boolean(genderFilterBlocked)}
            unclassifiedCount={unclassifiedCount}
            compact
          />
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500"
                aria-hidden
              />
              <Input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="이름 검색"
                className="h-10 border-lime-500/20 bg-black/30 pl-9 text-sm text-zinc-100 placeholder:text-zinc-500"
                aria-label="랭킹 이름 검색"
              />
            </div>
            {highlightMemberId && myRank ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 border-lime-500/30 bg-lime-500/10 text-lime-100 hover:bg-lime-500/15"
                onClick={jumpToMyRank}
              >
                {myRank.rank}위로 이동
              </Button>
            ) : null}
          </div>
        </div>

        <ScrollArea className="min-h-0 flex-1 px-4 py-4 sm:px-6">
          {searchedRanked.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-500">
              {searchQuery.trim() ? '검색 결과가 없습니다.' : '표시할 랭킹이 없습니다.'}
            </p>
          ) : rankingView === 'pb' ? (
            <PbRankingList
              leaderboard={paginatedPbLeaderboard}
              highlightMemberId={highlightMemberId}
              onMemberSelect={onMemberSelect}
              selectedMemberId={selectedMemberId}
              showAllRanks
              pbDistance={pbDistance}
              rankingBundle={rankingBundle}
              genderFilter={genderFilter}
              showDistanceLabel={false}
            />
          ) : rankingView === 'attendance' ? (
            <AttendanceRankingList
              leaderboard={paginatedAttendanceLeaderboard}
              highlightMemberId={highlightMemberId}
              onMemberSelect={onMemberSelect}
              selectedMemberId={selectedMemberId}
              showAllRanks
              portalCoachMemberIds={buildPortalCoachMemberIds(rankingBundle?.participants ?? [])}
              rankingBundle={rankingBundle}
              genderFilter={genderFilter}
            />
          ) : (
            <MileageRankingList
              leaderboard={paginatedMileageLeaderboard}
              highlightMemberId={highlightMemberId}
              onMemberSelect={onMemberSelect}
              selectedMemberId={selectedMemberId}
              showAllRanks
              portalCoachMemberIds={buildPortalCoachMemberIds(rankingBundle?.participants ?? [])}
              showChaseBadges={rankingView === 'chase'}
              chaseMemberId={chaseMemberId}
              chaseLabel={chaseLabel}
              rankingBundle={rankingBundle}
              genderFilter={genderFilter}
            />
          )}
        </ScrollArea>

        {showPagination ? (
          <div className="flex items-center justify-between gap-2 border-t border-lime-500/10 px-4 py-3 sm:px-6">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-lime-500/25 text-lime-100"
              disabled={safePage <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
              이전
            </Button>
            <span className="text-xs tabular-nums text-zinc-400">
              {safePage} / {totalPages}페이지 · {searchedRanked.length}명
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-lime-500/25 text-lime-100"
              disabled={safePage >= totalPages}
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            >
              다음
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

export function MemberRunningLeagueRankings({
  pb5kLeaderboard,
  pb10kLeaderboard,
  pbHalfLeaderboard = EMPTY_PB_LEADERBOARD,
  pbFullLeaderboard = EMPTY_PB_LEADERBOARD,
  mileageLeaderboard,
  scoreLeaderboard = [],
  rankingBundle = null,
  participant = null,
  pbRecords = [],
  mileageLogs = [],
  monthlyLessonRows = [],
  tableReady = true,
  readOnly = false,
  loading = false,
  rankingsError = null,
  highlightMemberId = null,
  runningLeagueDetailHref = '/dashboard/my/running-league',
  className,
  brandHeaderAction,
  brandHeaderBelow,
  showBrandHeader = true,
  showPortalShell = true,
  portalBrand = null,
  rankingPeriod: rankingPeriodProp,
  chaseMemberId = null,
  chaseLabel = null,
  canManageMemberLogs = false,
}: MemberRunningLeagueRankingsProps) {
  const effectiveRankingPeriod =
    rankingBundle?.rankingPeriod ?? rankingPeriodProp ?? resolvePortalRankingPeriod()
  const [genderFilter, setGenderFilter] = useState<RankingGenderFilter>('all')
  const [rankingView, setRankingView] = useState<RankingView>('mileage')
  const [graphChartTab, setGraphChartTab] = useState<GraphChartTab>('mileage')
  const [pbDistance, setPbDistance] = useState<PbLeaderboardDistance>(PORTAL_DEFAULT_PB_DISTANCE)
  const [fullRankingOpen, setFullRankingOpen] = useState(false)
  const graphPanelRef = useRef<HTMLDivElement>(null)
  const [selectedMember, setSelectedMember] = useState<{ id: string; name: string } | null>(null)
  const [pbDialogOpen, setPbDialogOpen] = useState(false)
  const [mileageDialogOpen, setMileageDialogOpen] = useState(false)
  const router = useRouter()
  const canShowRecordActions = tableReady && !readOnly
  const portalRecordReady = canShowRecordActions

  function handleMileageSaved() {
    handlePortalRankingViewChange('mileage')
    if (highlightMemberId) {
      const selfName =
        rankingBundle?.participants.find((row) => row.member_id === highlightMemberId)?.member
          ?.name ?? '나'
      setSelectedMember({ id: highlightMemberId, name: selfName })
    }
  }

  function openMileageDialog() {
    setMileageDialogOpen(true)
  }

  const portalPbDistance = (PORTAL_PB_DISTANCES as readonly PbLeaderboardDistance[]).includes(
    pbDistance,
  )
    ? pbDistance
    : PORTAL_DEFAULT_PB_DISTANCE

  useEffect(() => {
    if (pbDistance !== portalPbDistance) {
      setPbDistance(portalPbDistance)
    }
  }, [pbDistance, portalPbDistance])

  const filteredRankings = useMemo(() => {
    if (rankingBundle) {
      return buildFilteredPortalRankings(rankingBundle, genderFilter)
    }
    return {
      pbByDistance: {
        '5km': pb5kLeaderboard,
        '10km': pb10kLeaderboard,
        half: pbHalfLeaderboard,
        full: pbFullLeaderboard,
      },
      mileageLeaderboard,
      attendanceLeaderboard: EMPTY_ATTENDANCE_LEADERBOARD,
      scoreLeaderboard,
    }
  }, [
    genderFilter,
    mileageLeaderboard,
    pb10kLeaderboard,
    pb5kLeaderboard,
    pbFullLeaderboard,
    pbHalfLeaderboard,
    rankingBundle,
    scoreLeaderboard,
  ])

  const activePbLeaderboard =
    filteredRankings?.pbByDistance[portalPbDistance] ?? EMPTY_PB_LEADERBOARD
  const activeMileageLeaderboard =
    filteredRankings?.mileageLeaderboard ?? { ranked: [], unranked: [] }
  const activeAttendanceLeaderboard =
    filteredRankings?.attendanceLeaderboard ?? EMPTY_ATTENDANCE_LEADERBOARD
  const filteredParticipants = useMemo(
    () =>
      rankingBundle
        ? filterParticipantsByGender(rankingBundle.participants, genderFilter)
        : [],
    [genderFilter, rankingBundle],
  )
  const portalParticipants = rankingBundle?.participants ?? []
  const unfilteredMileageLeaderboard = useMemo(() => {
    if (!rankingBundle) return activeMileageLeaderboard
    return buildFilteredPortalRankings(rankingBundle, 'all').mileageLeaderboard
  }, [activeMileageLeaderboard, rankingBundle])
  const activeChaseLeaderboard = useMemo(
    () =>
      buildChaseBeatMileageLeaderboard(
        activeMileageLeaderboard,
        chaseMemberId,
        portalParticipants,
        {
          chaseMileageLeaderboard: unfilteredMileageLeaderboard,
          chaseParticipants: portalParticipants,
        },
      ),
    [
      activeMileageLeaderboard,
      chaseMemberId,
      portalParticipants,
      unfilteredMileageLeaderboard,
    ],
  )
  const activeRankedCount =
    rankingView === 'pb'
      ? activePbLeaderboard.ranked.length
      : rankingView === 'attendance'
        ? activeAttendanceLeaderboard.ranked.length
        : rankingView === 'chase'
          ? activeChaseLeaderboard.ranked.length
        : activeMileageLeaderboard.ranked.length
  const genderFilterBlocked = isGenderFilterUnavailable(rankingBundle)
  const unclassifiedCount = useMemo(
    () => (rankingBundle ? countUnclassifiedParticipants(rankingBundle.participants) : 0),
    [rankingBundle],
  )

  const panelMember = selectedMember

  const panelMemberRank = panelMember
    ? resolveMemberCurrentRank(
        panelMember.id,
        rankingView,
        activePbLeaderboard,
        activeMileageLeaderboard,
        activeAttendanceLeaderboard,
        activeChaseLeaderboard,
      )
    : null

  const isExplicitSelection = selectedMember != null

  const showLeagueHighlights =
    rankingView === 'mileage' || rankingView === 'attendance' || rankingView === 'chase'

  const leagueDailyHighlights = useMemo(() => {
    if (!showLeagueHighlights || !rankingBundle || rankingsError) return null
    const filteredParticipants = filterParticipantsByGender(
      rankingBundle.participants,
      genderFilter,
    )
    const { start, end } = effectiveRankingPeriod
    return buildLeagueDailyHighlights({
      rankingView,
      participants: filteredParticipants,
      mileageLogs: rankingBundle.mileageLogs,
      periodStart: start,
      periodEnd: end,
      limit: 5,
      mileageRecognition: rankingBundle.mileageRecognition,
    })
  }, [
    effectiveRankingPeriod,
    genderFilter,
    rankingBundle,
    rankingView,
    rankingsError,
    showLeagueHighlights,
  ])

  const filteredParticipantsForStatus = filteredParticipants

  const portalCoachMemberIds = useMemo(
    () => buildPortalCoachMemberIds(rankingBundle?.participants ?? []),
    [rankingBundle?.participants],
  )

  const leagueStatus = useMemo(() => {
    if (!highlightMemberId || rankingsError) return null
    return buildMemberLeagueStatusSnapshot({
      memberId: highlightMemberId,
      rankingView,
      pbDistance: portalPbDistance,
      participant,
      pbLeaderboard: activePbLeaderboard,
      mileageLeaderboard: activeMileageLeaderboard,
      attendanceLeaderboard: activeAttendanceLeaderboard,
      mileageLogs,
      pbRecords,
      participants: filteredParticipantsForStatus,
      rankingPeriod: effectiveRankingPeriod,
      mileageRecognition: rankingBundle?.mileageRecognition,
    })
  }, [
    activeAttendanceLeaderboard,
    activeMileageLeaderboard,
    activePbLeaderboard,
    effectiveRankingPeriod,
    filteredParticipantsForStatus,
    highlightMemberId,
    mileageLogs,
    participant,
    portalPbDistance,
    pbRecords,
    rankingView,
    rankingsError,
  ])

  function handlePortalRankingViewChange(view: RankingView) {
    setRankingView(view)
    setGraphChartTab(graphChartTabForRankingView(view))
  }

  function handleGraphChartTabChange(tab: GraphChartTab) {
    const view = rankingViewForGraphChartTab(tab)
    setGraphChartTab(tab)
    if (view === rankingView) return
    setRankingView(view)
    if (view === 'pb') {
      setPbDistance(PORTAL_DEFAULT_PB_DISTANCE)
    }
  }

  function handleGenderFilterChange(value: RankingGenderFilter) {
    setGenderFilter(value)
    setSelectedMember(null)
  }

  function handleMemberSelect(memberId: string, memberName: string) {
    if (selectedMember?.id === memberId) {
      setSelectedMember(null)
      return
    }
    setSelectedMember({ id: memberId, name: memberName })
    window.requestAnimationFrame(() => {
      graphPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    })
  }

  function handlePbUpdateSelect(item: LeagueMomentumMember) {
    handlePortalRankingViewChange('pb')
    setGraphChartTab(graphChartTabForRankingView('pb'))
    if (
      item.pbDistance &&
      PORTAL_PB_DISTANCES.includes(item.pbDistance as (typeof PORTAL_PB_DISTANCES)[number])
    ) {
      setPbDistance(item.pbDistance)
    }
    setSelectedMember({ id: item.memberId, name: item.memberName })
    window.requestAnimationFrame(() => {
      graphPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    })
  }

  const graphFilterStrip = (
    <MobileGraphFilterStrip
      rankingView={rankingView}
      onRankingViewChange={handlePortalRankingViewChange}
      genderFilter={genderFilter}
      onGenderFilterChange={handleGenderFilterChange}
      pbDistance={pbDistance}
      onPbDistanceChange={setPbDistance}
      genderFilterBlocked={genderFilterBlocked}
      onGraphChartTabChange={handleGraphChartTabChange}
      showRecordActions={canShowRecordActions}
      onAddMileage={openMileageDialog}
      onAddPb={() => setPbDialogOpen(true)}
    />
  )

  const portalGraphBody = panelMember ? (
    <MemberRankingDetailPanel
      key={panelMember.id}
      embedded
      emphasized={false}
      variant="mobile"
      memberId={panelMember.id}
      memberName={panelMember.name}
      distance={portalPbDistance}
      rankingView={rankingView}
      genderFilter={genderFilter}
      rankingBundle={rankingBundle}
      highlightMemberId={highlightMemberId}
      currentRank={panelMemberRank}
      totalRanked={activeRankedCount}
      isExplicitSelection={isExplicitSelection}
      onClose={isExplicitSelection ? () => setSelectedMember(null) : undefined}
      soloComparisonHint={leagueStatus?.soloRankHint ?? leagueStatus?.comparisonHint}
      mobileFilterSlot={graphFilterStrip}
      graphChartTab={graphChartTab}
      onGraphChartTabChange={handleGraphChartTabChange}
      chaseMemberId={chaseMemberId}
      className={MEMBER_PORTAL_CARD_CLASS}
      canManageMemberLogs={canManageMemberLogs}
    />
  ) : rankingBundle ? (
    <PortalAggregateGraphPanel
      rankingView={rankingView}
      genderFilter={genderFilter}
      pbDistance={portalPbDistance}
      rankingBundle={rankingBundle}
      graphChartTab={graphChartTab}
      onGraphChartTabChange={handleGraphChartTabChange}
      chaseMemberId={chaseMemberId}
      mobileFilterSlot={graphFilterStrip}
      className={MEMBER_PORTAL_CARD_CLASS}
    />
  ) : (
    <div className={MEMBER_PORTAL_CARD_CLASS}>
      {graphFilterStrip}
      <div className="flex min-h-[200px] flex-col items-center justify-center px-3 py-4 text-center sm:min-h-[240px]">
        <p className="text-xs text-zinc-500">러닝 기록 또는 PB를 등록해보세요.</p>
      </div>
    </div>
  )

  const portalHighlightsBody =
    showLeagueHighlights && !rankingsError && rankingBundle ? (
      <MemberLeagueMomentumStrip
        dailyHighlights={leagueDailyHighlights}
        highlightMemberId={highlightMemberId}
        onMemberSelect={handleMemberSelect}
        rankingPeriodLabel={effectiveRankingPeriod.label}
        className={MEMBER_PORTAL_CARD_CLASS}
      />
    ) : null

  if (loading) {
    return <MemberRunningLeagueRankingsSkeleton className={className} />
  }

  return (
    <section
      className={cn(
        showPortalShell && MEMBER_PORTAL_SHELL_CLASS,
        'flex flex-col gap-2.5 sm:gap-4',
        className,
      )}
    >
      {showBrandHeader ? (
        <MemberPortalBrandHeader brand={portalBrand} action={brandHeaderAction} />
      ) : null}
      {brandHeaderBelow}

      <div className="flex flex-col gap-2.5 sm:gap-4">
        <RankingPreview
          rankingView={rankingView}
          pbDistance={portalPbDistance}
          activePbLeaderboard={activePbLeaderboard}
          activeMileageLeaderboard={activeMileageLeaderboard}
          activeAttendanceLeaderboard={activeAttendanceLeaderboard}
          activeChaseLeaderboard={activeChaseLeaderboard}
          rankedCount={rankingsError ? 0 : activeRankedCount}
          highlightMemberId={highlightMemberId}
          selectedMemberId={panelMember?.id ?? null}
          onMemberSelect={handleMemberSelect}
          onOpenList={rankingsError ? undefined : () => setFullRankingOpen(true)}
          rankingsError={rankingsError}
          rankingBundle={rankingBundle}
          genderFilter={genderFilter}
          leagueStatus={leagueStatus}
          onRetry={() => router.refresh()}
          rankingPeriod={effectiveRankingPeriod}
          chaseMemberId={chaseMemberId}
          chaseLabel={chaseLabel}
        />

        <div ref={graphPanelRef} className="scroll-mt-4">
          {portalGraphBody}
        </div>

        {leagueStatus && highlightMemberId ? (
          <MemberLeagueStatusCard
            snapshot={leagueStatus}
            compact
            className={cn(MEMBER_PORTAL_CARD_CLASS, 'border-lime-400/30')}
          />
        ) : null}

        {portalHighlightsBody}
      </div>

      <FullRankingDialog
        open={fullRankingOpen}
        onOpenChange={setFullRankingOpen}
        rankingView={rankingView}
        onRankingViewChange={handlePortalRankingViewChange}
        genderFilter={genderFilter}
        onGenderFilterChange={handleGenderFilterChange}
        pbDistance={pbDistance}
        onPbDistanceChange={setPbDistance}
        activePbLeaderboard={activePbLeaderboard}
        activeMileageLeaderboard={activeMileageLeaderboard}
        activeAttendanceLeaderboard={activeAttendanceLeaderboard}
        activeChaseLeaderboard={activeChaseLeaderboard}
        highlightMemberId={highlightMemberId}
        selectedMemberId={panelMember?.id ?? null}
        onMemberSelect={(memberId, memberName) => {
          handleMemberSelect(memberId, memberName)
          setFullRankingOpen(false)
        }}
        rankingBundle={rankingBundle}
        genderFilterBlocked={genderFilterBlocked}
        unclassifiedCount={unclassifiedCount}
        chaseMemberId={chaseMemberId}
        chaseLabel={chaseLabel}
      />

      <MemberRunningPbDialog
        participant={participant}
        pbRecords={pbRecords}
        tableReady={tableReady}
        open={pbDialogOpen}
        onOpenChange={setPbDialogOpen}
        readOnly={readOnly}
        portalRecordReady={portalRecordReady}
        initialDistance={portalPbDistance as RunningLeagueDistanceEvent}
      />
      <MemberMileageLogDialog
        participant={participant}
        mileageLogs={mileageLogs}
        tableReady={tableReady}
        open={mileageDialogOpen}
        onOpenChange={setMileageDialogOpen}
        portalRecordReady={portalRecordReady}
        readOnly={readOnly}
        onSaved={handleMileageSaved}
      />
    </section>
  )
}
