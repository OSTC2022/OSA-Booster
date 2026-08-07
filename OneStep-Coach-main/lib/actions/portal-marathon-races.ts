'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/actions/auth'
import { getMemberForCurrentUser } from '@/lib/actions/auth'
import { canAccessSettingsArea } from '@/lib/operator-access'
import {
  normalizeMarathonDistances,
  type MarathonDistance,
  type PortalMarathonRace,
  type PortalMarathonRaceView,
} from '@/lib/portal-marathon-races'

function isMissingTableError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  if (error.code === '42P01') return true
  const message = error.message?.toLowerCase() ?? ''
  return message.includes('portal_marathon_races') || message.includes('portal_marathon_race_signups')
}

function mapRace(row: Record<string, unknown>): PortalMarathonRace {
  return {
    id: String(row.id),
    title: String(row.title ?? '').trim() || '대회',
    location: row.location == null ? null : String(row.location),
    race_date: String(row.race_date),
    distances: normalizeMarathonDistances(
      Array.isArray(row.distances) ? row.distances.map(String) : [],
    ),
    apply_url: row.apply_url == null ? null : String(row.apply_url),
    is_open_for_apply: row.is_open_for_apply !== false,
    is_published: row.is_published !== false,
    notes: row.notes == null ? null : String(row.notes),
    sort_order: Number(row.sort_order ?? 0),
  }
}

async function requireMarathonStaff() {
  const user = await requireAuth()
  if (!canAccessSettingsArea(user.role)) {
    throw new Error('관리자 또는 운영진만 이용할 수 있습니다.')
  }
  return user
}

function revalidateMarathonPaths() {
  revalidatePath('/dashboard/my')
  revalidatePath('/dashboard/settings/adult-running-portal')
  revalidatePath('/dashboard/settings/marathon-schedule')
}

export async function listPortalMarathonRacesForMember(): Promise<{
  races: PortalMarathonRaceView[]
  tableReady: boolean
}> {
  const supabase = await createClient()
  const member = await getMemberForCurrentUser()

  const { data, error } = await supabase
    .from('portal_marathon_races')
    .select('id, title, location, race_date, distances, apply_url, is_open_for_apply, is_published, notes, sort_order')
    .eq('is_published', true)
    .order('race_date', { ascending: true })
    .order('sort_order', { ascending: true })

  if (error) {
    if (isMissingTableError(error)) return { races: [], tableReady: false }
    console.error('listPortalMarathonRacesForMember', error.message)
    return { races: [], tableReady: true }
  }

  const races = (data ?? [])
    .map((row) => mapRace(row as Record<string, unknown>))
    .filter((race) => race.race_date >= new Date().toISOString().slice(0, 10))
  if (races.length === 0) return { races: [], tableReady: true }

  const raceIds = races.map((race) => race.id)
  const { data: signups } = await supabase
    .from('portal_marathon_race_signups')
    .select('race_id, member_id')
    .in('race_id', raceIds)

  const countByRace = new Map<string, number>()
  const signedRaceIds = new Set<string>()
  for (const row of signups ?? []) {
    const raceId = String(row.race_id)
    countByRace.set(raceId, (countByRace.get(raceId) ?? 0) + 1)
    if (member && String(row.member_id) === member.id) signedRaceIds.add(raceId)
  }

  return {
    tableReady: true,
    races: races.map((race) => ({
      ...race,
      signup_count: countByRace.get(race.id) ?? 0,
      is_signed_up: signedRaceIds.has(race.id),
    })),
  }
}

export async function listPortalMarathonRacesAdmin(): Promise<
  | { races: PortalMarathonRaceView[]; tableReady: boolean }
  | { error: string }
