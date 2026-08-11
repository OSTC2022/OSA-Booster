import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { findDuplicateCandidate, distanceThresholdKm } from '../duplicate'
import { formatMileageDuration, getKstActivityTime, getKstDateKey } from '../kst'
import { validateHealthImportActivity } from '../validate'

describe('health import validation', () => {
  const base = {
    provider: 'APPLE_HEALTH',
    externalActivityId: 'uuid-1',
    activityType: 'running',
    startedAt: '2026-08-10T08:10:00+09:00',
    endedAt: '2026-08-10T08:37:31+09:00',
    durationSeconds: 1651,
    distanceKm: 5.02,
    sourceOrigin: 'Garmin Connect',
  }

  it('accepts valid running payload', () => {
    const result = validateHealthImportActivity(base)
    assert.equal(result.ok, true)
    if (result.ok) {
      assert.equal(result.activity.provider, 'APPLE_HEALTH')
      assert.equal(result.activity.externalActivityId, 'uuid-1')
      assert.equal(result.activity.distanceKm, 5.02)
    }
  })

  it('rejects invalid provider', () => {
    const result = validateHealthImportActivity({ ...base, provider: 'GARMIN_FAKE' })
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.failure.code, 'INVALID_PROVIDER')
  })

  it('rejects non-running', () => {
    const result = validateHealthImportActivity({ ...base, activityType: 'walking' })
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.failure.code, 'NOT_RUNNING')
  })

  it('rejects invalid distance', () => {
    for (const distanceKm of [-5, 0, Number.NaN, Number.POSITIVE_INFINITY]) {
      const result = validateHealthImportActivity({ ...base, distanceKm })
      assert.equal(result.ok, false)
      if (!result.ok) assert.equal(result.failure.code, 'INVALID_DISTANCE')
    }
  })

  it('rejects missing external id', () => {
    const result = validateHealthImportActivity({ ...base, externalActivityId: '' })
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.failure.code, 'MISSING_EXTERNAL_ID')
  })

  it('ignores client member_id fields (still validates activity)', () => {
    const result = validateHealthImportActivity({
      ...base,
      memberId: 'attacker-b',
      member_id: 'attacker-b',
    })
    assert.equal(result.ok, true)
  })
})

describe('health duplicate candidate', () => {
  it('uses garmin-compatible distance threshold', () => {
    assert.equal(distanceThresholdKm(5.02), Math.max(0.3, 5.02 * 0.05))
  })

  it('flags near same-day garmin row as candidate', () => {
    const hit = findDuplicateCandidate({
      distanceKm: 5.02,
      loggedAt: '2026-08-10',
      activityTime: '07:01:00',
      sourceApp: 'APPLE_HEALTH',
      externalActivityId: 'health-1',
      existingLogs: [
        {
          id: 'g1',
          distance_km: 5.02,
          logged_at: '2026-08-10',
          activity_time: '07:01:00',
          source_app: 'GARMIN',
          external_activity_id: 'garmin-99',
        },
      ],
    })
    assert.ok(hit)
    assert.equal(hit?.existingLogId, 'g1')
    assert.equal(hit?.confidence, 'HIGH')
  })

  it('skips exact same provider external id', () => {
    const hit = findDuplicateCandidate({
      distanceKm: 5.02,
      loggedAt: '2026-08-10',
      activityTime: '07:01:00',
      sourceApp: 'APPLE_HEALTH',
      externalActivityId: 'health-1',
      existingLogs: [
        {
          id: 'a1',
          distance_km: 5.02,
          logged_at: '2026-08-10',
          activity_time: '07:01:00',
          source_app: 'APPLE_HEALTH',
          external_activity_id: 'health-1',
        },
      ],
    })
    assert.equal(hit, null)
  })
})

describe('kst mileage mapping', () => {
  it('formats duration like garmin worker', () => {
    assert.equal(formatMileageDuration(1651), '27:31')
    assert.equal(formatMileageDuration(3661), '01:01:01')
  })

  it('maps evening KST start without UTC day shift', () => {
    // 2026-08-10 00:30 KST = 2026-08-09 15:30 UTC
    const d = new Date('2026-08-09T15:30:00.000Z')
    assert.equal(getKstDateKey(d), '2026-08-10')
    assert.equal(getKstActivityTime(d), '00:30:00')
  })
})
