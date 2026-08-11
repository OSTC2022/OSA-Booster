import assert from 'node:assert/strict'
import {
  calculateRafflePointCost,
  canAffordRaffle,
  isWithinEntryWindow,
  validateEnterRaffleRequest,
  wouldExceedMaxEntries,
} from '../lib/running-league/raffle/entry.ts'
import {
  canExecuteDraw,
  pickMultipleWeightedWinners,
  pickWeightedWinner,
  totalTickets,
  aggregateTicketsByMember,
} from '../lib/running-league/raffle/draw-core.ts'

// Point cost
assert.equal(calculateRafflePointCost(5, 3), 15)
assert.equal(calculateRafflePointCost(10, 2), 20)
assert.throws(() => calculateRafflePointCost(0, 1))
assert.throws(() => calculateRafflePointCost(5, 0))
assert.throws(() => calculateRafflePointCost(-1, 2))

assert.equal(canAffordRaffle(15, 15), true)
assert.equal(canAffordRaffle(14, 15), false)
assert.equal(canAffordRaffle(0, 5), false)

assert.equal(
  wouldExceedMaxEntries({ currentTickets: 8, addTickets: 3, maxEntriesPerMember: 10 }),
  true,
)
assert.equal(
  wouldExceedMaxEntries({ currentTickets: 8, addTickets: 2, maxEntriesPerMember: 10 }),
  false,
)
assert.equal(
  wouldExceedMaxEntries({ currentTickets: 100, addTickets: 1, maxEntriesPerMember: null }),
  false,
)

assert.equal(
  isWithinEntryWindow({
    nowMs: 100,
    startAtMs: 50,
    entryEndAtMs: 200,
    status: 'OPEN',
  }),
  true,
)
assert.equal(
  isWithinEntryWindow({
    nowMs: 250,
    startAtMs: 50,
    entryEndAtMs: 200,
    status: 'OPEN',
  }),
  false,
)
assert.equal(
  isWithinEntryWindow({
    nowMs: 100,
    startAtMs: 50,
    entryEndAtMs: 200,
    status: 'CLOSED',
  }),
  false,
)

{
  const ok = validateEnterRaffleRequest({
    ticketCount: 3,
    ticketCostPoints: 5,
    balance: 50,
    currentTickets: 0,
    maxEntriesPerMember: 20,
    nowMs: 100,
    startAtMs: 0,
    entryEndAtMs: 200,
    status: 'OPEN',
  })
  assert.equal(ok.ok, true)
  if (ok.ok) assert.equal(ok.cost, 15)
}

{
  const fail = validateEnterRaffleRequest({
    ticketCount: 3,
    ticketCostPoints: 5,
    balance: 10,
    currentTickets: 0,
    maxEntriesPerMember: 20,
    nowMs: 100,
    startAtMs: 0,
    entryEndAtMs: 200,
    status: 'OPEN',
  })
  assert.equal(fail.ok, false)
  if (!fail.ok) assert.equal(fail.error, 'INSUFFICIENT_POINTS')
}

{
  const fail = validateEnterRaffleRequest({
    ticketCount: 3,
    ticketCostPoints: 5,
    balance: 50,
    currentTickets: 8,
    maxEntriesPerMember: 10,
    nowMs: 100,
    startAtMs: 0,
    entryEndAtMs: 200,
    status: 'OPEN',
  })
  assert.equal(fail.ok, false)
  if (!fail.ok) assert.equal(fail.error, 'MAX_ENTRIES_EXCEEDED')
}

// Weighted draw — single
{
  const winner = pickWeightedWinner([{ memberId: 'A', tickets: 1 }], 0)
  assert.equal(winner?.memberId, 'A')
}

{
  const a = pickWeightedWinner(
    [
      { memberId: 'A', tickets: 1 },
      { memberId: 'B', tickets: 1 },
    ],
    0,
  )
  const b = pickWeightedWinner(
    [
      { memberId: 'A', tickets: 1 },
      { memberId: 'B', tickets: 1 },
    ],
    0.5,
  )
  assert.equal(a?.memberId, 'A')
  assert.equal(b?.memberId, 'B')
}

{
  const winner = pickWeightedWinner(
    [
      { memberId: 'A', tickets: 1 },
      { memberId: 'B', tickets: 9 },
    ],
    0.05,
  )
  assert.equal(winner?.memberId, 'A')
  const winnerB = pickWeightedWinner(
    [
      { memberId: 'A', tickets: 1 },
      { memberId: 'B', tickets: 9 },
    ],
    0.2,
  )
  assert.equal(winnerB?.memberId, 'B')
}

assert.equal(pickWeightedWinner([], 0.5), null)
assert.throws(() => pickMultipleWeightedWinners([], 1, [0.1]))
assert.throws(() =>
  pickMultipleWeightedWinners([{ memberId: 'A', tickets: 1 }], 0, [0.1]),
)
assert.throws(() =>
  pickMultipleWeightedWinners([{ memberId: 'A', tickets: 1 }], 2, [0.1, 0.2]),
)

// Multiple winners — no duplicate
{
  const winners = pickMultipleWeightedWinners(
    [
      { memberId: 'A', tickets: 10 },
      { memberId: 'B', tickets: 5 },
      { memberId: 'C', tickets: 3 },
      { memberId: 'D', tickets: 1 },
    ],
    3,
    [0.01, 0.01, 0.01],
  )
  assert.equal(winners.length, 3)
  const ids = new Set(winners.map((w) => w.memberId))
  assert.equal(ids.size, 3)
  assert.equal(winners[0].memberId, 'A')
}

// Fairness smoke: A=1 B=9 over 10_000
{
  let aWins = 0
  const n = 10_000
  for (let i = 0; i < n; i += 1) {
    const unit = i / n
    const w = pickWeightedWinner(
      [
        { memberId: 'A', tickets: 1 },
        { memberId: 'B', tickets: 9 },
      ],
      unit,
    )
    if (w?.memberId === 'A') aWins += 1
  }
  const rate = aWins / n
  assert.ok(rate > 0.08 && rate < 0.12, `expected ~10%, got ${rate}`)
}

{
  const agg = aggregateTicketsByMember([
    { memberId: 'A', ticketCount: 2 },
    { memberId: 'A', ticketCount: 3 },
    { memberId: 'B', ticketCount: 5 },
  ])
  assert.equal(totalTickets(agg), 10)
  assert.equal(agg.find((r) => r.memberId === 'A')?.tickets, 5)
}

assert.deepEqual(
  canExecuteDraw({
    status: 'CLOSED',
    entryEndAtMs: 0,
    nowMs: 1,
    participantCount: 3,
    winnerCount: 2,
  }),
  { ok: true },
)
assert.equal(
  canExecuteDraw({
    status: 'OPEN',
    entryEndAtMs: 0,
    nowMs: 1,
    participantCount: 3,
    winnerCount: 2,
  }).ok,
  false,
)
assert.equal(
  canExecuteDraw({
    status: 'DRAWN',
    entryEndAtMs: 0,
    nowMs: 1,
    participantCount: 3,
    winnerCount: 2,
  }).ok,
  false,
)
assert.equal(
  canExecuteDraw({
    status: 'CLOSED',
    entryEndAtMs: 0,
    nowMs: 1,
    participantCount: 2,
    winnerCount: 5,
  }).ok,
  false,
)

console.log('verify-raffle: PASS')
