'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin'
import { getMemberForCurrentUser, requireAuth } from '@/lib/actions/auth'
import { canAccessSettingsArea } from '@/lib/operator-access'
import {
  DRAW_ALGORITHM_VERSION,
  aggregateTicketsByMember,
  buildDrawResultHash,
  canExecuteDraw,
  pickMultipleWeightedWinners,
  secureRandomUnit,
  totalTickets,
} from '@/lib/running-league/raffle/draw'
import { isRaffleStatus, type RaffleEvent, type RaffleStatus } from '@/lib/running-league/raffle/types'

const EVENT_SELECT =
  'id, title, description, prize_name, prize_description, image_url, ticket_cost_points, max_entries_per_member, start_at, entry_end_at, draw_at, status, winner_count, created_by, created_at, updated_at'

function isMissingRaffleTable(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false
  if (error.code === '42P01') return true
  const message = error.message?.toLowerCase() ?? ''
  return (
    message.includes('raffle_events') ||
    message.includes('raffle_entries') ||
    message.includes('raffle_draws') ||
    message.includes('raffle_winners') ||
    message.includes('enter_raffle_with_points') ||
    message.includes('refund_raffle_on_cancel')
  )
}

async function writeClient() {
  try {
    return createServiceRoleClient()
  } catch {
    return createClient()
  }
}

function revalidateRafflePaths() {
  revalidatePath('/dashboard/my')
  revalidatePath('/dashboard/my/run-point')
  revalidatePath('/dashboard/settings/adult-running-portal')
  revalidatePath('/dashboard/settings/raffle-events')
}

function mapEvent(row: Record<string, unknown>): RaffleEvent {
  const statusRaw = String(row.status ?? 'DRAFT')
  return {
    id: String(row.id),
    title: String(row.title ?? '').trim() || 'RUN EVENT',
    description: row.description == null ? null : String(row.description),
    prize_name: String(row.prize_name ?? '').trim() || '경품',
    prize_description: row.prize_description == null ? null : String(row.prize_description),
    image_url: row.image_url == null ? null : String(row.image_url),
    ticket_cost_points: Number(row.ticket_cost_points ?? 0),
    max_entries_per_member:
      row.max_entries_per_member == null ? null : Number(row.max_entries_per_member),
    start_at: String(row.start_at),
    entry_end_at: String(row.entry_end_at),
    draw_at: row.draw_at == null ? null : String(row.draw_at),
    status: isRaffleStatus(statusRaw) ? statusRaw : 'DRAFT',
    winner_count: Number(row.winner_count ?? 1),
    created_by: row.created_by == null ? null : String(row.created_by),
    created_at: row.created_at == null ? undefined : String(row.created_at),
    updated_at: row.updated_at == null ? undefined : String(row.updated_at),
  }
}

async function requireRaffleStaff() {
  const user = await requireAuth()
  if (!canAccessSettingsArea(user.role)) {
    throw new Error('관리자 또는 운영진만 이용할 수 있습니다.')
  }
  return user
}

export type RaffleEntryStats = {
  totalTickets: number
  participantCount: number
  myTickets: number
}

export type RaffleWinnerPublic = {
  memberId: string
  memberName: string
  winnerOrder: number
  entrySnapshot: number
}

export type RaffleDrawPublic = {
  id: string
  totalEntries: number
  totalMembers: number
  executedAt: string
  executedBy: string | null
  algorithmVersion: string
}

export type MemberRaffleCard = {
  event: RaffleEvent
  stats: RaffleEntryStats
  winners: RaffleWinnerPublic[]
  draw: RaffleDrawPublic | null
  pointBalance: number
  isOpenForEntry: boolean
  daysUntilEntryEnd: number | null
}

export type MemberRaffleHome = {
  tableReady: boolean
  featured: MemberRaffleCard | null
  events: MemberRaffleCard[]
  pastEvents: MemberRaffleCard[]
}

function daysUntil(iso: string, nowMs = Date.now()): number {
  const end = new Date(iso).getTime()
  return Math.ceil((end - nowMs) / (24 * 60 * 60 * 1000))
}

