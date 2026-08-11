import { toMileageLogDateKey } from '@/lib/running-league/attendance-leaderboard'
import {
  isMileageLogRecognized,
  type MileageRecognition,
} from '@/lib/running-league/mileage-recognition'
import { collectPbImprovementsInRange } from '@/lib/running-league/mvp'
import {
  MIN_REWARDED_RUN_DISTANCE_KM,
  REWARD_RULES,
  resolveAchievementReward,
  type RewardCurrency,
  type RewardSourceType,
} from '@/lib/running-league/rewards/config'
import {
  buildDefaultWeeklyMissions,
  buildWeeklyMissionsView,
  type WeeklyMissionDefinition,
} from '@/lib/running-league/weekly-missions'
import {
  getCurrentWeekRange,
  getWeekRangeForDateKey,
  shiftWeekRange,
} from '@/lib/running-league/week-range'

export type PendingReward = {
  currency: RewardCurrency
  amount: number
  source_type: RewardSourceType
  source_id: string | null
  idempotency_key: string
  description: string
  metadata?: Record<string, unknown>
}

type LogRow = { member_id: string; distance_km: number; logged_at: string }

function pushPair(
  out: PendingReward[],
  base: Omit<PendingReward, 'currency' | 'amount'> & { xp: number; point: number },
) {
  if (base.xp > 0) {
    out.push({
      currency: 'XP',
      amount: base.xp,
      source_type: base.source_type,
      source_id: base.source_id,
      idempotency_key: `${base.idempotency_key}:XP`,
      description: base.description,
      metadata: base.metadata,
    })
  }
  if (base.point > 0) {
    out.push({
      currency: 'POINT',
      amount: base.point,
      source_type: base.source_type,
      source_id: base.source_id,
      idempotency_key: `${base.idempotency_key}:POINT`,
      description: base.description,
      metadata: base.metadata,
    })
  }
}

/** 유효 러닝 활동일 → RUN_DAY (하루 1회) */
export function buildRunDayRewards(input: {
  memberId: string
  logs: ReadonlyArray<LogRow>
  recognition?: MileageRecognition | null
}): PendingReward[] {
  const days = new Set<string>()
  for (const log of input.logs) {
    if (log.member_id !== input.memberId) continue
    if (!isMileageLogRecognized(log.distance_km, input.recognition)) continue
    if (Number(log.distance_km) < MIN_REWARDED_RUN_DISTANCE_KM) continue
    const key = toMileageLogDateKey(String(log.logged_at))
    if (key) days.add(key)
  }
  const out: PendingReward[] = []
  const rule = REWARD_RULES.RUN_DAY
  for (const day of [...days].sort()) {
    pushPair(out, {
      xp: rule.xp,
      point: rule.point,
      source_type: 'RUN_DAY',
      source_id: day,
      idempotency_key: `RUN_DAY:${input.memberId}:${day}`,
      description: rule.description,
      metadata: { date: day },
    })
  }
  return out
}

export function buildWeeklyMissionRewards(input: {
  memberId: string
  logs: ReadonlyArray<LogRow>
  recognition?: MileageRecognition | null
  missionDefs: ReadonlyArray<WeeklyMissionDefinition>
  asOf?: Date
}): PendingReward[] {
  const asOf = input.asOf ?? new Date()
  const current = getCurrentWeekRange(asOf)
  const earliest = shiftWeekRange(current, -52).start
  let firstDate: string | null = null
  for (const log of input.logs) {
    if (log.member_id !== input.memberId) continue
    const key = toMileageLogDateKey(String(log.logged_at))
    if (!key) continue
    if (!firstDate || key < firstDate) firstDate = key
  }
  if (!firstDate) firstDate = current.start
  let cursor =
    firstDate < earliest
      ? getWeekRangeForDateKey(earliest)
      : getWeekRangeForDateKey(firstDate)

  const out: PendingReward[] = []
  const missionRule = REWARD_RULES.WEEKLY_MISSION
  const perfectRule = REWARD_RULES.PERFECT_WEEK

  while (cursor.start <= current.start) {
    const overlapping = input.missionDefs.filter(
      (m) => m.is_active && m.start_at <= cursor.end && m.end_at >= cursor.start,
    )
    const defs =
      overlapping.length > 0
        ? overlapping.map((m) => ({
            ...m,
            start_at: cursor.start,
            end_at: cursor.end,
          }))
        : buildDefaultWeeklyMissions(cursor)

    const view = buildWeeklyMissionsView({
      week: cursor,
      missions: defs,
      memberId: input.memberId,
      logs: input.logs,
      recognition: input.recognition,
      source: overlapping.length > 0 ? 'admin' : 'default',
      tableReady: true,
    })

    for (const mission of view.missions) {
      if (!mission.completed) continue
      pushPair(out, {
        xp: missionRule.xp,
        point: missionRule.point,
        source_type: 'WEEKLY_MISSION',
        source_id: mission.id,
        idempotency_key: `WEEKLY_MISSION:${input.memberId}:${mission.id}:${cursor.start}`,
        description: `${missionRule.description}: ${mission.title}`,
        metadata: { weekStart: cursor.start, missionId: mission.id },
      })
    }

    if (view.totalCount > 0 && view.completedCount === view.totalCount) {
      pushPair(out, {
        xp: perfectRule.xp,
        point: perfectRule.point,
        source_type: 'PERFECT_WEEK',
        source_id: cursor.start,
        idempotency_key: `PERFECT_WEEK:${input.memberId}:${cursor.start}`,
        description: perfectRule.description,
        metadata: { weekStart: cursor.start },
      })
    }

    cursor = shiftWeekRange(cursor, 1)
  }

  return out
}

