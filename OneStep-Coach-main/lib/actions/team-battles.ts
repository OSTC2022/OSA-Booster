'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getMemberForCurrentUser, requireAuth } from '@/lib/actions/auth'
import { canAccessSettingsArea } from '@/lib/operator-access'
import { getCenterSettings } from '@/lib/actions/center-settings'
import { resolveMileageRecognitionFromCenterSettings } from '@/lib/running-league/mileage-recognition'
import { getKstDateKey } from '@/lib/member-backup/kst-date'
import {
  assignBalancedTeams,
  assignRandomTeams,
  buildTeamBattleScoreboard,
  calculateBaselinesFromLogs,
  getBaselineDateRange,
  isAssignmentMode,
  isBattleStatus,
  isScoringMode,
  validateBattleRosterSize,
  type AssignmentMode,
  type ScoringMode,
  type TeamAssignment,
  type TeamBattleDefinition,
  type TeamBattleMemberRow,
  type TeamBattleScoreboard,
} from '@/lib/running-league/team-battle'

const BATTLE_SELECT =
  'id, title, description, start_at, end_at, status, assignment_mode, scoring_mode, created_by, created_at, updated_at'

function isMissingTableError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  if (error.code === '42P01') return true
  const message = error.message?.toLowerCase() ?? ''
  return message.includes('team_battles') || message.includes('team_battle_members')
}

function mapBattle(row: Record<string, unknown>): TeamBattleDefinition {
  const statusRaw = String(row.status ?? 'draft')
  const assignRaw = String(row.assignment_mode ?? 'balanced')
  const scoreRaw = String(row.scoring_mode ?? 'average_distance')
  return {
    id: String(row.id),
    title: String(row.title ?? '').trim() || 'TEAM BATTLE',
    description: row.description == null ? null : String(row.description),
    start_at: String(row.start_at).slice(0, 10),
    end_at: String(row.end_at).slice(0, 10),
    status: isBattleStatus(statusRaw) ? statusRaw : 'draft',
    assignment_mode: isAssignmentMode(assignRaw) ? assignRaw : 'balanced',
    scoring_mode: isScoringMode(scoreRaw) ? scoreRaw : 'average_distance',
    created_by: row.created_by == null ? null : String(row.created_by),
    created_at: row.created_at == null ? undefined : String(row.created_at),
    updated_at: row.updated_at == null ? undefined : String(row.updated_at),
  }
}

async function requireBattleStaff() {
  const user = await requireAuth()
  if (!canAccessSettingsArea(user.role)) {
    throw new Error('관리자 또는 운영진만 이용할 수 있습니다.')
  }
  return user
}

function revalidateBattlePaths() {
  revalidatePath('/dashboard/my')
  revalidatePath('/dashboard/settings/adult-running-portal')
  revalidatePath('/dashboard/settings/team-battles')
}

async function fetchRoster(battleId: string): Promise<TeamBattleMemberRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('team_battle_members')
    .select('id, battle_id, member_id, team_code, baseline_distance, assigned_at, member:members(id, name)')
    .eq('battle_id', battleId)

  if (error) {
    console.error('fetchRoster', error.message)
    return []
  }

  return (data ?? []).map((row) => {
    const memberJoin = row.member as { id?: string; name?: string } | { id?: string; name?: string }[] | null
    const member = Array.isArray(memberJoin) ? memberJoin[0] : memberJoin
    return {
      id: String(row.id),
      battle_id: String(row.battle_id),
      member_id: String(row.member_id),
      member_name: member?.name?.trim() || '회원',
      team_code: String(row.team_code) === 'BLUE' ? 'BLUE' : 'RED',
      baseline_distance: Number(row.baseline_distance ?? 0),
      assigned_at: row.assigned_at == null ? undefined : String(row.assigned_at),
    } satisfies TeamBattleMemberRow
  })
}

async function fetchLogsForMembers(
  memberIds: string[],
  start: string,
  end: string,
) {
  if (memberIds.length === 0) return []
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('running_league_mileage_logs')
    .select('member_id, distance_km, logged_at')
    .in('member_id', memberIds)
    .gte('logged_at', start)
    .lte('logged_at', end)

  if (error) {
    console.error('fetchLogsForMembers', error.message)
    return []
  }
  return (data ?? []).map((row) => ({
    member_id: String(row.member_id),
    distance_km: Number(row.distance_km ?? 0),
    logged_at: String(row.logged_at),
  }))
}

