'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getMemberForCurrentUser } from '@/lib/actions/auth'
import { GARMIN_PROVIDER } from '@/lib/garmin/config'

export type GarminReviewIssue = {
  id: string
  issueType: string
  confidence: string
  status: string
  reason: string
  externalActivityIdMasked: string
  proposedDistanceKm: number
  proposedLoggedAt: string
  proposedActivityTime: string | null
  proposedDuration: string | null
  existingLogId: string | null
  existingDistanceKm: number | null
  existingLoggedAt: string | null
  existingActivityTime: string | null
  existingDuration: string | null
  existingSource: string | null
  createdAt: string
}

function maskId(id: string | null | undefined): string {
  if (!id) return '—'
  const s = String(id)
  if (s.length <= 4) return '••••'
  return `${s.slice(0, 2)}…${s.slice(-2)}`
}

async function assertStaffOrOwner(memberId: string): Promise<
  { ok: true; actorMemberId: string | null; isStaff: boolean } | { ok: false; error: string }
> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: '로그인이 필요합니다.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, approval_status')
    .eq('id', user.id)
    .maybeSingle()

  const isStaff =
    !!profile &&
    ['admin', 'operator'].includes(String(profile.role)) &&
    profile.approval_status === 'approved'

  const me = await getMemberForCurrentUser()
  if (isStaff) {
    return { ok: true, actorMemberId: me?.id ?? null, isStaff: true }
  }
  if (!me || me.id !== memberId) {
    return { ok: false, error: '권한이 없습니다.' }
  }
  return { ok: true, actorMemberId: me.id, isStaff: false }
}

/**
 * Open review issues for the authenticated member (or staff viewing own portal).
 * Never returns tokens / raw Garmin payloads / full unmasked secrets.
 */
export async function listMyGarminReviewIssues(): Promise<
  { ok: true; issues: GarminReviewIssue[] } | { ok: false; error: string }
> {
  const member = await getMemberForCurrentUser()
  if (!member) return { ok: false, error: '로그인이 필요합니다.' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('member_mileage_duplicate_candidates')
    .select(
      'id, issue_type, confidence, status, reason, external_activity_id, proposed_distance_km, proposed_logged_at, proposed_activity_time, proposed_duration, existing_log_id, existing_summary, proposed_summary, created_at',
    )
    .eq('member_id', member.id)
    .eq('status', 'OPEN')
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    if (/does not exist|schema cache|column/i.test(error.message)) {
      return { ok: true, issues: [] }
    }
    return { ok: false, error: '검토 목록을 불러오지 못했습니다.' }
  }

  const logIds = (data || [])
    .map((r) => r.existing_log_id as string | null)
    .filter((id): id is string => !!id)

  const logMap = new Map<
    string,
    {
      distance_km: number | null
      logged_at: string | null
      activity_time: string | null
      duration: string | null
      source: string | null
      source_app: string | null
    }
  >()

  if (logIds.length) {
    const { data: logs } = await supabase
      .from('running_league_mileage_logs')
      .select('id, distance_km, logged_at, activity_time, duration, source, source_app')
      .in('id', logIds)
    for (const log of logs || []) {
      logMap.set(String(log.id), {
        distance_km: log.distance_km != null ? Number(log.distance_km) : null,
        logged_at: log.logged_at ? String(log.logged_at) : null,
        activity_time: log.activity_time ? String(log.activity_time) : null,
        duration: log.duration ? String(log.duration) : null,
        source: log.source ? String(log.source) : null,
        source_app: log.source_app ? String(log.source_app) : null,
      })
    }
  }

  const issues: GarminReviewIssue[] = (data || []).map((row) => {
    const existing = row.existing_log_id ? logMap.get(String(row.existing_log_id)) : undefined
    const existingSummary = (row.existing_summary || {}) as Record<string, unknown>
    return {
      id: String(row.id),
      issueType: String(row.issue_type || 'POSSIBLE_DUPLICATE'),
      confidence: String(row.confidence || 'HIGH'),
      status: String(row.status),
      reason: String(row.reason || ''),
      externalActivityIdMasked: maskId(row.external_activity_id as string),
      proposedDistanceKm: Number(row.proposed_distance_km),
      proposedLoggedAt: String(row.proposed_logged_at),
      proposedActivityTime: row.proposed_activity_time ? String(row.proposed_activity_time) : null,
      proposedDuration: row.proposed_duration ? String(row.proposed_duration) : null,
      existingLogId: row.existing_log_id ? String(row.existing_log_id) : null,
      existingDistanceKm:
        existing?.distance_km ??
        (existingSummary.distance_km != null ? Number(existingSummary.distance_km) : null),
      existingLoggedAt:
        existing?.logged_at ??
        (existingSummary.logged_at != null ? String(existingSummary.logged_at) : null),
      existingActivityTime:
        existing?.activity_time ??
        (existingSummary.activity_time != null ? String(existingSummary.activity_time) : null),
      existingDuration:
        existing?.duration ??
        (existingSummary.duration != null ? String(existingSummary.duration) : null),
      existingSource: existing?.source_app || existing?.source || 'manual',
      createdAt: String(row.created_at),
    }
  })

  return { ok: true, issues }
}

