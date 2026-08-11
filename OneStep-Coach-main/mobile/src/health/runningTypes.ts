import type { ActivitySyncProvider } from '@/src/health/types'

/** Normalized running workout for UI (G2). Not uploaded to DB yet. */
export type NormalizedRunningWorkout = {
  provider: 'APPLE_HEALTH' | 'HEALTH_CONNECT'
  externalActivityId: string
  startedAt: string // ISO
  endedAt: string // ISO
  durationSeconds: number
  distanceKm: number
  activityType: 'running'
  sourceOrigin: string | null
}

export type HealthReadErrorCode =
  | 'UNSUPPORTED'
  | 'UNAVAILABLE'
  | 'PERMISSION_DENIED'
  | 'READ_FAILED'
  | 'EXPO_GO'

export type HealthReadResult =
  | { ok: true; workouts: NormalizedRunningWorkout[]; lookbackDays: number }
  | { ok: false; code: HealthReadErrorCode; message: string }

export type HealthConnectState =
  | { status: 'UNSUPPORTED' }
  | { status: 'UNAVAILABLE'; message: string }
  | { status: 'NOT_CONNECTED' }
  | { status: 'CONNECTED' }
  | { status: 'PERMISSION_REQUIRED' }
  | { status: 'ERROR'; message: string }

export function isHealthProvider(
  value: ActivitySyncProvider | null,
): value is 'APPLE_HEALTH' | 'HEALTH_CONNECT' {
  return value === 'APPLE_HEALTH' || value === 'HEALTH_CONNECT'
}
