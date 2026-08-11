import assert from 'node:assert/strict'
import {
  getLevelFromXp,
  getLevelProgress,
  getRunnerTitle,
  getXpThresholdForLevel,
} from '../lib/running-league/rewards/level.ts'
import {
  buildRunDayRewards,
  buildAchievementRewards,
  sumLedgerBalance,
} from '../lib/running-league/rewards/evaluate.ts'
import { LEVEL_CONFIG, MIN_REWARDED_RUN_DISTANCE_KM } from '../lib/running-league/rewards/config.ts'

// Level thresholds
assert.equal(getXpThresholdForLevel(1), 0)
assert.equal(getXpThresholdForLevel(2), 100)
assert.equal(getXpThresholdForLevel(3), 300)
assert.equal(getXpThresholdForLevel(4), 600)
assert.equal(getXpThresholdForLevel(5), 1000)
assert.equal(getXpThresholdForLevel(6), 1500)

assert.equal(getLevelFromXp(0), 1)
assert.equal(getLevelFromXp(99), 1)
assert.equal(getLevelFromXp(100), 2)
assert.equal(getLevelFromXp(299), 2)
assert.equal(getLevelFromXp(300), 3)
assert.equal(getLevelFromXp(600), 4)

const p = getLevelProgress(650)
assert.equal(p.level, 4)
assert.equal(p.xpToNext, 350)
assert.equal(p.xpIntoLevel, 50)
assert.ok(p.progressPercent > 0 && p.progressPercent < 100)

assert.equal(getRunnerTitle(1), 'STARTER')
assert.equal(getRunnerTitle(12), 'PACER')
assert.equal(getRunnerTitle(50), 'LEGEND')
assert.equal(getLevelFromXp(getXpThresholdForLevel(LEVEL_CONFIG.maxLevel) + 99999), LEVEL_CONFIG.maxLevel)

// RUN_DAY once per day, min distance
{
  const rewards = buildRunDayRewards({
    memberId: 'm1',
    logs: [
      { member_id: 'm1', distance_km: 5, logged_at: '2026-08-10T01:00:00+09:00' },
      { member_id: 'm1', distance_km: 7, logged_at: '2026-08-10T20:00:00+09:00' },
      { member_id: 'm1', distance_km: 0.5, logged_at: '2026-08-11' },
      { member_id: 'm1', distance_km: 3, logged_at: '2026-08-12' },
    ],
  })
  const keys = rewards.map((r) => r.idempotency_key)
  assert.equal(rewards.filter((r) => r.currency === 'XP').length, 2)
  assert.ok(keys.some((k) => k.includes('2026-08-10')))
  assert.ok(keys.some((k) => k.includes('2026-08-12')))
  assert.ok(!keys.some((k) => k.includes('2026-08-11')))
  assert.ok(MIN_REWARDED_RUN_DISTANCE_KM >= 1)
}

// Achievement rewards idempotent keys
{
  const rewards = buildAchievementRewards({
    memberId: 'm1',
    unlocked: [
      { code: 'TOTAL_100K', tier: 'SILVER' },
      { code: 'FIRST_RUN', tier: null },
    ],
  })
  assert.ok(rewards.some((r) => r.idempotency_key === 'ACHIEVEMENT:m1:TOTAL_100K:XP'))
  assert.ok(rewards.some((r) => r.amount === 35 && r.currency === 'XP'))
  assert.ok(rewards.some((r) => r.idempotency_key === 'ACHIEVEMENT:m1:FIRST_RUN:XP'))
}

// balance sum
assert.equal(
  sumLedgerBalance(
    [
      { currency: 'XP', amount: 5 },
      { currency: 'POINT', amount: 3 },
      { currency: 'XP', amount: 15 },
      { currency: 'POINT', amount: -1 },
    ],
    'POINT',
  ),
  2,
)

console.log('verify-rewards: PASS')