function isOpenForEntry(event: RaffleEvent, nowMs = Date.now()): boolean {
  if (event.status !== 'OPEN') return false
  const start = new Date(event.start_at).getTime()
  const end = new Date(event.entry_end_at).getTime()
  return nowMs >= start && nowMs < end
}

async function loadPointBalance(memberId: string): Promise<number> {
  const admin = await writeClient()
  const { data, error } = await admin
    .from('member_reward_ledger')
    .select('amount')
    .eq('member_id', memberId)
    .eq('currency', 'POINT')
  if (error) {
    if (isMissingRaffleTable(error) || error.message.includes('member_reward_ledger')) return 0
    console.error('loadPointBalance', error.message)
    return 0
  }
  return (data ?? []).reduce((sum, row) => sum + Number(row.amount ?? 0), 0)
}

async function loadEntryAggregates(
  raffleIds: string[],
  memberId?: string | null,
): Promise<Map<string, RaffleEntryStats>> {
  const map = new Map<string, RaffleEntryStats>()
  for (const id of raffleIds) {
    map.set(id, { totalTickets: 0, participantCount: 0, myTickets: 0 })
  }
  if (raffleIds.length === 0) return map

  const admin = await writeClient()
  const { data, error } = await admin
    .from('raffle_entries')
    .select('raffle_id, member_id, ticket_count')
    .in('raffle_id', raffleIds)

  if (error) {
    console.error('loadEntryAggregates', error.message)
    return map
  }

  const byRaffle = new Map<string, Map<string, number>>()
  for (const row of data ?? []) {
    const raffleId = String(row.raffle_id)
    const mid = String(row.member_id)
    const tickets = Number(row.ticket_count ?? 0)
    if (!byRaffle.has(raffleId)) byRaffle.set(raffleId, new Map())
    const members = byRaffle.get(raffleId)!
    members.set(mid, (members.get(mid) ?? 0) + tickets)
  }

  for (const [raffleId, members] of byRaffle) {
    let total = 0
    for (const t of members.values()) total += t
    map.set(raffleId, {
      totalTickets: total,
      participantCount: members.size,
      myTickets: memberId ? (members.get(memberId) ?? 0) : 0,
    })
  }
  return map
}

async function loadWinners(raffleIds: string[]): Promise<Map<string, RaffleWinnerPublic[]>> {
  const map = new Map<string, RaffleWinnerPublic[]>()
  for (const id of raffleIds) map.set(id, [])
  if (raffleIds.length === 0) return map

  const admin = await writeClient()
  const { data, error } = await admin
    .from('raffle_winners')
    .select('raffle_id, member_id, winner_order, entry_snapshot, member:members(id, name)')
    .in('raffle_id', raffleIds)
    .order('winner_order', { ascending: true })

  if (error) {
    console.error('loadWinners', error.message)
    return map
  }

  for (const row of data ?? []) {
    const raffleId = String(row.raffle_id)
    const memberJoin = row.member as { id?: string; name?: string } | { id?: string; name?: string }[] | null
    const member = Array.isArray(memberJoin) ? memberJoin[0] : memberJoin
    const list = map.get(raffleId) ?? []
    list.push({
      memberId: String(row.member_id),
      memberName: member?.name?.trim() || '회원',
      winnerOrder: Number(row.winner_order),
      entrySnapshot: Number(row.entry_snapshot ?? 0),
    })
    map.set(raffleId, list)
  }
  return map
}

async function loadDraws(raffleIds: string[]): Promise<Map<string, RaffleDrawPublic | null>> {
  const map = new Map<string, RaffleDrawPublic | null>()
  for (const id of raffleIds) map.set(id, null)
  if (raffleIds.length === 0) return map

  const admin = await writeClient()
  const { data, error } = await admin
    .from('raffle_draws')
    .select('id, raffle_id, total_entries, total_members, executed_at, executed_by, draw_algorithm_version')
    .in('raffle_id', raffleIds)

  if (error) {
    console.error('loadDraws', error.message)
    return map
  }

  for (const row of data ?? []) {
    map.set(String(row.raffle_id), {
      id: String(row.id),
      totalEntries: Number(row.total_entries ?? 0),
      totalMembers: Number(row.total_members ?? 0),
      executedAt: String(row.executed_at),
      executedBy: row.executed_by == null ? null : String(row.executed_by),
      algorithmVersion: String(row.draw_algorithm_version ?? DRAW_ALGORITHM_VERSION),
    })
  }
  return map
}

