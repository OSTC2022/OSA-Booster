import { createServiceRoleClient } from '@/lib/supabase/admin'
import { parseRunningTimeToSeconds } from '@/lib/running-league/scoring'
import { formatSecondsToRunningTime } from '@/lib/running-league/records'

/** 등록 후 이 시간 안에는 비공개여도 로그인 화면에 자동 공개 */
export const HALL_OF_FAME_AUTO_PUBLIC_HOURS = 3

export type HallOfFameEntry = {
  id: string
  display_name: string
  time_text: string
  time_seconds: number
  race_name: string | null
  measured_at: string | null
  member_id: string | null
  notes: string | null
  is_published: boolean
  created_at?: string
  updated_at?: string
}

export type HallOfFamePublicEntry = {
  id: string
  display_name: string
  time_text: string
  time_seconds: number
  race_name: string | null
  measured_at: string | null
  rank: number
}

export function normalizeHallOfFameTime(input: {
  time_text?: string | null
  time_seconds?: number | null
}): { time_text: string; time_seconds: number } | { error: string } {
  const secondsFromInput =
    input.time_seconds != null && Number.isFinite(input.time_seconds) && input.time_seconds > 0
      ? Math.round(input.time_seconds)
      : null
  const parsed = parseRunningTimeToSeconds(input.time_text)
  const time_seconds = secondsFromInput ?? parsed
  if (time_seconds == null || time_seconds <= 0) {
    return { error: '기록 시간을 확인해주세요. 예: 3:28:55' }
  }
  const time_text =
    input.time_text?.trim() || formatSecondsToRunningTime(time_seconds) || String(time_seconds)
  return { time_text, time_seconds }
}

function mapPublicEntries(
  rows: Array<{
    id: string
    display_name: string
    time_text: string
    time_seconds: number
    race_name: string | null
    measured_at: string | null
  }>,
): HallOfFamePublicEntry[] {
  return rows.map((row, index) => ({
    id: row.id,
    display_name: row.display_name,
    time_text: row.time_text,
    time_seconds: row.time_seconds,
    race_name: row.race_name,
    measured_at: row.measured_at,
    rank: index + 1,
  }))
}

/** 최근 N시간 내 등록분은 자동 공개 */
async function publishRecentHallOfFameEntries(): Promise<void> {
  const admin = createServiceRoleClient()
  const since = new Date(
    Date.now() - HALL_OF_FAME_AUTO_PUBLIC_HOURS * 60 * 60 * 1000,
  ).toISOString()
  const { error } = await admin
    .from('hall_of_fame_entries')
    .update({
      is_published: true,
      updated_at: new Date().toISOString(),
    })
    .eq('is_published', false)
    .gte('created_at', since)

  if (error) {
    console.error('[hall-of-fame] auto-publish', error.message)
  }
}

/** 로그인 화면용 — 공개된 풀코스 기록, 빠른 순 */
export async function listPublishedHallOfFame(): Promise<HallOfFamePublicEntry[]> {
  try {
    const admin = createServiceRoleClient()
    await publishRecentHallOfFameEntries()

    const since = new Date(
      Date.now() - HALL_OF_FAME_AUTO_PUBLIC_HOURS * 60 * 60 * 1000,
    ).toISOString()

    // 공개 또는 최근 3시간 내 등록(자동 공개 대상)
    const { data, error } = await admin
      .from('hall_of_fame_entries')
      .select('id, display_name, time_text, time_seconds, race_name, measured_at')
      .or(`is_published.eq.true,created_at.gte.${since}`)
      .order('time_seconds', { ascending: true })
      .limit(100)

    if (error) {
      console.error('[hall-of-fame]', error.message)
      return []
    }

    return mapPublicEntries(data ?? [])
  } catch (error) {
    console.error('[hall-of-fame]', error)
    return []
  }
}

export async function listAllHallOfFameEntries(): Promise<HallOfFameEntry[]> {
  const admin = createServiceRoleClient()
  await publishRecentHallOfFameEntries()
  const { data, error } = await admin
    .from('hall_of_fame_entries')
    .select('*')
    .order('time_seconds', { ascending: true })

  if (error) throw new Error(error.message)
  return (data ?? []) as HallOfFameEntry[]
}
