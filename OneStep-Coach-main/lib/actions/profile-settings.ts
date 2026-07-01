'use server'

import { revalidatePath } from 'next/cache'
import { createServiceRoleClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser, getMemberForCurrentUser, requireAuth } from '@/lib/actions/auth'
import { isProtectedAdminAccount } from '@/lib/protected-admin'
import { formatKoreanPhoneInput } from '@/lib/phone-format'
import { normalizeMemberGender } from '@/lib/running-league/ranking-gender'
import type { MemberGender } from '@/lib/running-league/ranking-gender'
import {
  DEFAULT_PORTAL_STATUS_MESSAGE_COLOR,
  normalizePortalStatusMessage,
  normalizePortalStatusMessageColor,
  PORTAL_STATUS_MESSAGE_MAX_LENGTH,
} from '@/lib/running-league/portal-status-message'
import { isAdultPortalUser } from '@/lib/member-portal-routes'
import { profileRoleToLegacyUsersRole } from '@/lib/roles'
import type { UserRole } from '@/lib/types'

const PROFILE_SETTINGS_SELECT =
  'full_name, avatar_url, phone, kakao_id, instagram_id, email, role'

function toLegacyUsersRole(role: UserRole) {
  return profileRoleToLegacyUsersRole(role)
}

function normalizeOptionalText(value: string | null | undefined) {
  const trimmed = value?.trim() ?? ''
  return trimmed || null
}

async function syncContactToLinkedRecords(
  userId: string,
  contact: {
    phone: string | null
    kakao_id: string | null
    instagram_id: string | null
    gender?: MemberGender | null
    portal_status_message?: string | null
    portal_status_message_color?: string | null
  },
): Promise<string | undefined> {
  const supabase = await createClient()

  const memberPatch: Record<string, string | null> = {
    phone: contact.phone,
    kakao_id: contact.kakao_id,
    instagram_id: contact.instagram_id,
  }
  if (contact.gender !== undefined) {
    memberPatch.gender = contact.gender
  }
  if (contact.portal_status_message !== undefined) {
    memberPatch.portal_status_message = contact.portal_status_message
  }
  if (contact.portal_status_message_color !== undefined) {
    memberPatch.portal_status_message_color = contact.portal_status_message_color
  }

  const { error: memberUpdateError } = await supabase
    .from('members')
    .update(memberPatch)
    .or(`auth_user_id.eq.${userId},user_id.eq.${userId}`)

  if (memberUpdateError) {
    try {
      const admin = createServiceRoleClient()
      const { error: adminMemberError } = await admin
        .from('members')
        .update(memberPatch)
        .or(`auth_user_id.eq.${userId},user_id.eq.${userId}`)
      if (adminMemberError) {
        console.error('syncContactToLinkedRecords.members', adminMemberError.message)
        return adminMemberError.message
      }
    } catch {
      console.error('syncContactToLinkedRecords.members', memberUpdateError.message)
      return memberUpdateError.message
    }
  }

  try {
    const admin = createServiceRoleClient()
    await admin
      .from('instructors')
      .update({
        phone: contact.phone,
        kakao_id: contact.kakao_id,
        instagram_id: contact.instagram_id,
      })
      .eq('user_id', userId)
  } catch {
    /* service role 없으면 instructors 동기화 생략 */
  }

  return undefined
}

export type MyProfileSettings = {
  full_name: string
  email: string | null
  role: UserRole
  avatar_url: string | null
  phone: string
  kakao_id: string
  instagram_id: string
  gender: MemberGender | null
  portal_status_message: string
  portal_status_message_color: string
  has_linked_member: boolean
}

export async function getMyProfileSettings(): Promise<MyProfileSettings | null> {
  const user = await getCurrentUser()
  if (!user) return null

  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select(PROFILE_SETTINGS_SELECT)
    .eq('id', user.id)
    .maybeSingle()

  let phone = profile?.phone ?? user.phone ?? ''
  let kakaoId = profile?.kakao_id ?? user.kakao_id ?? ''
  let instagramId = profile?.instagram_id ?? user.instagram_id ?? ''
  let gender: MemberGender | null = null
  let portalStatusMessage = ''
  let portalStatusMessageColor = DEFAULT_PORTAL_STATUS_MESSAGE_COLOR

  const member = await getMemberForCurrentUser()
  if (member) {
    phone = phone || member.phone || ''
    kakaoId = kakaoId || member.kakao_id || ''
    instagramId = instagramId || member.instagram_id || ''
    gender = normalizeMemberGender(member.gender)
    portalStatusMessage = member.portal_status_message?.trim() ?? ''
    portalStatusMessageColor = normalizePortalStatusMessageColor(
      member.portal_status_message_color,
    )
  }

  return {
    full_name: profile?.full_name ?? user.full_name ?? '',
    email: user.email,
    role: user.role,
    avatar_url: profile?.avatar_url ?? user.avatar_url ?? null,
    phone,
    kakao_id: kakaoId,
    instagram_id: instagramId,
    gender,
    portal_status_message: portalStatusMessage,
    portal_status_message_color: portalStatusMessageColor,
    has_linked_member: member != null,
  }
}

