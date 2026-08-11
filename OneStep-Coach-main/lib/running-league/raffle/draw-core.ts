import type { WeightedRaffleEntry, RaffleWinnerResult } from './types'

export const DRAW_ALGORITHM_VERSION = 'weighted_v1'

export function aggregateTicketsByMember(
  rows: ReadonlyArray<{ memberId: string; ticketCount: number; memberName?: string }>,
): WeightedRaffleEntry[] {
  const map = new Map<string, WeightedRaffleEntry>()
  for (const row of rows) {
    if (!Number.isFinite(row.ticketCount) || row.ticketCount <= 0) continue
    const existing = map.get(row.memberId)
    if (existing) {
      existing.tickets += row.ticketCount
    } else {
      map.set(row.memberId, {
        memberId: row.memberId,
        memberName: row.memberName,
        tickets: row.ticketCount,
      })
    }
  }
  return [...map.values()].sort((a, b) => a.memberId.localeCompare(b.memberId))
}

export function totalTickets(entries: ReadonlyArray<WeightedRaffleEntry>): number {
  return entries.reduce((sum, row) => sum + Math.max(0, row.tickets), 0)
}

/**
 * randomUnit in [0, 1). Uses cumulative weights (ticket = equal chance).
 * Pure: injectable random for tests.
 */
export function pickWeightedWinner(
  entries: ReadonlyArray<WeightedRaffleEntry>,
  randomUnit: number,
): WeightedRaffleEntry | null {
  const active = entries.filter((row) => row.tickets > 0)
  const total = totalTickets(active)
  if (total <= 0 || active.length === 0) return null
  if (!(randomUnit >= 0 && randomUnit < 1)) {
    throw new Error('RANDOM_UNIT_OUT_OF_RANGE')
  }

  let cursor = randomUnit * total
  for (const row of active) {
    cursor -= row.tickets
    if (cursor < 0) return row
  }
  return active[active.length - 1]!
}

/**
 * Multiple winners: after each win, remove that member's remaining tickets.
 * randomUnits[i] used for ith pick. Length must be >= winnerCount.
 */
export function pickMultipleWeightedWinners(
  entries: ReadonlyArray<WeightedRaffleEntry>,
  winnerCount: number,
  randomUnits: ReadonlyArray<number>,
): RaffleWinnerResult[] {
  if (!Number.isInteger(winnerCount) || winnerCount <= 0) {
    throw new Error('INVALID_WINNER_COUNT')
  }
  const pool = aggregateTicketsByMember(
    entries.map((e) => ({
      memberId: e.memberId,
      ticketCount: e.tickets,
      memberName: e.memberName,
    })),
  )
  const distinctMembers = pool.length
  if (distinctMembers === 0) {
    throw new Error('NO_ENTRIES')
  }
  if (winnerCount > distinctMembers) {
    throw new Error('WINNER_COUNT_EXCEEDS_MEMBERS')
  }
  if (randomUnits.length < winnerCount) {
    throw new Error('INSUFFICIENT_RANDOM_UNITS')
  }

  const winners: RaffleWinnerResult[] = []
  let remaining = [...pool]

  for (let order = 1; order <= winnerCount; order += 1) {
    const picked = pickWeightedWinner(remaining, randomUnits[order - 1]!)
    if (!picked) throw new Error('DRAW_FAILED')
    winners.push({
      memberId: picked.memberId,
      memberName: picked.memberName,
      winnerOrder: order,
      entrySnapshot: picked.tickets,
    })
    remaining = remaining.filter((row) => row.memberId !== picked.memberId)
  }

  const unique = new Set(winners.map((w) => w.memberId))
  if (unique.size !== winners.length) {
    throw new Error('DUPLICATE_WINNER')
  }
  return winners
}

/** Visual: weighted segments without expanding tickets into DOM slots */
export type WheelSegment = {
  memberId: string
  memberName: string
  weight: number
  startDeg: number
  endDeg: number
  color: string
}

export function buildWeightedWheelSegments(
  entries: ReadonlyArray<WeightedRaffleEntry & { memberName: string }>,
  colorFor: (memberId: string, index: number) => string,
): WheelSegment[] {
  const total = totalTickets(entries)
  if (total <= 0) return []
  let cursor = 0
  return entries.map((row, index) => {
    const startDeg = (cursor / total) * 360
    cursor += row.tickets
    const endDeg = (cursor / total) * 360
    return {
      memberId: row.memberId,
      memberName: row.memberName,
      weight: row.tickets,
      startDeg,
      endDeg,
      color: colorFor(row.memberId, index),
    }
  })
}

/** Pointer at 12 o'clock; spin so a point inside winner segment lands under pointer */
export function computeWeightedRotationDegrees(
  segments: ReadonlyArray<WheelSegment>,
  winnerMemberId: string,
  randomUnitInSegment = 0.5,
  extraSpins = 6,
): number {
  const segment = segments.find((s) => s.memberId === winnerMemberId)
  if (!segment) return extraSpins * 360
  const span = segment.endDeg - segment.startDeg
  const t = Math.min(Math.max(randomUnitInSegment, 0.05), 0.95)
  const targetCenter = segment.startDeg + span * t
  return extraSpins * 360 + (360 - targetCenter)
}

export function canExecuteDraw(params: {
  status: string
  entryEndAtMs: number
  nowMs: number
  participantCount: number
  winnerCount: number
}): { ok: true } | { ok: false; error: string } {
  if (params.status === 'DRAWN' || params.status === 'DRAWING') {
    return { ok: false, error: 'ALREADY_DRAWN' }
  }
  if (params.status === 'CANCELLED') {
    return { ok: false, error: 'CANCELLED' }
  }
  if (params.status === 'OPEN') {
    return { ok: false, error: 'MUST_CLOSE_FIRST' }
  }
  if (params.status !== 'CLOSED') {
    return { ok: false, error: 'INVALID_STATUS' }
  }
  if (params.winnerCount <= 0) {
    return { ok: false, error: 'INVALID_WINNER_COUNT' }
  }
  if (params.participantCount <= 0) {
    return { ok: false, error: 'NO_ENTRIES' }
  }
  if (params.winnerCount > params.participantCount) {
    return { ok: false, error: 'WINNER_COUNT_EXCEEDS_MEMBERS' }
  }
  return { ok: true }
}
