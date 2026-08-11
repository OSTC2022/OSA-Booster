'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin'
import { getMemberForCurrentUser, requireAuth } from '@/lib/actions/auth'
import { canAccessSettingsArea } from '@/lib/operator-access'
import { getCenterSettings } from '@/lib/actions/center-settings'
import { resolveMileageRecognitionFromCenterSettings } from '@/lib/running-league/mileage-recognition'
import { getLevelProgress } from '@/lib/running-league/rewards/level'
import {
  buildAchievementRewards,
  buildMvpRewards,
  buildPbRewards,
  buildRunDayRewards,
  buildTeamBattleRewards,
  buildWeeklyMissionRewards,
  collectPendingRewards,
  sumLedgerBalance,
  type PendingReward,
} from '@/lib/running-league/rewards/evaluate'
import { buildTeamBattleScoreboard } from '@/lib/running-league/team-battle'
import { buildMvpHomeView } from '@/lib/running-league/mvp'
import {
  isWeeklyMissionType,
  type WeeklyMissionDefinition,
  unitForMissionType,
} from '@/lib/running-league/weekly-missions'
import { resolveAdultRunningMemberIds } from '@/lib/running-league/resolve-adult-running-member-ids'
import { filterParticipantsForAdultRunningLeague } from '@/lib/running-league/adult-running-eligibility'
import type { RewardCurrency } from '@/lib/running-league/rewards/config'

function isMissingLedgerTable(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false
  if (error.code === '42P01') return true
  const message = error.message?.toLowerCase() ?? ''
  return message.includes('member_reward_ledger')
}

async function rewardWriteClient() {
  try {
    return createServiceRoleClient()
  } catch {
    return createClient()
  }
}

function revalidateRewardPaths() {
  revalidatePath('/dashboard/my')
  revalidatePath('/dashboard/settings/adult-running-portal')
}

export type RewardLedgerRow = {
  id: string
  currency: RewardCurrency
  amount: number
  source_type: string
  description: string
  created_at: string
  metadata: Record<string, unknown> | null
}

export type MemberRewardHome = {
  tableReady: boolean
  totalXp: number
  totalPoints: number
  level: ReturnType<typeof getLevelProgress>
  recent: RewardLedgerRow[]
  newlyAwarded: PendingReward[]
  leveledUp: boolean
  previousLevel: number | null
}

export type MemberRewardHomeResult = MemberRewardHome | { unlinked: true }

async function insertPendingRewards(
  memberId: string,
  pending: PendingReward[],
  createdBy?: string | null,
): Promise<PendingReward[]> {
  if (pending.length === 0) return []
  const admin = await rewardWriteClient()
  const newly: PendingReward[] = []

  for (const row of pending) {
    const { error } = await admin.from('member_reward_ledger').insert({
      member_id: memberId,
      currency: row.currency,
      amount: row.amount,
      source_type: row.source_type,
      source_id: row.source_id,
      idempotency_key: row.idempotency_key,
      description: row.description,
      metadata: row.metadata ?? {},
      created_by: createdBy ?? null,
    })
    if (error) {
      if (error.code === '23505' || error.message.includes('duplicate')) continue
      if (isMissingLedgerTable(error)) {
        throw new Error('member_reward_ledger 테이블이 없습니다. add-member-reward-ledger.sql 실행 필요')
      }
      console.error('insertPendingRewards', row.idempotency_key, error.message)
      continue
    }
    newly.push(row)
  }
  return newly
}

