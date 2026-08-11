import assert from 'node:assert/strict'
import { getCurrentWeekRange, isDateKeyInRange } from '../lib/running-league/week-range.ts'
import {
  buildDefaultWeeklyMissions,
  buildWeeklyMissionsView,
  getMissionProgressPercent,
  getWeeklyAttendanceCount,
  getWeeklyDistanceKm,
  getWeeklyRunCount,
  resolveWeeklyMissionDefinitions,
} from '../lib/running-league/weekly-missions.ts'

// CASE B: 5+6 = 11.0km
const logs = [
  { member_id: 'm1', distance_km: 5, logged_at: '2026-08-11' },
  { member_id: 'm1', distance_km: 6, logged_at: '2026-08-12' },
  { member_id: 'm1', distance_km: 7, logged_at: '2026-08-13' },
  { member_id: 'other', distance_km: 50, logged_at: '2026-08-11' },
]

assert.equal(getWeeklyDistanceKm('m1', logs, '2026-08-10', '2026-08-16', null), 18)
assert.equal(getWeeklyRunCount('m1', logs, '2026-08-10', '2026-08-16', null), 3)
assert.equal(getWeeklyAttendanceCount('m1', logs, '2026-08-10', '2026-08-16'), 3)

// CASE E: over target
assert.equal(getMissionProgressPercent(25, 20), 100)
assert.equal(getMissionProgressPercent(10, 20), 50)
assert.equal(getMissionProgressPercent(5, 0), 0)

// Monday boundary
assert.equal(isDateKeyInRange('2026-08-10', '2026-08-10', '2026-08-16'), true)
assert.equal(isDateKeyInRange('2026-08-09', '2026-08-10', '2026-08-16'), false)
assert.equal(isDateKeyInRange('2026-08-16', '2026-08-10', '2026-08-16'), true)
assert.equal(isDateKeyInRange('2026-08-17', '2026-08-10', '2026-08-16'), false)

const week = getCurrentWeekRange(new Date('2026-08-12T03:00:00+09:00'))
assert.equal(week.start, '2026-08-10')
assert.equal(week.end, '2026-08-16')

const defaults = buildDefaultWeeklyMissions(week)
assert.equal(defaults.length, 3)

const resolved = resolveWeeklyMissionDefinitions({
  week,
  adminMissions: [],
  tableReady: true,
})
assert.equal(resolved.source, 'default')

const view = buildWeeklyMissionsView({
  week,
  missions: defaults,
  source: 'default',
  tableReady: true,
  memberId: 'm1',
  logs,
  recognition: null,
})
assert.equal(view.missions[0].currentValue, 18)
assert.equal(view.missions[0].completed, false)
assert.equal(view.missions[1].currentValue, 3)
assert.equal(view.missions[1].completed, true)
assert.equal(view.missions[2].currentValue, 3)
assert.equal(view.missions[2].completed, true)
assert.equal(view.completedCount, 2)
assert.equal(view.totalCount, 3)

// empty member
const empty = buildWeeklyMissionsView({
  week,
  missions: defaults,
  source: 'default',
  tableReady: true,
  memberId: 'nobody',
  logs,
  recognition: null,
})
assert.equal(empty.missions[0].currentValue, 0)
assert.equal(empty.completedCount, 0)

console.log('[verify-weekly-missions] OK')
