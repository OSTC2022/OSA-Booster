import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/admin'
import {
  GARMIN_PAIRING_MAX_FAILED_ATTEMPTS,
  GARMIN_PROVIDER,
} from '@/lib/garmin/config'
import {
  generateCompletionToken,
  hashSecret,
  safeEqualHash,
} from '@/lib/garmin/pairing-crypto'
import { encryptDiTokens } from '@/lib/garmin/token-crypto'

export const runtime = 'nodejs'

type ClaimBody = {
  pairingCode?: string
  connectorSecret?: string
}

/**
 * Connector claim: pairing code + long secret.
 * Does not accept member_id from client — member is bound on the session row.
 * Never returns service role key.
 */
export async function POST(request: Request) {
  let body: ClaimBody
  try {
    body = (await request.json()) as ClaimBody
  } catch {
    return NextResponse.json({ ok: false, error: 'INVALID_BODY' }, { status: 400 })
  }

  const pairingCode = String(body.pairingCode || '').replace(/\s+/g, '')
  const connectorSecret = String(body.connectorSecret || '').trim()
  if (!/^\d{6}$/.test(pairingCode) || connectorSecret.length < 16) {
    return NextResponse.json({ ok: false, error: 'INVALID_CREDENTIALS' }, { status: 400 })
  }

  const admin = createServiceRoleClient()
  const codeHash = hashSecret(pairingCode)
  const secretHash = hashSecret(connectorSecret)
  const now = Date.now()

  // Lookup by pairing code hash among active sessions (short window)
  const { data: candidates, error } = await admin
    .from('garmin_connection_sessions')
    .select(
      'id, member_id, status, pairing_code_hash, connector_secret_hash, expires_at, failed_attempts, consumed_at',
    )
    .eq('pairing_code_hash', codeHash)
    .in('status', ['PENDING'])
    .limit(5)

  if (error) {
    return NextResponse.json({ ok: false, error: 'CLAIM_FAILED' }, { status: 500 })
  }

  const session = (candidates || []).find((row) =>
    safeEqualHash(String(row.connector_secret_hash), secretHash),
  )

  if (!session) {
    // Soft fail — do not reveal which part mismatched
    // Increment failed_attempts on any PENDING row with matching code (rate limit)
    const soft = (candidates || [])[0]
    if (soft) {
      const attempts = Number(soft.failed_attempts || 0) + 1
      const patch: Record<string, unknown> = {
        failed_attempts: attempts,
        updated_at: new Date().toISOString(),
      }
      if (attempts >= GARMIN_PAIRING_MAX_FAILED_ATTEMPTS) {
        patch.status = 'FAILED'
        patch.error_code = 'TOO_MANY_ATTEMPTS'
      }
      await admin.from('garmin_connection_sessions').update(patch).eq('id', soft.id)
    }
    return NextResponse.json({ ok: false, error: 'CLAIM_DENIED' }, { status: 401 })
  }

  if (session.consumed_at) {
    return NextResponse.json({ ok: false, error: 'ALREADY_CONSUMED' }, { status: 409 })
  }
  if (new Date(String(session.expires_at)).getTime() < now) {
    await admin
      .from('garmin_connection_sessions')
      .update({ status: 'EXPIRED', updated_at: new Date().toISOString() })
      .eq('id', session.id)
    return NextResponse.json({ ok: false, error: 'EXPIRED' }, { status: 410 })
  }

  const completionToken = generateCompletionToken()
  const nowIso = new Date().toISOString()
  const { error: updateError } = await admin
    .from('garmin_connection_sessions')
    .update({
      status: 'CLAIMED',
      claimed_at: nowIso,
      completion_token_hash: hashSecret(completionToken),
      failed_attempts: 0,
      updated_at: nowIso,
    })
    .eq('id', session.id)
    .eq('status', 'PENDING')

  if (updateError) {
    return NextResponse.json({ ok: false, error: 'CLAIM_FAILED' }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    sessionId: session.id,
    completionToken,
    // Never return member_id to reduce cross-account probing surface in connector logs
  })
}
