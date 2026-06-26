import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import postgres from 'postgres'

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
const dbPassword = process.env.SUPABASE_DB_PASSWORD
const dbUrl = process.env.SUPABASE_DB_URL

if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const projectRef = new URL(url).hostname.split('.')[0]
const sqlPath = resolve(process.cwd(), 'supabase/bootstrap-minimal-admin.sql')
const sql = readFileSync(sqlPath, 'utf8')

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const { error: profilesCheck } = await admin.from('profiles').select('id').limit(1)
if (!profilesCheck) {
  console.log('profiles table already exists — skipping SQL bootstrap')
  process.exit(0)
}

let connectionString = dbUrl
if (!connectionString && dbPassword) {
  connectionString = `postgresql://postgres:${encodeURIComponent(dbPassword)}@db.${projectRef}.supabase.co:5432/postgres`
}

if (!connectionString) {
  console.error(
    [
      'DB 테이블이 없습니다. 아래 중 하나를 진행하세요:',
      '',
      '1) Supabase SQL Editor에서 실행:',
      `   https://supabase.com/dashboard/project/${projectRef}/sql/new`,
      `   파일: supabase/bootstrap-minimal-admin.sql`,
      '',
      '2) 또는 .env.local에 SUPABASE_DB_PASSWORD 추가 후 이 스크립트 재실행',
      '   (Supabase → Settings → Database → Database password)',
    ].join('\n'),
  )
  process.exit(1)
}

const sqlClient = postgres(connectionString, { max: 1 })
try {
  await sqlClient.unsafe(sql)
  console.log('bootstrap SQL applied successfully')
} catch (error) {
  console.error('bootstrap SQL failed:', error instanceof Error ? error.message : error)
  process.exit(1)
} finally {
  await sqlClient.end({ timeout: 5 })
}
