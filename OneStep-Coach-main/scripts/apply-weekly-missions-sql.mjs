import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postgres from 'postgres'

for (const line of readFileSync(resolve(process.cwd(), '.env.local'), 'utf8').split('\n')) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  const separator = trimmed.indexOf('=')
  if (separator < 0) continue
  const key = trimmed.slice(0, separator).trim()
  let value = trimmed.slice(separator + 1).trim()
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1)
  }
  if (!process.env[key]) process.env[key] = value
}

const publicUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const password = process.env.SUPABASE_DB_PASSWORD
let connectionString = process.env.SUPABASE_DB_URL

if (!connectionString && publicUrl && password) {
  const projectRef = new URL(publicUrl).hostname.split('.')[0]
  connectionString =
    `postgresql://postgres:${encodeURIComponent(password)}` +
    `@db.${projectRef}.supabase.co:5432/postgres`
}

if (!connectionString) {
  console.error(
    'SUPABASE_DB_URL 또는 SUPABASE_DB_PASSWORD가 없어 SQL을 자동 적용할 수 없습니다. ' +
      'Supabase SQL Editor에서 supabase/add-weekly-missions.sql을 실행하세요.',
  )
  process.exit(1)
}

const sql = readFileSync(resolve(process.cwd(), 'supabase/add-weekly-missions.sql'), 'utf8')
const client = postgres(connectionString, { max: 1 })
try {
  await client.unsafe(sql)
  console.log('weekly_missions schema applied successfully.')
} finally {
  await client.end({ timeout: 5 })
}
