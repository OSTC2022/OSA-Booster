import {
  DUPLICATE_DISTANCE_ABSOLUTE_KM,
  DUPLICATE_DISTANCE_PERCENT,
  DUPLICATE_TIME_WINDOW_MINUTES,
} from '@/lib/health-bridge/constants'

export type MileageLogDupRow = {
  id: string
  distance_km: number | string
  logged_at: string
  activity_time?: string | null
  duration?: string | null
  source_app?: string | null
  external_activity_id?: string | null
  source?: string | null
}

export type DuplicateCandidateMatch = {
  existingLogId: string
  reason: string
  confidence: 'HIGH' | 'LOW'
}

function parseActivityTime(value: string | null | undefined): number | null {
  if (!value) return null
  const text = value.trim()
  const m = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/)
  if (!m) return null
  const hours = Number(m[1])
  const minutes = Number(m[2])
  const seconds = m[3] != null ? Number(m[3]) : 0
  if (![hours, minutes, seconds].every(Number.isFinite)) return null
  return hours * 3600 + minutes * 60 + seconds
}

export function distanceThresholdKm(distanceKm: number): number {
  return Math.max(DUPLICATE_DISTANCE_ABSOLUTE_KM, Math.abs(distanceKm) * DUPLICATE_DISTANCE_PERCENT)
}

/**
 * Cross-provider / manual similarity — port of garmin-worker/app/duplicate.py.
 * Does not treat exact same (source_app, external_activity_id) as candidate (handled elsewhere).
 */
export function findDuplicateCandidate(input: {
  distanceKm: number
  loggedAt: string
  activityTime: string | null
  sourceApp: string
  externalActivityId: string
  existingLogs: MileageLogDupRow[]
}): DuplicateCandidateMatch | null {
  const threshold = distanceThresholdKm(input.distanceKm)
  const proposedTime = parseActivityTime(input.activityTime)
  const day = input.loggedAt.slice(0, 10)

  for (const row of input.existingLogs) {
    const rowApp = String(row.source_app || '').trim().toUpperCase()
    const rowExt = String(row.external_activity_id || '').trim()
    if (
      rowApp === input.sourceApp.toUpperCase() &&
      rowExt &&
      rowExt === input.externalActivityId
    ) {
      continue
    }

    const loggedAt = String(row.logged_at || '').slice(0, 10)
    if (loggedAt !== day) continue

    const existingKm = Number(row.distance_km)
    if (!Number.isFinite(existingKm)) continue
    if (Math.abs(existingKm - input.distanceKm) > threshold) continue

    const existingTime = parseActivityTime(
      row.activity_time != null ? String(row.activity_time) : null,
    )

    if (proposedTime != null && existingTime != null) {
      const delta = Math.abs(proposedTime - existingTime)
      if (delta > DUPLICATE_TIME_WINDOW_MINUTES * 60) continue
      return {
        existingLogId: String(row.id),
        reason: `same_day_near_distance_near_time|km_diff=${Math.abs(existingKm - input.distanceKm).toFixed(2)}|min_diff=${Math.floor(delta / 60)}`,
        confidence: 'HIGH',
      }
    }

    return {
      existingLogId: String(row.id),
      reason: `same_day_near_distance_no_time|km_diff=${Math.abs(existingKm - input.distanceKm).toFixed(2)}`,
      confidence: 'LOW',
    }
  }

  return null
}
