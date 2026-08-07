'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/actions/auth'
import { isOperatorRole } from '@/lib/operator-access'

function normalizeOptionalText(value: string | null | undefined) {
  const trimmed = value?.trim() ?? ''
  return trimmed || null
}

export type OperatorContactSettings = {
  full_name: string
  kakao_id: string
  instagram_id: string
  kakao_qr_url: string | null
}

export async function getMyOperatorContactSettings(): Promise<
  OperatorContactSettings | { error: string }
> {
  const user = await requireAuth()
  if (!isOperatorRole(user.role) && user.role !== 'admin') {
    return { error: '운영진만 이용할 수 있습니다.' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('full_name, kakao_id, instagram_id, kakao_qr_url')
    .eq('id', user.id)
    .maybeSingle()

  if (error && /kakao_qr_url/i.test(error.message)) {
    const fallback = await supabase
      .from('profiles')
      .select('full_name, kakao_id, instagram_id')
      .eq('id', user.id)
      .maybeSingle()
    if (fallback.error || !fallback.data) {
      return { error: fallback.error?.message ?? '프로필을 불러오지 못했습니다.' }
    }
    return {
      full_name: fallback.data.full_name ?? user.full_name ?? '',
      kakao_id: fallback.data.kakao_id ?? '',
      instagram_id: fallback.data.instagram_id ?? '',
      kakao_qr_url: null,
    }
  }

  if (error || !data) {
    return { error: error?.message ?? '프로필을 불러오지 못했습니다.' }
  }

  return {
    full_name: data.full_name ?? user.full_name ?? '',
    kakao_id: data.kakao_id ?? '',
    instagram_id: data.instagram_id ?? '',
    kakao_qr_url: data.kakao_qr_url ?? null,
  }
}

export async function updateMyOperatorContact(input: {
  kakao_id?: string
  instagram_id?: string
  kakao_qr_url?: string | null
}): Promise<{ error?: string }> {
  const user = await requireAuth()
  if (!isOperatorRole(user.role) && user.role !== 'admin') {
    return { error: '운영진만 저장할 수 있습니다.' }
  }

  const kakaoId = normalizeOptionalText(input.kakao_id)
  const instagramId = normalizeOptionalText(input.instagram_id)
  const kakaoQrUrl =
    input.kakao_qr_url === undefined
      ? undefined
      : normalizeOptionalText(input.kakao_qr_url ?? null)

  if (kakaoId && kakaoId.length > 80) {
    return { error: '카카오톡 아이디는 80자 이내로 입력해주세요.' }
  }
  if (instagramId && instagramId.length > 80) {
    return { error: '인스타그램 아이디는 80자 이내로 입력해주세요.' }
  }

  const supabase = await createClient()
  const payload: Record<string, string | null> = {
    kakao_id: kakaoId,
    instagram_id: instagramId,
    updated_at: new Date().toISOString(),
  }
  if (kakaoQrUrl !== undefined) {
    payload.kakao_qr_url = kakaoQrUrl
  }

  const { error } = await supabase.from('profiles').update(payload).eq('id', user.id)

    if (error) {
    if (/kakao_qr_url/i.test(error.message) && kakaoQrUrl !== undefined) {
      const withoutQr = {
        kakao_id: kakaoId,
        instagram_id: instagramId,
        updated_at: new Date().toISOString(),
      }
      const retry = await supabase.from('profiles').update(withoutQr).eq('id', user.id)
      if (retry.error) return { error: retry.error.message }
      return {
        error:
          '카카오 QR 저장용 컬럼이 없습니다. supabase/add-operator-contact.sql 을 실행한 뒤 다시 시도해주세요.',
      }
    }
    return { error: error.message }
  }

  revalidatePath('/dashboard/settings/operator-contact')
  revalidatePath('/auth/login')
  return {}
}
