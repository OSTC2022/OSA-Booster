import assert from 'node:assert/strict'
import {
  MVP_GROWTH_CONFIG,
  buildMvpHomeView,
  collectPbImprovementsInRange,
  getMvpMonthRange,
  getPreviousMonthRange,
  rankAttendanceCandidates,
  rankConsistencyCandidates,
  rankDistanceCandidates,
  rankGrowthCandidates,
  rankPbCandidates,
  summarizeMvpWinnersLabel,
} from '../lib/running-league/mvp.ts'

const members = [
  { memberId: 'a', memberName: '김OO' },
  { memberId: 'b', memberName: '박OO' },
  { memberId: 'c', memberName: '이OO' },
]

// month helpers
{
  const month = getMvpMonthRange(new Date('2026-08-10T12:00:00+09:00'))
  assert.equal(month.start, '2026-08-01')
  assert.equal(month.end, '2026-08-31')
  const prev = getPreviousMonthRange(month.start)
  assert.equal(prev.start, '2026-07-01')
  assert.equal(prev.end, '2026-07-31')
}

// distance — zero activity → no winner
{
  const ranked = rankDistanceCandidates({
    members,
    logs: [],
    start: '2026-08-10',
    end: '2026-08-16',
  })
  assert.equal(ranked.length, 0)
}

// distance winner + co-winners
{
  const ranked = rankDistanceCandidates({
    members,
    logs: [
      { member_id: 'a', distance_km: 20, logged_at: '2026-08-11' },
      { member_id: 'b', distance_km: 20, logged_at: '2026-08-12' },
      { member_id: 'c', distance_km: 10, logged_at: '2026-08-12' },
    ],
    start: '2026-08-10',
    end: '2026-08-16',
  })
  assert.equal(ranked[0].score, 20)
  assert.equal(ranked.filter((r) => r.score === 20).length, 2)
  assert.match(summarizeMvpWinnersLabel(ranked.filter((r) => r.score === 20)), /김OO|박OO/)
}

// attendance unique days
{
  const ranked = rankAttendanceCandidates({
    members,
    logs: [
      { member_id: 'a', distance_km: 1, logged_at: '2026-08-11' },
      { member_id: 'a', distance_km: 1, logged_at: '2026-08-11' },
      { member_id: 'b', distance_km: 1, logged_at: '2026-08-11' },
      { member_id: 'b', distance_km: 1, logged_at: '2026-08-12' },
      { member_id: 'b', distance_km: 1, logged_at: '2026-08-13' },
    ],
    start: '2026-08-10',
    end: '2026-08-16',
  })
  assert.equal(ranked[0].memberId, 'b')
  assert.equal(ranked[0].score, 3)
}

// growth min baseline
{
  assert.equal(MVP_GROWTH_CONFIG.weeklyMinimumBaselineKm, 5)
  const ranked = rankGrowthCandidates({
    members,
    logs: [
      { member_id: 'a', distance_km: 0.1, logged_at: '2026-08-04' },
      { member_id: 'a', distance_km: 10, logged_at: '2026-08-11' },
      { member_id: 'b', distance_km: 10, logged_at: '2026-08-04' },
      { member_id: 'b', distance_km: 15, logged_at: '2026-08-11' },
    ],
    currentStart: '2026-08-10',
    currentEnd: '2026-08-16',
    previousStart: '2026-08-03',
    previousEnd: '2026-08-09',
    period: 'weekly',
  })
  // a excluded (prev 0.1 < 5), b included (+50%)
  assert.equal(ranked.length, 1)
  assert.equal(ranked[0].memberId, 'b')
  assert.equal(ranked[0].score, 50)
}

// PB improvements
{
  const improvements = collectPbImprovementsInRange({
    start: '2026-08-01',
    end: '2026-08-31',
    records: [
      {
        member_id: 'a',
        distance_event: '10km',
        measured_at: '2026-07-01',
        time_seconds: 2500,
        record_phase: 'pb_history',
      },
      {
        member_id: 'a',
        distance_event: '10km',
        measured_at: '2026-08-12',
        time_seconds: 2400,
        record_phase: 'other',
      },
      {
        member_id: 'b',
        distance_event: '5km',
        measured_at: '2026-08-10',
        time_seconds: 1200,
        record_phase: 'other',
      },
    ],
  })
  assert.equal(improvements.length, 1)
  assert.equal(improvements[0].memberId, 'a')
  assert.equal(improvements[0].deltaSeconds, 100)

  const pb = rankPbCandidates({
    members,
    records: [
      {
        member_id: 'a',
        distance_event: '10km',
        measured_at: '2026-07-01',
        time_seconds: 2500,
      },
      {
        member_id: 'a',
        distance_event: '10km',
        measured_at: '2026-08-12',
        time_seconds: 2400,
      },
    ],
    start: '2026-08-01',
    end: '2026-08-31',
    pbHistoryAvailable: true,
  })
  assert.equal(pb.available, true)
  assert.equal(pb.ranked[0].memberId, 'a')
  assert.match(pb.ranked[0].valueLabel, /10K/)

  const unavailable = rankPbCandidates({
    members,
    records: [],
    start: '2026-08-01',
    end: '2026-08-31',
    pbHistoryAvailable: false,
  })
  assert.equal(unavailable.available, false)
}

// consistency uses streak
{
  const logs = []
  // member a: 3 weeks of 3 runs each before current incomplete week
  for (const weekStart of ['2026-07-20', '2026-07-27', '2026-08-03']) {
    for (let d = 0; d < 3; d += 1) {
      const day = String(Number(weekStart.slice(8, 10)) + d).padStart(2, '0')
      logs.push({
        member_id: 'a',
        distance_km: 5,
        logged_at: `${weekStart.slice(0, 8)}${day}`,
      })
    }
  }
  const ranked = rankConsistencyCandidates({
    members,
    logs,
    periodStart: '2026-08-10',
    periodEnd: '2026-08-16',
    asOf: new Date('2026-08-12T12:00:00+09:00'),
  })
  assert.ok(ranked[0].score > 0)
  assert.equal(ranked[0].memberId, 'a')
}

// full board builds my titles
{
  const view = buildMvpHomeView({
    members,
    logs: [
      { member_id: 'a', distance_km: 30, logged_at: '2026-08-11' },
      { member_id: 'b', distance_km: 5, logged_at: '2026-08-11' },
    ],
    pbRecords: [],
    pbHistoryAvailable: true,
    viewerMemberId: 'a',
    asOf: new Date('2026-08-12T12:00:00+09:00'),
  })
  assert.ok(view.weekly.categories.length === 5)
  assert.ok(view.weekly.myTitles.some((t) => t.includes('거리왕')))
  assert.equal(view.weekly.provisional, true)
}

console.log('verify-mvp: PASS')
