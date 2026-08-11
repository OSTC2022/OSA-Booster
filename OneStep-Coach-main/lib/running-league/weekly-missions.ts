import {
  formatMileageKmDisplay,
} from '@/lib/running-league/mileage-leaderboard'
import {
  isMileageLogRecognized,
  type MileageRecognition,
} from '@/lib/running-league/mileage-recognition'
import { toMileageLogDateKey } from '@/lib/running-league/attendance-leaderboard'
import { isDateKeyInRange, type WeekRange } from '@/lib/running-league/week-range'
import type { RunningLeagueMileageLog } from '@/lib/types'

export const WEEKLY_MISSION_TYPES = [
  'distance',
  'run_count',
  'attendance_count',
] as const

export type WeeklyMissionType = (typeof WEEKLY_MISSION_TYPES)[number]

export type WeeklyMissionDefinition = {
  id: string
  title: string
  description: string | null
  mission_type: WeeklyMissionType
  target_value: number
  unit: string
  start_at: string
  end_at: string
  is_active: boolean
  is_auto: boolean
  reward_points: number
  sort_order: number
  created_by: string | null
  created_at?: string
  updated_at?: string
}

export type WeeklyMissionProgressItem = WeeklyMissionDefinition & {
  currentValue: number
  currentLabel: string
  targetLabel: string
  progressPercent: number
  completed: boolean
}

export type WeeklyMissionsView = {
  week: WeekRange
  missions: WeeklyMissionProgressItem[]
  completedCount: number
  totalCount: number
  source: 'admin' | 'default'
  tableReady: boolean
}

/** 기본 자동 미션 — 숫자/문구는 이 상수만 수정 */
export const DEFAULT_WEEKLY_MISSIONS = [
  {
    key: 'default-distance',
    title: '주간 20km 달리기',
    description: '이번 주 누적 러닝 거리',
    mission_type: 'distance' as const,
    target_value: 20,
    unit: 'km',
    sort_order: 10,
    reward_points: 0,
  },
  {
    key: 'default-run-count',
    title: '이번 주 러닝 3회',
    description: '인정 거리 기준 러닝 기록 횟수',
    mission_type: 'run_count' as const,
    target_value: 3,
    unit: '회',
    sort_order: 20,
    reward_points: 0,
  },
  {
    key: 'default-attendance',
    title: '이번 주 출석 2회',
    description: '마일리지 기록을 올린 날 기준 출석',
    mission_type: 'attendance_count' as const,
    target_value: 2,
    unit: '회',
    sort_order: 30,
    reward_points: 0,
  },
] as const

export function unitForMissionType(type: WeeklyMissionType): string {
  switch (type) {
    case 'distance':
      return 'km'
    case 'run_count':
    case 'attendance_count':
      return '회'
    default:
      return '회'
  }
}

export function isWeeklyMissionType(value: string): value is WeeklyMissionType {
  return (WEEKLY_MISSION_TYPES as readonly string[]).includes(value)
}

export function buildDefaultWeeklyMissions(week: WeekRange): WeeklyMissionDefinition[] {
  return DEFAULT_WEEKLY_MISSIONS.map((row) => ({
    id: row.key,
    title: row.title,
    description: row.description,
    mission_type: row.mission_type,
    target_value: row.target_value,
    unit: row.unit,
    start_at: week.start,
    end_at: week.end,
    is_active: true,
    is_auto: true,
    reward_points: row.reward_points,
    sort_order: row.sort_order,
    created_by: null,
  }))
}

/** 이번 주와 기간이 겹치는 활성 미션 */
export function filterMissionsForWeek(
  missions: ReadonlyArray<WeeklyMissionDefinition>,
  week: WeekRange,
): WeeklyMissionDefinition[] {
  return missions
    .filter((mission) => {
      if (!mission.is_active) return false
      return mission.start_at <= week.end && mission.end_at >= week.start
    })
    .sort((a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title, 'ko'))
}

export function resolveWeeklyMissionDefinitions(input: {
  week: WeekRange
  adminMissions: ReadonlyArray<WeeklyMissionDefinition>
  tableReady: boolean
}): { missions: WeeklyMissionDefinition[]; source: 'admin' | 'default' } {
  const overlapping = filterMissionsForWeek(input.adminMissions, input.week)
  if (overlapping.length > 0) {
    return { missions: overlapping, source: 'admin' }
  }
  return {
    missions: buildDefaultWeeklyMissions(input.week),
    source: 'default',
  }
}

function roundKm(km: number): number {
  return Math.round(km * 10) / 10
}