export function buildAchievementRewards(input: {
  memberId: string
  unlocked: ReadonlyArray<{ code: string; tier: string | null; achievementId?: string }>
}): PendingReward[] {
  const out: PendingReward[] = []
  for (const row of input.unlocked) {
    const reward = resolveAchievementReward({ code: row.code, tier: row.tier })
    pushPair(out, {
      xp: reward.xp,
      point: reward.point,
      source_type: 'ACHIEVEMENT',
      source_id: row.achievementId ?? row.code,
      idempotency_key: `ACHIEVEMENT:${input.memberId}:${row.code}`,
      description: `Achievement: ${row.code}`,
      metadata: { code: row.code, tier: row.tier },
    })
  }
  return out
}

export function buildPbRewards(input: {
  memberId: string
  pbHistoryAvailable: boolean
  records: ReadonlyArray<{
    member_id: string
    distance_event: string
    measured_at: string
    time_seconds?: number | null
    time_text?: string | null
    created_at?: string | null
    id?: string
  }>
}): PendingReward[] {
  if (!input.pbHistoryAvailable) return []
  const improvements = collectPbImprovementsInRange({
    records: input.records,
    start: '1970-01-01',
    end: '9999-12-31',
  }).filter((row) => row.memberId === input.memberId)

  const out: PendingReward[] = []
  const rule = REWARD_RULES.PB
  for (const row of improvements) {
    const key = `PB:${input.memberId}:${row.distanceEvent}:${row.measuredAt}:${row.newSeconds}`
    pushPair(out, {
      xp: rule.xp,
      point: rule.point,
      source_type: 'PB',
      source_id: key,
      idempotency_key: key,
      description: rule.description,
      metadata: {
        event: row.distanceEvent,
        previous: row.previousSeconds,
        next: row.newSeconds,
      },
    })
  }
  return out
}

export function buildTeamBattleRewards(input: {
  memberId: string
  battles: ReadonlyArray<{
    battleId: string
    status: string
    startAt: string
    endAt: string
    winner: 'RED' | 'BLUE' | 'TIED' | null
    myTeam: 'RED' | 'BLUE' | null
    participated: boolean
  }>
}): PendingReward[] {
  const out: PendingReward[] = []
  const part = REWARD_RULES.TEAM_BATTLE_PARTICIPATION
  const win = REWARD_RULES.TEAM_BATTLE_WIN

  for (const battle of input.battles) {
    if (battle.status !== 'ended' && battle.status !== 'active') continue
    // 참여 보상: ended만 (진행 중 지급 방지) — 스펙: 배틀 종료 후
    if (battle.status !== 'ended') continue
    if (!battle.participated || !battle.myTeam) continue

    pushPair(out, {
      xp: part.xp,
      point: part.point,
      source_type: 'TEAM_BATTLE_PARTICIPATION',
      source_id: battle.battleId,
      idempotency_key: `TEAM_BATTLE:${battle.battleId}:${input.memberId}`,
      description: part.description,
      metadata: { battleId: battle.battleId },
    })

    if (
      battle.winner &&
      battle.winner !== 'TIED' &&
      battle.myTeam === battle.winner
    ) {
      pushPair(out, {
        xp: win.xp,
        point: win.point,
        source_type: 'TEAM_BATTLE_WIN',
        source_id: battle.battleId,
        idempotency_key: `TEAM_BATTLE_WIN:${battle.battleId}:${input.memberId}`,
        description: win.description,
        metadata: { battleId: battle.battleId, team: battle.myTeam },
      })
    }
  }
  return out
}

export function buildMvpRewards(input: {
  memberId: string
  awards: ReadonlyArray<{
    period: 'weekly' | 'monthly'
    periodKey: string
    category: string
  }>
}): PendingReward[] {
  const out: PendingReward[] = []
  const rule = REWARD_RULES.MVP
  for (const row of input.awards) {
    const key = `MVP:${row.period}:${row.category}:${row.periodKey}:${input.memberId}`
    pushPair(out, {
      xp: rule.xp,
      point: rule.point,
      source_type: 'MVP',
      source_id: key,
      idempotency_key: key,
      description: `${rule.description} (${row.category})`,
      metadata: row,
    })
  }
  return out
}

export function collectPendingRewards(parts: PendingReward[][]): PendingReward[] {
  const map = new Map<string, PendingReward>()
  for (const list of parts) {
    for (const row of list) {
      if (row.amount === 0) continue
      map.set(row.idempotency_key, row)
    }
  }
  return [...map.values()]
}

export function sumLedgerBalance(
  rows: ReadonlyArray<{ currency: string; amount: number }>,
  currency: RewardCurrency,
): number {
  let sum = 0
  for (const row of rows) {
    if (row.currency !== currency) continue
    sum += Number(row.amount) || 0
  }
  return sum
}
