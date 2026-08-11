import { Platform } from 'react-native'
import {
  healthProviderLabel,
  resolveHealthProviderForOs,
} from '@/src/health/provider-map'
import { isExpoGoRuntime } from '@/src/health/runtime'
import {
  NoopHealthBridge,
  type HealthBridge,
  type HealthBridgeAvailability,
  type HealthUiStatus,
} from '@/src/health/types'

export { healthProviderLabel, resolveHealthProviderForOs }

class PlatformHealthBridge implements HealthBridge {
  readonly provider: ReturnType<typeof resolveHealthProviderForOs>

  constructor(os: typeof Platform.OS) {
    this.provider = resolveHealthProviderForOs(os)
  }

  async getAvailability(): Promise<HealthBridgeAvailability> {
    if (!this.provider) return 'UNSUPPORTED'
    if (isExpoGoRuntime()) return 'EXPO_GO'
    try {
      const { getHealthAvailability } = await import('@/src/health/readRunning')
      const result = await getHealthAvailability()
      if (result.ok) return 'AVAILABLE'
      if (result.code === 'EXPO_GO') return 'EXPO_GO'
      if (result.code === 'UNSUPPORTED') return 'UNSUPPORTED'
      return 'UNAVAILABLE'
    } catch {
      return 'UNAVAILABLE'
    }
  }

  async getUiStatus(): Promise<HealthUiStatus> {
    if (!this.provider) return 'UNSUPPORTED'
    if (isExpoGoRuntime()) return 'UNSUPPORTED'
    try {
      const { getHealthAvailability, hasHealthReadPermission } = await import(
        '@/src/health/readRunning'
      )
      const availability = await getHealthAvailability()
      if (!availability.ok) {
        if (availability.code === 'UNSUPPORTED' || availability.code === 'EXPO_GO') {
          return 'UNSUPPORTED'
        }
        return 'ERROR'
      }
      const permitted = await hasHealthReadPermission()
      return permitted ? 'CONNECTED' : 'NOT_CONNECTED'
    } catch {
      return 'ERROR'
    }
  }
}

export function createPlatformHealthBridge(
  os: typeof Platform.OS = Platform.OS,
): HealthBridge {
  if (os !== 'ios' && os !== 'android') {
    return new NoopHealthBridge(null)
  }
  return new PlatformHealthBridge(os)
}