export function getWeeklyDistanceKm(
  memberId: string,
  logs: ReadonlyArray<Pick<RunningLeagueMileageLog, 'member_id' | 'distance_km' | 'logged_at'>>,
  start: string,
  end: string,
  recognition?: MileageRecognition | null,
): number {
  let total = 0
  for (const log of logs) {
    if (log.member_id !== memberId) continue
    const dateKey = toMileageLogDateKey(String(log.logged_at ?? ''))
    if (!isDateKeyInRange(dateKey, start, end)) continue
    if (!isMileageLogRecognized(log.distance_km, recognition)) continue
    total += Number(log.distance_km ?? 0)
  }
  return roundKm(total)
}

/** 인정 거리 기준 러닝 기록 row 수 = 1회 러닝 */
export function getWeeklyRunCount(
  memberId: string,
  logs: ReadonlyArray<Pick<RunningLeagueMileageLog, 'member_id' | 'distance_km' | 'logged_at'>>,
  start: string,
  end: string,
  recognition?: MileageRecognition | null,
): number {
  let count = 0
  for (const log of logs) {
    if (log.member_id !== memberId) continue
    const dateKey = toMileageLogDateKey(String(log.logged_at ?? ''))
    if (!isDateKeyInRange(dateKey, start, end)) continue
    if (!isMileageLogRecognized(log.distance_km, recognition)) continue
    count += 1
  }
  return count
}

/**
 * 포털 출석과 동일: 해당 날짜에 마일리지 기록을 올리면 출석 1회
 * (인정 거리 필터 없음 — attendance-leaderboard와 동일)
 */
export function getWeeklyAttendanceCount(
  memberId: string,
  logs: ReadonlyArray<Pick<RunningLeagueMileageLog, 'member_id' | 'logged_at'>>,
  start: string,
  end: string,
): number {
  const days = new Set<string>()
  for (const log of logs) {
    if (log.member_id !== memberId) continue
    const dateKey = toMileageLogDateKey(String(log.logged_at ?? ''))
    if (!isDateKeyInRange(dateKey, start, end)) continue
    days.add(dateKey)
  }
  return days.size
}

export function computeMissionCurrentValue(input: {
  mission: WeeklyMissionDefinition
  memberId: string
  logs: ReadonlyArray<Pick<RunningLeagueMileageLog, 'member_id' | 'distance_km' | 'logged_at'>>
  recognition?: MileageRecognition | null
}): number {
  const { mission, memberId, logs, recognition } = input
  const start = mission.start_at
  const end = mission.end_at
  switch (mission.mission_type) {
    case 'distance':
      return getWeeklyDistanceKm(memberId, logs, start, end, recognition)
    case 'run_count':
      return getWeeklyRunCount(memberId, logs, start, end, recognition)
    case 'attendance_count':
      return getWeeklyAttendanceCount(memberId, logs, start, end)
    default:
      return 0
  }
}

export function formatMissionValue(value: number, type: WeeklyMissionType, unit: string): string {
  if (type === 'distance') {
    return formatMileageKmDisplay(value)
  }
  return `${Math.max(0, Math.floor(value))}${unit}`
}

export function getMissionProgressPercent(currentValue: number, targetValue: number): number {
  if (!Number.isFinite(targetValue) || targetValue <= 0) return 0
  if (!Number.isFinite(currentValue) || currentValue <= 0) return 0
  return Math.min(100, Math.round((currentValue / targetValue) * 1000) / 10)
}

export function buildWeeklyMissionsView(input: {
  week: WeekRange
  missions: ReadonlyArray<WeeklyMissionDefinition>
  source: 'admin' | 'default'
  tableReady: boolean
  memberId: string
  logs: ReadonlyArray<Pick<RunningLeagueMileageLog, 'member_id' | 'distance_km' | 'logged_at'>>
  recognition?: MileageRecognition | null
}): WeeklyMissionsView {
  const items: WeeklyMissionProgressItem[] = input.missions.map((mission) => {
    const currentValue = computeMissionCurrentValue({
      mission,
      memberId: input.memberId,
      logs: input.logs,
      recognition: input.recognition,
    })
    const target = Number(mission.target_value) || 0
    const completed = target > 0 && currentValue >= target
    return {
      ...mission,
      currentValue,
      currentLabel: formatMissionValue(currentValue, mission.mission_type, mission.unit),
      targetLabel: formatMissionValue(target, mission.mission_type, mission.unit),
      progressPercent: getMissionProgressPercent(currentValue, target),
      completed,
    }
  })

  const completedCount = items.filter((item) => item.completed).length

  return {
    week: input.week,
    missions: items,
    completedCount,
    totalCount: items.length,
    source: input.source,
    tableReady: input.tableReady,
  }
}
