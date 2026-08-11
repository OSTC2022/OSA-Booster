import {
  ExerciseType,
  SdkAvailabilityStatus,
  aggregateRecord,
  getGrantedPermissions,
  getSdkStatus,
  initialize,
  openHealthConnectSettings,
  readRecords,
  requestPermission,
} from 'react-native-health-connect'
import { metersToKm } from '@/src/health/format'
import type { NormalizedRunningWorkout } from '@/src/health/runningTypes'

const READ_PERMISSIONS = [
  { accessType: 'read' as const, recordType: 'ExerciseSession' as const },
  { accessType: 'read' as const, recordType: 'Distance' as const },
]

const RUNNING_TYPES = new Set<number>([
  ExerciseType.RUNNING,
  ExerciseType.RUNNING_TREADMILL,
])

function toIso(date: Date): string {
  return date.toISOString()
}

function isReadGranted(
  granted: readonly { accessType?: string; recordType?: string }[],
  recordType: 'ExerciseSession' | 'Distance',
): boolean {
  return granted.some(
    (p) => p.accessType === 'read' && p.recordType === recordType,
  )
}

export async function getHealthConnectAvailability(): Promise<
  | { ok: true; provider: 'HEALTH_CONNECT' }
  | { ok: false; code: 'UNAVAILABLE' | 'UNSUPPORTED'; message: string }
> {
  try {
    const status = await getSdkStatus()
    if (status === SdkAvailabilityStatus.SDK_AVAILABLE) {
      const ok = await initialize()
      if (!ok) {
        return {
          ok: false,
          code: 'UNAVAILABLE',
          message: '이 기기에서는 운동 기록 자동 연동을 사용할 수 없습니다.',
        }
      }
      return { ok: true, provider: 'HEALTH_CONNECT' }
    }

    if (status === SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED) {
      return {
        ok: false,
        code: 'UNAVAILABLE',
        message:
          'Health Connect 앱 설치 또는 업데이트가 필요합니다. Play 스토어에서 Health Connect를 확인해주세요.',
      }
    }

    return {
      ok: false,
      code: 'UNAVAILABLE',
      message: '이 기기에서는 운동 기록 자동 연동을 사용할 수 없습니다.',
    }
  } catch {
    return {
      ok: false,
      code: 'UNAVAILABLE',
      message: '이 기기에서는 운동 기록 자동 연동을 사용할 수 없습니다.',
    }
  }
}

/** Minimal READ: ExerciseSession + Distance only. No HR / sleep / steps write. */
export async function requestHealthConnectReadPermission(): Promise<
  | { ok: true }
  | {
      ok: false
      code: 'PERMISSION_DENIED' | 'UNAVAILABLE' | 'UNSUPPORTED'
      message: string
    }
> {
  const availability = await getHealthConnectAvailability()
  if (!availability.ok) return availability

  try {
    const granted = await requestPermission([...READ_PERMISSIONS])
    const ok =
      isReadGranted(granted as readonly { accessType?: string; recordType?: string }[], 'ExerciseSession') &&
      isReadGranted(granted as readonly { accessType?: string; recordType?: string }[], 'Distance')
    if (!ok) {
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

export async function hasHealthConnectReadPermission(): Promise<boolean> {
  try {
    await initialize()
    const granted = await getGrantedPermissions()
    return (
      isReadGranted(granted, 'ExerciseSession') && isReadGranted(granted, 'Distance')
    )
  } catch {
    return false
  }
}

export function openHealthConnectOsSettings(): void {
  try {
    openHealthConnectSettings()
  } catch {
    // no-op — caller shows guidance text
  }
}

/**
 * ExerciseSessionRecord (RUNNING / RUNNING_TREADMILL) + Distance aggregate
 * over each session interval (official HC aggregate API — no manual GPS math).
 */
export async function readHealthConnectRunningWorkouts(
  start: Date,
  end: Date,
): Promise<NormalizedRunningWorkout[]> {
  await initialize()

  const sessions = await readRecords('ExerciseSession', {
    timeRangeFilter: {
      operator: 'between',
      startTime: toIso(start),
      endTime: toIso(end),
    },
    ascendingOrder: false,
    pageSize: 100,
  })

  const workouts: NormalizedRunningWorkout[] = []

  for (const session of sessions.records) {
    if (!RUNNING_TYPES.has(session.exerciseType)) continue

    const startTime = session.startTime
    const endTime = session.endTime
    const started = new Date(startTime)
    const ended = new Date(endTime)
    const durationSeconds = Math.max(
      0,
      Math.round((ended.getTime() - started.getTime()) / 1000),
    )

    let distanceKm = 0
    try {
      const agg = await aggregateRecord({
        recordType: 'Distance',
        timeRangeFilter: {
          operator: 'between',
          startTime,
          endTime,
        },
      })
      if (agg.DISTANCE?.inMeters != null) {
        distanceKm = metersToKm(agg.DISTANCE.inMeters)
      } else if (agg.DISTANCE?.inKilometers != null) {
        distanceKm = agg.DISTANCE.inKilometers
      }
    } catch {
      distanceKm = 0
    }

    const externalActivityId =
      session.metadata?.id ||
      session.metadata?.clientRecordId ||
      `${startTime}_${endTime}_${session.exerciseType}`

    workouts.push({
      provider: 'HEALTH_CONNECT',
      externalActivityId,
      startedAt: startTime,
      endedAt: endTime,
      durationSeconds,
      distanceKm,
      activityType: 'running',
      sourceOrigin: session.metadata?.dataOrigin ?? null,
    })
  }

  return workouts
}
