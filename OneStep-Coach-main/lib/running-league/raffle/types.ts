export const RAFFLE_STATUSES = [
  'DRAFT',
  'OPEN',
  'CLOSED',
  'DRAWING',
  'DRAWN',
  'CANCELLED',
] as const

export type RaffleStatus = (typeof RAFFLE_STATUSES)[number]

export type RaffleEvent = {
  id: string
  title: string
  description: string | null
  prize_name: string
  prize_description: string | null
  image_url: string | null
  ticket_cost_points: number
  max_entries_per_member: number | null
  start_at: string
  entry_end_at: string
  draw_at: string | null
  status: RaffleStatus
  winner_count: number
  created_by: string | null
  created_at?: string
  updated_at?: string
}

export type WeightedRaffleEntry = {
  memberId: string
  memberName?: string
  tickets: number
}

export type RaffleWinnerResult = {
  memberId: string
  memberName?: string
  winnerOrder: number
  entrySnapshot: number
}

export function isRaffleStatus(value: string): value is RaffleStatus {
  return (RAFFLE_STATUSES as readonly string[]).includes(value)
}
