'use server'

import { createClient } from '@/lib/supabase/server'
import { getMemberForCurrentUser } from '@/lib/actions/auth'
import { getCenterSettings } from '@/lib/actions/center-settings'
import { resolveMileageRecognitionFromCenterSettings } from '@/lib/running-league/mileage-recognition'
import {
  calculateRunningStreak,
  type RunningStreakStatus,
} from '@/lib/running-league/running-streak'

export type MemberRunningStreakHome =
  | RunningStreakStatus
  | { unlinked: true }

export async function getMemberRunningStreakHome(
  memberId?: string | null,
): Promise<MemberRunningStreakHome> {
  let resolvedMemberId = memberId?.trim() || null

  if (!resolvedMemberId) {
    const member = await getMemberForCurrentUser()
    resolvedMemberId = member?.id ?? null
  }

  if (!resolvedMemberId) {
    return { unlinked: true }
  }

  const [centerSettings, logs] = await Promise.all([
    getCenterSettings(),
    fetchMemberStreakLogs(resolvedMemberId),
  ])

  const recognition = resolveMileageRecognitionFromCenterSettings(centerSettings)

  return calculateRunningStreak({
    memberId: resolvedMemberId,
    logs,
    recognition,
  })
}

async function fetchMemberStreakLogs(memberId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('running_league_mileage_logs')
    .select('member_id, distance_km, logged_at')
    .eq('member_id', memberId)
    .order('logged_at', { ascending: true })

  if (error) {
    console.error('fetchMemberStreakLogs', error.message)
    return []
  }

  return (data ?? []).map((row) => ({
    member_id: String(row.member_id),
    distance_km: Number(row.distance_km ?? 0),
    logged_at: String(row.logged_at),
  }))
}
