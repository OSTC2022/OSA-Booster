/**
 * 13-F readiness gate — schema + counts only (no secrets printed).
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

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('GATE FAIL: missing Supabase URL or service role')
  process.exit(1)
}

const sb = createClient(url, key, { auth: { persistSession: false } })

const tables = [
  'member_activity_connections',
  'member_mileage_duplicate_candidates',
  'activity_sync_resolutions',
  'activity_reconciliation_events',
  'garmin_sync_runs',
  'activity_sync_requests',
  'activity_provider_sync_state',
]

let fail = false
for (const t of tables) {
  const { error } = await sb.from(t).select('*', { count: 'exact', head: true })
  if (error) {
    console.log(`TABLE ${t}: FAIL ${error.message}`)
    fail = true
  } else {
    console.log(`TABLE ${t}: PASS`)
  }
}

const { data: conns } = await sb
  .from('member_activity_connections')
  .select('status')
  .eq('provider', 'GARMIN')

const statuses = Object.create(null)
for (const row of conns || []) {
  const s = row.status || 'UNKNOWN'
  statuses[s] = (statuses[s] || 0) + 1
}
console.log('CONNECTIONS:', JSON.stringify(statuses))

const { count: garminLogs } = await sb
  .from('running_league_mileage_logs')
  .select('id', { count: 'exact', head: true })
  .eq('source_app', 'GARMIN')

console.log('GARMIN_MILEAGE_ROWS:', garminLogs ?? 0)

const { data: provider } = await sb
  .from('activity_provider_sync_state')
  .select('status, blocked_until, last_worker_heartbeat')
  .eq('provider', 'GARMIN')
  .maybeSingle()

console.log(
  'PROVIDER:',
  provider?.status || 'MISSING',
  'heartbeat:',
  provider?.last_worker_heartbeat ? 'SET' : 'NONE',
)

const connected = (statuses.CONNECTED || 0)
if (connected < 1) {
  console.log('LIVE_E2E: NOT_READY (need >=1 CONNECTED member)')
  fail = true
} else {
  console.log('LIVE_E2E: READY_FOR_MANUAL_QA')
}

if (fail) {
  console.log('13-F GATE: NOT READY FOR RELEASE')
  process.exit(2)
}
console.log('13-F GATE: SCHEMA OK + LIVE MEMBER PRESENT')
