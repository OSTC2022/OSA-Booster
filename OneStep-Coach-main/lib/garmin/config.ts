/** Garmin pairing / sync configuration (single source). */

export const GARMIN_PROVIDER = 'GARMIN' as const

/** Pairing session TTL */
export const GARMIN_PAIRING_SESSION_TTL_MINUTES = Number(
  process.env.GARMIN_PAIRING_SESSION_TTL_MINUTES || '10',
)

/** Failed claim attempts before session invalidate */
export const GARMIN_PAIRING_MAX_FAILED_ATTEMPTS = Number(
  process.env.GARMIN_PAIRING_MAX_FAILED_ATTEMPTS || '8',
)

/** Manual sync cooldown (seconds). Prefer GARMIN_MANUAL_SYNC_COOLDOWN_MINUTES. */
export const GARMIN_MANUAL_SYNC_COOLDOWN_SECONDS = Number(
  process.env.GARMIN_MANUAL_SYNC_COOLDOWN_MINUTES
    ? Number(process.env.GARMIN_MANUAL_SYNC_COOLDOWN_MINUTES) * 60
    : process.env.GARMIN_MANUAL_SYNC_COOLDOWN_SECONDS || '300',
)

/** UI poll interval hint (ms) */
export const GARMIN_PAIRING_POLL_INTERVAL_MS = 2500

export type GarminConnectionStatus =
  | 'CONNECTED'
  | 'REAUTH_REQUIRED'
  | 'ERROR'
  | 'DISCONNECTED'

export type GarminPairingSessionStatus =
  | 'PENDING'
  | 'CLAIMED'
  | 'AUTHENTICATING'
  | 'COMPLETED'
  | 'EXPIRED'
  | 'FAILED'
  | 'CANCELLED'
