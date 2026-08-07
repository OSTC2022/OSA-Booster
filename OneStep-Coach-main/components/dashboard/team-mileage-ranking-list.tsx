'use client'

import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import {
  buildTeamMileageLeaderboard,
  defaultTeamColor,
  formatMileageKmDisplay,
  type TeamMileageRankRow,
} from '@/lib/running-league/mileage-team-leaderboard'
import type { MemberRunningLeagueRankingBundle } from '@/lib/actions/running-league'
import { cn } from '@/lib/utils'

const TOP_TEAM_PREVIEW = 5

function TeamRankRow({
  row,
  expanded,
  onToggle,
  highlightMemberId,
  selectedMemberId,
  onMemberSelect,
  defaultExpanded,
}: {
  row: TeamMileageRankRow
  expanded: boolean
  onToggle: () => void
  highlightMemberId?: string | null
  selectedMemberId?: string | null
  onMemberSelect?: (memberId: string, memberName: string) => void
  defaultExpanded?: boolean
}) {
  const color = row.color || defaultTeamColor(row.rank - 1)
  const hasMe = highlightMemberId
    ? row.members.some((member) => member.memberId === highlightMemberId)
    : false

  return (
    <div
      className={cn(
        'overflow-hidden rounded-lg border transition-colors',
        hasMe ? 'border-orange-400/40 bg-orange-500/10' : 'border-white/5 bg-black/20',
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
        aria-expanded={expanded}
      >
        <span className="w-7 shrink-0 text-center text-sm font-semibold tabular-nums text-orange-200">
          {row.rank}
        </span>
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: color }}
          aria-hidden
        />
        <span className="min-w-0 flex-1 truncate font-medium text-orange-50">
          {row.teamName}
          <span className="ml-1.5 text-[11px] font-normal text-zinc-400">
            {row.members.length}명
          </span>
        </span>
        <span className="shrink-0 text-sm font-semibold tabular-nums text-orange-400">
          {formatMileageKmDisplay(row.mileageKm)}
        </span>
        {expanded || defaultExpanded ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
        )}
      </button>

      {expanded ? (
        <div className="space-y-1 border-t border-white/5 px-2.5 py-2">
          {row.members.length === 0 ? (
            <p className="px-2 py-1 text-xs text-zinc-500">멤버 없음</p>
          ) : (
            row.members.map((member) => {
              const isMe = highlightMemberId === member.memberId
              const isSelected = selectedMemberId === member.memberId
              return (
                <button
                  key={member.memberId}
                  type="button"
                  onClick={() => onMemberSelect?.(member.memberId, member.memberName)}
                  className={cn(
                    'flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors',
                    isSelected
                      ? 'bg-orange-500/20 ring-1 ring-orange-400/40'
                      : 'hover:bg-white/5',
                  )}
                >
                  <span
                    className={cn(
                      'min-w-0 truncate',
                      isMe ? 'font-medium text-orange-400' : 'text-zinc-200',
                    )}
                  >
                    {member.memberName}
                    {isMe ? ' · 나' : ''}
                  </span>
                  <span className="shrink-0 tabular-nums text-orange-300/90">
                    {formatMileageKmDisplay(member.mileageKm)}
                  </span>
                </button>
              )
            })
          )}
        </div>
      ) : null}
    </div>
  )
}

export function TeamMileageRankingList({
  rankingBundle,
  highlightMemberId,
  selectedMemberId,
  onMemberSelect,
  showAllTeams = false,
  forceExpandAll = false,
}: {
  rankingBundle: MemberRunningLeagueRankingBundle | null
  highlightMemberId?: string | null
  selectedMemberId?: string | null
  onMemberSelect?: (memberId: string, memberName: string) => void
  showAllTeams?: boolean
  forceExpandAll?: boolean
}) {
  const leaderboard = useMemo(() => {
    if (!rankingBundle) return { ranked: [] as TeamMileageRankRow[] }
    return buildTeamMileageLeaderboard({
      teams: rankingBundle.mileageTeams ?? [],
      memberships: rankingBundle.mileageTeamMembers ?? [],
      logs: rankingBundle.mileageLogs,
      mileageRecognition: rankingBundle.mileageRecognition,
    })
  }, [rankingBundle])

  const displayRows = showAllTeams
    ? leaderboard.ranked
    : leaderboard.ranked.slice(0, TOP_TEAM_PREVIEW)

  const initialExpanded = useMemo(() => {
    const ids = new Set<string>()
    if (forceExpandAll) {
      for (const row of displayRows) ids.add(row.teamId)
      return ids
    }
    if (highlightMemberId) {
      const mine = leaderboard.ranked.find((row) =>
        row.members.some((member) => member.memberId === highlightMemberId),
      )
      if (mine) ids.add(mine.teamId)
    }
    if (ids.size === 0 && displayRows[0]) ids.add(displayRows[0].teamId)
    return ids
  }, [displayRows, forceExpandAll, highlightMemberId, leaderboard.ranked])

  const [expandedIds, setExpandedIds] = useState<Set<string>>(initialExpanded)

  function toggle(teamId: string) {
    if (forceExpandAll) return
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(teamId)) next.delete(teamId)
      else next.add(teamId)
      return next
    })
  }

  if (!rankingBundle || leaderboard.ranked.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-zinc-700/80 bg-black/10 px-3 py-6 text-center">
        <p className="text-sm font-medium text-zinc-300">팀전이 아직 없습니다</p>
        <p className="mt-1 text-xs text-zinc-500">
          관리자·운영진이 설정에서 팀을 추가하면 여기에 합산 마일리지가 표시됩니다.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {displayRows.map((row) => (
        <TeamRankRow
          key={row.teamId}
          row={row}
          expanded={forceExpandAll || expandedIds.has(row.teamId)}
          onToggle={() => toggle(row.teamId)}
          highlightMemberId={highlightMemberId}
          selectedMemberId={selectedMemberId}
          onMemberSelect={onMemberSelect}
          defaultExpanded={forceExpandAll}
        />
      ))}
    </div>
  )
}

export function buildTeamMileageRankedCount(
  rankingBundle: MemberRunningLeagueRankingBundle | null,
): number {
  if (!rankingBundle) return 0
  return buildTeamMileageLeaderboard({
    teams: rankingBundle.mileageTeams ?? [],
    memberships: rankingBundle.mileageTeamMembers ?? [],
    logs: rankingBundle.mileageLogs,
    mileageRecognition: rankingBundle.mileageRecognition,
  }).ranked.length
}
