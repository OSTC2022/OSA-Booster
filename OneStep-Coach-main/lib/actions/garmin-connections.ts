'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin'
import { getMemberForCurrentUser } from '@/lib/actions/auth'
import {
  GARMIN_MANUAL_SYNC_COOLDOWN_SECONDS,
  GARMIN_PAIRING_POLL_INTERVAL_MS,
  GARMIN_PAIRING_SESSION_TTL_MINUTES,
  GARMIN_PROVIDER,
  type GarminPairingSessionStatus,
} from '@/lib/garmin/config'
import {
  generateConnectorSecret,
  generatePairingCode,
  hashSecret,
} from '@/lib/garmin/pairing-crypto'

export type ActivityConnectionStatus = {
  provider: 'GARMIN'
  status: string
  connectedAt: string | null
  lastSyncAt: string | null
  lastSuccessAt: string | null
  lastErrorCode: string | null
  lastErrorAt: string | null
  nextSyncAt: string | null
  initialSyncDone: boolean
  recentGarminKm: number | null
  recentGarminLoggedAt: string | null
  recentGarminDuration: string | null
  openDuplicateCandidates: number
  lastImportSummary: {
    status?: string
    imported?: number
    added_km?: number
  } | null
}

export type GarminPairingPublicSession = {
  sessionId: string
  status: GarminPairingSessionStatus
  pairingCode: string
  connectorSecret: string
  expiresAt: string
  pollIntervalMs: number
}

function mapSafeConnection(
  row: Record<string, unknown> | null,
  extras?: Partial<ActivityConnectionStatus>,
): ActivityConnectionStatus | null {
  if (!row) return null
  return {
    provider: 'GARMIN',
    status: String(row.status || 'DISCONNECTED'),
    connectedAt: row.connected_at ? String(row.connected_at) : null,
    lastSyncAt: row.last_sync_at ? String(row.last_sync_at) : null,
    lastSuccessAt: row.last_success_at ? String(row.last_success_at) : null,
    lastErrorCode: row.last_error_code ? String(row.last_error_code) : null,
    lastErrorAt: row.last_error_at ? String(row.last_error_at) : null,
    nextSyncAt: row.next_sync_at ? String(row.next_sync_at) : extras?.nextSyncAt ?? null,
    initialSyncDone: Boolean(row.initial_sync_done ?? extras?.initialSyncDone ?? false),
    recentGarminKm: extras?.recentGarminKm ?? null,
    recentGarminLoggedAt: extras?.recentGarminLoggedAt ?? null,
    recentGarminDuration: extras?.recentGarminDuration ?? null,
    openDuplicateCandidates: extras?.openDuplicateCandidates ?? 0,
    lastImportSummary: extras?.lastImportSummary ?? null,
  }
}

/**
 * Member-facing Garmin connection status.
 * Never returns encrypted_token / DI tokens / secrets.
 * member_id is resolved from auth — never trusted from client.
 */
export async function getMyGarminConnectionStatus(): Promise<
  { ok: true; connection: ActivityConnectionStatus | null } | { ok: false; error: string }