export async function resolveMyGarminDuplicateIssue(
  issueId: string,
  resolution: 'KEEP_MANUAL' | 'USE_GARMIN' | 'ALLOW_BOTH',
): Promise<{ ok: true } | { ok: false; error: string }> {
  const member = await getMemberForCurrentUser()
  if (!member) return { ok: false, error: '로그인이 필요합니다.' }
  if (!issueId) return { ok: false, error: '잘못된 요청입니다.' }

  const supabase = await createClient()

  // Ownership: issue must belong to this member (or staff via RPC check)
  const { data: issue } = await supabase
    .from('member_mileage_duplicate_candidates')
    .select('id, member_id')
    .eq('id', issueId)
    .maybeSingle()

  if (!issue) return { ok: false, error: '검토 항목을 찾을 수 없습니다.' }

  const authz = await assertStaffOrOwner(String(issue.member_id))
  if (!authz.ok) return authz

  const { data, error } = await supabase.rpc('resolve_garmin_duplicate_candidate', {
    p_issue_id: issueId,
    p_resolution: resolution,
  })

  if (error) {
    return { ok: false, error: '처리에 실패했습니다. 잠시 후 다시 시도해 주세요.' }
  }

  const payload = data as { ok?: boolean; error?: string } | null
  if (!payload?.ok) {
    const code = payload?.error || 'FAILED'
    if (code === 'FORBIDDEN') return { ok: false, error: '권한이 없습니다.' }
    if (code === 'ALREADY_RESOLVED' || code === 'CONCURRENT_RESOLUTION') {
      return { ok: true }
    }
    return { ok: false, error: '처리할 수 없는 상태입니다.' }
  }

  revalidatePath('/dashboard/my')
  return { ok: true }
}

export async function resolveMyGarminSourceIssue(
  issueId: string,
  resolution: 'KEEP_LOCAL' | 'REMOVE_LOCAL',
): Promise<{ ok: true } | { ok: false; error: string }> {
  const member = await getMemberForCurrentUser()
  if (!member) return { ok: false, error: '로그인이 필요합니다.' }

  const supabase = await createClient()
  const { data: issue } = await supabase
    .from('member_mileage_duplicate_candidates')
    .select('id, member_id')
    .eq('id', issueId)
    .maybeSingle()

  if (!issue) return { ok: false, error: '검토 항목을 찾을 수 없습니다.' }
  const authz = await assertStaffOrOwner(String(issue.member_id))
  if (!authz.ok) return authz

  const { data, error } = await supabase.rpc('resolve_garmin_source_issue', {
    p_issue_id: issueId,
    p_resolution: resolution,
  })
  if (error) return { ok: false, error: '처리에 실패했습니다.' }
  const payload = data as { ok?: boolean; error?: string } | null
  if (!payload?.ok) {
    if (payload?.error === 'FORBIDDEN') return { ok: false, error: '권한이 없습니다.' }
    if (payload?.error === 'ALREADY_RESOLVED' || payload?.error === 'CONCURRENT_RESOLUTION') {
      return { ok: true }
    }
    return { ok: false, error: '처리할 수 없는 상태입니다.' }
  }
  revalidatePath('/dashboard/my')
  return { ok: true }
}

export async function resolveMyGarminChangeIssue(
  issueId: string,
  resolution: 'APPLY_GARMIN' | 'KEEP_LOCAL',
): Promise<{ ok: true } | { ok: false; error: string }> {
  const member = await getMemberForCurrentUser()
  if (!member) return { ok: false, error: '로그인이 필요합니다.' }

  const supabase = await createClient()
  const { data: issue } = await supabase
    .from('member_mileage_duplicate_candidates')
    .select('id, member_id, issue_type')
    .eq('id', issueId)
    .maybeSingle()

  if (!issue) return { ok: false, error: '검토 항목을 찾을 수 없습니다.' }
  const authz = await assertStaffOrOwner(String(issue.member_id))
  if (!authz.ok) return authz

  const { data, error } = await supabase.rpc('resolve_garmin_change_issue', {
    p_issue_id: issueId,
    p_resolution: resolution,
  })
  if (error) return { ok: false, error: '처리에 실패했습니다.' }
  const payload = data as { ok?: boolean; error?: string } | null
  if (!payload?.ok) {
    if (payload?.error === 'FORBIDDEN') return { ok: false, error: '권한이 없습니다.' }
    if (payload?.error === 'ALREADY_RESOLVED') return { ok: true }
    return { ok: false, error: '처리할 수 없는 상태입니다.' }
  }
  revalidatePath('/dashboard/my')
  return { ok: true }
}

/** Admin diagnostic: open review count across members (no tokens). */
export async function getAdminGarminReviewStats(): Promise<
  { ok: true; openCount: number } | { ok: false; error: string }
> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: '로그인이 필요합니다.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, approval_status')
    .eq('id', user.id)
    .maybeSingle()

  if (
    !profile ||
    !['admin', 'operator'].includes(String(profile.role)) ||
    profile.approval_status !== 'approved'
  ) {
    return { ok: false, error: '권한이 없습니다.' }
  }

  const { count, error } = await supabase
    .from('member_mileage_duplicate_candidates')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'OPEN')
    .eq('provider', GARMIN_PROVIDER)

  if (error) return { ok: true, openCount: 0 }
  return { ok: true, openCount: count ?? 0 }
}
