import type { SupabaseClient } from '@supabase/supabase-js'
import type { LinkedMember, MemberBootstrapResult } from '@/src/auth/types'
import { maskId } from '@/src/lib/mask'

export { maskId }

/**
 * Resolve ONE STEP member from auth.uid — same rule as web getMemberForCurrentUser:
 * members.auth_user_id OR members.user_id = auth user id.
 * Never accepts a client-supplied member_id.
 */
export async function bootstrapMember(
  supabase: SupabaseClient,
): Promise<MemberBootstrapResult> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return { status: 'ERROR', message: '인증 세션을 확인할 수 없습니다.' }
  }

  const authUserId = user.id
  const { data, error } = await supabase
    .from('members')
    .select('id, name')
    .or(`auth_user_id.eq.${authUserId},user_id.eq.${authUserId}`)
    .maybeSingle()

  if (error) {
    return { status: 'ERROR', message: '회원 정보를 불러오지 못했습니다.' }
  }

  if (!data?.id) {
    return { status: 'UNLINKED', authUserId }
  }

  let roleHint: string | null = null
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', authUserId)
    .maybeSingle()
  if (profile?.role) {
    roleHint = String(profile.role)
  }

  const member: LinkedMember = {
    id: String(data.id),
    name: String(data.name || '회원'),
    roleHint,
  }

  return { status: 'LINKED', member, authUserId }
}