> {
  const member = await getMemberForCurrentUser()
  if (!member) return { ok: false, error: '로그인이 필요합니다.' }

  try {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('get_my_activity_connection_status', {
      p_provider: GARMIN_PROVIDER,
    })
    if (error) {
      if (/does not exist|schema cache/i.test(error.message)) {
        return { ok: true, connection: null }
      }
      return { ok: false, error: '연결 상태를 불러오지 못했습니다.' }
    }
    const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null

    let recent: {
      recentGarminKm: number | null
      recentGarminLoggedAt: string | null
      recentGarminDuration: string | null
    } = {
      recentGarminKm: null,
      recentGarminLoggedAt: null,
      recentGarminDuration: null,
    }
    let openDuplicateCandidates = 0

    try {
      const { data: logs } = await supabase
        .from('running_league_mileage_logs')
        .select('distance_km, logged_at, duration')
        .eq('member_id', member.id)
        .eq('source_app', GARMIN_PROVIDER)
        .order('logged_at', { ascending: false })
        .limit(1)
      const log = logs?.[0]
      if (log) {
        recent = {
          recentGarminKm: log.distance_km != null ? Number(log.distance_km) : null,
          recentGarminLoggedAt: log.logged_at ? String(log.logged_at) : null,
          recentGarminDuration: log.duration ? String(log.duration) : null,
        }
      }
    } catch {
      // soft
    }

    try {
      const { count } = await supabase
        .from('member_mileage_duplicate_candidates')
        .select('id', { count: 'exact', head: true })
        .eq('member_id', member.id)
        .eq('status', 'OPEN')
      openDuplicateCandidates = count ?? 0
    } catch {
      // soft
    }

    let lastImportSummary: ActivityConnectionStatus['lastImportSummary'] = null
    try {
      const { data: runs } = await supabase
        .from('garmin_sync_runs')
        .select('status, imported_count, added_distance_km')
        .eq('member_id', member.id)
        .in('status', ['SUCCESS', 'PARTIAL'])
        .order('started_at', { ascending: false })
        .limit(1)
      const run = runs?.[0]
      if (run) {
        lastImportSummary = {
          status: String(run.status),
          imported: Number(run.imported_count || 0),
          added_km: Number(run.added_distance_km || 0),
        }
      }
    } catch {
      // soft until migration
    }

    return {
      ok: true,
      connection: mapSafeConnection(row, {
        ...recent,
        openDuplicateCandidates,
        lastImportSummary,
        nextSyncAt: row?.next_sync_at ? String(row.next_sync_at) : null,
        initialSyncDone: Boolean(row?.initial_sync_done),
      }),
    }
  } catch {
    return { ok: true, connection: null }
  }
}

/**
 * Queue a manual sync for the authenticated member only.
 * Does not call Garmin from the web request — worker processes the queue.
 */
export async function requestMyGarminManualSync(): Promise<
  | { ok: true; queued: true }
  | { ok: false; error: string; cooldown?: boolean }
> {
  const member = await getMemberForCurrentUser()
  if (!member) return { ok: false, error: '로그인이 필요합니다.' }

  const supabase = await createClient()
  const { data: statusRows } = await supabase.rpc('get_my_activity_connection_status', {
    p_provider: GARMIN_PROVIDER,
  })
  const conn = (Array.isArray(statusRows) ? statusRows[0] : statusRows) as
    | { status?: string; last_sync_at?: string | null; last_success_at?: string | null }
    | null
  if (!conn || conn.status !== 'CONNECTED') {
    return { ok: false, error: 'Garmin이 연결되지 않았습니다.' }
  }

  const last = conn.last_sync_at || conn.last_success_at
  if (last) {
    const elapsedMs = Date.now() - new Date(String(last)).getTime()
    if (elapsedMs < GARMIN_MANUAL_SYNC_COOLDOWN_SECONDS * 1000) {
      return {
        ok: false,
        cooldown: true,
        error: '최근 동기화를 완료했습니다. 잠시 후 다시 시도해주세요.',
      }
    }
  }

  const { error } = await supabase.from('activity_sync_requests').insert({
    member_id: member.id,
    provider: GARMIN_PROVIDER,
    status: 'PENDING',
  })
  if (error) {
    if (/duplicate|unique|one_pending/i.test(error.message)) {
      return { ok: true, queued: true }
    }
    if (/does not exist|schema cache/i.test(error.message)) {
      return {
        ok: false,
        error: '동기화 큐가 없습니다. add-garmin-auto-sync.sql을 실행해주세요.',
      }
    }
    return { ok: false, error: '동기화 요청에 실패했습니다.' }
  }
  return { ok: true, queued: true }
}

export type GarminAdminOverview = {
  connected: number
  reauthRequired: number
  error: number
  disconnected: number
  rateLimited: boolean
  blockedUntil: string | null
  lastWorkerHeartbeat: string | null
  importedLast24h: number
}

export async function getGarminAdminOverview(): Promise<
  { ok: true; overview: GarminAdminOverview } | { ok: false; error: string }
> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: '로그인이 필요합니다.' }
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, approval_status')
      .eq('id', user.id)
      .maybeSingle()
    if (
      !profile ||
      !['admin', 'operator'].includes(String(profile.role)) ||
      profile.approval_status !== 'approved'
    ) {
      return { ok: false, error: '권한이 없습니다.' }
    }

    const admin = createServiceRoleClient()
    const { data: conns } = await admin
      .from('member_activity_connections')
      .select('status')
      .eq('provider', GARMIN_PROVIDER)
    const list = conns || []
    const overview: GarminAdminOverview = {
      connected: list.filter((r) => r.status === 'CONNECTED').length,
      reauthRequired: list.filter((r) => r.status === 'REAUTH_REQUIRED').length,
      error: list.filter((r) => r.status === 'ERROR').length,
      disconnected: list.filter((r) => r.status === 'DISCONNECTED').length,
      rateLimited: false,
      blockedUntil: null,
      lastWorkerHeartbeat: null,
      importedLast24h: 0,
    }

    const { data: provider } = await admin
      .from('activity_provider_sync_state')
      .select('status, blocked_until, last_worker_heartbeat')
      .eq('provider', GARMIN_PROVIDER)
      .maybeSingle()
    if (provider) {
      overview.rateLimited = provider.status === 'RATE_LIMITED'
      overview.blockedUntil = provider.blocked_until ? String(provider.blocked_until) : null
      overview.lastWorkerHeartbeat = provider.last_worker_heartbeat
        ? String(provider.last_worker_heartbeat)
        : null
    }

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { data: runs } = await admin
      .from('garmin_sync_runs')
      .select('imported_count')
      .gte('started_at', since)
    overview.importedLast24h = (runs || []).reduce(
      (sum, row) => sum + Number(row.imported_count || 0),
      0,
    )

    return { ok: true, overview }
  } catch {
    return { ok: false, error: '상태를 불러오지 못했습니다.' }
  }
}

export async function startGarminPairingSession(input?: {
  confirmReplace?: boolean
}): Promise<
  | { ok: true; session: GarminPairingPublicSession; replacing: boolean }
  | { ok: false; error: string; needsConfirm?: boolean }
> {
  const member = await getMemberForCurrentUser()
  if (!member) return { ok: false, error: '로그인이 필요합니다.' }

  const supabase = await createClient()

  const { data: existingStatus } = await supabase.rpc('get_my_activity_connection_status', {
    p_provider: GARMIN_PROVIDER,
  })
  const existing = (Array.isArray(existingStatus) ? existingStatus[0] : existingStatus) as
    | { status?: string }
    | null
  const replacing = existing?.status === 'CONNECTED' || existing?.status === 'REAUTH_REQUIRED'
  if (replacing && !input?.confirmReplace) {
    return {
      ok: false,
      needsConfirm: true,
      error:
        '현재 Garmin이 연결되어 있습니다. 다시 연결하면 기존 인증 정보가 교체됩니다. 이미 등록된 러닝 기록은 삭제되지 않습니다.',
    }
  }

  // Cancel other active sessions for this member
  const nowIso = new Date().toISOString()
  await supabase
    .from('garmin_connection_sessions')
    .update({ status: 'CANCELLED', cancelled_at: nowIso, updated_at: nowIso })
    .eq('member_id', member.id)
    .in('status', ['PENDING', 'CLAIMED', 'AUTHENTICATING'])

  const pairingCode = generatePairingCode()
  const connectorSecret = generateConnectorSecret()
  const expiresAt = new Date(
    Date.now() + GARMIN_PAIRING_SESSION_TTL_MINUTES * 60_000,
  ).toISOString()

  const { data, error } = await supabase
    .from('garmin_connection_sessions')
    .insert({
      member_id: member.id,
      status: 'PENDING',
      pairing_code_hash: hashSecret(pairingCode),
      connector_secret_hash: hashSecret(connectorSecret),
      expires_at: expiresAt,
      started_at: nowIso,
      updated_at: nowIso,
    })
    .select('id, expires_at, status')
    .single()

  if (error || !data) {
    if (/does not exist|schema cache/i.test(error?.message || '')) {
      return {
        ok: false,
        error: 'Garmin 연결 테이블이 없습니다. add-garmin-pairing-sessions.sql을 실행해주세요.',
      }
    }
    return { ok: false, error: '연결 세션을 만들지 못했습니다.' }
  }

  return {
    ok: true,
    replacing,
    session: {
      sessionId: String(data.id),
      status: 'PENDING',
      pairingCode,
      connectorSecret,
      expiresAt: String(data.expires_at),
      pollIntervalMs: GARMIN_PAIRING_POLL_INTERVAL_MS,
    },
  }
}

