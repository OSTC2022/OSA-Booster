import {
  AuthorizationRequestStatus,
  WorkoutActivityType,
  WorkoutTypeIdentifier,
  getRequestStatusForAuthorization,
  isHealthDataAvailableAsync,
  queryWorkoutSamples,
  requestAuthorization,
} from '@kingstinct/react-native-healthkit'
import { quantityToKm } from '@/src/health/format'
import type { NormalizedRunningWorkout } from '@/src/health/runningTypes'

const READ_TYPES = [WorkoutTypeIdentifier] as const

function toIso(date: Date): string {
  return date.toISOString()
}

function sourceOriginFromWorkout(workout: {
  sourceRevision?: { source?: { name?: string; bundleIdentifier?: string } }
}): string | null {
  const source = workout.sourceRevision?.source
  if (!source) return null
  const name = source.name?.trim()
  const bundle = source.bundleIdentifier?.trim()
  if (name && bundle) return `${name} (${bundle})`
  return name || bundle || null
}

export async function getAppleHealthAvailability(): Promise<
  | { ok: true; provider: 'APPLE_HEALTH' }
  | { ok: false; code: 'UNAVAILABLE' | 'UNSUPPORTED'; message: string }
> {
  try {
    const available = await isHealthDataAvailableAsync()
    if (!available) {
      return {
        ok: false,
        code: 'UNAVAILABLE',
        message: '이 기기에서는 운동 기록 자동 연동을 사용할 수 없습니다.',
      }
    }
    return { ok: true, provider: 'APPLE_HEALTH' }
  } catch {
    return {
      ok: false,
      code: 'UNAVAILABLE',
      message: '이 기기에서는 운동 기록 자동 연동을 사용할 수 없습니다.',
    }
  }
}

/** Read-only: HKWorkoutTypeIdentifier only. No write / no HR / no route. */
export async function requestAppleHealthReadPermission(): Promise<
  | { ok: true }
  | {
      ok: false
      code: 'PERMISSION_DENIED' | 'UNAVAILABLE' | 'UNSUPPORTED'
      message: string
    }
> {
  const availability = await getAppleHealthAvailability()
  if (!availability.ok) return availability

  try {
    await requestAuthorization({
      toRead: [...READ_TYPES],
      // Explicit empty share — we never write HealthKit data.
      toShare: [],
    })

    const status = await getRequestStatusForAuthorization({
      toRead: [...READ_TYPES],
      toShare: [],
    })

    // After the sheet, status is usually unnecessary. Apple does not expose
    // definitive read-deny; treat shouldRequest after dismiss as denied UX.
    if (status === AuthorizationRequestStatus.shouldRequest) {
      return {
        ok: false,
        code: 'PERMISSION_DENIED',
        message: '운동 기록 접근 권한이 필요합니다.',
      }
    }

    return { ok: true }
  } catch {
    return {
      ok: false,
      code: 'PERMISSION_DENIED',
      message: '운동 기록 접근 권한이 필요합니다.',
    }
  }
}

export async function hasAppleHealthReadPermission(): Promise<boolean> {
  try {
    const status = await getRequestStatusForAuthorization({
      toRead: [...READ_TYPES],
      toShare: [],
    })
    return status === AuthorizationRequestStatus.unnecessary
  } catch {
    return false
  }
}

/**
 * Query HKWorkout samples with workoutActivityType = running only.
 * Distance from workout.totalDistance (HKWorkout property).
 */
export async function readAppleRunningWorkouts(
  start: Date,
  end: Date,
): Promise<NormalizedRunningWorkout[]> {
  const samples = await queryWorkoutSamples({
    limit: 100,
    ascending: false,
    filter: {
      workoutActivityType: WorkoutActivityType.running,
      date: {
        startDate: start,
        endDate: end,
      },
    },
  })

  const workouts: NormalizedRunningWorkout[] = []

  for (const sample of samples) {
    if (sample.workoutActivityType !== WorkoutActivityType.running) continue

    const distanceKm = sample.totalDistance
      ? quantityToKm(sample.totalDistance.quantity, sample.totalDistance.unit)
      : 0

    const durationSeconds =
      typeof sample.duration?.quantity === 'number'
        ? sample.duration.quantity
        : Math.max(
            0,
            (sample.endDate.getTime() - sample.startDate.getTime()) / 1000,
          )

    workouts.push({
      provider: 'APPLE_HEALTH',
      externalActivityId: sample.uuid,
      startedAt: toIso(sample.startDate),
      endedAt: toIso(sample.endDate),
      durationSeconds,
      distanceKm,
      activityType: 'running',
      sourceOrigin: sourceOriginFromWorkout(sample),
    })
  }

  return workouts
}
