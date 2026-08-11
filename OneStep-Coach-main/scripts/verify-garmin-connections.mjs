/**
 * Verify 13-B Garmin schema pieces exist (no token values printed).
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

for (const line of readFileSync(resolve(process.cwd(), '.env.local'), 'utf8').split('\n')) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  const i = trimmed.indexOf('=')
  if (i < 0) continue
  const key = trimmed.slice(0, i).trim()
  let value = trimmed.slice(i + 1).trim()
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1)
  }
  if (!process.env[key]) process.env[key] = value
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const checks = []

async function check(name, fn) {
  try {
    await fn()
    checks.push({ name, ok: true })
    console.log(`PASS  ${name}`)
  } catch (error) {
    checks.push({ name, ok: false, error: String(error?.message || error) })
    console.log(`FAIL  ${name}: ${error?.message || error}`)
  }
}

await check('member_activity_connections table', async () => {
  const { error } = await supabase
    .from('member_activity_connections')
    .select('id, member_id, provider, status')
    .limit(1)
  if (error) throw error
})

await check('encrypted_token column exists (service select)', async () => {
  const { error } = await supabase
    .from('member_activity_connections')
    .select('encrypted_token')
    .limit(1)
  if (error) throw error
})

await check('external_activity_id on mileage logs', async () => {
  const { error } = await supabase
    .from('running_league_mileage_logs')
    .select('id, external_activity_id, source_app')
    .limit(1)
  if (error) throw error
})

await check('import_garmin_mileage_log RPC present', async () => {
  // Call with impossible ids — expect error other than "function not found"
  const { error } = await supabase.rpc('import_garmin_mileage_log', {
    p_member_id: '00000000-0000-0000-0000-000000000000',
    p_participant_id: '00000000-0000-0000-0000-000000000000',
    p_league_id: '00000000-0000-0000-0000-000000000000',
    p_distance_km: 1,
    p_logged_at: '2099-01-01',
    p_duration: '00:10:00',
    p_activity_time: '10:00:00',
    p_external_activity_id: 'verify-rpc-probe',
    p_notes: 'verify',
  })
  if (error && /function|schema cache|does not exist/i.test(error.message)) {
    throw error
  }
})

await check('get_my_activity_connection_status RPC present', async () => {
  const { error } = await supabase.rpc('get_my_activity_connection_status', {
    p_provider: 'GARMIN',
  })
  // service role may return empty; missing function fails
  if (error && /function|schema cache|does not exist/i.test(error.message)) {
    throw error
  }
})

const failed = checks.filter((c) => !c.ok)
console.log('---')
console.log(failed.length === 0 ? 'verify:garmin-connections PASS' : 'verify:garmin-connections FAIL')
process.exit(failed.length === 0 ? 0 : 1)