async function loadMemberRewardContext(memberId: string) {
  const supabase = await createClient()
  const centerSettings = await getCenterSettings()
  const recognition = resolveMileageRecognitionFromCenterSettings(centerSettings)

  const [
    logsResult,
    pbResult,
    missionsResult,
    unlocksResult,
    battleMembersResult,
  ] = await Promise.all([
    supabase
      .from('running_league_mileage_logs')
      .select('member_id, distance_km, logged_at')
      .eq('member_id', memberId)
      .order('logged_at', { ascending: true }),
    supabase
      .from('running_league_records')
      .select(
        'id, member_id, distance_event, measured_at, time_seconds, time_text, record_phase, created_at',
      )
      .eq('member_id', memberId)
      .in('record_phase', ['other', 'pb_history']),
    supabase
      .from('weekly_missions')
      .select(
        'id, title, description, mission_type, target_value, unit, start_at, end_at, is_active, is_auto, created_by, reward_points, sort_order',
      )
      .eq('is_active', true),
    supabase
      .from('member_achievements')
      .select('achievement_id, achievement:achievements(code, tier)')
      .eq('member_id', memberId),
    supabase
      .from('team_battle_members')
      .select(
        'battle_id, team_code, battle:team_battles(id, status, start_at, end_at, scoring_mode, title, description, assignment_mode, created_by)',
      )
      .eq('member_id', memberId),
  ])

  let pbHistoryAvailable = true
  if (pbResult.error) {
    const message = pbResult.error.message?.toLowerCase() ?? ''
    if (pbResult.error.code === '23514' || message.includes('record_phase')) {
      pbHistoryAvailable = false
    }
  }

  const logs = (logsResult.data ?? []).map((row) => ({
    member_id: String(row.member_id),
    distance_km: Number(row.distance_km ?? 0),
    logged_at: String(row.logged_at),
  }))

  const missionDefs: WeeklyMissionDefinition[] = (missionsResult.data ?? []).map((row) => {
    const typeRaw = String(row.mission_type ?? 'distance')
    const mission_type = isWeeklyMissionType(typeRaw) ? typeRaw : 'distance'
    return {
      id: String(row.id),
      title: String(row.title ?? '미션'),
      description: row.description == null ? null : String(row.description),
      mission_type,
      target_value: Number(row.target_value ?? 0),
      unit: String(row.unit ?? unitForMissionType(mission_type)),
      start_at: String(row.start_at).slice(0, 10),
      end_at: String(row.end_at).slice(0, 10),
      is_active: row.is_active !== false,
      is_auto: Boolean(row.is_auto),
      reward_points: Math.max(0, Math.floor(Number(row.reward_points ?? 0))),
      sort_order: Number(row.sort_order ?? 0),
      created_by: row.created_by == null ? null : String(row.created_by),
    }
  })

  const unlocked = (unlocksResult.data ?? []).map((row) => {
    const achJoin = row.achievement as
      | { code?: string; tier?: string | null }
      | { code?: string; tier?: string | null }[]
      | null
    const ach = Array.isArray(achJoin) ? achJoin[0] : achJoin
    return {
      code: String(ach?.code ?? ''),
      tier: ach?.tier == null ? null : String(ach.tier),
      achievementId: row.achievement_id ? String(row.achievement_id) : undefined,
    }
  }).filter((row) => row.code)

  const pbRecords = pbHistoryAvailable
    ? (pbResult.data ?? []).map((row) => ({
        id: String(row.id),
        member_id: String(row.member_id),
        distance_event: String(row.distance_event),
        measured_at: String(row.measured_at),
        time_seconds: row.time_seconds == null ? null : Number(row.time_seconds),
        time_text: row.time_text == null ? null : String(row.time_text),
        record_phase: row.record_phase == null ? null : String(row.record_phase),
        created_at: row.created_at == null ? null : String(row.created_at),
      }))
    : []

  // Team battles context
  const battleRows = battleMembersResult.data ?? []
  const battleIds = [
    ...new Set(
      battleRows
        .map((row) => {
          const battleJoin = row.battle as { id?: string } | { id?: string }[] | null
          const battle = Array.isArray(battleJoin) ? battleJoin[0] : battleJoin
          return battle?.id ? String(battle.id) : String(row.battle_id)
        })
        .filter(Boolean),
    ),
  ]

  const battles: Array<{
    battleId: string
    status: string
    startAt: string
    endAt: string
    winner: 'RED' | 'BLUE' | 'TIED' | null
    myTeam: 'RED' | 'BLUE' | null
    participated: boolean
  }> = []

  if (battleIds.length > 0) {
    const { data: fullBattles } = await supabase
      .from('team_battles')
      .select(
        'id, title, description, start_at, end_at, status, assignment_mode, scoring_mode, created_by',
      )
      .in('id', battleIds)

    const { data: fullRoster } = await supabase
      .from('team_battle_members')
      .select('battle_id, member_id, team_code, baseline_distance, member:members(name)')
      .in('battle_id', battleIds)

    const { data: battleLogs } = await supabase
      .from('running_league_mileage_logs')
      .select('member_id, distance_km, logged_at')
      .in(
        'member_id',
        [...new Set((fullRoster ?? []).map((r) => String(r.member_id)))],
      )

    for (const battle of fullBattles ?? []) {
      const status = String(battle.status)
      if (status !== 'ended' && status !== 'active') continue
      const roster = (fullRoster ?? [])
        .filter((r) => String(r.battle_id) === String(battle.id))
        .map((r) => {
          const memberJoin = r.member as { name?: string } | { name?: string }[] | null
          const member = Array.isArray(memberJoin) ? memberJoin[0] : memberJoin
          return {
            battle_id: String(r.battle_id),
            member_id: String(r.member_id),
            member_name: member?.name?.trim() || '회원',
            team_code: (String(r.team_code) === 'BLUE' ? 'BLUE' : 'RED') as 'RED' | 'BLUE',
            baseline_distance: Number(r.baseline_distance ?? 0),
          }
        })
      const mine = roster.find((r) => r.member_id === memberId)
      if (!mine) continue
      const definition = {
        id: String(battle.id),
        title: String(battle.title ?? 'TEAM BATTLE'),
        description: battle.description == null ? null : String(battle.description),
        start_at: String(battle.start_at).slice(0, 10),
        end_at: String(battle.end_at).slice(0, 10),
        status: status as 'draft' | 'active' | 'ended' | 'archived',
        assignment_mode: (String(battle.assignment_mode) === 'random'
          ? 'random'
          : 'balanced') as 'balanced' | 'random',
        scoring_mode: (String(battle.scoring_mode) === 'total_distance'
          ? 'total_distance'
          : 'average_distance') as 'average_distance' | 'total_distance',
        created_by: battle.created_by == null ? null : String(battle.created_by),
      }
      const board = buildTeamBattleScoreboard({
        battle: definition,
        roster,
        logs: (battleLogs ?? []).map((l) => ({
          member_id: String(l.member_id),
          distance_km: Number(l.distance_km ?? 0),
          logged_at: String(l.logged_at),
        })),
        recognition,
        viewerMemberId: memberId,
      })
      const myContribution = board.red.members
        .concat(board.blue.members)
        .find((m) => m.memberId === memberId)
      battles.push({
        battleId: definition.id,
        status,
        startAt: definition.start_at,
        endAt: definition.end_at,
        winner: board.winner,
        myTeam: mine.team_code,
        participated: Boolean(myContribution?.participated),
      })
    }
  }

  // MVP awards for current periods only (no historical guess)
  const mvpAwards: Array<{
    period: 'weekly' | 'monthly'
    periodKey: string
    category: string
  }> = []
  try {
    const { data: participantRows } = await supabase
      .from('running_league_participants')
      .select('member_id, member:members(id, name, is_active, auth_user_id, user_id, sport, grade)')
    const mapped = (participantRows ?? []).map((row) => {
      const memberJoin = row.member as
        | {
            id?: string
            name?: string
            is_active?: boolean
            auth_user_id?: string | null
            user_id?: string | null
            sport?: string | null
            grade?: string | null
          }
        | Array<{
            id?: string
            name?: string
            is_active?: boolean
            auth_user_id?: string | null
            user_id?: string | null
            sport?: string | null
            grade?: string | null
          }>
        | null
      const member = Array.isArray(memberJoin) ? memberJoin[0] : memberJoin
      return {
        member_id: String(row.member_id),
        member: member
          ? {
              id: String(member.id ?? row.member_id),
              name: member.name ?? '회원',
              is_active: member.is_active !== false,
              auth_user_id: member.auth_user_id,
              user_id: member.user_id,
              sport: member.sport,
              grade: member.grade,
            }
          : null,
      }
    })
    const adultIds = await resolveAdultRunningMemberIds(
      supabase,
      mapped.map((m) => m.member_id),
    )
    const adults = filterParticipantsForAdultRunningLeague(mapped, adultIds)
    const members = adults
      .filter((row) => row.member && row.member.is_active !== false)
      .map((row) => ({
        memberId: row.member_id,
        memberName: row.member?.name?.trim() || '회원',
      }))

    // Need broader logs for MVP distance among adults — fetch period window logs
    const memberIds = members.map((m) => m.memberId)
    const { data: mvpLogs } =
      memberIds.length > 0
        ? await supabase
            .from('running_league_mileage_logs')
            .select('member_id, distance_km, logged_at')
            .in('member_id', memberIds)
        : { data: [] }

    const mvpView = buildMvpHomeView({
      members,
      logs: (mvpLogs ?? []).map((l) => ({
        member_id: String(l.member_id),
        distance_km: Number(l.distance_km ?? 0),
        logged_at: String(l.logged_at),
      })),
      pbRecords,
      pbHistoryAvailable,
      viewerMemberId: memberId,
      recognition,
    })

    for (const board of [mvpView.weekly, mvpView.monthly]) {
      for (const category of board.categories) {
        if (!category.available) continue
        if (!category.winners.some((w) => w.memberId === memberId)) continue
        mvpAwards.push({
          period: board.period,
          periodKey: board.start,
          category: category.category,
        })
      }
    }
  } catch (error) {
    console.error('loadMemberRewardContext.mvp', error)
  }

  return {
    supabase,
    recognition,
    logs,
    missionDefs,
    unlocked,
    pbRecords,
    pbHistoryAvailable,
    battles,
    mvpAwards,
  }
}

