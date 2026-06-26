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
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const email = (process.argv[2] ?? 'allakj@naver.com').trim().toLowerCase()
const password = process.argv[3] ?? '11111111'
const fullName = process.argv[4] ?? '관리자'

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function tableExists(table) {
  const { error } = await admin.from(table).select('id').limit(1)
  return !error
}

async function findUserIdByEmail(targetEmail) {
  let page = 1
  while (page <= 10) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error || !data.users.length) break
    const found = data.users.find((u) => u.email?.toLowerCase() === targetEmail)
    if (found) return found.id
    if (!data.nextPage) break
    page = data.nextPage
  }
  return null
}

const metadata = {
  full_name: fullName,
  role: 'admin',
  approval_status: 'approved',
}

let userId = await findUserIdByEmail(email)
let action = 'updated'

if (!userId) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: metadata,
  })
  if (error || !data.user) {
    console.error('createUser failed:', error?.message ?? 'unknown error')
    process.exit(1)
  }
  userId = data.user.id
  action = 'created'
} else {
  const { error } = await admin.auth.admin.updateUserById(userId, {
    password,
    email_confirm: true,
    user_metadata: metadata,
  })
  if (error) {
    console.error('updateUserById failed:', error.message)
    process.exit(1)
  }
}

const hasProfiles = await tableExists('profiles')
if (!hasProfiles) {
  const projectRef = new URL(url).hostname.split('.')[0]
  console.error(
    [
      'profiles 테이블이 없습니다. Supabase SQL Editor에서 아래 파일을 실행하세요:',
      `  supabase/bootstrap-minimal-admin.sql`,
      `  https://supabase.com/dashboard/project/${projectRef}/sql/new`,
      'SQL 실행 후 이 스크립트를 다시 실행하세요.',
    ].join('\n'),
  )
  process.exit(1)
}

const { error: profileError } = await admin.from('profiles').upsert(
  {
    id: userId,
    email,
    full_name: fullName,
    role: 'admin',
    approval_status: 'approved',
    updated_at: new Date().toISOString(),
  },
  { onConflict: 'id' },
)
if (profileError) {
  console.error('profiles upsert failed:', profileError.message)
  process.exit(1)
}

const { error: usersError } = await admin.from('users').upsert(
  {
    id: userId,
    email,
    full_name: fullName,
    role: 'admin',
  },
  { onConflict: 'id' },
)
if (usersError) {
  console.error('users upsert failed:', usersError.message)
  process.exit(1)
}

await admin.from('instructors').update({ user_id: null }).eq('user_id', userId)
await admin
  .from('members')
  .update({ auth_user_id: null, user_id: null })
  .or(`auth_user_id.eq.${userId},user_id.eq.${userId}`)

console.log(
  JSON.stringify(
    {
      ok: true,
      action,
      userId,
      email,
      role: 'admin',
      approval_status: 'approved',
    },
    null,
    2,
  ),
)
