'use client'

import { useMemo, useState } from 'react'
import {
  buildWeightedWheelSegments,
  computeWeightedRotationDegrees,
} from '@/lib/running-league/raffle/draw-core'
import { memberChartColorAtIndex } from '@/lib/running-league/chart-member-colors'
import { cn } from '@/lib/utils'

const SPIN_DURATION_MS = 7000
const LABEL_THRESHOLD = 20

type SegmentInput = {
  memberId: string
  memberName: string
  tickets: number
}

type Props = {
  segments: SegmentInput[]
  /** Server-decided winner — animation only follows this */
  targetWinnerMemberId: string | null
  spinning: boolean
  rotation: number
  className?: string
}

export function RaffleWeightedWheelDisc({
  segments,
  targetWinnerMemberId,
  spinning,
  rotation,
  className,
}: Props) {
  const wheelSegments = useMemo(() => {
    const sorted = [...segments].filter((s) => s.tickets > 0)
    return buildWeightedWheelSegments(sorted, (memberId, index) =>
      memberChartColorAtIndex(index, sorted.length),
    )
  }, [segments])

  const gradient = useMemo(() => {
    if (wheelSegments.length === 0) return 'conic-gradient(#27272a 0deg 360deg)'
    return `conic-gradient(from 0deg, ${wheelSegments
      .map((seg) => `${seg.color} ${seg.startDeg}deg ${seg.endDeg}deg`)
      .join(', ')})`
  }, [wheelSegments])

  const showLabels = wheelSegments.length > 0 && wheelSegments.length <= LABEL_THRESHOLD

  return (
    <div className={cn('relative mx-auto aspect-square w-full max-w-[280px]', className)}>
      <div
        className="pointer-events-none absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-1"
        aria-hidden
      >
        <div className="h-0 w-0 border-x-[10px] border-x-transparent border-b-[16px] border-b-orange-300" />
      </div>
      <div className="absolute inset-0 rounded-full border-2 border-zinc-700/90 bg-zinc-950 p-[3px]">
        <div
          className={cn('relative h-full w-full overflow-hidden rounded-full', spinning && 'will-change-transform')}
          style={{
            background: gradient,
            transform: `rotate(${rotation}deg)`,
            transition: spinning
              ? `transform ${SPIN_DURATION_MS}ms cubic-bezier(0.12, 0.82, 0.16, 1)`
              : undefined,
          }}
        >
          {showLabels
            ? wheelSegments.map((seg) => {
                const mid = (seg.startDeg + seg.endDeg) / 2
                return (
                  <span
                    key={seg.memberId}
                    className="pointer-events-none absolute left-1/2 top-1/2 origin-left text-[9px] font-medium text-zinc-950/80"
                    style={{
                      transform: `rotate(${mid}deg) translate(42%, -50%)`,
                    }}
                  >
                    {seg.memberName.slice(0, 4)}
                  </span>
                )
              })
            : null}
        </div>
      </div>
      <div className="pointer-events-none absolute inset-[28%] rounded-full border border-white/10 bg-zinc-950/90" />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="rounded-full border border-zinc-600/50 bg-zinc-950/90 px-3 py-1.5 text-center text-[10px] font-semibold text-orange-200">
          {targetWinnerMemberId ? '추첨' : `${wheelSegments.length}명`}
        </div>
      </div>
    </div>
  )
}

export function useRaffleWheelSpin() {
  const [rotation, setRotation] = useState(0)
  const [spinning, setSpinning] = useState(false)

  function spinToWinner(
    segments: SegmentInput[],
    winnerMemberId: string,
    onDone?: () => void,
  ) {
    const wheelSegments = buildWeightedWheelSegments(
      segments.filter((s) => s.tickets > 0),
      (memberId, index) => memberChartColorAtIndex(index, segments.length),
    )
    const next = computeWeightedRotationDegrees(wheelSegments, winnerMemberId, 0.5, 6)
    const base = rotation % 360
    const target = rotation - base + next
    setSpinning(true)
    setRotation(target)
    window.setTimeout(() => {
      setSpinning(false)
      onDone?.()
    }, SPIN_DURATION_MS)
  }

  return { rotation, spinning, spinToWinner, setRotation }
}

export { SPIN_DURATION_MS }
