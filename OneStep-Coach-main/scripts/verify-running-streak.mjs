import assert from 'node:assert/strict'
import { addDays, format, parseISO } from 'date-fns'
import { calculateRunningStreak } from '../lib/running-league/running-streak.ts'
import {
  getCurrentWeekRange,
  getWeekRangeForDateKey,
  shiftWeekRange,
} from '../lib/running-league/week-range.ts'

const TARGET = 3
const MEMBER = 'm1'

function logsForWeeks(weeks) {
  const logs = []
  for (const week of weeks) {
    const monday = parseISO(week.start)
    for (let i = 0; i < week.count; i += 1) {
      logs.push({
        member_id: MEMBER,
        distance_km: 5,
        logged_at: format(addDays(monday, i), 'yyyy-MM-dd'),
      })
    }
  }
  return logs
}

// Fixed "today": Wednesday 2026-08-12 → week 2026-08-10 ~ 2026-08-16
const AS_OF = new Date('2026-08-12T12:00:00+09:00')
const current = getCurrentWeekRange(AS_OF)
assert.equal(current.start, '2026-08-10')
assert.equal(current.end, '2026-08-16')

const w0 = current
const w1 = shiftWeekRange(current, -1)
const w2 = shiftWeekRange(current, -2)
const w3 = shiftWeekRange(current, -3)
const w4 = shiftWeekRange(current, -4)

assert.equal(w1.start, '2026-08-03')
assert.equal(w2.start, '2026-07-27')

// CASE 1
{
  const status = calculateRunningStreak({
    memberId: MEMBER,
    logs: logsForWeeks([
      { start: w3.start, count: 3 },
      { start: w2.start, count: 3 },
      { start: w1.start, count: 3 },
    ]),
    weeklyTarget: TARGET,
    recognition: null,
    asOf: AS_OF,
  })
  assert.equal(status.currentWeekRuns, 0)
  assert.equal(status.currentStreak, 3)
  assert.equal(status.currentWeekCompleted, false)
}

// CASE 2
{
  const status = calculateRunningStreak({
    memberId: MEMBER,
    logs: logsForWeeks([
      { start: w3.start, count: 3 },
      { start: w2.start, count: 3 },
      { start: w1.start, count: 3 },
      { start: w0.start, count: 2 },
    ]),
    weeklyTarget: TARGET,
    recognition: null,
    asOf: AS_OF,
  })
  assert.equal(status.currentWeekRuns, 2)
  assert.equal(status.currentStreak, 3)
  assert.equal(status.remainingRuns, 1)
  assert.match(status.hint, /1회 더/)
}

// CASE 3
{
  const status = calculateRunningStreak({
    memberId: MEMBER,
    logs: logsForWeeks([
      { start: w3.start, count: 3 },
      { start: w2.start, count: 3 },
      { start: w1.start, count: 3 },
      { start: w0.start, count: 3 },
    ]),
    weeklyTarget: TARGET,
    recognition: null,
    asOf: AS_OF,
  })
  assert.equal(status.currentStreak, 4)
  assert.equal(status.currentWeekCompleted, true)
  assert.match(status.hint, /STREAK 확보/)
}

// CASE 4
{
  const status = calculateRunningStreak({
    memberId: MEMBER,
    logs: logsForWeeks([
      { start: w2.start, count: 3 },
      { start: w1.start, count: 1 },
      { start: w0.start, count: 3 },
    ]),
    weeklyTarget: TARGET,
    recognition: null,
    asOf: AS_OF,
  })
  assert.equal(status.currentStreak, 1)
}

// CASE 5: best = 3
{
  const weeks = [
    shiftWeekRange(current, -7),
    shiftWeekRange(current, -6),
    shiftWeekRange(current, -5),
    shiftWeekRange(current, -4),
    shiftWeekRange(current, -3),
    shiftWeekRange(current, -2),
    shiftWeekRange(current, -1),
  ]
  const counts = [3, 3, 1, 3, 3, 3, 1]
  const status = calculateRunningStreak({
    memberId: MEMBER,
    logs: logsForWeeks(weeks.map((w, i) => ({ start: w.start, count: counts[i] }))),
    weeklyTarget: TARGET,
    recognition: null,
    asOf: AS_OF,
  })
  assert.equal(status.bestStreak, 3)
  assert.equal(status.currentStreak, 0)
}

// CASE 6
{
  const status = calculateRunningStreak({
    memberId: MEMBER,
    logs: [],
    weeklyTarget: TARGET,
    recognition: null,
    asOf: AS_OF,
  })
  assert.equal(status.currentStreak, 0)
  assert.equal(status.bestStreak, 0)
  assert.equal(status.currentWeekRuns, 0)
}

// CASE 7
{
  const status = calculateRunningStreak({
    memberId: MEMBER,
    logs: [
      ...logsForWeeks([{ start: w1.start, count: 3 }]),
      { member_id: MEMBER, distance_km: 10, logged_at: '2026-08-20' },
      { member_id: MEMBER, distance_km: 10, logged_at: '2026-08-21' },
      { member_id: MEMBER, distance_km: 10, logged_at: '2026-08-22' },
    ],
    weeklyTarget: TARGET,
    recognition: null,
    asOf: AS_OF,
  })
  assert.equal(status.currentWeekRuns, 0)
  assert.equal(status.currentStreak, 1)
}

// CASE 8
{
  const sun = getWeekRangeForDateKey('2026-08-16')
  assert.equal(sun.start, '2026-08-10')
  assert.equal(sun.end, '2026-08-16')
}

// CASE 9
{
  const mon = getWeekRangeForDateKey('2026-08-17')
  assert.equal(mon.start, '2026-08-17')
  assert.equal(mon.end, '2026-08-23')
}

// CASE 10: over target 5/3 (all logs on/before asOf)
{
  const status = calculateRunningStreak({
    memberId: MEMBER,
    logs: [
      { member_id: MEMBER, distance_km: 5, logged_at: '2026-08-10' },
      { member_id: MEMBER, distance_km: 5, logged_at: '2026-08-10' },
      { member_id: MEMBER, distance_km: 5, logged_at: '2026-08-11' },
      { member_id: MEMBER, distance_km: 5, logged_at: '2026-08-11' },
      { member_id: MEMBER, distance_km: 5, logged_at: '2026-08-12' },
    ],
    weeklyTarget: TARGET,
    recognition: null,
    asOf: AS_OF,
  })
  assert.equal(status.currentWeekRuns, 5)
  assert.equal(status.currentWeekCompleted, true)
  assert.equal(status.progressPercent, 100)
  assert.equal(status.currentStreak, 1)
}

// unused w4 reference silence
assert.ok(w4.start)

console.log('[verify-running-streak] OK')
