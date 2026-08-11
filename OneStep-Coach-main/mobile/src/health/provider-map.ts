import type { ActivitySyncProvider } from '@/src/health/types'

export function resolveHealthProviderForOs(
  os: string,
): ActivitySyncProvider | null {
  if (os === 'ios') return 'APPLE_HEALTH'
  if (os === 'android') return 'HEALTH_CONNECT'
  return null
}

export function healthProviderLabel(provider: ActivitySyncProvider | null): string {
  switch (provider) {
    case 'APPLE_HEALTH':
      return 'Apple 건강'
    case 'HEALTH_CONNECT':
      return 'Health Connect'
    case 'DIRECT_GARMIN':
      return 'Garmin (직접)'
    default:
      return '지원되지 않음'
  }
}