function toMemberCard(
  event: RaffleEvent,
  stats: RaffleEntryStats,
  winners: RaffleWinnerPublic[],
  draw: RaffleDrawPublic | null,
  pointBalance: number,
): MemberRaffleCard {
  const open = isOpenForEntry(event)
  return {
    event,
    stats,
    winners,
    draw,
    pointBalance,
    isOpenForEntry: open,
    daysUntilEntryEnd: open ? daysUntil(event.entry_end_at) : null,
  }
}

export async function getMemberRaffleHome(memberId?: string | null): Promise<MemberRaffleHome> {
  const resolvedMemberId =
    memberId ??
    (await getMemberForCurrentUser().then((m) => m?.id ?? null).catch(() => null))

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('raffle_events')
    .select(EVENT_SELECT)
    .neq('status', 'DRAFT')
    .order('entry_end_at', { ascending: true })

  if (error) {
    if (isMissingRaffleTable(error)) {
      return { tableReady: false, featured: null, events: [], pastEvents: [] }
    }
    console.error('getMemberRaffleHome', error.message)
    return { tableReady: true, featured: null, events: [], pastEvents: [] }
  }

  const events = (data ?? []).map((row) => mapEvent(row as Record<string, unknown>))
  const ids = events.map((e) => e.id)
  const [statsMap, winnersMap, drawsMap, balance] = await Promise.all([
    loadEntryAggregates(ids, resolvedMemberId),
    loadWinners(ids),
    loadDraws(ids),
    resolvedMemberId ? loadPointBalance(resolvedMemberId) : Promise.resolve(0),
  ])

  const cards = events.map((event) =>
    toMemberCard(
      event,
      statsMap.get(event.id) ?? { totalTickets: 0, participantCount: 0, myTickets: 0 },
      winnersMap.get(event.id) ?? [],
      drawsMap.get(event.id) ?? null,
      balance,
    ),
  )

  const openCards = cards
    .filter((c) => c.event.status === 'OPEN')
    .sort((a, b) => a.event.entry_end_at.localeCompare(b.event.entry_end_at))
  const pastEvents = cards.filter((c) =>
    ['CLOSED', 'DRAWN', 'CANCELLED', 'DRAWING'].includes(c.event.status),
  )
  const featured = openCards[0] ?? cards.find((c) => c.event.status === 'CLOSED') ?? null

  return {
    tableReady: true,
    featured,
    events: cards,
    pastEvents,
  }
}

export async function enterRaffle(input: {
  raffleId: string
  ticketCount: number
  idempotencyKey?: string
}): Promise<{ ok: true; pointsSpent: number; ticketCount: number; balanceAfter: number | null } | { ok: false; error: string }> {
  const user = await requireAuth()
  const member = await getMemberForCurrentUser()
  if (!member?.id) {
    return { ok: false, error: 'MEMBER_NOT_LINKED' }
  }

  const ticketCount = Math.floor(Number(input.ticketCount))
  if (!Number.isFinite(ticketCount) || ticketCount <= 0) {
    return { ok: false, error: 'INVALID_TICKET_COUNT' }
  }

  const idempotencyKey = (input.idempotencyKey?.trim() || randomUUID()).slice(0, 120)
  const admin = await writeClient()

  const { data, error } = await admin.rpc('enter_raffle_with_points', {
    p_raffle_id: input.raffleId,
    p_member_id: member.id,
    p_ticket_count: ticketCount,
    p_idempotency_key: idempotencyKey,
    p_created_by: user.id,
  })

  if (error) {
    if (isMissingRaffleTable(error)) {
      return { ok: false, error: 'TABLE_MISSING' }
    }
    console.error('enterRaffle', error.message)
    return { ok: false, error: 'ENTER_FAILED' }
  }

  const result = data as Record<string, unknown> | null
  if (!result || result.ok !== true) {
    const code = String(result?.error ?? 'ENTER_FAILED')
    if (code === 'INSUFFICIENT_POINTS') return { ok: false, error: 'INSUFFICIENT_POINTS' }
    if (code === 'MAX_ENTRIES_EXCEEDED') return { ok: false, error: 'MAX_ENTRIES_EXCEEDED' }
    if (code === 'OUTSIDE_ENTRY_WINDOW' || code === 'EVENT_NOT_OPEN') {
      return { ok: false, error: 'ENTRY_CLOSED' }
    }
    return { ok: false, error: code }
  }

  revalidateRafflePaths()
  return {
    ok: true,
    pointsSpent: Number(result.points_spent ?? 0),
    ticketCount: Number(result.ticket_count ?? ticketCount),
    balanceAfter: result.balance_after == null ? null : Number(result.balance_after),
  }
}