async function buildScoreboardForBattle(
  battle: TeamBattleDefinition,
  viewerMemberId?: string | null,
  tableReady = true,
): Promise<TeamBattleScoreboard> {
  const roster = await fetchRoster(battle.id)
  const memberIds = roster.map((row) => row.member_id)
  const asOf = getKstDateKey()
  const endCap = asOf < battle.end_at ? asOf : battle.end_at
  const [logs, centerSettings] = await Promise.all([
    fetchLogsForMembers(memberIds, battle.start_at, endCap),
    getCenterSettings(),
  ])
  return buildTeamBattleScoreboard({
    battle,
    roster,
    logs,
    recognition: resolveMileageRecognitionFromCenterSettings(centerSettings),
    viewerMemberId,
    asOfDateKey: asOf,
    tableReady,
  })
}

export type TeamBattleCandidate = {
  memberId: string
  memberName: string
}

export async function listTeamBattleMemberCandidates(): Promise<
  | { candidates: TeamBattleCandidate[] }
  | { error: string }
> {
  try {
    await requireBattleStaff()
  } catch (error) {
    return { error: error instanceof Error ? error.message : '권한 없음' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('running_league_participants')
    .select('member_id, member:members(id, name, is_active)')
    .order('created_at', { ascending: true })

  if (error) {
    return { error: error.message }
  }

  const candidates: TeamBattleCandidate[] = []
  for (const row of data ?? []) {
    const memberJoin = row.member as
      | { id?: string; name?: string; is_active?: boolean }
      | { id?: string; name?: string; is_active?: boolean }[]
      | null
    const member = Array.isArray(memberJoin) ? memberJoin[0] : memberJoin
    if (!member?.id || member.is_active === false) continue
    candidates.push({
      memberId: String(row.member_id ?? member.id),
      memberName: member.name?.trim() || '회원',
    })
  }

  candidates.sort((a, b) => a.memberName.localeCompare(b.memberName, 'ko'))
  return { candidates }
}

export async function getMemberTeamBattleHome(
  memberId?: string | null,
): Promise<{ scoreboard: TeamBattleScoreboard | null; tableReady: boolean }> {
  let resolvedMemberId = memberId?.trim() || null
  if (!resolvedMemberId) {
    const member = await getMemberForCurrentUser()
    resolvedMemberId = member?.id ?? null
  }

  const supabase = await createClient()
  const asOf = getKstDateKey()

  const { data: activeRows, error: activeError } = await supabase
    .from('team_battles')
    .select(BATTLE_SELECT)
    .eq('status', 'active')
    .lte('start_at', asOf)
    .gte('end_at', asOf)
    .order('start_at', { ascending: false })
    .limit(1)

  if (activeError) {
    if (isMissingTableError(activeError)) {
      return { scoreboard: null, tableReady: false }
    }
    console.error('getMemberTeamBattleHome.active', activeError.message)
    return { scoreboard: null, tableReady: true }
  }

  let battleRow = activeRows?.[0] ?? null

  if (!battleRow) {
    const { data: upcoming } = await supabase
      .from('team_battles')
      .select(BATTLE_SELECT)
      .eq('status', 'active')
      .gt('start_at', asOf)
      .order('start_at', { ascending: true })
      .limit(1)
    battleRow = upcoming?.[0] ?? null
  }

  if (!battleRow) {
    const { data: ended } = await supabase
      .from('team_battles')
      .select(BATTLE_SELECT)
      .in('status', ['active', 'ended'])
      .lt('end_at', asOf)
      .order('end_at', { ascending: false })
      .limit(1)
    battleRow = ended?.[0] ?? null
  }

  if (!battleRow) {
    return { scoreboard: null, tableReady: true }
  }

  const battle = mapBattle(battleRow as Record<string, unknown>)
  const scoreboard = await buildScoreboardForBattle(battle, resolvedMemberId, true)
  return { scoreboard, tableReady: true }
}

export async function listTeamBattlesAdmin(): Promise<
  | { battles: TeamBattleDefinition[]; tableReady: boolean }
  | { error: string }
> {
  try {
    await requireBattleStaff()
  } catch (error) {
    return { error: error instanceof Error ? error.message : '권한 없음' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('team_battles')
    .select(BATTLE_SELECT)
    .neq('status', 'archived')
    .order('start_at', { ascending: false })

  if (error) {
    if (isMissingTableError(error)) {
      return {
        error: '팀 배틀 테이블이 없습니다. supabase/add-team-battles.sql 을 실행해주세요.',
      }
    }
    return { error: error.message }
  }

  return {
    tableReady: true,
    battles: (data ?? []).map((row) => mapBattle(row as Record<string, unknown>)),
  }
}

export async function getTeamBattleAdminDetail(battleId: string): Promise<
  | { battle: TeamBattleDefinition; roster: TeamBattleMemberRow[]; scoreboard: TeamBattleScoreboard }
  | { error: string }
> {
  try {
    await requireBattleStaff()
  } catch (error) {
    return { error: error instanceof Error ? error.message : '권한 없음' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('team_battles')
    .select(BATTLE_SELECT)
    .eq('id', battleId)
    .maybeSingle()

  if (error) {
    if (isMissingTableError(error)) {
      return { error: '팀 배틀 테이블이 없습니다. supabase/add-team-battles.sql 을 실행해주세요.' }
    }
    return { error: error.message }
  }
  if (!data) return { error: '배틀을 찾을 수 없습니다.' }

  const battle = mapBattle(data as Record<string, unknown>)
  const roster = await fetchRoster(battle.id)
  const scoreboard = await buildScoreboardForBattle(battle, null, true)
  return { battle, roster, scoreboard }
}

export type UpsertTeamBattleInput = {
  id?: string
  title: string
  description?: string | null
  start_at: string
  end_at: string
  assignment_mode?: string
  scoring_mode?: string
}

export async function upsertTeamBattle(
  input: UpsertTeamBattleInput,
): Promise<{ ok: true; battle: TeamBattleDefinition } | { ok: false; error: string }> {
  let user
  try {
    user = await requireBattleStaff()
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : '권한 없음' }
  }

  const title = input.title.trim()
  if (!title) return { ok: false, error: '배틀 이름을 입력해주세요.' }
  const start_at = String(input.start_at ?? '').slice(0, 10)
  const end_at = String(input.end_at ?? '').slice(0, 10)
  if (!start_at || !end_at) return { ok: false, error: '시작일·종료일을 입력해주세요.' }
  if (end_at < start_at) return { ok: false, error: '종료일은 시작일 이후여야 합니다.' }

  const assignment_mode: AssignmentMode = isAssignmentMode(String(input.assignment_mode ?? ''))
    ? (input.assignment_mode as AssignmentMode)
    : 'balanced'
  const scoring_mode: ScoringMode = isScoringMode(String(input.scoring_mode ?? ''))
    ? (input.scoring_mode as ScoringMode)
    : 'average_distance'

  const supabase = await createClient()

  if (input.id) {
    const { data: existing } = await supabase
      .from('team_battles')
      .select('status')
      .eq('id', input.id)
      .maybeSingle()
    if (existing?.status === 'active' || existing?.status === 'ended') {
      // allow title/description/scoring update only lightly — block date change for simplicity
    }

    const { data, error } = await supabase
      .from('team_battles')
      .update({
        title,
        description: input.description?.trim() || null,
        start_at,
        end_at,
        assignment_mode,
        scoring_mode,
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.id)
      .eq('status', 'draft')
      .select(BATTLE_SELECT)
      .maybeSingle()

    if (error) {
      if (isMissingTableError(error)) {
        return { ok: false, error: '팀 배틀 테이블이 없습니다. supabase/add-team-battles.sql 을 실행해주세요.' }
      }
      return { ok: false, error: error.message }
    }
    if (!data) {
      return { ok: false, error: 'DRAFT 배틀만 수정할 수 있습니다.' }
    }
    revalidateBattlePaths()
    return { ok: true, battle: mapBattle(data as Record<string, unknown>) }
  }

  const { data, error } = await supabase
    .from('team_battles')
    .insert({
      title,
      description: input.description?.trim() || null,
      start_at,
      end_at,
      status: 'draft',
      assignment_mode,
      scoring_mode,
      created_by: user.id,
    })
    .select(BATTLE_SELECT)
    .single()

  if (error) {
    if (isMissingTableError(error)) {
      return { ok: false, error: '팀 배틀 테이블이 없습니다. supabase/add-team-battles.sql 을 실행해주세요.' }
    }
    return { ok: false, error: error.message }
  }

  revalidateBattlePaths()
  return { ok: true, battle: mapBattle(data as Record<string, unknown>) }
}

export async function previewTeamBattleAssignment(input: {
  battleId: string
  memberIds: string[]
  mode?: string
}): Promise<
  | {
      ok: true
      assignments: TeamAssignment[]
      redBaseline: number
      blueBaseline: number
      redCount: number
      blueCount: number
    }
  | { ok: false; error: string }
> {
  try {
    await requireBattleStaff()
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : '권한 없음' }
  }

  const sizeError = validateBattleRosterSize(input.memberIds.length)
  if (sizeError) return { ok: false, error: sizeError }

  const supabase = await createClient()
  const { data: battle, error: battleError } = await supabase
    .from('team_battles')
    .select(BATTLE_SELECT)
    .eq('id', input.battleId)
    .maybeSingle()

  if (battleError || !battle) {
    return { ok: false, error: battleError?.message ?? '배틀을 찾을 수 없습니다.' }
  }
  if (battle.status !== 'draft') {
    return { ok: false, error: 'DRAFT 배틀만 팀 편성할 수 있습니다.' }
  }

  const mapped = mapBattle(battle as Record<string, unknown>)
  const mode: AssignmentMode = isAssignmentMode(String(input.mode ?? mapped.assignment_mode))
    ? ((input.mode ?? mapped.assignment_mode) as AssignmentMode)
    : mapped.assignment_mode

  const uniqueIds = [...new Set(input.memberIds.map((id) => id.trim()).filter(Boolean))]
  const { data: members } = await supabase
    .from('members')
    .select('id, name')
    .in('id', uniqueIds)
    .eq('is_active', true)

  const memberRows = (members ?? []).map((row) => ({
    memberId: String(row.id),
    memberName: String(row.name ?? '회원'),
  }))
  if (memberRows.length < 2) {
    return { ok: false, error: '활성 회원 2명 이상이 필요합니다.' }
  }

  const baselineRange = getBaselineDateRange(mapped.start_at)
  const [logs, centerSettings] = await Promise.all([
    fetchLogsForMembers(
      memberRows.map((row) => row.memberId),
      baselineRange.start,
      baselineRange.end,
    ),
    getCenterSettings(),
  ])
  const recognition = resolveMileageRecognitionFromCenterSettings(centerSettings)
  const baselines = calculateBaselinesFromLogs(
    memberRows,
    logs,
    mapped.start_at,
    recognition,
  )
  const assignments =
    mode === 'random' ? assignRandomTeams(baselines) : assignBalancedTeams(baselines)

  const red = assignments.filter((row) => row.teamCode === 'RED')
  const blue = assignments.filter((row) => row.teamCode === 'BLUE')
  const redBaseline = Math.round(red.reduce((s, r) => s + r.baselineKm, 0) * 10) / 10
  const blueBaseline = Math.round(blue.reduce((s, r) => s + r.baselineKm, 0) * 10) / 10

  return {
    ok: true,
    assignments,
    redBaseline,
    blueBaseline,
    redCount: red.length,
    blueCount: blue.length,
  }
}

export async function confirmTeamBattleAssignment(input: {
  battleId: string
  assignments: Array<{ memberId: string; teamCode: string; baselineKm: number }>
  assignmentMode?: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireBattleStaff()
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : '권한 없음' }
  }

  const sizeError = validateBattleRosterSize(input.assignments.length)
  if (sizeError) return { ok: false, error: sizeError }

  const supabase = await createClient()
  const { data: battle } = await supabase
    .from('team_battles')
    .select('status')
    .eq('id', input.battleId)
    .maybeSingle()

  if (!battle) return { ok: false, error: '배틀을 찾을 수 없습니다.' }
  if (battle.status !== 'draft') {
    return { ok: false, error: 'ACTIVE 배틀은 팀을 재편성할 수 없습니다.' }
  }

  await supabase.from('team_battle_members').delete().eq('battle_id', input.battleId)

  const rows = input.assignments.map((row) => ({
    battle_id: input.battleId,
    member_id: row.memberId,
    team_code: row.teamCode === 'BLUE' ? 'BLUE' : 'RED',
    baseline_distance: Number(row.baselineKm) || 0,
  }))

  const { error } = await supabase.from('team_battle_members').insert(rows)
  if (error) {
    if (isMissingTableError(error)) {
      return { ok: false, error: '팀 배틀 테이블이 없습니다. supabase/add-team-battles.sql 을 실행해주세요.' }
    }
    return { ok: false, error: error.message }
  }

  if (isAssignmentMode(String(input.assignmentMode ?? ''))) {
    await supabase
      .from('team_battles')
      .update({
        assignment_mode: input.assignmentMode,
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.battleId)
      .eq('status', 'draft')
  }

  revalidateBattlePaths()
  return { ok: true }
}

export async function activateTeamBattle(
  battleId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireBattleStaff()
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : '권한 없음' }
  }

  const supabase = await createClient()
  const { data: battle } = await supabase
    .from('team_battles')
    .select(BATTLE_SELECT)
    .eq('id', battleId)
    .maybeSingle()
  if (!battle) return { ok: false, error: '배틀을 찾을 수 없습니다.' }
  if (battle.status !== 'draft') return { ok: false, error: 'DRAFT 배틀만 활성화할 수 있습니다.' }

  const roster = await fetchRoster(battleId)
  const sizeError = validateBattleRosterSize(roster.length)
  if (sizeError) return { ok: false, error: sizeError }

  const asOf = getKstDateKey()
  const { count: activeCount } = await supabase
    .from('team_battles')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'active')
    .lte('start_at', asOf)
    .gte('end_at', asOf)

  if ((activeCount ?? 0) > 0) {
    return {
      ok: false,
      error: '이미 진행 중인 ACTIVE 배틀이 있습니다. 종료 후 활성화해주세요.',
    }
  }

  const { error } = await supabase
    .from('team_battles')
    .update({ status: 'active', updated_at: new Date().toISOString() })
    .eq('id', battleId)

  if (error) return { ok: false, error: error.message }
  revalidateBattlePaths()
  const { evaluateAchievementsForMemberQuiet } = await import('@/lib/actions/achievements')
  for (const row of roster) {
    void evaluateAchievementsForMemberQuiet(row.member_id)
  }
  return { ok: true }
}

export async function endTeamBattle(
  battleId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireBattleStaff()
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : '권한 없음' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('team_battles')
    .update({ status: 'ended', updated_at: new Date().toISOString() })
    .eq('id', battleId)
    .eq('status', 'active')

  if (error) return { ok: false, error: error.message }
  revalidateBattlePaths()
  return { ok: true }
}

export async function archiveTeamBattle(
  battleId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireBattleStaff()
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : '권한 없음' }
  }

  const supabase = await createClient()
  const { data: battle } = await supabase
    .from('team_battles')
    .select('status')
    .eq('id', battleId)
    .maybeSingle()
  if (!battle) return { ok: false, error: '배틀을 찾을 수 없습니다.' }
  if (battle.status === 'active') {
    return { ok: false, error: '진행 중인 배틀은 보관할 수 없습니다. 먼저 종료하세요.' }
  }

  const { error } = await supabase
    .from('team_battles')
    .update({ status: 'archived', updated_at: new Date().toISOString() })
    .eq('id', battleId)

  if (error) return { ok: false, error: error.message }
  revalidateBattlePaths()
  return { ok: true }
}

export async function deleteDraftTeamBattle(
  battleId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireBattleStaff()
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : '권한 없음' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('team_battles')
    .delete()
    .eq('id', battleId)
    .eq('status', 'draft')

  if (error) return { ok: false, error: error.message }
  revalidateBattlePaths()
  return { ok: true }
}
