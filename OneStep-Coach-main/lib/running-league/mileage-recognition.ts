import type { CenterSettings, RunningLeagueMileageLog } from '@/lib/types'

export type MileageRecognition = {
  enabled: boolean
  minKm: number
}

export const DEFAULT_MILEAGE_MIN_KM = 3

export function resolveMileageRecognitionFromCenterSettings(
  settings:
    | Pick<
        CenterSettings,
        'adult_portal_mileage_min_km_enabled' | 'adult_portal_mileage_min_km'
      >
    | null
    | undefined,
): MileageRecognition {
  const enabled = Boolean(settings?.adult_portal_mileage_min_km_enabled)
  const raw = settings?.adult_portal_mileage_min_km
  const parsed = raw != null ? Number(raw) : DEFAULT_MILEAGE_MIN_KM
  const minKm =
    Number.isFinite(parsed) && parsed > 0
      ? Math.round(parsed * 10) / 10
      : DEFAULT_MILEAGE_MIN_KM
  return { enabled, minKm }
}

export function isMileageLogRecognized(
  distanceKm: number | null | undefined,
  recognition?: MileageRecognition | null,
): boolean {
  if (!recognition?.enabled) return true
  return Number(distanceKm ?? 0) >= recognition.minKm
}

export function sumRecognizedMileageKm(
  logs: ReadonlyArray<Pick<RunningLeagueMileageLog, 'distance_km'>>,
  recognition?: MileageRecognition | null,
): number {
  let total = 0
  for (const log of logs) {
    if (!isMileageLogRecognized(log.distance_km, recognition)) continue
    total += Number(log.distance_km ?? 0)
  }
  return Math.round(total * 10) / 10
}

export function sumMemberMileageUpToDate(
  memberId: string,
  logs: ReadonlyArray<RunningLeagueMileageLog>,
  asOfDate: string,
  recognition?: MileageRecognition | null,
): number {
  let total = 0
  for (const log of logs) {
    if (log.member_id !== memberId) continue
    if (log.logged_at > asOfDate) continue
    if (!isMileageLogRecognized(log.distance_km, recognition)) continue
    total += Number(log.distance_km ?? 0)
  }
  return Math.round(total * 10) / 10
}

export function sumMemberMileageOnDate(
  memberId: string,
  logs: ReadonlyArray<RunningLeagueMileageLog>,
  date: string,
  recognition?: MileageRecognition | null,
): number {
  let total = 0
  for (const log of logs) {
    if (log.member_id !== memberId || log.logged_at !== date) continue
    if (!isMileageLogRecognized(log.distance_km, recognition)) continue
    total += Number(log.distance_km ?? 0)
  }
  return Math.round(total * 10) / 10
}
