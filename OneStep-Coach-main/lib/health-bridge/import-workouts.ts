import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceRoleClient } from '@/lib/supabase/admin'
import { ensureCenterPortalRankingLeague } from '@/lib/running-league/center-portal-ranking-league'
import { sumMileageLogsKm } from '@/lib/running-league/mileage-leaderboard'
import { resolveMileageRecognitionFromCenterSettings } from '@/lib/running-league/mileage-recognition'
import { mileageScoreFromKm } from '@/lib/running-league/scoring'
import { getCenterSettingsCached } from '@/lib/data/center-settings-read'
import { resolvePortalRankingPeriod } from '@/lib/running-league/ranking-period'
import { findDuplicateCandidate } from '@/lib/health-bridge/duplicate'
import { MAX_HEALTH_IMPORT_BATCH } from '@/lib/health-bridge/constants'
import { formatMileageDuration, getKstActivityTime, getKstDateKey } from '@/lib/health-bridge/kst'
import {
  validateHealthImportActivity,
  type HealthImportActivityInput,
} from '@/lib/health-bridge/validate'
import type { Member } from '@/lib/types'

export type HealthImportItemResult = {
  externalActivityId: string
  status:
    | 'IMPORTED'
    | 'ALREADY_IMPORTED'
    | 'DUPLICATE_CANDIDATE'
    | 'INVALID'
    | 'ERROR'
  distanceKm?: number
  code?: string
}

export type HealthImportBatchResult = {
  ok: true
  imported: number
  alreadyImported: number
  duplicateCandidates: number
  invalid: number
  errors: number
  importedDistanceKm: number
  results: HealthImportItemResult[]
  mileageKm: number | null
}

async function ensurePortalParticipant(
  admin: SupabaseClient,
  memberId: string,
): Promise<{ ok: true; participantId: string; leagueId: string } | { ok: false; error: string }> {
  const league = await ensureCenterPortalRankingLeague()
  if (!league) {
    return { ok: false, error: '랭킹 DB가 준비되지 않았습니다.' }
  }

  const { data: existing } = await admin
    .from('running_league_participants')
    .select('id, league_id')
    .eq('league_id', league.id)
    .eq('member_id', memberId)
    .maybeSingle()

  if (existing) {
    return {
      ok: true,
      participantId: String(existing.id),
      leagueId: String(existing.league_id),
    }
  }

  const { data: inserted, error } = await admin
    .from('running_league_participants')
    .insert({ league_id: league.id, member_id: memberId })
    .select('id, league_id')
    .single()

  if (error) {
    if (error.code === '23505') {
      const { data: retry } = await admin
        .from('running_league_participants')
        .select('id, league_id')
        .eq('league_id', league.id)
        .eq('member_id', memberId)
        .maybeSingle()
      if (retry) {
        return {
          ok: true,
          participantId: String(retry.id),
          leagueId: String(retry.league_id),
        }
      }
    }
    return { ok: false, error: error.message }
  }

  return {
    ok: true,
    participantId: String(inserted.id),
    leagueId: String(inserted.league_id),
  }
}

async function syncParticipantMileage(
  admin: SupabaseClient,
  participantId: string,
): Promise<number> {
  const centerSettings = await getCenterSettingsCached()
  const mileageRecognition = resolveMileageRecognitionFromCenterSettings(centerSettings)
  const { start, end } = resolvePortalRankingPeriod(centerSettings)

  const { data, error } = await admin
    .from('running_league_mileage_logs')
    .select('distance_km')
    .eq('participant_id', participantId)
    .gte('logged_at', start)
    .lte('logged_at', end)

  if (error) throw new Error(error.message)

  const mileageKm = sumMileageLogsKm(data ?? [], mileageRecognition)
  const mileageScore = mileageScoreFromKm(mileageKm)

  const { error: updateError } = await admin
    .from('running_league_participants')
    .update({
      mileage_km: mileageKm,
      mileage_score: mileageScore,
      updated_at: new Date().toISOString(),
    })
    .eq('id', participantId)

  if (updateError) throw new Error(updateError.message)
  return mileageKm
}

async function recordDuplicateCandidate(input: {
  admin: SupabaseClient
  memberId: string
  provider: string
  externalActivityId: string
  distanceKm: number
  loggedAt: string
  activityTime: string
  duration: string
  existingLogId: string
  reason: string
  confidence: 'HIGH' | 'LOW'
}): Promise<void> {
  const payload = {
    member_id: input.memberId,
    existing_log_id: input.existingLogId,
    provider: input.provider,
    external_activity_id: input.externalActivityId,
    proposed_distance_km: input.distanceKm,
    proposed_logged_at: input.loggedAt,
    proposed_activity_time: input.activityTime,
    proposed_duration: input.duration,
    reason: input.reason,
    status: 'OPEN',
    issue_type: 'POSSIBLE_DUPLICATE',
    confidence: input.confidence,
    proposed_summary: {
      distance_km: input.distanceKm,
      logged_at: input.loggedAt,
      activity_time: input.activityTime,
      duration: input.duration,
      source_app: input.provider,
    },
  }

  const { error } = await input.admin
    .from('member_mileage_duplicate_candidates')
    .insert(payload)

  // Open unique index may reject duplicates — treat as already queued
  if (error && error.code !== '23505') {
    // Non-fatal for import flow
    console.error('[health-bridge] duplicate candidate insert', error.code)
  }
}

/**
 * Import Health running activities for the authenticated member only.
 * Client member_id is ignored.
 */