export type RaffleAdminListItem = RaffleEvent & {
  totalTickets: number
  participantCount: number
}

export async function listRafflesAdmin(): Promise<{
  tableReady: boolean
  events: RaffleAdminListItem[]
  error?: string
}> {
  await requireRaffleStaff()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('raffle_events')
    .select(EVENT_SELECT)
    .order('created_at', { ascending: false })

  if (error) {
    if (isMissingRaffleTable(error)) {
      return { tableReady: false, events: [], error: 'add-raffle-events.sql 적용이 필요합니다.' }
    }
    return { tableReady: true, events: [], error: error.message }
  }

  const events = (data ?? []).map((row) => mapEvent(row as Record<string, unknown>))
  const stats = await loadEntryAggregates(events.map((e) => e.id))
  return {
    tableReady: true,
    events: events.map((event) => ({
      ...event,
      totalTickets: stats.get(event.id)?.totalTickets ?? 0,
      participantCount: stats.get(event.id)?.participantCount ?? 0,
    })),
  }
}

export async function getRaffleAdminDetail(raffleId: string): Promise<{
  event: RaffleEvent
  stats: RaffleEntryStats
  winners: RaffleWinnerPublic[]
  draw: RaffleDrawPublic | null
  pool: Array<{ memberId: string; memberName: string; tickets: number }>
} | null> {
  await requireRaffleStaff()
  const admin = await writeClient()
  const { data, error } = await admin.from('raffle_events').select(EVENT_SELECT).eq('id', raffleId).maybeSingle()
  if (error || !data) return null

  const event = mapEvent(data as Record<string, unknown>)
  const { data: entryRows } = await admin
    .from('raffle_entries')
    .select('member_id, ticket_count, member:members(id, name)')
    .eq('raffle_id', raffleId)

  const raw = (entryRows ?? []).map((row) => {
    const memberJoin = row.member as { id?: string; name?: string } | { id?: string; name?: string }[] | null
    const member = Array.isArray(memberJoin) ? memberJoin[0] : memberJoin
    return {
      memberId: String(row.member_id),
      ticketCount: Number(row.ticket_count ?? 0),
      memberName: member?.name?.trim() || '회원',
    }
  })
  const pool = aggregateTicketsByMember(raw).map((row) => ({
    memberId: row.memberId,
    memberName: row.memberName ?? '회원',
    tickets: row.tickets,
  }))

  const [statsMap, winnersMap, drawsMap] = await Promise.all([
    loadEntryAggregates([raffleId]),
    loadWinners([raffleId]),
    loadDraws([raffleId]),
  ])

  return {
    event,
    stats: statsMap.get(raffleId) ?? { totalTickets: 0, participantCount: 0, myTickets: 0 },
    winners: winnersMap.get(raffleId) ?? [],
    draw: drawsMap.get(raffleId) ?? null,
    pool,
  }
}

