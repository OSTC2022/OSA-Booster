import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/admin'
import { GARMIN_PROVIDER } from '@/lib/garmin/config'
import { hashSecret, safeEqualHash } from '@/lib/garmin/pairing-crypto'
import { encryptDiTokens } from '@/lib/garmin/token-crypto'

export const runtime = 'nodejs'

type CompleteBody = {
  sessionId?: string
  completionToken?: string
  phase?: 'authenticating' | 'complete'
  tokens?: {
    di_token?: string
    di_refresh_token?: string
    di_client_id?: string
  }
}

/**
 * Connector progress / token submit.
 * Tokens arrive in POST body only (never query string).
 * Server encrypts immediately; never logs token values.
 * Member binding comes from the pairing session row.
 */
export async function POST(request: Request) {
  let body: CompleteBody
  try {
    body = (await request.json()) as CompleteBody
  } catch {
    return NextResponse.json({ ok: false, error: 'INVALID_BODY' }, { status: 400 })
  }

  const sessionId = String(body.sessionId || '').trim()
  const completionToken = String(body.completionToken || '').trim()
  if (!sessionId || completionToken.length < 16) {
    return NextResponse.json({ ok: false, error: 'INVALID_CREDENTIALS' }, { status: 400 })
  }

  const admin = createServiceRoleClient()
  const { data: session, error } = await admin
    .from('garmin_connection_sessions')
    .select(
      'id, member_id, status, completion_token_hash, expires_at, consumed_at',
    )
    .eq('id', sessionId)
    .maybeSingle()

  if (error || !session) {
    return NextResponse.json({ ok: false, error: 'SESSION_NOT_FOUND' }, { status: 404 })
  }

  if (
    !session.completion_token_hash ||
    !safeEqualHash(String(session.completion_token_hash), hashSecret(completionToken))
  ) {
    return NextResponse.json({ ok: false, error: 'CLAIM_DENIED' }, { status: 401 })
  }

  if (session.consumed_at || session.status === 'COMPLETED') {
    return NextResponse.json({ ok: false, error: 'ALREADY_CONSUMED' }, { status: 409 })
  }

  if (['CANCELLED', 'FAILED', 'EXPIRED'].includes(String(session.status))) {
    return NextResponse.json({ ok: false, error: 'SESSION_INACTIVE' }, { status: 409 })
  }

  if (new Date(String(session.expires_at)).getTime() < Date.now()) {
    await admin
      .from('garmin_connection_sessions')
      .update({ status: 'EXPIRED', updated_at: new Date().toISOString() })
      .eq('id', session.id)
    return NextResponse.json({ ok: false, error: 'EXPIRED' }, { status: 410 })
  }

  const nowIso = new Date().toISOString()
  const phase = body.phase || 'complete'

  if (phase === 'authenticating') {
    await admin
      .from('garmin_connection_sessions')
      .update({ status: 'AUTHENTICATING', updated_at: nowIso })
      .eq('id', session.id)
      .in('status', ['CLAIMED', 'AUTHENTICATING'])
    return NextResponse.json({ ok: true, status: 'AUTHENTICATING' })
  }

  const diToken = String(body.tokens?.di_token || '')
  const diRefresh = String(body.tokens?.di_refresh_token || '')
  const diClientId = String(body.tokens?.di_client_id || '')
  if (!diToken || !diRefresh) {
    await admin
      .from('garmin_connection_sessions')
      .update({
        status: 'FAILED',
        error_code: 'TOKEN_CAPTURE_FAILED',
        updated_at: nowIso,
      })
      .eq('id', session.id)
    return NextResponse.json({ ok: false, error: 'TOKEN_CAPTURE_FAILED' }, { status: 400 })
  }

  let ciphertext: string
  let tokenFormatVersion: number
  try {
    const enc = encryptDiTokens({
      di_token: diToken,
      di_refresh_token: diRefresh,
      di_client_id: diClientId,
    })
    ciphertext = enc.ciphertext
    tokenFormatVersion = enc.tokenFormatVersion
  } catch {
    await admin
      .from('garmin_connection_sessions')
      .update({
        status: 'FAILED',
        error_code: 'TOKEN_ENCRYPT_FAILED',
        updated_at: nowIso,
      })
      .eq('id', session.id)
    return NextResponse.json({ ok: false, error: 'TOKEN_ENCRYPT_FAILED' }, { status: 500 })
  }

  const memberId = String(session.member_id)
  const { error: upsertError } = await admin.from('member_activity_connections').upsert(
    {
      member_id: memberId,
      provider: GARMIN_PROVIDER,
      status: 'CONNECTED',
      encrypted_token: ciphertext,
      token_format_version: tokenFormatVersion,
      connected_at: nowIso,
      last_success_at: nowIso,
      last_error_code: null,
      last_error_at: null,
      // First auto sync ASAP (worker picks up null/due next_sync_at)
      next_sync_at: nowIso,
      initial_sync_done: false,
      consecutive_failures: 0,
      updated_at: nowIso,
    },
    { onConflict: 'member_id,provider' },
  )

  if (upsertError) {
    await admin
      .from('garmin_connection_sessions')
      .update({
        status: 'FAILED',
        error_code: 'CONNECTION_SAVE_FAILED',
        updated_at: nowIso,
      })
      .eq('id', session.id)
    return NextResponse.json({ ok: false, error: 'CONNECTION_SAVE_FAILED' }, { status: 500 })
  }

  await admin
    .from('garmin_connection_sessions')
    .update({
      status: 'COMPLETED',
      completed_at: nowIso,
      consumed_at: nowIso,
      // Invalidate completion token hash so replay fails
      completion_token_hash: hashSecret(`consumed:${session.id}:${nowIso}`),
      updated_at: nowIso,
    })
    .eq('id', session.id)

  return NextResponse.json({ ok: true, status: 'COMPLETED' })
}
