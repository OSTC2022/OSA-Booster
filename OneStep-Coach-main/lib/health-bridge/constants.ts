/** Health Bridge G3 — shared constants (mirror garmin-worker duplicate thresholds). */

export const HEALTH_SOURCE_APPS = ['APPLE_HEALTH', 'HEALTH_CONNECT'] as const
export type HealthSourceApp = (typeof HEALTH_SOURCE_APPS)[number]

export const PREFERRED_SYNC_PROVIDERS = [
  'DIRECT_GARMIN',
  'APPLE_HEALTH',
  'HEALTH_CONNECT',
] as const
export type PreferredSyncProvider = (typeof PREFERRED_SYNC_PROVIDERS)[number]

/** Reuse Garmin worker duplicate window (duplicate.py). */
export const DUPLICATE_TIME_WINDOW_MINUTES = 30
export const DUPLICATE_DISTANCE_ABSOLUTE_KM = 0.3
export const DUPLICATE_DISTANCE_PERCENT = 0.05

export const MAX_HEALTH_IMPORT_BATCH = 50

export const GARMIN_SOURCE_APP = 'GARMIN'
