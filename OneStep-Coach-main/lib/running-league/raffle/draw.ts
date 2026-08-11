import { createHash, randomBytes } from 'node:crypto'
import type { WeightedRaffleEntry, RaffleWinnerResult } from './types'
import { DRAW_ALGORITHM_VERSION } from './draw-core'

export * from './draw-core'

/** cryptographically secure [0, 1) — server only */
export function secureRandomUnit(): number {
  const buf = randomBytes(6)
  const n = buf.readUIntBE(0, 6)
  return n / 0x1_0000_0000_0000
}

export function buildDrawResultHash(params: {
  raffleId: string
  snapshot: ReadonlyArray<WeightedRaffleEntry>
  winners: ReadonlyArray<RaffleWinnerResult>
  algorithmVersion?: string
}): string {
  const payload = JSON.stringify({
    raffleId: params.raffleId,
    algorithmVersion: params.algorithmVersion ?? DRAW_ALGORITHM_VERSION,
    snapshot: params.snapshot.map((s) => ({ memberId: s.memberId, tickets: s.tickets })),
    winners: params.winners.map((w) => ({
      memberId: w.memberId,
      winnerOrder: w.winnerOrder,
      entrySnapshot: w.entrySnapshot,
    })),
  })
  return createHash('sha256').update(payload).digest('hex')
}
