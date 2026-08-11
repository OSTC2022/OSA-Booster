import 'server-only'

import { createClient } from '@supabase/supabase-js'
import { createServiceRoleClient } from '@/lib/supabase/admin'
import { getPublicSupabaseEnv } from '@/lib/supabase/env'
import type { Member } from '@/lib/types'

/**
 * Resolve authenticated user from mobile Bearer JWT.
 * Never trusts client member_id.
 */
export async function resolveUserFromBearer(
  request: Request,
): Promise<{ id: string; email?: string | null } | null> {
  const header = request.headers.get('authorization') || request.headers.get('Authorization')
  if (!header || !header.toLowerCase().startsWith('bearer ')) return null
  const token = header.slice(7).trim()
  if (!token) return null

  try {
    const { url, anonKey } = getPublicSupabaseEnv()
    const supabase = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data, error } = await supabase.auth.getUser(token)
    if (error || !data.user) return null
    return { id: data.user.id, email: data.user.email }
  } catch {
    return null
  }
}

export async function resolveMemberForAuthUserId(
  authUserId: string,
): Promise<Member | null> {
  const admin = createServiceRoleClient()
  const { data, error } = await admin
    .from('members')
    .select('*')
    .or(`auth_user_id.eq.${authUserId},user_id.eq.${authUserId}`)
    .maybeSingle()

  if (error || !data) return null
  return data as Member
}
