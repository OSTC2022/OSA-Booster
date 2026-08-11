import {
  HEALTH_SOURCE_APPS,
  type HealthSourceApp,
} from '@/lib/health-bridge/constants'

export type HealthImportActivityInput = {
  provider?: string
  externalActivityId?: string
  activityType?: string
  startedAt?: string
  endedAt?: string
  durationSeconds?: number
  distanceKm?: number
  sourceOrigin?: string | null
  /** Ignored — never trusted. */
  memberId?: unknown
  member_id?: unknown
}

export type ValidatedHealthActivity = {
  provider: HealthSourceApp
  externalActivityId: string
  startedAt: Date
  endedAt: Date
  durationSeconds: number
  distanceKm: number
  sourceOrigin: string | null
}

export type ValidationFailure = {
  status: 'INVALID'
  code: string
  message: string
}

const MAX_FUTURE_MS = 24 * 60 * 60 * 1000
const MAX_DURATION_SECONDS = 24 * 60 * 60
const MAX_DISTANCE_KM = 500

export function isHealthSourceApp(value: string): value is HealthSourceApp {
  return (HEALTH_SOURCE_APPS as readonly string[]).includes(value)
}

export function validateHealthImportActivity(
  raw: HealthImportActivityInput,
): { ok: true; activity: ValidatedHealthActivity } | { ok: false; failure: ValidationFailure } {
  const provider = String(raw.provider || '').trim().toUpperCase()
  if (!isHealthSourceApp(provider)) {
    return {
      ok: false,
      failure: {
        status: 'INVALID',
        code: 'INVALID_PROVIDER',
        message: '지원하지 않는 provider입니다.',
      },
    }
  }

  const externalActivityId = String(raw.externalActivityId || '').trim()
  if (!externalActivityId || externalActivityId.length > 200) {
    return {
      ok: false,
      failure: {
        status: 'INVALID',
        code: 'MISSING_EXTERNAL_ID',
        message: 'externalActivityId가 필요합니다.',
      },
    }
  }

  const activityType = String(raw.activityType || '')
    .trim()
    .toLowerCase()
  if (activityType !== 'running') {
    return {
      ok: false,
      failure: {
        status: 'INVALID',
        code: 'NOT_RUNNING',
        message: '러닝 기록만 등록할 수 있습니다.',
      },
    }
  }

  const distanceKm = Number(raw.distanceKm)
  if (!Number.isFinite(distanceKm) || distanceKm <= 0 || distanceKm > MAX_DISTANCE_KM) {
    return {
      ok: false,
      failure: {
        status: 'INVALID',
        code: 'INVALID_DISTANCE',
        message: '거리 값이 올바르지 않습니다.',
      },
    }
  }

  const startedAt = new Date(String(raw.startedAt || ''))
  if (Number.isNaN(startedAt.getTime())) {
    return {
      ok: false,
      failure: {
        status: 'INVALID',
        code: 'INVALID_STARTED_AT',
        message: '시작 시간이 올바르지 않습니다.',
      },
    }
  }

  const now = Date.now()
  if (startedAt.getTime() > now + MAX_FUTURE_MS) {
    return {
      ok: false,
      failure: {
        status: 'INVALID',
        code: 'FUTURE_TIMESTAMP',
        message: '시작 시간이 올바르지 않습니다.',
      },
    }
  }

  let endedAt = raw.endedAt ? new Date(String(raw.endedAt)) : null
  if (endedAt && Number.isNaN(endedAt.getTime())) endedAt = null

  let durationSeconds = Number(raw.durationSeconds)
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    if (endedAt) {
      durationSeconds = Math.round((endedAt.getTime() - startedAt.getTime()) / 1000)
    } else {
      return {
        ok: false,
        failure: {
          status: 'INVALID',
          code: 'INVALID_DURATION',
          message: '운동 시간이 올바르지 않습니다.',
        },
      }
    }
  }

  if (durationSeconds <= 0 || durationSeconds > MAX_DURATION_SECONDS) {
    return {
      ok: false,
      failure: {
        status: 'INVALID',
        code: 'INVALID_DURATION',
        message: '운동 시간이 올바르지 않습니다.',
      },
    }
  }

  if (!endedAt) {
    endedAt = new Date(startedAt.getTime() + durationSeconds * 1000)
  }

  let sourceOrigin: string | null = null
  if (typeof raw.sourceOrigin === 'string') {
    const trimmed = raw.sourceOrigin.trim().slice(0, 120)
    sourceOrigin = trimmed || null
  }

  return {
    ok: true,
    activity: {
      provider,
      externalActivityId,
      startedAt,
      endedAt,
      durationSeconds,
      distanceKm,
      sourceOrigin,
    },
  }
}
