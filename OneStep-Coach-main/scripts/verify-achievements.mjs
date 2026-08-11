import assert from 'node:assert/strict'
import {
  computeMemberAchievementStats,
  evaluateAchievementUnlocks,
  mergeAchievementCatalog,
  buildMemberAchievementsView,
  DEFAULT_ACHIEVEMENT_CATALOG,
} from '../lib/running-league/achievements.ts'

const catalog = mergeAchievementCatalog([])
assert.ok(catalog.length >= 15)

const memberId = 'm1'

// CASE: milestones unlock all at once (not else-if)
{
  const logs = []
  let day = 1
  // accumulate to 320km with single runs of 40km
  for (let i = 0; i < 8; i += 1) {
    logs.push({
      member_id: memberId,
      distance_km: 40,
      logged_at: `2026-01-${String(day).padStart(2, '0')}`,
    })
    day += 1
  }
  const stats = computeMemberAchievementStats({
    memberId,
    logs,
    pbHistoryAvailable: true,
  })
  assert.equal(stats.totalDistanceKm, 320)
  assert.ok(stats.longestSingleRunKm >= 40)
  const unlocks = evaluateAchievementUnlocks(catalog, stats).map((u) => u.code)
  assert.ok(unlocks.includes('FIRST_RUN'))
  assert.ok(unlocks.includes('FIRST_5K'))
  assert.ok(unlocks.includes('FIRST_10K'))
  assert.ok(unlocks.includes('TOTAL_50K'))
  assert.ok(unlocks.includes('TOTAL_100K'))
  assert.ok(unlocks.includes('TOTAL_300K'))
  assert.ok(!unlocks.includes('TOTAL_500K'))
  assert.ok(stats.milestoneUnlockDates.TOTAL_50K)
  assert.ok(stats.milestoneUnlockDates.TOTAL_300K)
}

// CASE: FIRST_5K needs single run >= 5, not cumulative 3+3
{
  const stats = computeMemberAchievementStats({
    memberId,
    logs: [
      { member_id: memberId, distance_km: 3, logged_at: '2026-02-01' },
      { member_id: memberId, distance_km: 3, logged_at: '2026-02-02' },
    ],
  })
  assert.equal(stats.longestSingleRunKm, 3)
  const unlocks = evaluateAchievementUnlocks(catalog, stats).map((u) => u.code)
  assert.ok(unlocks.includes('FIRST_RUN'))
  assert.ok(!unlocks.includes('FIRST_5K'))
}

// CASE: streak uses bestStreak
{
  const logs = []
  // 4 complete weeks of 3 runs
  const weeks = ['2026-06-02', '2026-06-09', '2026-06-16', '2026-06-23']
  for (const start of weeks) {
    for (let d = 0; d < 3; d += 1) {
      const day = String(Number(start.slice(8, 10)) + d).padStart(2, '0')
      logs.push({
        member_id: memberId,
        distance_km: 5,
        logged_at: `${start.slice(0, 8)}${day}`,
      })
    }
  }
  const stats = computeMemberAchievementStats({
    memberId,
    logs,
    asOf: new Date('2026-07-01T12:00:00+09:00'),
  })
  assert.ok(stats.bestStreak >= 4)
  const unlocks = evaluateAchievementUnlocks(catalog, stats).map((u) => u.code)
  assert.ok(unlocks.includes('STREAK_4'))
}

// CASE: FIRST_PB unavailable without history
{
  const stats = computeMemberAchievementStats({
    memberId,
    logs: [{ member_id: memberId, distance_km: 5, logged_at: '2026-03-01' }],
    pbHistoryAvailable: false,
    pbRecords: [],
  })
  const unlocks = evaluateAchievementUnlocks(catalog, stats).map((u) => u.code)
  assert.ok(!unlocks.includes('FIRST_PB'))
  const view = buildMemberAchievementsView({
    catalog,
    stats,
    unlockedByCode: new Map(),
    showcaseCodes: [],
  })
  const pb = view.items.find((i) => i.code === 'FIRST_PB')
  assert.equal(pb?.unavailable, true)
}

// CASE: FIRST_PB with improvement
{
  const stats = computeMemberAchievementStats({
    memberId,
    logs: [],
    pbHistoryAvailable: true,
    pbRecords: [
      {
        member_id: memberId,
        distance_event: '10km',
        measured_at: '2026-01-01',
        time_seconds: 3000,
      },
      {
        member_id: memberId,
        distance_event: '10km',
        measured_at: '2026-02-01',
        time_seconds: 2800,
      },
    ],
  })
  assert.equal(stats.hasPbImprovement, true)
  const unlocks = evaluateAchievementUnlocks(catalog, stats).map((u) => u.code)
  assert.ok(unlocks.includes('FIRST_PB'))
}

// CASE: social / team / mvp flags
{
  const stats = computeMemberAchievementStats({
    memberId,
    logs: [],
    hasRival: true,
    hasTeamBattle: true,
    isCurrentMvp: true,
  })
  const unlocks = evaluateAchievementUnlocks(catalog, stats).map((u) => u.code)
  assert.ok(unlocks.includes('FIRST_RIVAL'))
  assert.ok(unlocks.includes('TEAM_BATTLE_FIRST'))
  assert.ok(unlocks.includes('MVP_FIRST'))
}

// CASE: view progress labels
{
  const stats = computeMemberAchievementStats({
    memberId,
    logs: [{ member_id: memberId, distance_km: 73.4, logged_at: '2026-04-01' }],
  })
  const view = buildMemberAchievementsView({
    catalog: DEFAULT_ACHIEVEMENT_CATALOG,
    stats,
    unlockedByCode: new Map([
      ['FIRST_RUN', { unlockedAt: '2026-04-01T00:00:00.000Z', metadata: null }],
    ]),
    showcaseCodes: [{ code: 'FIRST_RUN', position: 1 }],
  })
  assert.equal(view.unlockedCount, 1)
  assert.equal(view.showcase.length, 1)
  const total100 = view.items.find((i) => i.code === 'TOTAL_100K')
  assert.ok(total100?.progressLabel?.includes('73.4'))
}

console.log('verify-achievements: PASS')