> {
  try {
    await requireMarathonStaff()
  } catch (error) {
    return { error: error instanceof Error ? error.message : '권한 없음' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('portal_marathon_races')
    .select('id, title, location, race_date, distances, apply_url, is_open_for_apply, is_published, notes, sort_order')
    .order('race_date', { ascending: true })
    .order('sort_order', { ascending: true })

  if (error) {
    if (isMissingTableError(error)) {
      return {
        error: '마라톤 일정 테이블이 없습니다. supabase/add-portal-marathon-races.sql 을 실행해주세요.',
      }
    }
    return { error: error.message }
  }

  const races = (data ?? []).map((row) => mapRace(row as Record<string, unknown>))
  const raceIds = races.map((race) => race.id)
  const countByRace = new Map<string, number>()
  if (raceIds.length > 0) {
    const { data: signups } = await supabase
      .from('portal_marathon_race_signups')
      .select('race_id')
      .in('race_id', raceIds)
    for (const row of signups ?? []) {
      const raceId = String(row.race_id)
      countByRace.set(raceId, (countByRace.get(raceId) ?? 0) + 1)
    }
  }

  return {
    tableReady: true,
    races: races.map((race) => ({
      ...race,
      signup_count: countByRace.get(race.id) ?? 0,
      is_signed_up: false,
    })),
  }
}

export async function upsertPortalMarathonRace(input: {
  id?: string
  title: string
  location?: string | null
  race_date: string
  distances: string[]
  apply_url?: string | null
  is_open_for_apply?: boolean
  is_published?: boolean
  notes?: string | null
  sort_order?: number
}): Promise<{ error?: string; race?: PortalMarathonRace }> {
  try {
    await requireMarathonStaff()
  } catch (error) {
    return { error: error instanceof Error ? error.message : '권한 없음' }
  }

  const title = input.title.trim()
  if (!title) return { error: '대회명을 입력해주세요.' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.race_date)) {
    return { error: '대회 날짜를 확인해주세요.' }
  }

  const payload = {
    title,
    location: input.location?.trim() || null,
    race_date: input.race_date,
    distances: normalizeMarathonDistances(input.distances),
    apply_url: input.apply_url?.trim() || null,
    is_open_for_apply: input.is_open_for_apply ?? true,
    is_published: input.is_published ?? true,
    notes: input.notes?.trim() || null,
    sort_order: input.sort_order ?? 0,
    updated_at: new Date().toISOString(),
  }

  const supabase = await createClient()

  // 같은 날짜·대회명이면 중복 insert 대신 갱신
  if (!input.id) {
    const { data: existing } = await supabase
      .from('portal_marathon_races')
      .select('id')
      .eq('race_date', payload.race_date)
      .eq('title', payload.title)
      .maybeSingle()
    if (existing?.id) {
      const { data, error } = await supabase
        .from('portal_marathon_races')
        .update(payload)
        .eq('id', existing.id)
        .select('*')
        .maybeSingle()
      if (error) {
        if (isMissingTableError(error)) {
          return {
            error:
              '마라톤 일정 테이블이 없습니다. supabase/add-portal-marathon-races.sql 을 실행해주세요.',
          }
        }
        return { error: error.message }
      }
      revalidateMarathonPaths()
      return { race: data ? mapRace(data as Record<string, unknown>) : undefined }
    }
  }

  if (input.id) {
    const { data, error } = await supabase
      .from('portal_marathon_races')
      .update(payload)
      .eq('id', input.id)
      .select('*')
      .maybeSingle()
    if (error) {
      if (isMissingTableError(error)) {
        return { error: '마라톤 일정 테이블이 없습니다. supabase/add-portal-marathon-races.sql 을 실행해주세요.' }
      }
      return { error: error.message }
    }
    revalidateMarathonPaths()
    return { race: data ? mapRace(data as Record<string, unknown>) : undefined }
  }

  const { data, error } = await supabase
    .from('portal_marathon_races')
    .insert(payload)
    .select('*')
    .maybeSingle()
  if (error) {
    if (isMissingTableError(error)) {
      return { error: '마라톤 일정 테이블이 없습니다. supabase/add-portal-marathon-races.sql 을 실행해주세요.' }
    }
    return { error: error.message }
  }
  revalidateMarathonPaths()
  return { race: data ? mapRace(data as Record<string, unknown>) : undefined }
}

/** 외부 캘린더 항목 원클릭 추가 */
export async function addPortalMarathonRaceFromOnline(input: {
  title: string
  race_date: string
  region?: string | null
  venue?: string | null
  distances?: string[]
  distances_raw?: string | null
  apply_url?: string | null
  is_open_for_apply?: boolean
  detail_url?: string | null
}): Promise<{ error?: string; race?: PortalMarathonRace; alreadyAdded?: boolean }> {
  const locationParts = [input.region?.trim(), input.venue?.trim()].filter(Boolean)
  const notesParts = [
    input.distances_raw?.trim() ? `종목: ${input.distances_raw.trim()}` : null,
    input.detail_url?.trim() ? `출처: ${input.detail_url.trim()}` : '출처: marathon.pe.kr 캘린더',
  ].filter(Boolean)

  const before = await listPortalMarathonRacesAdmin()
  const already =
    'races' in before
      ? before.races.some(
          (race) => race.race_date === input.race_date && race.title === input.title.trim(),
        )
      : false

  const result = await upsertPortalMarathonRace({
    title: input.title,
    race_date: input.race_date,
    location: locationParts.join(' · ') || null,
    distances: input.distances ?? [],
    apply_url: input.apply_url,
    is_open_for_apply: input.is_open_for_apply ?? true,
    is_published: true,
    notes: notesParts.join('\n'),
  })

  if (result.error) return result
  return { ...result, alreadyAdded: already }
}

export async function deletePortalMarathonRace(id: string): Promise<{ error?: string }> {
  try {
    await requireMarathonStaff()
  } catch (error) {
    return { error: error instanceof Error ? error.message : '권한 없음' }
  }
  const supabase = await createClient()
  const { error } = await supabase.from('portal_marathon_races').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidateMarathonPaths()
  return {}
}

export async function togglePortalMarathonRaceSignup(
  raceId: string,
): Promise<{ ok: true; signedUp: boolean } | { ok: false; error: string }> {
  const member = await getMemberForCurrentUser()
  if (!member) return { ok: false, error: '회원 연결이 필요합니다.' }

  const supabase = await createClient()
  const { data: existing } = await supabase
    .from('portal_marathon_race_signups')
    .select('id')
    .eq('race_id', raceId)
    .eq('member_id', member.id)
    .maybeSingle()

  if (existing) {
    const { error } = await supabase
      .from('portal_marathon_race_signups')
      .delete()
      .eq('id', existing.id)
    if (error) {
      if (isMissingTableError(error)) {
        return { ok: false, error: '마라톤 일정 테이블이 없습니다.' }
      }
      return { ok: false, error: error.message }
    }
    revalidateMarathonPaths()
    return { ok: true, signedUp: false }
  }

  const { error } = await supabase.from('portal_marathon_race_signups').insert({
    race_id: raceId,
    member_id: member.id,
  })
  if (error) {
    if (isMissingTableError(error)) {
      return { ok: false, error: '마라톤 일정 테이블이 없습니다.' }
    }
    return { ok: false, error: error.message }
  }
  revalidateMarathonPaths()
  return { ok: true, signedUp: true }
}
