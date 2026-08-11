'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getMemberForCurrentUser, requireAuth } from '@/lib/actions/auth'
import { canAccessSettingsArea } from '@/lib/operator-access'
import { getCenterSettings } from '@/lib/actions/center-settings'
import { resolveMileageRecognitionFromCenterSettings } from '@/lib/running-league/mileage-recognition'
import { getCurrentWeekRange } from '@/lib/running-league/week-range'
import {
  buildWeeklyMissionsView,
  isWeeklyMissionType,
  resolveWeeklyMissionDefinitions,
  unitForMissionType,
  type WeeklyMissionDefinition,
  type WeeklyMissionType,
  type WeeklyMissionsView,
} from '@/lib/running-league/weekly-missions'

const MISSION_SELECT =
  'id, title, description, mission_type, target_value, unit, start_at, end_at, is_active, is_auto, created_by, reward_points, sort_order, created_at, updated_at'

function isMissingTableError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  if (error.code === '42P01') return true
  const message = error.message?.toLowerCase() ?? ''
  return message.includes('weekly_missions')
}

function mapMission(row: Record<string, unknown>): WeeklyMissionDefinition {
  const typeRaw = String(row.mission_type ?? 'distance')
  const mission_type: WeeklyMissionType = isWeeklyMissionType(typeRaw) ? typeRaw : 'distance'
  return {
    id: String(row.id),
    title: String(row.title ?? '').trim() || '미션',
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
    created_at: row.created_at == null ? undefined : String(row.created_at),
    updated_at: row.updated_at == null ? undefined : String(row.updated_at),
  }
}

async function requireMissionStaff() {
  const user = await requireAuth()
  if (!canAccessSettingsArea(user.role)) {
    throw new Error('관리자 또는 운영진만 이용할 수 있습니다.')
  }
  return user
}

function revalidateWeeklyMissionPaths() {
  revalidatePath('/dashboard/my')
  revalidatePath('/dashboard/settings/adult-running-portal')
  revalidatePath('/dashboard/settings/weekly-missions')
}

async function fetchActiveMissionsForWeek(
  weekStart: string,
  weekEnd: string,
): Promise<{ missions: WeeklyMissionDefinition[]; tableReady: boolean }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('weekly_missions')
    .select(MISSION_SELECT)
    .eq('is_active', true)
    .lte('start_at', weekEnd)
    .gte('end_at', weekStart)
    .order('sort_order', { ascending: true })

  if (error) {
    if (isMissingTableError(error)) return { missions: [], tableReady: false }
    console.error('fetchActiveMissionsForWeek', error.message)
    return { missions: [], tableReady: true }
  }

  return {
    tableReady: true,
    missions: (data ?? []).map((row) => mapMission(row as Record<string, unknown>)),
  }
}

async function fetchMemberWeekLogs(memberId: string, start: string, end: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('running_league_mileage_logs')
    .select('id, member_id, distance_km, logged_at')
    .eq('member_id', memberId)
    .gte('logged_at', start)
    .lte('logged_at', end)
    .order('logged_at', { ascending: true })

  if (error) {
    console.error('fetchMemberWeekLogs', error.message)
    return []
  }
  return (data ?? []).map((row) => ({
    id: String(row.id),
    member_id: String(row.member_id),
    distance_km: Number(row.distance_km ?? 0),
    logged_at: String(row.logged_at),
  }))
}

export async function getMemberWeeklyMissionsHome(
  memberId?: string | null,
): Promise<WeeklyMissionsView | { unlinked: true } | null> {
  const week = getCurrentWeekRange()
  let resolvedMemberId = memberId?.trim() || null

  if (!resolvedMemberId) {
    const member = await getMemberForCurrentUser()
    resolvedMemberId = member?.id ?? null
  }

  if (!resolvedMemberId) {
    return { unlinked: true }
  }

  const [{ missions: adminMissions, tableReady }, centerSettings] = await Promise.all([
    fetchActiveMissionsForWeek(week.start, week.end),
    getCenterSettings(),
  ])

  const { missions, source } = resolveWeeklyMissionDefinitions({
    week,
    adminMissions,
    tableReady,
  })

  const rangeStart = missions.reduce(
    (min, m) => (m.start_at < min ? m.start_at : min),
    week.start,
  )
  const rangeEnd = missions.reduce((max, m) => (m.end_at > max ? m.end_at : max), week.end)

  const logs = await fetchMemberWeekLogs(resolvedMemberId, rangeStart, rangeEnd)
  const recognition = resolveMileageRecognitionFromCenterSettings(centerSettings)

  return buildWeeklyMissionsView({
    week,
    missions,
    source,
    tableReady,
    memberId: resolvedMemberId,
    logs,
    recognition,
  })
}