export async function evaluateRewardsForMember(
  memberId: string,
): Promise<
  | { ok: true; newlyAwarded: PendingReward[]; previousXp: number; nextXp: number }
  | { ok: false; error: string }
> {
  const id = memberId.trim()
  if (!id) return { ok: false, error: 'member_id 필요' }

  try {
    const ctx = await loadMemberRewardContext(id)
    const admin = await rewardWriteClient()
    const { data: existingRows, error: existingError } = await admin
      .from('member_reward_ledger')
      .select('currency, amount')
      .eq('member_id', id)
      .eq('currency', 'XP')

    if (existingError && isMissingLedgerTable(existingError)) {
      return {
        ok: false,
        error: 'member_reward_ledger 테이블이 없습니다. add-member-reward-ledger.sql 을 실행해주세요.',
      }
    }

    const previousXp = sumLedgerBalance(
      (existingRows ?? []).map((r) => ({
        currency: String(r.currency),
        amount: Number(r.amount),
      })),
      'XP',
    )

    const pending = collectPendingRewards([
      buildRunDayRewards({
        memberId: id,
        logs: ctx.logs,
        recognition: ctx.recognition,
      }),
      buildWeeklyMissionRewards({
        memberId: id,
        logs: ctx.logs,
        recognition: ctx.recognition,
        missionDefs: ctx.missionDefs,
      }),
      buildAchievementRewards({ memberId: id, unlocked: ctx.unlocked }),
      buildPbRewards({
        memberId: id,
        pbHistoryAvailable: ctx.pbHistoryAvailable,
        records: ctx.pbRecords,
      }),
      buildTeamBattleRewards({ memberId: id, battles: ctx.battles }),
      buildMvpRewards({ memberId: id, awards: ctx.mvpAwards }),
    ])

    const newlyAwarded = await insertPendingRewards(id, pending)
    if (newlyAwarded.length > 0) revalidateRewardPaths()

    const nextXp =
      previousXp +
      newlyAwarded
        .filter((row) => row.currency === 'XP')
        .reduce((sum, row) => sum + row.amount, 0)

    return { ok: true, newlyAwarded, previousXp, nextXp }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : '보상 평가 실패',
    }
  }
}

