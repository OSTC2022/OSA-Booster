import 'server-only'

import { createServiceRoleClient } from '@/lib/supabase/admin'
import type { HealthSourceApp } from '@/lib/health-bridge/constants'
import { GARMIN_SOURCE_APP } from '@/lib/health-bridge/constants'

const FAR_FUTURE = '2099-01-01T00:00:00.000Z'

/**
 * Health connect success → preferred = OS provider, pause Garmin AUTO sync.
 * Does not delete Garmin tokens or force DISCONNECTED.
 */
export async function setHealthPrimaryProvider(input: {
  memberId: string
  provider: HealthSourceApp
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createServiceRoleClient()

  const { error: memberError } = await admin
    .from('members')
    .update({
      preferred_activity_sync_provider: input.provider,
    })
    .eq('id', input.memberId)

  if (memberError) {
    return { ok: false, error: memberError.message }
  }

  // Best-effort pause (column may be missing until SQL applied)
  const paused = await admin
    .from('member_activity_connections')
    .update({
      auto_sync_paused: true,
      next_sync_at: FAR_FUTURE,
      updated_at: new Date().toISOString(),
    })
    .eq('member_id', input.memberId)
    .eq('provider', GARMIN_SOURCE_APP)
    .eq('status', 'CONNECTED')

  if (paused.error) {
    await admin
      .from('member_activity_connections')
      .update({
        next_sync_at: FAR_FUTURE,
        updated_at: new Date().toISOString(),
      })
      .eq('member_id', input.memberId)
      .eq('provider', GARMIN_SOURCE_APP)
      .eq('status', 'CONNECTED')
  }

  return { ok: true }
}

/**
 * Health disconnect → clear Health preferred; restore Garmin AUTO if still CONNECTED.
 */
export async function clearHealthPrimaryProvider(input: {
  memberId: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createServiceRoleClient()

  const { data: member } = await admin
    .from('members')
    .select('preferred_activity_sync_provider')
    .eq('id', input.memberId)
    .maybeSingle()

  const preferred = String(member?.preferred_activity_sync_provider || '')
  const wasHealth = preferred === 'APPLE_HEALTH' || preferred === 'HEALTH_CONNECT'

  const { data: garmin } = await admin
    .from('member_activity_connections')
    .select('id, status')
    .eq('member_id', input.memberId)
    .eq('provider', GARMIN_SOURCE_APP)
    .maybeSingle()

  const garminConnected = garmin && String(garmin.status) === 'CONNECTED'

  if (garminConnected) {
    const resume = await admin
      .from('member_activity_connections')
      .update({
        auto_sync_paused: false,
        next_sync_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', garmin.id)

    if (resume.error) {
      await admin
        .from('member_activity_connections')
        .update({
          next_sync_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', garmin.id)
    }

    const { error } = await admin
      .from('members')
      .update({
        preferred_activity_sync_provider: 'DIRECT_GARMIN',
      })
      .eq('id', input.memberId)
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  }

  if (wasHealth) {
    const { error } = await admin
      .from('members')
      .update({
        preferred_activity_sync_provider: null,
      })
      .eq('id', input.memberId)
    if (error) return { ok: false, error: error.message }
  }

  return { ok: true }
}