export async function listWeeklyMissionsAdmin(): Promise<
  | { missions: WeeklyMissionDefinition[]; tableReady: boolean }
  | { error: string }
> {
  try {
    await requireMissionStaff()
  } catch (error) {
    return { error: error instanceof Error ? error.message : '권한 없음' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('weekly_missions')
    .select(MISSION_SELECT)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false })

  if (error) {
    if (isMissingTableError(error)) {
      return {
        error:
          '주간 미션 테이블이 없습니다. supabase/add-weekly-missions.sql 을 실행해주세요.',
      }
    }
    return { error: error.message }
  }

  return {
    tableReady: true,
    missions: (data ?? []).map((row) => mapMission(row as Record<string, unknown>)),
  }
}

export type UpsertWeeklyMissionInput = {
  id?: string
  title: string
  description?: string | null
  mission_type: string
  target_value: number
  start_at: string
  end_at: string
  is_active?: boolean
  reward_points?: number
  sort_order?: number
}

export async function upsertWeeklyMission(
  input: UpsertWeeklyMissionInput,
): Promise<{ ok: true; mission: WeeklyMissionDefinition } | { ok: false; error: string }> {
  let user
  try {
    user = await requireMissionStaff()
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : '권한 없음' }
  }

  const title = input.title.trim()
  if (!title) return { ok: false, error: '미션 제목을 입력해주세요.' }
  if (!isWeeklyMissionType(input.mission_type)) {
    return { ok: false, error: '지원하지 않는 미션 종류입니다.' }
  }
  const target = Number(input.target_value)
  if (!Number.isFinite(target) || target <= 0) {
    return { ok: false, error: '목표 수치는 0보다 커야 합니다.' }
  }
  const start_at = String(input.start_at ?? '').slice(0, 10)
  const end_at = String(input.end_at ?? '').slice(0, 10)
  if (!start_at || !end_at) return { ok: false, error: '시작일·종료일을 입력해주세요.' }
  if (end_at < start_at) return { ok: false, error: '종료일은 시작일 이후여야 합니다.' }

  const payload = {
    title,
    description: input.description?.trim() || null,
    mission_type: input.mission_type,
    target_value: target,
    unit: unitForMissionType(input.mission_type),
    start_at,
    end_at,
    is_active: input.is_active !== false,
    is_auto: false,
    reward_points: Math.max(0, Math.floor(Number(input.reward_points ?? 0))),
    sort_order: Math.floor(Number(input.sort_order ?? 0)),
    updated_at: new Date().toISOString(),
  }

  const supabase = await createClient()

  if (input.id) {
    const { data, error } = await supabase
      .from('weekly_missions')
      .update(payload)
      .eq('id', input.id)
      .select(MISSION_SELECT)
      .single()

    if (error) {
      if (isMissingTableError(error)) {
        return {
          ok: false,
          error: '주간 미션 테이블이 없습니다. supabase/add-weekly-missions.sql 을 실행해주세요.',
        }
      }
      return { ok: false, error: error.message }
    }

    revalidateWeeklyMissionPaths()
    return { ok: true, mission: mapMission(data as Record<string, unknown>) }
  }

  const { data, error } = await supabase
    .from('weekly_missions')
    .insert({
      ...payload,
      created_by: user.id,
    })
    .select(MISSION_SELECT)
    .single()

  if (error) {
    if (isMissingTableError(error)) {
      return {
        ok: false,
        error: '주간 미션 테이블이 없습니다. supabase/add-weekly-missions.sql 을 실행해주세요.',
      }
    }
    return { ok: false, error: error.message }
  }

  revalidateWeeklyMissionPaths()
  return { ok: true, mission: mapMission(data as Record<string, unknown>) }
}

export async function setWeeklyMissionActive(
  id: string,
  isActive: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireMissionStaff()
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : '권한 없음' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('weekly_missions')
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) {
    if (isMissingTableError(error)) {
      return {
        ok: false,
        error: '주간 미션 테이블이 없습니다. supabase/add-weekly-missions.sql 을 실행해주세요.',
      }
    }
    return { ok: false, error: error.message }
  }

  revalidateWeeklyMissionPaths()
  return { ok: true }
}

export async function deleteWeeklyMission(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireMissionStaff()
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : '권한 없음' }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('weekly_missions').delete().eq('id', id)

  if (error) {
    if (isMissingTableError(error)) {
      return {
        ok: false,
        error: '주간 미션 테이블이 없습니다. supabase/add-weekly-missions.sql 을 실행해주세요.',
      }
    }
    return { ok: false, error: error.message }
  }

  revalidateWeeklyMissionPaths()
  return { ok: true }
}
