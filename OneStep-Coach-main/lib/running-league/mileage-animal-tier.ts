import { buildMileageDistanceLeaderboard } from '@/lib/running-league/mileage-leaderboard'
import type { MileageDistanceLeaderboard } from '@/lib/running-league/mileage-leaderboard'
import type { MileageRecognition } from '@/lib/running-league/mileage-recognition'
import type { RunningLeagueMileageLog, RunningLeagueParticipant } from '@/lib/types'

export type MileageAnimalTier = {
  minKm: number
  emoji: string
  label: string
}

/** 누적 마일리지(km) 기준 동물 등급 — 높은 구간부터 매칭 */
export const MILEAGE_ANIMAL_TIERS: readonly MileageAnimalTier[] = [
  { minKm: 3000, emoji: '🦄', label: '전설' },
  { minKm: 1500, emoji: '🐎', label: '말' },
  { minKm: 1000, emoji: '🦅', label: '독수리' },
  { minKm: 700, emoji: '🦌', label: '사슴' },
  { minKm: 400, emoji: '🐆', label: '치타' },
  { minKm: 250, emoji: '🐺', label: '늑대' },
  { minKm: 150, emoji: '🦊', label: '여우' },
  { minKm: 80, emoji: '🐕', label: '강아지' },
  { minKm: 30, emoji: '🐢', label: '거북이' },
  { minKm: 0, emoji: '🐣', label: '병아리' },
] as const

export function resolveMileageAnimalTier(mileageKm: number): MileageAnimalTier {
  const km = Math.max(0, Math.round(mileageKm * 10) / 10)
  for (const tier of MILEAGE_ANIMAL_TIERS) {
    if (km >= tier.minKm) return tier
  }
  return MILEAGE_ANIMAL_TIERS[MILEAGE_ANIMAL_TIERS.length - 1]
}

export function buildMemberMileageKmMap(
  leaderboard: MileageDistanceLeaderboard,
): Map<string, number> {
  const map = new Map<string, number>()
  for (const row of leaderboard.ranked) {
    map.set(row.memberId, row.mileageKm)
  }
  for (const row of leaderboard.unranked) {
    map.set(row.memberId, 0)
  }
  return map
}

export function buildMemberMileageKmMapFromLogs(
  participants: ReadonlyArray<RunningLeagueParticipant>,
  logs: ReadonlyArray<RunningLeagueMileageLog>,
  mileageRecognition?: MileageRecognition | null,
): Map<string, number> {
  return buildMemberMileageKmMap(
    buildMileageDistanceLeaderboard(participants, logs, mileageRecognition),
  )
}

export function resolveMemberMileageKm(
  memberId: string,
  memberMileageKmById: ReadonlyMap<string, number>,
): number {
  return memberMileageKmById.get(memberId) ?? 0
}