export async function importHealthWorkoutsForMember(input: {
  member: Member
  activities: HealthImportActivityInput[]
}): Promise<HealthImportBatchResult | { ok: false; error: string }> {
  const admin = createServiceRoleClient()
  const ensured = await ensurePortalParticipant(admin, input.member.id)
  if (!ensured.ok) return { ok: false, error: ensured.error }

  const batch = input.activities.slice(0, MAX_HEALTH_IMPORT_BATCH)
  const results: HealthImportItemResult[] = []
  let imported = 0
  let alreadyImported = 0
  let duplicateCandidates = 0
  let invalid = 0
  let errors = 0
  let importedDistanceKm = 0
  let anyImported = false

  // Prefetch recent logs once for similarity checks (portal league window ~ lookback)
  const lookbackStart = new Date()
  lookbackStart.setDate(lookbackStart.getDate() - 40)
  const lookbackKey = getKstDateKey(lookbackStart)

  const { data: existingLogs } = await admin
    .from('running_league_mileage_logs')
    .select(
      'id, distance_km, logged_at, activity_time, duration, source_app, external_activity_id, source',
    )
    .eq('member_id', input.member.id)
    .gte('logged_at', lookbackKey)
    .limit(500)

  const logs = (existingLogs ?? []) as Array<{
    id: string
    distance_km: number | string
    logged_at: string
    activity_time?: string | null
    duration?: string | null
    source_app?: string | null
    external_activity_id?: string | null
    source?: string | null
  }>

  for (const raw of batch) {
    const validated = validateHealthImportActivity(raw)
    if (!validated.ok) {
      invalid += 1
      results.push({
        externalActivityId: String(raw.externalActivityId || ''),
        status: 'INVALID',
        code: validated.failure.code,
      })
      continue
    }

    const activity = validated.activity
    const loggedAt = getKstDateKey(activity.startedAt)
    const activityTime = getKstActivityTime(activity.startedAt)
    const duration = formatMileageDuration(activity.durationSeconds)
    const distanceKm = Math.round(activity.distanceKm * 100) / 100

    // Exact duplicate
    const exact = logs.find(
      (row) =>
        String(row.source_app || '').toUpperCase() === activity.provider &&
        String(row.external_activity_id || '') === activity.externalActivityId,
    )
    if (exact) {
      alreadyImported += 1
      results.push({
        externalActivityId: activity.externalActivityId,
        status: 'ALREADY_IMPORTED',
        distanceKm,
      })
      continue
    }

    const candidate = findDuplicateCandidate({
      distanceKm,
      loggedAt,
      activityTime,
      sourceApp: activity.provider,
      externalActivityId: activity.externalActivityId,
      existingLogs: logs,
    })

    if (candidate) {
      duplicateCandidates += 1
      try {
        await recordDuplicateCandidate({
          admin,
          memberId: input.member.id,
          provider: activity.provider,
          externalActivityId: activity.externalActivityId,
          distanceKm,
          loggedAt,
          activityTime,
          duration,
          existingLogId: candidate.existingLogId,
          reason: candidate.reason,
          confidence: candidate.confidence,
        })
      } catch {
        // still report candidate even if review row write fails
      }
      results.push({
        externalActivityId: activity.externalActivityId,
        status: 'DUPLICATE_CANDIDATE',
        distanceKm,
        code: 'CROSS_PROVIDER_OR_MANUAL',
      })
      continue
    }

    const notes = activity.sourceOrigin
      ? `health_origin=${activity.sourceOrigin}`.slice(0, 200)
      : ''

    const { data: inserted, error: insertError } = await admin
      .from('running_league_mileage_logs')
      .insert({
        participant_id: ensured.participantId,
        league_id: ensured.leagueId,
        member_id: input.member.id,
        distance_km: distanceKm,
        logged_at: loggedAt,
        source: 'import',
        source_app: activity.provider,
        notes,
        duration,
        activity_time: activityTime,
        external_activity_id: activity.externalActivityId,
        verification_status: 'confirmed',
        updated_at: new Date().toISOString(),
      })
      .select('id')
      .maybeSingle()

    if (insertError) {
      if (insertError.code === '23505') {
        alreadyImported += 1
        results.push({
          externalActivityId: activity.externalActivityId,
          status: 'ALREADY_IMPORTED',
          distanceKm,
        })
        continue
      }
      errors += 1
      results.push({
        externalActivityId: activity.externalActivityId,
        status: 'ERROR',
        code: 'INSERT_FAILED',
      })
      continue
    }

    if (!inserted) {
      alreadyImported += 1
      results.push({
        externalActivityId: activity.externalActivityId,
        status: 'ALREADY_IMPORTED',
        distanceKm,
      })
      continue
    }

    imported += 1
    importedDistanceKm = Math.round((importedDistanceKm + distanceKm) * 100) / 100
    anyImported = true
    logs.push({
      id: String(inserted.id),
      distance_km: distanceKm,
      logged_at: loggedAt,
      activity_time: activityTime,
      duration,
      source_app: activity.provider,
      external_activity_id: activity.externalActivityId,
      source: 'import',
    })
    results.push({
      externalActivityId: activity.externalActivityId,
      status: 'IMPORTED',
      distanceKm,
    })
  }

  let mileageKm: number | null = null
  if (anyImported) {
    try {
      mileageKm = await syncParticipantMileage(admin, ensured.participantId)
      const { evaluateAchievementsForMemberQuiet } = await import('@/lib/actions/achievements')
      void evaluateAchievementsForMemberQuiet(input.member.id)
    } catch {
      mileageKm = null
    }
  }

  return {
    ok: true,
    imported,
    alreadyImported,
    duplicateCandidates,
    invalid,
    errors,
    importedDistanceKm,
    results,
    mileageKm,
  }
}