export async function upsertRaffleEvent(input: {
  id?: string
  title: string
  description?: string | null
  prize_name: string
  prize_description?: string | null
  image_url?: string | null
  ticket_cost_points: number
  max_entries_per_member?: number | null
  start_at: string
  entry_end_at: string
  draw_at?: string | null
  winner_count: number
  status?: RaffleStatus
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const user = await requireRaffleStaff()
  const title = input.title.trim()
  const prizeName = input.prize_name.trim()
  const ticketCost = Math.floor(Number(input.ticket_cost_points))
  const winnerCount = Math.floor(Number(input.winner_count))
  const maxEntries =
    input.max_entries_per_member == null || input.max_entries_per_member === undefined
      ? null
      : Math.floor(Number(input.max_entries_per_member))

  if (!title || !prizeName) return { ok: false, error: '필수 항목을 입력해주세요.' }
  if (!Number.isFinite(ticketCost) || ticketCost <= 0) {
    return { ok: false, error: '추첨권 가격은 1P 이상이어야 합니다.' }
  }
  if (!Number.isFinite(winnerCount) || winnerCount <= 0) {
    return { ok: false, error: '당첨 인원은 1명 이상이어야 합니다.' }
  }
  if (maxEntries != null && maxEntries <= 0) {
    return { ok: false, error: '1인 최대 응모는 비우거나 1 이상이어야 합니다.' }
  }
  if (!input.start_at || !input.entry_end_at) {
    return { ok: false, error: '응모 시작/마감을 입력해주세요.' }
  }
  if (new Date(input.entry_end_at).getTime() <= new Date(input.start_at).getTime()) {
    return { ok: false, error: '응모 마감은 시작보다 이후여야 합니다.' }
  }

  const admin = await writeClient()

  if (input.id) {
    const { data: existing, error: existErr } = await admin
      .from('raffle_events')
      .select(EVENT_SELECT)
      .eq('id', input.id)
      .maybeSingle()
    if (existErr || !existing) return { ok: false, error: '이벤트를 찾을 수 없습니다.' }
    const current = mapEvent(existing as Record<string, unknown>)

    const patch: Record<string, unknown> = {
      title,
      description: input.description?.trim() || null,
      prize_name: prizeName,
      prize_description: input.prize_description?.trim() || null,
      image_url: input.image_url?.trim() || null,
      updated_at: new Date().toISOString(),
    }

    if (current.status === 'DRAFT') {
      patch.ticket_cost_points = ticketCost
      patch.max_entries_per_member = maxEntries
      patch.start_at = input.start_at
      patch.entry_end_at = input.entry_end_at
      patch.draw_at = input.draw_at || null
      patch.winner_count = winnerCount
      if (input.status === 'OPEN') {
        patch.status = 'OPEN'
      }
    } else if (current.status === 'OPEN') {
      // OPEN 이후 핵심 조건 잠금 — 문구/마감만 허용
      patch.entry_end_at = input.entry_end_at
      patch.draw_at = input.draw_at || null
    } else {
      return { ok: false, error: '현재 상태에서는 수정할 수 없습니다.' }
    }

    const { error } = await admin.from('raffle_events').update(patch).eq('id', input.id)
    if (error) {
      console.error('upsertRaffleEvent update', error.message)
      return { ok: false, error: error.message }
    }
    revalidateRafflePaths()
    return { ok: true, id: input.id }
  }

  const status: RaffleStatus = input.status === 'OPEN' ? 'OPEN' : 'DRAFT'
  const { data, error } = await admin
    .from('raffle_events')
    .insert({
      title,
      description: input.description?.trim() || null,
      prize_name: prizeName,
      prize_description: input.prize_description?.trim() || null,
      image_url: input.image_url?.trim() || null,
      ticket_cost_points: ticketCost,
      max_entries_per_member: maxEntries,
      start_at: input.start_at,
      entry_end_at: input.entry_end_at,
      draw_at: input.draw_at || null,
      winner_count: winnerCount,
      status,
      created_by: user.id,
      updated_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (error || !data) {
    if (isMissingRaffleTable(error)) {
      return { ok: false, error: 'add-raffle-events.sql 적용이 필요합니다.' }
    }
    console.error('upsertRaffleEvent insert', error?.message)
    return { ok: false, error: error?.message ?? 'CREATE_FAILED' }
  }

  revalidateRafflePaths()
  return { ok: true, id: String(data.id) }
}

export async function setRaffleStatus(
  raffleId: string,
  nextStatus: Extract<RaffleStatus, 'OPEN' | 'CLOSED' | 'CANCELLED'>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireRaffleStaff()
  const admin = await writeClient()

  if (nextStatus === 'CANCELLED') {
    const { data, error } = await admin.rpc('refund_raffle_on_cancel', {
      p_raffle_id: raffleId,
      p_executed_by: user.id,
    })
    if (error) {
      if (isMissingRaffleTable(error)) return { ok: false, error: 'TABLE_MISSING' }
      console.error('setRaffleStatus cancel', error.message)
      return { ok: false, error: error.message }
    }
    const result = data as Record<string, unknown> | null
    if (!result || result.ok !== true) {
      return { ok: false, error: String(result?.error ?? 'CANCEL_FAILED') }
    }
    revalidateRafflePaths()
    return { ok: true }
  }

  const { data: existing, error: existErr } = await admin
    .from('raffle_events')
    .select('id, status')
    .eq('id', raffleId)
    .maybeSingle()
  if (existErr || !existing) return { ok: false, error: 'EVENT_NOT_FOUND' }
  const current = String(existing.status)

  if (nextStatus === 'OPEN') {
    if (current !== 'DRAFT' && current !== 'CLOSED') {
      return { ok: false, error: 'DRAFT/CLOSED에서만 OPEN할 수 있습니다.' }
    }
  }
  if (nextStatus === 'CLOSED') {
    if (current !== 'OPEN') return { ok: false, error: 'OPEN 이벤트만 종료할 수 있습니다.' }
  }

  const { error } = await admin
    .from('raffle_events')
    .update({ status: nextStatus, updated_at: new Date().toISOString() })
    .eq('id', raffleId)
  if (error) return { ok: false, error: error.message }

  revalidateRafflePaths()
  return { ok: true }
}

export async function executeRaffleDraw(raffleId: string): Promise<
  | {
      ok: true
      drawId: string
      winners: RaffleWinnerPublic[]
    }
  | { ok: false; error: string }
> {
  const user = await requireRaffleStaff()
  const admin = await writeClient()

  const { data: eventRow, error: eventErr } = await admin
    .from('raffle_events')
    .select(EVENT_SELECT)
    .eq('id', raffleId)
    .maybeSingle()
  if (eventErr || !eventRow) {
    if (isMissingRaffleTable(eventErr)) return { ok: false, error: 'TABLE_MISSING' }
    return { ok: false, error: 'EVENT_NOT_FOUND' }
  }
  const event = mapEvent(eventRow as Record<string, unknown>)

  const { data: entryRows, error: entryErr } = await admin
    .from('raffle_entries')
    .select('member_id, ticket_count, member:members(id, name)')
    .eq('raffle_id', raffleId)
  if (entryErr) return { ok: false, error: entryErr.message }

  const raw = (entryRows ?? []).map((row) => {
    const memberJoin = row.member as { id?: string; name?: string } | { id?: string; name?: string }[] | null
    const member = Array.isArray(memberJoin) ? memberJoin[0] : memberJoin
    return {
      memberId: String(row.member_id),
      ticketCount: Number(row.ticket_count ?? 0),
      memberName: member?.name?.trim() || '회원',
    }
  })
  const snapshot = aggregateTicketsByMember(raw)
  const participantCount = snapshot.length
  const tickets = totalTickets(snapshot)

  const gate = canExecuteDraw({
    status: event.status,
    entryEndAtMs: new Date(event.entry_end_at).getTime(),
    nowMs: Date.now(),
    participantCount,
    winnerCount: event.winner_count,
  })
  if (!gate.ok) return { ok: false, error: gate.error }

  // status lock: CLOSED → DRAWING
  const { data: locked, error: lockErr } = await admin
    .from('raffle_events')
    .update({ status: 'DRAWING', updated_at: new Date().toISOString() })
    .eq('id', raffleId)
    .eq('status', 'CLOSED')
    .select('id')
    .maybeSingle()

  if (lockErr || !locked) {
    return { ok: false, error: 'ALREADY_DRAWING_OR_DRAWN' }
  }

  try {
    const randomUnits = Array.from({ length: event.winner_count }, () => secureRandomUnit())
    const winners = pickMultipleWeightedWinners(snapshot, event.winner_count, randomUnits)
    const resultHash = buildDrawResultHash({
      raffleId,
      snapshot,
      winners,
      algorithmVersion: DRAW_ALGORITHM_VERSION,
    })

    const { data: drawRow, error: drawErr } = await admin
      .from('raffle_draws')
      .insert({
        raffle_id: raffleId,
        total_entries: tickets,
        total_members: participantCount,
        draw_algorithm_version: DRAW_ALGORITHM_VERSION,
        result_hash: resultHash,
        entry_snapshot: snapshot.map((s) => ({
          memberId: s.memberId,
          entries: s.tickets,
          memberName: s.memberName ?? null,
        })),
        metadata: {
          winner_count: event.winner_count,
          note: '동일 회원 중복 당첨 불가. 당첨 후 해당 회원 티켓 제거 후 다음 추첨.',
        },
        executed_by: user.id,
      })
      .select('id')
      .single()

    if (drawErr || !drawRow) {
      await admin
        .from('raffle_events')
        .update({ status: 'CLOSED', updated_at: new Date().toISOString() })
        .eq('id', raffleId)
        .eq('status', 'DRAWING')
      if (drawErr?.code === '23505') return { ok: false, error: 'ALREADY_DRAWN' }
      return { ok: false, error: drawErr?.message ?? 'DRAW_INSERT_FAILED' }
    }

    const drawId = String(drawRow.id)
    const winnerInserts = winners.map((w) => ({
      raffle_id: raffleId,
      member_id: w.memberId,
      winner_order: w.winnerOrder,
      entry_snapshot: w.entrySnapshot,
      draw_id: drawId,
      drawn_by: user.id,
    }))

    const { error: winnersErr } = await admin.from('raffle_winners').insert(winnerInserts)
    if (winnersErr) {
      await admin.from('raffle_winners').delete().eq('draw_id', drawId)
      await admin.from('raffle_draws').delete().eq('id', drawId)
      await admin
        .from('raffle_events')
        .update({ status: 'CLOSED', updated_at: new Date().toISOString() })
        .eq('id', raffleId)
      return { ok: false, error: winnersErr.message }
    }

    const { error: doneErr } = await admin
      .from('raffle_events')
      .update({ status: 'DRAWN', updated_at: new Date().toISOString() })
      .eq('id', raffleId)
      .eq('status', 'DRAWING')

    if (doneErr) {
      return { ok: false, error: doneErr.message }
    }

    const publicWinners: RaffleWinnerPublic[] = winners.map((w) => ({
      memberId: w.memberId,
      memberName: w.memberName ?? snapshot.find((s) => s.memberId === w.memberId)?.memberName ?? '회원',
      winnerOrder: w.winnerOrder,
      entrySnapshot: w.entrySnapshot,
    }))

    revalidateRafflePaths()
    return { ok: true, drawId, winners: publicWinners }
  } catch (err) {
    await admin
      .from('raffle_events')
      .update({ status: 'CLOSED', updated_at: new Date().toISOString() })
      .eq('id', raffleId)
      .eq('status', 'DRAWING')
    const message = err instanceof Error ? err.message : 'DRAW_FAILED'
    return { ok: false, error: message }
  }
}

export async function getRafflePoolForWheel(raffleId: string): Promise<{
  ok: true
  segments: Array<{ memberId: string; memberName: string; tickets: number }>
  winners: RaffleWinnerPublic[]
  status: RaffleStatus
} | { ok: false; error: string }> {
  await requireRaffleStaff()
  const detail = await getRaffleAdminDetail(raffleId)
  if (!detail) return { ok: false, error: 'NOT_FOUND' }
  return {
    ok: true,
    segments: detail.pool,
    winners: detail.winners,
    status: detail.event.status,
  }
}
