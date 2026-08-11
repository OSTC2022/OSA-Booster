/** Shared provider vocabulary (G0). DIRECT_GARMIN is web/worker — not mobile Health Bridge. */
export type ActivitySyncProvider =
  | 'DIRECT_GARMIN'
  | 'APPLE_HEALTH'
  | 'HEALTH_CONNECT'

export type HealthUiStatus =
  | 'NOT_CONNECTED'
  | 'PERMISSION_REQUIRED'
  | 'CONNECTED'
  | 'SYNCING'
  | 'ERROR'
  | 'UNSUPPORTED'

export type HealthBridgeAvailability =
  | 'AVAILABLE'
  | 'UNSUPPORTED'
  | 'UNAVAILABLE'
  | 'EXPO_GO'
  | 'NOT_IMPLEMENTED'

/**
 * Thin availability/status facade. Running reads live in readRunning.ts (G2).
 */
export interface HealthBridge {
  readonly provider: ActivitySyncProvider | null
  getAvailability(): Promise<HealthBridgeAvailability>
  getUiStatus(): Promise<HealthUiStatus>
}

export class NoopHealthBridge implements HealthBridge {
  readonly provider: ActivitySyncProvider | null

  constructor(provider: ActivitySyncProvider | null) {
    this.provider = provider
  }

  async getAvailability(): Promise<HealthBridgeAvailability> {
    if (!this.provider) return 'UNSUPPORTED'
    return 'UNSUPPORTED'
  }

  async getUiStatus(): Promise<HealthUiStatus> {
    if (!this.provider) return 'UNSUPPORTED'
    return 'UNSUPPORTED'
  }
}