export async function updateMyProfile(input: {
  full_name: string
  avatar_url?: string | null
  phone?: string
  kakao_id?: string
  instagram_id?: string
  gender?: MemberGender | null
  portal_status_message?: string
  portal_status_message_color?: string
}): Promise<{ error?: string }> {
  const user = await requireAuth()
  const fullName = input.full_name.trim()
  const phone = normalizeOptionalText(
    input.phone ? formatKoreanPhoneInput(input.phone) : null,
  )
  const kakaoId = normalizeOptionalText(input.kakao_id)
  const instagramId = normalizeOptionalText(input.instagram_id)
  const gender =
    input.gender === undefined ? undefined : normalizeMemberGender(input.gender)
  const avatarUrl =
    input.avatar_url === undefined
      ? undefined
      : normalizeOptionalText(input.avatar_url ?? null)

  if (!fullName) {
    return { error: '이름을 입력해주세요.' }
  }

  if (isAdultPortalUser(user.role)) {
    const resolvedGender = normalizeMemberGender(input.gender)
    if (!resolvedGender) {
      return { error: '성별을 선택해주세요.' }
    }
  }

  const genderToSync = isAdultPortalUser(user.role)
    ? normalizeMemberGender(input.gender)
    : gender

  if (fullName.length > 40) {
    return { error: '이름은 40자 이내로 입력해주세요.' }
  }

  if (kakaoId && kakaoId.length > 80) {
    return { error: '카카오톡 아이디는 80자 이내로 입력해주세요.' }
  }

  if (instagramId && instagramId.length > 80) {
    return { error: '인스타그램 아이디는 80자 이내로 입력해주세요.' }
  }

  const portalStatusMessage =
    isAdultPortalUser(user.role) && input.portal_status_message !== undefined
      ? normalizePortalStatusMessage(input.portal_status_message)
      : undefined

  const portalStatusMessageColor =
    isAdultPortalUser(user.role) && input.portal_status_message_color !== undefined
      ? normalizePortalStatusMessageColor(input.portal_status_message_color)
      : undefined

  if (
    portalStatusMessage &&
    portalStatusMessage.length > PORTAL_STATUS_MESSAGE_MAX_LENGTH
  ) {
    return { error: `상태 메시지는 ${PORTAL_STATUS_MESSAGE_MAX_LENGTH}자 이내로 입력해주세요.` }
  }

  if (isAdultPortalUser(user.role) && input.portal_status_message !== undefined) {
    const member = await getMemberForCurrentUser()
    if (!member && (portalStatusMessage || input.portal_status_message_color !== undefined)) {
      return {
        error:
          '상태 메시지는 러닝 회원 프로필에 저장됩니다. 회원 연결 후 다시 시도해주세요.',
      }
    }
  }

  const supabase = await createClient()
  const updatePayload: Record<string, string | null> = {
    full_name: fullName,
    phone,
    kakao_id: kakaoId,
    instagram_id: instagramId,
    updated_at: new Date().toISOString(),
  }

  if (avatarUrl !== undefined) {
    updatePayload.avatar_url = avatarUrl
  }

  const { error: profileError } = await supabase
    .from('profiles')
    .update(updatePayload)
    .eq('id', user.id)

  if (profileError) {
    return { error: profileError.message }
  }

  const memberSyncError = await syncContactToLinkedRecords(user.id, {
    phone,
    kakao_id: kakaoId,
    instagram_id: instagramId,
    ...(genderToSync !== undefined ? { gender: genderToSync } : {}),
    ...(isAdultPortalUser(user.role) && portalStatusMessage !== undefined
      ? { portal_status_message: portalStatusMessage }
      : {}),
    ...(isAdultPortalUser(user.role) && portalStatusMessageColor !== undefined
      ? { portal_status_message_color: portalStatusMessageColor }
      : {}),
  })

  if (memberSyncError) {
    return { error: memberSyncError }
  }

  await supabase.from('users').upsert(
    {
      id: user.id,
      email: user.email,
      full_name: fullName,
      role: toLegacyUsersRole(user.role),
    },
    { onConflict: 'id' },
  )

  try {
    const admin = createServiceRoleClient()
    await admin.auth.admin.updateUserById(user.id, {
      user_metadata: {
        full_name: fullName,
        role: user.role,
        ...(avatarUrl !== undefined ? { avatar_url: avatarUrl } : {}),
      },
    })

    if (isProtectedAdminAccount(user.email)) {
      await admin.from('profiles').update({ role: 'admin' }).eq('id', user.id)
      await admin.from('users').upsert(
        {
          id: user.id,
          email: user.email,
          full_name: fullName,
          role: 'admin',
        },
        { onConflict: 'id' },
      )
    }
  } catch {
    /* service role 없으면 profiles만 갱신 */
  }

  revalidatePath('/dashboard/profile', 'page')
  revalidatePath('/dashboard/my/profile', 'page')
  revalidatePath('/dashboard/my', 'page')
  revalidatePath('/dashboard/my/running-league', 'page')
  revalidatePath('/dashboard', 'layout')
  return { success: true as const }
}