export async function evaluateRewardsForMemberQuiet(memberId: string | null | undefined) {
  const id = memberId?.trim()
  if (!id) return
  try {
    await evaluateRewardsForMember(id)
  } catch (error) {
    console.error('evaluateRewardsForMemberQuiet', error)
  }
}

export async function getMemberRewardHome(
  memberId?: string | null,
  options?: { evaluate?: boolean },
): Promise<MemberRewardHomeResult> {
  let resolved = memberId?.trim() || null
  if (!resolved) {
    const member = await getMemberForCurrentUser()
    resolved = member?.id ?? null
  }
  if (!resolved) return { unlinked: true }

  let newlyAwarded: PendingReward[] = []
  let previousXp: number | null = null
  let nextXp: number | null = null

  if (options?.evaluate !== false) {
    const result = await evaluateRewardsForMember(resolved)
    if (result.ok) {
      newlyAwarded = result.newlyAwarded
      previousXp = result.previousXp
      nextXp = result.nextXp
    } else if (result.error.includes('테이블이 없습니다')) {
      return {
        tableReady: false,
        totalXp: 0,
        totalPoints: 0,
        level: getLevelProgress(0),
        recent: [],
        newlyAwarded: [],
        leveledUp: false,
        previousLevel: null,
      }
    }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('member_reward_ledger')
    .select('id, currency, amount, source_type, description, created_at, metadata')
    .eq('member_id', resolved)
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) {
    if (isMissingLedgerTable(error)) {
      return {
        tableReady: false,
        totalXp: 0,
        totalPoints: 0,
        level: getLevelProgress(0),
        recent: [],
        newlyAwarded: [],
        leveledUp: false,
        previousLevel: null,
      }
    }
    console.error('getMemberRewardHome', error.message)
  }

  const rows = (data ?? []).map((row) => ({
    id: String(row.id),
    currency: (row.currency === 'POINT' ? 'POINT' : 'XP') as RewardCurrency,
    amount: Number(row.amount ?? 0),
    source_type: String(row.source_type),
    description: String(row.description ?? ''),
    created_at: String(row.created_at),
    metadata: (row.metadata as Record<string, unknown> | null) ?? null,
  }))

  const totalXp = sumLedgerBalance(rows, 'XP')
  const totalPoints = sumLedgerBalance(rows, 'POINT')
  const level = getLevelProgress(totalXp)
  const prevLevel =
    previousXp != null ? getLevelProgress(previousXp).level : null
  const leveledUp =
    prevLevel != null && nextXp != null
      ? getLevelProgress(nextXp).level > prevLevel
      : false

  return {
    tableReady: true,
    totalXp,
    totalPoints,
    level,
    recent: rows.slice(0, 20),
    newlyAwarded,
    leveledUp,
    previousLevel: prevLevel,
  }
}

