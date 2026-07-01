'use client'

import { useMemo, useState } from 'react'
import { Disc3 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import type { MemberRunningLeagueRankingBundle } from '@/lib/actions/running-league'
import { buildAttendanceLeaderboard } from '@/lib/running-league/attendance-leaderboard'
import {
  buildAttendanceRouletteSlots,
  computeAttendanceRouletteRotationDegrees,
  pickAttendanceRouletteWinner,
  resolveAttendanceRouletteSlotFromRotation,
  summarizeAttendanceRouletteOdds,
  type AttendanceRouletteSlot,
} from '@/lib/running-league/attendance-roulette'
import { memberChartColorAtIndex } from '@/lib/running-league/chart-member-colors'
import { cn } from '@/lib/utils'

const SPIN_DURATION_MS = 7000

type AttendanceRouletteWheelProps = {
  rankingBundle: MemberRunningLeagueRankingBundle | null
  canSpin?: boolean
  className?: string
}

function buildMemberColor(memberId: string, memberIds: string[]): string {
  const index = memberIds.indexOf(memberId)
  return memberChartColorAtIndex(index < 0 ? 0 : index, memberIds.length)
}

function RouletteWheelDisc({
  slots,
  rotation,
  spinning,
}: {
  slots: AttendanceRouletteSlot[]
  rotation: number
  spinning: boolean
}) {
  const gradient = useMemo(() => {
    if (slots.length === 0) return 'conic-gradient(#27272a 0deg 360deg)'
    const slotAngle = 360 / slots.length
    return `conic-gradient(from 0deg, ${slots
      .map((slot, index) => {
        const start = index * slotAngle
        const end = (index + 1) * slotAngle
        return `${slot.color} ${start}deg ${end}deg`
      })
      .join(', ')})`
  }, [slots])

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[280px]">
      <div
        className="pointer-events-none absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-1"
        aria-hidden
      >
        <div className="h-0 w-0 border-x-[10px] border-x-transparent border-b-[16px] border-b-lime-300 drop-shadow-[0_0_8px_rgba(163,230,53,0.45)]" />
      </div>
      <div className="absolute inset-0 rounded-full border-2 border-zinc-700/90 bg-zinc-950 p-[3px] shadow-[0_0_24px_rgba(0,0,0,0.45)]">
        <div
          className={cn(
            'h-full w-full overflow-hidden rounded-full',
            spinning && 'will-change-transform',
          )}
          style={{
            background: gradient,
            transform: `rotate(${rotation}deg)`,
            transition: spinning
              ? `transform ${SPIN_DURATION_MS}ms cubic-bezier(0.12, 0.82, 0.16, 1)`
              : undefined,
          }}
        />
      </div>
      <div className="pointer-events-none absolute inset-[28%] rounded-full border border-white/10 bg-zinc-950/90 shadow-inner" />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="rounded-full border border-zinc-600/50 bg-zinc-950/90 px-3 py-1.5 text-center text-[10px] font-semibold text-lime-200">
          {slots.length}칸
        </div>
      </div>
    </div>
  )
}

export function AttendanceRouletteWheel({
  rankingBundle,
  canSpin = false,
  className,
}: AttendanceRouletteWheelProps) {
  const [open, setOpen] = useState(false)
  const [rotation, setRotation] = useState(0)
  const [spinning, setSpinning] = useState(false)
  const [winner, setWinner] = useState<AttendanceRouletteSlot | null>(null)

  const attendanceMembers = useMemo(() => {
    if (!rankingBundle) return []
    const { start, end } = rankingBundle.rankingPeriod
    const leaderboard = buildAttendanceLeaderboard(
      rankingBundle.participants,
      rankingBundle.mileageLogs,
      start,
      end,
    )
    return leaderboard.ranked.map((row) => ({
      memberId: row.memberId,
      memberName: row.memberName,
      attendanceDays: row.attendanceDays,
    }))
  }, [rankingBundle])

  const memberIds = useMemo(
    () => attendanceMembers.map((row) => row.memberId),
    [attendanceMembers],
  )

  const slots = useMemo(
    () =>
      buildAttendanceRouletteSlots(attendanceMembers, (memberId) =>
        buildMemberColor(memberId, memberIds),
      ),
    [attendanceMembers, memberIds],
  )

  const odds = useMemo(() => summarizeAttendanceRouletteOdds(attendanceMembers), [attendanceMembers])

  const hasSlots = slots.length > 0

  function handleSpin() {
    if (!canSpin || spinning || !hasSlots) return
    const { slotIndex, winner: picked } = pickAttendanceRouletteWinner(slots)
    const nextRotation = computeAttendanceRouletteRotationDegrees(slotIndex, slots.length)
    const base = rotation % 360
    const target = rotation - base + nextRotation

    setWinner(null)
    setSpinning(true)
    setRotation(target)

    window.setTimeout(() => {
      const resolvedIndex = resolveAttendanceRouletteSlotFromRotation(target, slots.length)
      setSpinning(false)
      setWinner(slots[resolvedIndex] ?? picked)
    }, SPIN_DURATION_MS)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(
            'h-9 gap-1.5 border-lime-500/30 bg-lime-500/5 px-2.5 text-[11px] text-lime-100 hover:bg-lime-500/10',
            className,
          )}
          aria-label="출석 돌림판 열기"
        >
          <Disc3 className="h-4 w-4 shrink-0 text-lime-300" />
          <span className="hidden sm:inline">돌림판</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md border-lime-500/20 bg-zinc-950 text-zinc-100">
        <DialogHeader>
          <DialogTitle className="text-lime-100">출석 돌림판</DialogTitle>
          <DialogDescription className="text-zinc-400">
            출석 1회마다 돌림판 칸 1개 · 칸마다 당첨 확률은 동일 · 확률은 출석 횟수만큼 올라감
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {hasSlots ? (
            <>
              <RouletteWheelDisc slots={slots} rotation={rotation} spinning={spinning} />
              {winner ? (
                <div className="rounded-lg border border-lime-400/35 bg-lime-500/10 px-4 py-3 text-center">
                  <p className="text-xs text-lime-200/80">당첨</p>
                  <p className="mt-1 text-lg font-bold text-lime-50">{winner.memberName}</p>
                </div>
              ) : null}
              {canSpin ? (
                <Button
                  type="button"
                  className="w-full bg-lime-500 text-zinc-950 hover:bg-lime-400"
                  disabled={spinning}
                  onClick={handleSpin}
                >
                  {spinning ? '돌리는 중…' : '돌리기'}
                </Button>
              ) : (
                <p className="text-center text-xs text-zinc-500">
                  돌리기는 운영진·관리자만 할 수 있습니다.
                </p>
              )}
              <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-white/5 bg-black/30 p-2.5">
                <p className="text-[11px] font-medium text-zinc-400">회원별 칸 · 확률</p>
                {odds.map((row) => (
                  <div
                    key={row.memberId}
                    className="flex items-center justify-between gap-2 text-xs"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: buildMemberColor(row.memberId, memberIds) }}
                        aria-hidden
                      />
                      <span className="truncate text-zinc-200">{row.memberName}</span>
                    </span>
                    <span className="shrink-0 tabular-nums text-lime-300/90">
                      {row.slotCount}칸 · {row.oddsPercent}%
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="rounded-lg border border-dashed border-zinc-700 px-4 py-8 text-center text-sm text-zinc-500">
              이번 달 출석 기록이 있는 회원이 없습니다.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
