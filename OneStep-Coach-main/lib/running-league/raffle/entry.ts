/** 추첨권 비용 / 응모 검증 (순수) */

export function calculateRafflePointCost(ticketCostPoints: number, ticketCount: number): number {
  if (!Number.isFinite(ticketCostPoints) || !Number.isFinite(ticketCount)) {
    throw new Error('INVALID_COST_INPUT')
  }
  if (ticketCostPoints <= 0) throw new Error('INVALID_TICKET_COST')
  if (ticketCount <= 0) throw new Error('INVALID_TICKET_COUNT')
  if (!Number.isInteger(ticketCostPoints) || !Number.isInteger(ticketCount)) {
    throw new Error('NON_INTEGER_COST_INPUT')
  }
  return ticketCostPoints * ticketCount
}

export function canAffordRaffle(balance: number, cost: number): boolean {
  return Number.isFinite(balance) && Number.isFinite(cost) && balance >= cost && cost > 0
}

export function wouldExceedMaxEntries(params: {
  currentTickets: number
  addTickets: number
  maxEntriesPerMember: number | null
}): boolean {
  if (params.maxEntriesPerMember == null) return false
  if (params.maxEntriesPerMember <= 0) return true
  return params.currentTickets + params.addTickets > params.maxEntriesPerMember
}

export function isWithinEntryWindow(params: {
  nowMs: number
  startAtMs: number
  entryEndAtMs: number
  status: string
}): boolean {
  if (params.status !== 'OPEN') return false
  return params.nowMs >= params.startAtMs && params.nowMs < params.entryEndAtMs
}

export function validateEnterRaffleRequest(params: {
  ticketCount: number
  ticketCostPoints: number
  balance: number
  currentTickets: number
  maxEntriesPerMember: number | null
  nowMs: number
  startAtMs: number
  entryEndAtMs: number
  status: string
}): { ok: true; cost: number } | { ok: false; error: string } {
  if (!Number.isInteger(params.ticketCount) || params.ticketCount <= 0) {
    return { ok: false, error: 'INVALID_TICKET_COUNT' }
  }
  if (!Number.isInteger(params.ticketCostPoints) || params.ticketCostPoints <= 0) {
    return { ok: false, error: 'INVALID_TICKET_COST' }
  }
  if (!isWithinEntryWindow(params)) {
    return { ok: false, error: 'OUTSIDE_ENTRY_WINDOW' }
  }
  if (
    wouldExceedMaxEntries({
      currentTickets: params.currentTickets,
      addTickets: params.ticketCount,
      maxEntriesPerMember: params.maxEntriesPerMember,
    })
  ) {
    return { ok: false, error: 'MAX_ENTRIES_EXCEEDED' }
  }
  const cost = calculateRafflePointCost(params.ticketCostPoints, params.ticketCount)
  if (!canAffordRaffle(params.balance, cost)) {
    return { ok: false, error: 'INSUFFICIENT_POINTS' }
  }
  return { ok: true, cost }
}