export async function adminAdjustMemberReward(input: {
  memberId: string
  currency: RewardCurrency
  amount: number
  reason: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireAuth()
  if (!canAccessSettingsArea(user.role)) {
    return { ok: false, error: '관리자 또는 운영진만 가능합니다.' }
  }

  const memberId = input.memberId.trim()
  const reason = input.reason.trim()
  if (!memberId) return { ok: false, error: '회원을 선택해주세요.' }
  if (!reason) return { ok: false, error: '조정 사유를 입력해주세요.' }
  if (!Number.isFinite(input.amount) || input.amount === 0) {
    return { ok: false, error: '0이 아닌 수량을 입력해주세요.' }
  }
  if (input.currency === 'XP' && input.amount < 0) {
    return { ok: false, error: 'XP는 음수 조정을 허용하지 않습니다. POINT만 회수할 수 있습니다.' }
  }

  // POINT 잔액 방어 (향후 차감)
  if (input.currency === 'POINT' && input.amount < 0) {
    const home = await getMemberRewardHome(memberId, { evaluate: false })
    if ('unlinked' in home) return { ok: false, error: '회원을 찾을 수 없습니다.' }
    if (home.totalPoints + input.amount < 0) {
      return { ok: false, error: '포인트 잔액이 부족합니다.' }
    }
  }

  const key = `ADMIN:${memberId}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`
  try {
    await insertPendingRewards(
      memberId,
      [
        {
          currency: input.currency,
          amount: Math.trunc(input.amount),
          source_type: 'ADMIN_ADJUSTMENT',
          source_id: key,
          idempotency_key: key,
          description: `관리자 조정: ${reason}`,
          metadata: { reason },
        },
      ],
      user.id,
    )
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : '조정 실패',
    }
  }

  revalidateRewardPaths()
  return { ok: true }
}

/** Dry-run: 예상 보상 건수만 계산 (DB INSERT 없음) */
export async function previewRewardBackfillForMember(
  memberId: string,
): Promise<
  | { ok: true; pendingCount: number; xp: number; point: number }
  | { ok: false; error: string }
> {
  const user = await requireAuth()
  if (!canAccessSettingsArea(user.role)) {
    return { ok: false, error: '관리자만 가능합니다.' }
  }
  try {
    const ctx = await loadMemberRewardContext(memberId)
    const pending = collectPendingRewards([
      buildRunDayRewards({
        memberId,
        logs: ctx.logs,
        recognition: ctx.recognition,
      }),
      buildWeeklyMissionRewards({
        memberId,
        logs: ctx.logs,
        recognition: ctx.recognition,
        missionDefs: ctx.missionDefs,
      }),
      buildAchievementRewards({ memberId, unlocked: ctx.unlocked }),
      buildPbRewards({
        memberId,
        pbHistoryAvailable: ctx.pbHistoryAvailable,
        records: ctx.pbRecords,
      }),
      buildTeamBattleRewards({ memberId, battles: ctx.battles }),
      buildMvpRewards({ memberId, awards: ctx.mvpAwards }),
    ])
    return {
      ok: true,
      pendingCount: pending.length,
      xp: pending.filter((r) => r.currency === 'XP').reduce((s, r) => s + r.amount, 0),
      point: pending.filter((r) => r.currency === 'POINT').reduce((s, r) => s + r.amount, 0),
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'preview 실패',
    }
  }
}
