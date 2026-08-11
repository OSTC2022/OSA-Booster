import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  formatDistanceKm,
  formatDuration,
  formatWorkoutDate,
  metersToKm,
  quantityToKm,
} from '../health/format'
import {
  healthProviderLabel,
  resolveHealthProviderForOs,
} from '../health/provider-map'
import { NoopHealthBridge } from '../health/types'
import { maskId } from '../lib/mask'

describe('platform health provider', () => {
  it('maps ios to APPLE_HEALTH', () => {
    assert.equal(resolveHealthProviderForOs('ios'), 'APPLE_HEALTH')
    assert.equal(healthProviderLabel('APPLE_HEALTH'), 'Apple 건강')
  })

  it('maps android to HEALTH_CONNECT', () => {
    assert.equal(resolveHealthProviderForOs('android'), 'HEALTH_CONNECT')
    assert.equal(healthProviderLabel('HEALTH_CONNECT'), 'Health Connect')
  })

  it('marks web unsupported', () => {
    assert.equal(resolveHealthProviderForOs('web'), null)
  })
})

describe('noop health bridge', () => {
  it('reports unsupported outside native wiring', async () => {
    const bridge = new NoopHealthBridge('APPLE_HEALTH')
    assert.equal(await bridge.getAvailability(), 'UNSUPPORTED')
    assert.equal(await bridge.getUiStatus(), 'UNSUPPORTED')
  })
})

describe('distance / duration format', () => {
  it('converts meters and quantities to km', () => {
    assert.equal(metersToKm(5020), 5.02)
    assert.equal(quantityToKm(5.02, 'km'), 5.02)
    assert.equal(quantityToKm(5020, 'm'), 5.02)
    assert.ok(Math.abs(quantityToKm(1, 'mi') - 1.609344) < 1e-9)
  })

  it('formats display values without mutating precision of source number', () => {
    assert.equal(formatDistanceKm(4.1298), '4.13 km')
    assert.equal(formatDistanceKm(5.02), '5.02 km')
    assert.equal(formatDuration(1651), '27:31')
    assert.equal(formatDuration(2342), '39:02')
    assert.equal(formatDuration(3661), '1:01:01')
  })

  it('formats workout dates as M/D', () => {
    const local = new Date(2026, 7, 10, 12, 0, 0)
    assert.equal(formatWorkoutDate(local.toISOString()), '8/10')
  })
})

describe('health sync lock', () => {
  it('prevents overlapping exclusive syncs', async () => {
    const {
      resetHealthSyncSession,
      runExclusiveHealthSync,
      isHealthSyncLocked,
    } = await import('../health/syncSession')
    resetHealthSyncSession()

    let startedSecond = false
    const first = runExclusiveHealthSync(async () => {
      assert.equal(isHealthSyncLocked(), true)
      const second = await runExclusiveHealthSync(async () => {
        startedSecond = true
      })
      assert.equal(second.started, false)
    })
    await first
    assert.equal(startedSecond, false)
    assert.equal(isHealthSyncLocked(), false)
  })
})

describe('maskId', () => {
  it('masks stable ids', () => {
    assert.equal(maskId('abcdefghijklmnop'), 'abcd…mnop')
  })
})
