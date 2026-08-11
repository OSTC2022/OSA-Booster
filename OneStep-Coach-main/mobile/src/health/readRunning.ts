import { Platform } from 'react-native'
import {
  formatDistanceKm,
  formatDuration,
  formatWorkoutDate,
  lookbackStart,
  quantityToKm,
} from '@/src/health/format'
import type {
  HealthReadResult,
  NormalizedRunningWorkout,
} from '@/src/health/runningTypes'
import { isExpoGoRuntime } from '@/src/health/runtime'

export { formatDistanceKm, formatDuration, formatWorkoutDate, lookbackStart, quantityToKm }

const DEFAULT_LOOKBACK_DAYS = 7
const EXTENDED_LOOKBACK_DAYS = 30

export async function getHealthAvailability(): Promise<
  | { ok: true; provider: 'APPLE_HEALTH' | 'HEALTH_CONNECT' }
  | { ok: false; code: 'UNSUPPORTED' | 'UNAVAILABLE' | 'EXPO_GO'; message: string }
> {
  if (isExpoGoRuntime()) {
    return {
      ok: false,
      code: 'EXPO_GO',
      message:
        '운동 기록 연동은 Development Build가 필요합니다. Expo Go에서는 Health를 사용할 수 없습니다.',
    }
  }

  if (Platform.OS === 'ios') {
    const apple = await import('@/src/health/appleHealth')
    return apple.getAppleHealthAvailability()
  }
  if (Platform.OS === 'android') {
    const hc = await import('@/src/health/healthConnect')
    return hc.getHealthConnectAvailability()
  }
  return {
    ok: false,
    code: 'UNSUPPORTED',
    message: '이 기기에서는 운동 기록 자동 연동을 사용할 수 없습니다.',
  }
}

export async function requestHealthReadPermission(): Promise<
  | { ok: true }
  | { ok: false; code: 'PERMISSION_DENIED' | 'UNAVAILABLE' | 'UNSUPPORTED' | 'EXPO_GO'; message: string }
> {
  const availability = await getHealthAvailability()
  if (!availability.ok) {
    return {
      ok: false,
      code: availability.code,
      message: availability.message,
    }
  }

  if (Platform.OS === 'ios') {
    const apple = await import('@/src/health/appleHealth')
    return apple.requestAppleHealthReadPermission()
  }
  if (Platform.OS === 'android') {
    const hc = await import('@/src/health/healthConnect')
    return hc.requestHealthConnectReadPermission()
  }
  return {
    ok: false,
    code: 'UNSUPPORTED',
    message: '이 기기에서는 운동 기록 자동 연동을 사용할 수 없습니다.',
  }
}

export async function hasHealthReadPermission(): Promise<boolean> {
  if (Platform.OS === 'ios') {
    const apple = await import('@/src/health/appleHealth')
    return apple.hasAppleHealthReadPermission()
  }
  if (Platform.OS === 'android') {
    const hc = await import('@/src/health/healthConnect')
    return hc.hasHealthConnectReadPermission()
  }
  return false
}

/**
 * Read recent running workouts only (7 days; extend to 30 if empty for QA).
 * Never reads GPS / HR / sleep / steps.
 */
export async function readRecentRunningWorkouts(options?: {
  lookbackDays?: number
  extendIfEmpty?: boolean
}): Promise<HealthReadResult> {
  const lookbackDays = options?.lookbackDays ?? DEFAULT_LOOKBACK_DAYS
  const extendIfEmpty = options?.extendIfEmpty ?? true

  const availability = await getHealthAvailability()
  if (!availability.ok) {
    return {
      ok: false,
      code: availability.code,
      message: availability.message,
    }
  }

  const permitted = await hasHealthReadPermission()
  if (!permitted) {
    return {
      ok: false,
      code: 'PERMISSION_DENIED',
      message: '운동 기록 접근 권한이 필요합니다.',
    }
  }

  try {
    let workouts = await readRunningForDays(lookbackDays)
    let usedDays = lookbackDays
    if (extendIfEmpty && workouts.length === 0) {
      workouts = await readRunningForDays(EXTENDED_LOOKBACK_DAYS)
      usedDays = EXTENDED_LOOKBACK_DAYS
    }

    if (__DEV__) {
      console.log(`Running count: ${workouts.length}`)
    }

    return { ok: true, workouts, lookbackDays: usedDays }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '운동 기록을 읽는 중 오류가 발생했습니다.'
    return { ok: false, code: 'READ_FAILED', message }
  }
}

async function readRunningForDays(days: number): Promise<NormalizedRunningWorkout[]> {
  const end = new Date()
  const start = lookbackStart(days, end)

  if (Platform.OS === 'ios') {
    const apple = await import('@/src/health/appleHealth')
    return apple.readAppleRunningWorkouts(start, end)
  }
  if (Platform.OS === 'android') {
    const hc = await import('@/src/health/healthConnect')
    return hc.readHealthConnectRunningWorkouts(start, end)
  }
  return []
}
