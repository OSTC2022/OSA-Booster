'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/actions/auth'
import { canAccessSettingsArea } from '@/lib/operator-access'
import {
  listAllHallOfFameEntries,
  normalizeHallOfFameTime,
  type HallOfFameEntry,
} from '@/lib/hall-of-fame'
import { resolvePbTimeSeconds } from '@/lib/running-league/pb-leaderboard'
import { formatSecondsToRunningTime } from '@/lib/running-league/records'

async function requireHallOfFameStaff() {
  const user = await requireAuth()
  if (!canAccessSettingsArea(user.role)) {
    throw new Error('관리자 또는 운영진만 이용할 수 있습니다.')
  }
  return user
}

export async function getHallOfFameSettingsList(): Promise<
  { entries: HallOfFameEntry[] } | { error: string }
> {
  try {
    await requireHallOfFameStaff()
    const entries = await listAllHallOfFameEntries()
    return { entries }
  } catch (error) {
    return { error: error instanceof Error ? error.message : '불러오기 실패' }
  }
}

export async function upsertHallOfFameEntry(input: {
  id?: string
  display_name: string
  time_text: string
  race_name?: string
  measured_at?: string
  notes?: string
  is_published?: boolean
  member_id?: string | null
}): Promise<{ error?: string; entry?: HallOfFameEntry }> {
  try {
    await requireHallOfFameStaff()
  } catch (error) {
    return { error: error instanceof Error ? error.message : '권한 없음' }
  }

  const displayName = input.display_name.trim()
  if (!displayName) return { error: '이름을 입력해주세요.' }
  if (displayName.length > 40) return { error: '이름은 40자 이내로 입력해주세요.' }

  const time = normalizeHallOfFameTime({ time_text: input.time_text })
  if ('error' in time) return { error: time.error }

  const payload = {
    display_name: displayName,
    time_text: time.time_text,
    time_seconds: time.time_seconds,
    race_name: input.race_name?.trim() || null,
    measured_at: input.measured_at?.trim() || null,
    notes: input.notes?.trim() || null,
    is_published: input.is_published ?? true,
    member_id: input.member_id || null,
    updated_at: new Date().toISOString(),
  }

  const supabase = await createClient()
  if (input.id) {
    const { data, error } = await supabase
      .from('hall_of_fame_entries')
      .update(payload)
      .eq('id', input.id)
      .select('*')
      .maybeSingle()
    if (error) return { error: error.message }
    revalidatePath('/dashboard/settings/hall-of-fame')
    revalidatePath('/auth/login')
    return { entry: data as HallOfFameEntry }
  }

  const { data, error } = await supabase
    .from('hall_of_fame_entries')
    .insert(payload)
    .select('*')
    .maybeSingle()
  if (error) return { error: error.message }
  revalidatePath('/dashboard/settings/hall-of-fame')
  revalidatePath('/auth/login')
  return { entry: data as HallOfFameEntry }
}

export async function deleteHallOfFameEntry(id: string): Promise<{ error?: string }> {
  try {
    await requireHallOfFameStaff()
  } catch (error) {
    return { error: error instanceof Error ? error.message : '권한 없음' }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('hall_of_fame_entries').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/dashboard/settings/hall-of-fame')
  revalidatePath('/auth/login')
  return {}
}

/** 러닝 리그 풀코스 PB → 명예의 전당에 없는 기록만 추가 */
export async function importFullPbIntoHallOfFame(): Promise<{
  error?: string
  imported?: number
}> {
  try {
    await requireHallOfFameStaff()
  } catch (error) {
    return { error: error instanceof Error ? error.message : '권한 없음' }
  }

  try {
    const admin = createServiceRoleClient()
    const [{ data: records, error: recordsError }, { data: existing }] = await Promise.all([
      admin
        .from('running_league_records')
        .select('member_id, time_text, time_seconds, measured_at')
        .eq('distance_event', 'full')
        .eq('record_phase', 'other'),
      admin.from('hall_of_fame_entries').select('member_id, display_name, time_seconds'),
    ])

    if (recordsError) return { error: recordsError.message }

    const memberIds = [
      ...new Set((records ?? []).map((row) => row.member_id).filter(Boolean)),
    ] as string[]

    const { data: members } = memberIds.length
      ? await admin.from('members').select('id, name').in('id', memberIds)
      : { data: [] as Array<{ id: string; name: string }> }

    const nameById = new Map((members ?? []).map((m) => [m.id, m.name]))
    const existingKeys = new Set(
      (existing ?? []).flatMap((row) => {
        const keys: string[] = []
        if (row.member_id) keys.push(`m:${row.member_id}`)
        keys.push(`n:${row.display_name}:${row.time_seconds}`)
        return keys
      }),
    )

    // member별 최고(최단) 기록만
    const bestByMember = new Map<
      string,
      { member_id: string; time_text: string; time_seconds: number; measured_at: string | null }
    >()

    for (const row of records ?? []) {
      if (!row.member_id) continue
      const seconds = resolvePbTimeSeconds({
        time_seconds: row.time_seconds,
        time_text: row.time_text,
      })
      if (seconds == null) continue
      const prev = bestByMember.get(row.member_id)
      if (!prev || seconds < prev.time_seconds) {
        bestByMember.set(row.member_id, {
          member_id: row.member_id,
          time_text: row.time_text?.trim() || formatSecondsToRunningTime(seconds) || '',
          time_seconds: seconds,
          measured_at: row.measured_at ?? null,
        })
      }
    }

    const toInsert = [...bestByMember.values()]
      .filter((row) => {
        const name = nameById.get(row.member_id)?.trim()
        if (!name) return false
        if (existingKeys.has(`m:${row.member_id}`)) return false
        if (existingKeys.has(`n:${name}:${row.time_seconds}`)) return false
        return true
      })
      .map((row) => ({
        display_name: nameById.get(row.member_id)!.trim(),
        time_text: row.time_text,
        time_seconds: row.time_seconds,
        measured_at: row.measured_at,
        member_id: row.member_id,
        race_name: '풀코스',
        is_published: true,
      }))

    if (toInsert.length === 0) return { imported: 0 }

    const { error } = await admin.from('hall_of_fame_entries').insert(toInsert)
    if (error) return { error: error.message }

    revalidatePath('/dashboard/settings/hall-of-fame')
    revalidatePath('/auth/login')
    return { imported: toInsert.length }
  } catch (error) {
    return { error: error instanceof Error ? error.message : '가져오기 실패' }
  }
}
