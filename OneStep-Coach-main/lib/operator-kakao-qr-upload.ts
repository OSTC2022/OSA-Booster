'use client'

import { createClient } from '@/lib/supabase/client'
import {
  PROFILE_AVATAR_ACCEPT,
  validateProfileAvatarFile,
} from '@/lib/profile-avatar-upload'

export const OPERATOR_QR_ACCEPT = PROFILE_AVATAR_ACCEPT

export async function uploadOperatorKakaoQr(
  userId: string,
  file: File,
): Promise<{ url?: string; error?: string }> {
  const validationError = validateProfileAvatarFile(file)
  if (validationError) return { error: validationError }

  try {
    const ext =
      file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
    const path = `${userId}/kakao-qr.${ext}`
    const supabase = createClient()

    const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file, {
      upsert: true,
      contentType: file.type,
      cacheControl: '3600',
    })

    if (uploadError) return { error: uploadError.message }

    const { data } = supabase.storage.from('avatars').getPublicUrl(path)
    return { url: `${data.publicUrl}?v=${Date.now()}` }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'QR 업로드에 실패했습니다.',
    }
  }
}

export async function removeOperatorKakaoQr(userId: string): Promise<{ error?: string }> {
  const supabase = createClient()
  const candidates = ['jpg', 'png', 'webp'].map((ext) => `${userId}/kakao-qr.${ext}`)
  const { error } = await supabase.storage.from('avatars').remove(candidates)
  if (error) return { error: error.message }
  return {}
}