export async function getMyGarminPairingSessionStatus(sessionId: string): Promise<
  | {
      ok: true
      status: GarminPairingSessionStatus
      expiresAt: string | null
      errorCode: string | null
    }
  | { ok: false; error: string }
> {
  const member = await getMemberForCurrentUser()
  if (!member) return { ok: false, error: '로그인이 필요합니다.' }
  if (!sessionId?.trim()) return { ok: false, error: '세션이 없습니다.' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('garmin_connection_sessions')
    .select('id, member_id, status, expires_at, error_code')
    .eq('id', sessionId.trim())
    .maybeSingle()

  if (error || !data) return { ok: false, error: '세션을 찾을 수 없습니다.' }
  if (String(data.member_id) !== member.id) {
    return { ok: false, error: '세션을 찾을 수 없습니다.' }
  }

  let status = data.status as GarminPairingSessionStatus
  if (
    (status === 'PENDING' || status === 'CLAIMED' || status === 'AUTHENTICATING') &&
    data.expires_at &&
    new Date(String(data.expires_at)).getTime() < Date.now()
  ) {
    status = 'EXPIRED'
    await supabase
      .from('garmin_connection_sessions')
      .update({ status: 'EXPIRED', updated_at: new Date().toISOString() })
      .eq('id', sessionId)
      .eq('member_id', member.id)
  }

  return {
    ok: true,
    status,
    expiresAt: data.expires_at ? String(data.expires_at) : null,
    errorCode: data.error_code ? String(data.error_code) : null,
  }
}

export async function cancelGarminPairingSession(sessionId: string): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const member = await getMemberForCurrentUser()
  if (!member) return { ok: false, error: '로그인이 필요합니다.' }

  const supabase = await createClient()
  const { data } = await supabase
    .from('garmin_connection_sessions')
    .select('id, status')
    .eq('id', sessionId)
    .eq('member_id', member.id)
    .maybeSingle()

  if (!data) return { ok: false, error: '세션을 찾을 수 없습니다.' }
  if (data.status === 'COMPLETED') {
    return { ok: false, error: '이미 완료된 연결은 취소할 수 없습니다.' }
  }
  if (!['PENDING', 'CLAIMED', 'AUTHENTICATING'].includes(String(data.status))) {
    return { ok: true }
  }

  const nowIso = new Date().toISOString()
  const { error } = await supabase
    .from('garmin_connection_sessions')
    .update({ status: 'CANCELLED', cancelled_at: nowIso, updated_at: nowIso })
    .eq('id', sessionId)
    .eq('member_id', member.id)

  if (error) return { ok: false, error: '취소에 실패했습니다.' }
  return { ok: true }
}

/**
 * Disconnect Garmin. Does NOT delete mileage logs.
 * Uses service role to clear encrypted_token (member JWT cannot update token column policies).
 */
export async function disconnectMyGarminConnection(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const member = await getMemberForCurrentUser()
  if (!member) return { ok: false, error: '로그인이 필요합니다.' }

  try {
    const admin = createServiceRoleClient()
    const nowIso = new Date().toISOString()
    const { error } = await admin
      .from('member_activity_connections')
      .update({
        status: 'DISCONNECTED',
        encrypted_token: 'DISCARDED',
        token_format_version: 0,
        last_error_code: null,
        last_error_at: null,
        updated_at: nowIso,
      })
      .eq('member_id', member.id)
      .eq('provider', GARMIN_PROVIDER)

    if (error) return { ok: false, error: '연결 해제에 실패했습니다.' }
    return { ok: true }
  } catch {
    return { ok: false, error: '연결 해제에 실패했습니다.' }
  }
}
