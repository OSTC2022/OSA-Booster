import assert from 'node:assert/strict'
import {
  buildMyRunningStatusView,
  formatProjectedRankHint,
  projectMileageRankWithExtraKm,
} from '../lib/running-league/my-running-status.ts'

const ranked = [
  { participantId: '1', memberId: 'a', memberName: 'A', mileageKm: 20, rank: 1 },
  { participantId: '2', memberId: 'b', memberName: 'B', mileageKm: 19.2, rank: 2 },
  { participantId: '3', memberId: 'c', memberName: '이교직', mileageKm: 18.2, rank: 3 },
]

assert.equal(projectMileageRankWithExtraKm(ranked, 'c', 5), 1)

const view = buildMyRunningStatusView({
  memberId: 'c',
  memberName: '이교직',
  mileageLeaderboard: { ranked, unranked: [] },
  mileageLogs: [
    { id: '1', member_id: 'c', distance_km: 5, logged_at: '2026-08-01T00:00:00Z' },
    { id: '2', member_id: 'c', distance_km: 6, logged_at: '2026-08-02T00:00:00Z' },
    { id: '3', member_id: 'c', distance_km: 7.2, logged_at: '2026-08-03T00:00:00Z' },
  ],
  rankingPeriod: {
    start: '2026-08-01',
    end: '2026-08-31',
    label: '2026년 8월',
    shortLabel: '2026년 8월',
    isCustom: false,
    resetHint: '',
  },
  mileageRecognition: null,
})

assert.ok(view)
assert.equal(view.gapToNextKm, 1)
assert.equal(view.gapToNextLabel, '1.0km')
assert.equal(view.rank, 3)
assert.equal(view.runCount, 3)
assert.equal(view.projectedRankWithExtraKm, 1)
assert.match(formatProjectedRankHint(view) ?? '', /예상 1위/)

const empty = buildMyRunningStatusView({
  memberId: 'z',
  memberName: '신규',
  mileageLeaderboard: { ranked, unranked: [{ participantId: '9', memberId: 'z', memberName: '신규' }] },
  mileageLogs: [],
  rankingPeriod: {
    start: '2026-08-01',
    end: '2026-08-31',
    label: '2026년 8월',
    shortLabel: '2026년 8월',
    isCustom: false,
    resetHint: '',
  },
})
assert.ok(empty)
assert.equal(empty.rank, null)
assert.equal(empty.monthlyKm, 0)
assert.equal(empty.hasMonthlyDistance, false)

const first = buildMyRunningStatusView({
  memberId: 'a',
  memberName: 'A',
  mileageLeaderboard: { ranked, unranked: [] },
  mileageLogs: [{ id: '9', member_id: 'a', distance_km: 20, logged_at: '2026-08-01T00:00:00Z' }],
  rankingPeriod: {
    start: '2026-08-01',
    end: '2026-08-31',
    label: '2026년 8월',
    shortLabel: '2026년 8월',
    isCustom: false,
    resetHint: '',
  },
})
assert.ok(first)
assert.equal(first.isFirstPlace, true)
assert.equal(first.gapToNextKm, null)

console.log('[verify-my-running-status] OK')
