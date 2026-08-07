import { createServiceRoleClient } from '@/lib/supabase/admin'

export type OperatorPublicContact = {
  id: string
  full_name: string
  kakao_id: string | null
  instagram_id: string | null
  kakao_qr_url: string | null
}

function hasAnyContact(row: {
  kakao_id?: string | null
  instagram_id?: string | null
  kakao_qr_url?: string | null
}) {
  return Boolean(
    row.kakao_id?.trim() || row.instagram_id?.trim() || row.kakao_qr_url?.trim(),
  )
}

/** 로그인 화면용 — 연락처가 등록된 운영진만 */
export async function listOperatorPublicContacts(): Promise<OperatorPublicContact[]> {
  try {
    const admin = createServiceRoleClient()
    const { data, error } = await admin
      .from('profiles')
      .select('id, full_name, kakao_id, instagram_id, kakao_qr_url')
      .eq('role', 'operator')
      .eq('approval_status', 'approved')
      .order('full_name', { ascending: true })

    if (error) {
      // kakao_qr_url 컬럼 없을 때 폴백
      if (/kakao_qr_url/i.test(error.message)) {
        const fallback = await admin
          .from('profiles')
          .select('id, full_name, kakao_id, instagram_id')
          .eq('role', 'operator')
          .eq('approval_status', 'approved')
          .order('full_name', { ascending: true })
        if (fallback.error || !fallback.data) return []
        return fallback.data
          .filter((row) => hasAnyContact(row))
          .map((row) => ({
            id: row.id,
            full_name: row.full_name?.trim() || '운영진',
            kakao_id: row.kakao_id ?? null,
            instagram_id: row.instagram_id ?? null,
            kakao_qr_url: null,
          }))
      }
      console.error('[operator-contacts]', error.message)
      return []
    }

    return (data ?? [])
      .filter((row) => hasAnyContact(row))
      .map((row) => ({
        id: row.id,
        full_name: row.full_name?.trim() || '운영진',
        kakao_id: row.kakao_id ?? null,
        instagram_id: row.instagram_id ?? null,
        kakao_qr_url: row.kakao_qr_url ?? null,
      }))
  } catch (error) {
    console.error('[operator-contacts]', error)
    return []
  }
}
