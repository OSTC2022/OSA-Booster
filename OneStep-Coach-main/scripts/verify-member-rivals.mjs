import assert from 'node:assert/strict'
import {
  buildRivalComparison,
  getRecommendedRivals,
  RIVAL_DISTANCE_INCREMENT_KM,
} from '../lib/running-league/member-rivals.ts'

const period = '2026년 8월'

// CASE 1 behind
{
  const c = buildRivalComparison({
    user: { memberId: 'me', memberName: '나', mileageKm: 10, rank: 5 },
    rival: { memberId: 'r', memberName: '라이벌', mileageKm: 15, rank: 3 },
    periodLabel: period,
  })
  assert.equal(c.status, 'behind')
  assert.equal(c.differenceKm, 5)
  assert.equal(c.distanceToTieKm, 5)
  assert.equal(c.distanceToPassKm, 5.1)
  assert.match(c.hint, /추월/)
}

// CASE 2 ahead
{
  const c = buildRivalComparison({
    user: { memberId: 'me', memberName: '나', mileageKm: 15, rank: 3 },
    rival: { memberId: 'r', memberName: '라이벌', mileageKm: 10, rank: 5 },
    periodLabel: period,
  })
  assert.equal(c.status, 'ahead')
  assert.equal(c.differenceKm, 5)
  assert.match(c.hint, /앞서/)
}

// CASE 3 tied
{
  const c = buildRivalComparison({
    user: { memberId: 'me', memberName: '나', mileageKm: 10, rank: 4 },
    rival: { memberId: 'r', memberName: '라이벌', mileageKm: 10, rank: 4 },
    periodLabel: period,
  })
  assert.equal(c.status, 'tied')
  assert.match(c.hint, /동점/)
}

// CASE 4 both empty
{
  const c = buildRivalComparison({
    user: { memberId: 'me', memberName: '나', mileageKm: 0, rank: null },
    rival: { memberId: 'r', memberName: '라이벌', mileageKm: 0, rank: null },
    periodLabel: period,
  })
  assert.equal(c.status, 'both_empty')
  assert.match(c.hint, /기록이 없습니다/)
}

// CASE 5 rounding / pass distance
{
  const c = buildRivalComparison({
    user: { memberId: 'me', memberName: '나', mileageKm: 10, rank: 5 },
    rival: { memberId: 'r', memberName: '라이벌', mileageKm: 10.1, rank: 4 },
    periodLabel: period,
  })
  assert.equal(c.status, 'behind')
  assert.equal(c.differenceKm, 0.1)
  assert.equal(c.distanceToPassKm, 0.2)
  assert.equal(RIVAL_DISTANCE_INCREMENT_KM, 0.1)
}

// CASE recommend order
{
  const rec = getRecommendedRivals(
    [
      { memberId: 'me', memberName: '나', mileageKm: 40, rank: 5 },
      { memberId: 'a', memberName: 'A', mileageKm: 40.5, rank: 4 },
      { memberId: 'b', memberName: 'B', mileageKm: 42, rank: 3 },
      { memberId: 'c', memberName: 'C', mileageKm: 30, rank: 8 },
      { memberId: 'd', memberName: 'D', mileageKm: 39, rank: 6 },
    ],
    'me',
    3,
  )
  assert.equal(rec[0].memberId, 'a')
  assert.equal(rec[1].memberId, 'd')
  assert.equal(rec[2].memberId, 'b')
  assert.ok(!rec.some((r) => r.memberId === 'me'))
}

// empty month no force recommend
{
  const rec = getRecommendedRivals(
    [
      { memberId: 'me', memberName: '나', mileageKm: 0, rank: null },
      { memberId: 'a', memberName: 'A', mileageKm: 0, rank: null },
    ],
    'me',
    3,
  )
  assert.equal(rec.length, 0)
}

console.log('[verify-member-rivals] OK')
