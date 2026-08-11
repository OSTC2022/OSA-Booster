import { getPublicEnv } from '@/src/lib/env'
import { getSupabase } from '@/src/lib/supabase'
import type { NormalizedRunningWorkout } from '@/src/health/runningTypes'

export type HealthUploadSummary = {
  ok: boolean
  message: string
  imported: number
  alreadyImported: number
  duplicateCandidates: number
  invalid: number
  errors: number
  importedDistanceKm: number
}

function healthBridgeBaseUrl(): string {
  const env = getPublicEnv()
  const explicit = process.env.EXPO_PUBLIC_HEALTH_BRIDGE_URL?.trim()
  if (explicit) return explicit.replace(/\/$/, '')
  return env.webPortalUrl.replace(/\/$/, '')
}

async function authHeaders(): Promise<HeadersInit | null> {
  const supabase = getSupabase()
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) return null
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
}

export async function notifyHealthConnected(
  provider: 'APPLE_HEALTH' | 'HEALTH_CONNECT',
): Promise<{ ok: boolean }> {
  const headers = await authHeaders()
  if (!headers) return { ok: false }
  try {
    const res = await fetch(`${healthBridgeBaseUrl()}/api/health-bridge/connect`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ provider }),
    })
    return { ok: res.ok }
  } catch {
    return { ok: false }
  }
}

export async function uploadHealthWorkouts(
  workouts: NormalizedRunningWorkout[],
): Promise<HealthUploadSummary> {
  const headers = await authHeaders()
  if (!headers) {
    return {
      ok: false,
      message: '동기화하지 못했습니다. 다시 시도해주세요.',
      imported: 0,
      alreadyImported: 0,
      duplicateCandidates: 0,
      invalid: 0,
      errors: 0,
      importedDistanceKm: 0,
    }
  }

  if (workouts.length === 0) {
    return {
      ok: true,
      message: '새로운 러닝 기록이 없습니다.',
      imported: 0,
      alreadyImported: 0,
      duplicateCandidates: 0,
      invalid: 0,
      errors: 0,
      importedDistanceKm: 0,
    }
  }

  const activities = workouts.map((w) => ({
    provider: w.provider,
    externalActivityId: w.externalActivityId,
    activityType: w.activityType,
    startedAt: w.startedAt,
    endedAt: w.endedAt,
    durationSeconds: w.durationSeconds,
    distanceKm: w.distanceKm,
    sourceOrigin: w.sourceOrigin,
  }))

  try {
    const res = await fetch(`${healthBridgeBaseUrl()}/api/health-bridge/import`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ activities }),
    })
    const json = (await res.json()) as Partial<HealthUploadSummary> & {
      ok?: boolean
      error?: string
      message?: string
    }

    if (!res.ok || json.ok === false) {
      return {
        ok: false,
        message: '동기화하지 못했습니다. 다시 시도해주세요.',
        imported: 0,
        alreadyImported: 0,
        duplicateCandidates: 0,
        invalid: 0,
        errors: 1,
        importedDistanceKm: 0,
      }
    }

    return {
      ok: true,
      message: json.message || '새로운 러닝 기록이 없습니다.',
      imported: Number(json.imported || 0),
      alreadyImported: Number(json.alreadyImported || 0),
      duplicateCandidates: Number(json.duplicateCandidates || 0),
      invalid: Number(json.invalid || 0),
      errors: Number(json.errors || 0),
      importedDistanceKm: Number(json.importedDistanceKm || 0),
    }
  } catch {
    return {
      ok: false,
      message: '동기화하지 못했습니다. 다시 시도해주세요.',
      imported: 0,
      alreadyImported: 0,
      duplicateCandidates: 0,
      invalid: 0,
      errors: 1,
      importedDistanceKm: 0,
    }
  }
}
