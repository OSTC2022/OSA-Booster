'use server'

import { createClient } from '@/lib/supabase/server'
import { getMemberForCurrentUser } from '@/lib/actions/auth'
import { getCenterSettings } from '@/lib/actions/center-settings'
import { filterParticipantsForAdultRunningLeague } from '@/lib/running-league/adult-running-eligibility'
import { resolveAdultRunningMemberIds } from '@/lib/running-league/resolve-adult-running-member-ids'
import { resolveMileageRecognitionFromCenterSettings } from '@/lib/running-league/mileage-recognition'
import {
  buildMvpHomeView,
  getMvpMonthRange,
  getPreviousMonthRange,
  type MvpHomeView,
  type MvpMember,
} from '@/lib/running-league/mvp'
import { getCurrentWeekRange, shiftWeekRange } from '@/lib/running-league/week-range'
import { getKstDateKey } from '@/lib/member-backup/kst-date'

export type MemberMvpHome =
  | MvpHomeView
  | { unlinked: true }

async function resolveAdultParticipants(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: participantRows, error: participantError } = await supabase
    .from('running_league_participants')
    .select(
      'id, member_id, league_id, member:members(id, name, is_active, auth_user_id, user_id, sport, grade)',
    )
    .order('created_at', { ascending: true })

  if (participantError) {
    console.error('getMemberMvpHome.participants', participantError.message)
    return [] as MvpMember[]
  }

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
      id: String(row.id),
      member_id: String(row.member_id),
      league_id: String(row.league_id ?? ''),
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

  const adultMemberIds = await resolveAdultRunningMemberIds(
    supabase,
    mapped.map((row) => row.member_id),
  )
  const adult = filterParticipantsForAdultRunningLeague(mapped, adultMemberIds)
  const members: MvpMember[] = []
  const seen = new Set<string>()
  for (const row of adult) {
    if (!row.member || row.member.is_active === false) continue
    if (seen.has(row.member_id)) continue
    seen.add(row.member_id)
    members.push({
      memberId: row.member_id,
      memberName: row.member.name?.trim() || '회원',
    })
  }
  return members
}

function resolveFetchWindow(asOf = new Date()) {
  const week = getCurrentWeekRange(asOf)
  const prevWeek = shiftWeekRange(week, -1)
  const month = getMvpMonthRange(asOf)
  const prevMonth = getPreviousMonthRange(month.start)
  // streak needs history — pull from ~1 year before or prevMonth start whichever earlier, but cap reasonably
  const streakLookbackStart = shiftWeekRange(week, -52).start
  const starts = [prevWeek.start, prevMonth.start, streakLookbackStart, month.start]
  starts.sort()
  return {
    logStart: starts[0],
    logEnd: getKstDateKey(asOf),
  }
}

export async function getMemberMvpHome(
  memberId?: string | null,
): Promise<MemberMvpHome> {
  let resolvedMemberId = memberId?.trim() || null
  if (!resolvedMemberId) {
    const member = await getMemberForCurrentUser()
    resolvedMemberId = member?.id ?? null
  }

  if (!resolvedMemberId) {
    return { unlinked: true }
  }

  const supabase = await createClient()
  const [centerSettings, members] = await Promise.all([
    getCenterSettings(),
    resolveAdultParticipants(supabase),
  ])

  const recognition = resolveMileageRecognitionFromCenterSettings(centerSettings)
  const window = resolveFetchWindow()
  const memberIds = members.map((m) => m.memberId)

  if (memberIds.length === 0) {
    return buildMvpHomeView({
      members: [],
      logs: [],
      pbRecords: [],
      pbHistoryAvailable: true,
      viewerMemberId: resolvedMemberId,
      recognition,
    })
  }

  const [logsResult, pbResult, pbHistoryProbe] = await Promise.all([
    supabase
      .from('running_league_mileage_logs')
      .select('member_id, distance_km, logged_at')
      .in('member_id', memberIds)
      .gte('logged_at', window.logStart)
      .lte('logged_at', window.logEnd),
    supabase
      .from('running_league_records')
      .select(
        'member_id, distance_event, measured_at, time_seconds, time_text, record_phase, created_at',
      )
      .in('member_id', memberIds)
      .in('record_phase', ['other', 'pb_history']),
    supabase
      .from('running_league_records')
      .select('id')
      .eq('record_phase', 'pb_history')
      .limit(1),
  ])

  if (logsResult.error) {
    console.error('getMemberMvpHome.logs', logsResult.error.message)
  }
  if (pbResult.error) {
    console.error('getMemberMvpHome.pb', pbResult.error.message)
  }

  let pbHistoryAvailable = true
  if (pbHistoryProbe.error) {
    const message = pbHistoryProbe.error.message?.toLowerCase() ?? ''
    if (
      pbHistoryProbe.error.code === '23514' ||
      message.includes('record_phase') ||
      message.includes('pb_history')
    ) {
      pbHistoryAvailable = false
    }
  }

  // If probe failed for check constraint but current PB rows exist without history capability
  if (
    pbResult.error &&
    (pbResult.error.message.includes('record_phase') ||
      pbResult.error.code === '23514')
  ) {
    pbHistoryAvailable = false
  }

  const logs = (logsResult.data ?? []).map((row) => ({
    member_id: String(row.member_id),
    distance_km: Number(row.distance_km ?? 0),
    logged_at: String(row.logged_at),
  }))

  const pbRecords = pbHistoryAvailable
    ? (pbResult.data ?? []).map((row) => ({
        member_id: String(row.member_id),
        distance_event: String(row.distance_event),
        measured_at: String(row.measured_at),
        time_seconds: row.time_seconds == null ? null : Number(row.time_seconds),
        time_text: row.time_text == null ? null : String(row.time_text),
        record_phase: row.record_phase == null ? null : String(row.record_phase),
        created_at: row.created_at == null ? null : String(row.created_at),
      }))
    : []

  return buildMvpHomeView({
    members,
    logs,
    pbRecords,
    pbHistoryAvailable,
    viewerMemberId: resolvedMemberId,
    recognition,
  })
}
