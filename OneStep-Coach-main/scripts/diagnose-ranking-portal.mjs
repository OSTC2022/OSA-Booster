import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const envPath = resolve(process.cwd(), '.env.local')
for (const line of readFileSync(envPath, 'utf8').split('\n')) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  const eq = trimmed.indexOf('=')
  if (eq === -1) continue
  const key = trimmed.slice(0, eq).trim()
  let value = trimmed.slice(eq + 1).trim()
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
  console.error('Missing env')
  process.exit(1)
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const LEAGUE_SELECT =
  'id, title, description, starts_at, ends_at, status, audience, target_group, board_post_id, created_by, created_at, updated_at'

const PARTICIPANT_SELECT =
  'id, league_id, member_id, goal_level, goal_type, personal_goal, goal_achievement_rate, attendance_score, goal_score, record_score, mileage_score, recovery_score, mileage_km, total_score, record_baseline, record_current, notes, coach_comment, created_at, updated_at, member:members(id, name, sport, phone, gender)'

async function probe(name, fn) {
  try {
    const result = await fn()
    console.log(`OK  ${name}`, result ?? '')
  } catch (e) {
    console.log(`ERR ${name}`, e instanceof Error ? e.message : e)
  }
}

await probe('running_leagues table', async () => {
  const { data, error } = await admin.from('running_leagues').select('id').limit(1)
  if (error) throw error
  return `rows=${data?.length ?? 0}`
})

await probe('LEAGUE_SELECT', async () => {
  const { data, error } = await admin.from('running_leagues').select(LEAGUE_SELECT).limit(3)
  if (error) throw error
  return data?.map((r) => r.title).join(', ') || '(empty)'
})

await probe('portal ranking league', async () => {
  const { data, error } = await admin
    .from('running_leagues')
    .select(LEAGUE_SELECT)
    .or('title.eq.ONE STEP RUNNING RANKING,description.like.%__center_portal_ranking__%')
  if (error) throw error
  return data?.length ? data[0].title : '(not found)'
})

await probe('PARTICIPANT_SELECT', async () => {
  const { data: leagues } = await admin.from('running_leagues').select('id').limit(1)
  const leagueId = leagues?.[0]?.id
  if (!leagueId) return 'no league — skip'
  const { data, error } = await admin
    .from('running_league_participants')
    .select(PARTICIPANT_SELECT)
    .eq('league_id', leagueId)
    .limit(3)
  if (error) throw error
  return `participants=${data?.length ?? 0}`
})

await probe('running_league_records', async () => {
  const { error } = await admin
    .from('running_league_records')
    .select('id, distance_event, record_phase, time_seconds')
    .limit(1)
  if (error) throw error
  return 'ok'
})

await probe('running_league_pb_snapshots', async () => {
  const { error } = await admin.from('running_league_pb_snapshots').select('id').limit(1)
  if (error) throw error
  return 'ok'
})

await probe('running_league_mileage_logs', async () => {
  const { error } = await admin.from('running_league_mileage_logs').select('id').limit(1)
  if (error) throw error
  return 'ok'
})

await probe('adult_member count', async () => {
  const { count, error } = await admin
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'adult_member')
  if (error) throw error
  return `profiles.adult_member=${count ?? 0}`
})

await probe('members with gender', async () => {
  const { error } = await admin.from('members').select('id, name, gender').limit(1)
  if (error) throw error
  return 'ok'
})
