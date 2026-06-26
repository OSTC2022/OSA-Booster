'use server'

import { requireRole } from '@/lib/actions/auth'
import {
  getCenterSettingsCached,
} from '@/lib/data/center-settings-read'
import { createServiceRoleClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath, revalidateTag } from 'next/cache'
import type { CenterSettings } from '@/lib/types'

const CENTER_SETTINGS_ID = 'default'

const CENTER_SETTINGS_MIGRATION_HINTS: Array<{
  fields: readonly string[]
  sql: string
  label: string
}> = [
  {
    fields: [
      'center_phone',
      'naver_place_url',
      'center_address',
      'business_hours',
      'show_instructor_contact',
    ],
    sql: 'supabase/add-center-contact-fields.sql',
    label: '연락처·위치',
  },
  {
    fields: [
      'adult_portal_brand_eyebrow',
      'adult_portal_brand_title',
      'adult_portal_brand_eyebrow_color',
      'adult_portal_brand_title_color',
      'adult_portal_brand_eyebrow_size',
      'adult_portal_brand_title_size',
      'adult_portal_brand_eyebrow_weight',
      'adult_portal_brand_title_weight',
      'adult_portal_brand_hidden',
    ],
    sql: 'supabase/add-adult-portal-brand-settings.sql',
    label: '포털 상단 문구',
  },
  {
    fields: ['adult_portal_blind_member_usage'],
    sql: 'supabase/add-adult-portal-blind-member-usage.sql',
    label: '블라인드 회원 사용',
  },
  {
    fields: ['adult_portal_ranking_period_start', 'adult_portal_ranking_period_end'],
    sql: 'supabase/add-adult-portal-ranking-period.sql',
    label: '랭킹 집계 기간',
  },
  {
    fields: ['adult_portal_notice'],
    sql: 'supabase/add-adult-portal-notice.sql',
    label: '포털 공지사항',
  },
  {
    fields: ['adult_portal_chase_member_id', 'adult_portal_chase_label'],
    sql: 'supabase/add-adult-portal-chase-member.sql 및 add-adult-portal-chase-label.sql',
    label: '이겨라 술래',
  },
]

function migrationHintForUpdatedFields(updatedFields: string[]): string | null {
  for (const hint of CENTER_SETTINGS_MIGRATION_HINTS) {
    if (updatedFields.some((field) => hint.fields.includes(field))) {
      return `${hint.label} 설정은 ${hint.sql} 실행 후 저장됩니다.`
    }
  }
  return null
}

function revalidateCenterSettingsPaths() {
  revalidateTag('center-settings', 'max')
  revalidatePath('/dashboard/settings')
  revalidatePath('/dashboard/settings/adult-running-portal')
  revalidatePath('/dashboard')
  revalidatePath('/dashboard/my')
  revalidatePath('/dashboard/members')
}

function normalizeOptionalString(value?: string | null): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

async function settingsClient() {
  try {
    return createServiceRoleClient()
  } catch {
    return createClient()
  }
}

export async function getCenterSettings(): Promise<CenterSettings> {
  return getCenterSettingsCached()
}

export async function updateCenterSettings(formData: {
  name?: string
  kakao_id?: string
  instagram_id?: string
  blog_url?: string
  center_phone?: string
  naver_place_url?: string
  center_address?: string
  business_hours?: string
  show_instructor_contact?: boolean
  adult_portal_blind_member_usage?: boolean
  adult_portal_brand_eyebrow?: string | null
  adult_portal_brand_title?: string | null
  adult_portal_brand_eyebrow_color?: string | null
  adult_portal_brand_title_color?: string | null
  adult_portal_brand_eyebrow_size?: string | null
  adult_portal_brand_title_size?: string | null
  adult_portal_brand_eyebrow_weight?: string | null
  adult_portal_brand_title_weight?: string | null
  adult_portal_brand_hidden?: boolean
  adult_portal_ranking_period_start?: string | null
  adult_portal_ranking_period_end?: string | null
  adult_portal_chase_member_id?: string | null
  adult_portal_chase_label?: string | null
  adult_portal_notice?: string | null
}): Promise<{ data?: CenterSettings; error?: string }> {
  await requireRole(['admin'])
  const supabase = await settingsClient()

  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }

  if (formData.name !== undefined) {
    updateData.name = formData.name.trim() || '센터'
  }
  if (formData.kakao_id !== undefined) {
    updateData.kakao_id = normalizeOptionalString(formData.kakao_id)
  }
  if (formData.instagram_id !== undefined) {
    updateData.instagram_id = normalizeOptionalString(formData.instagram_id)
  }
  if (formData.blog_url !== undefined) {
    updateData.blog_url = normalizeOptionalString(formData.blog_url)
  }
  if (formData.center_phone !== undefined) {
    updateData.center_phone = normalizeOptionalString(formData.center_phone)
  }
  if (formData.naver_place_url !== undefined) {
    updateData.naver_place_url = normalizeOptionalString(formData.naver_place_url)
  }
  if (formData.center_address !== undefined) {
    updateData.center_address = normalizeOptionalString(formData.center_address)
  }
  if (formData.business_hours !== undefined) {
    updateData.business_hours = normalizeOptionalString(formData.business_hours)
  }
  if (formData.show_instructor_contact !== undefined) {
    updateData.show_instructor_contact = formData.show_instructor_contact
  }
  if (formData.adult_portal_blind_member_usage !== undefined) {
    updateData.adult_portal_blind_member_usage = formData.adult_portal_blind_member_usage
  }
  if (formData.adult_portal_brand_eyebrow !== undefined) {
    updateData.adult_portal_brand_eyebrow = normalizeOptionalString(formData.adult_portal_brand_eyebrow)
  }
  if (formData.adult_portal_brand_title !== undefined) {
    updateData.adult_portal_brand_title = normalizeOptionalString(formData.adult_portal_brand_title)
  }
  if (formData.adult_portal_brand_eyebrow_color !== undefined) {
    updateData.adult_portal_brand_eyebrow_color = normalizeOptionalString(
      formData.adult_portal_brand_eyebrow_color,
    )
  }
  if (formData.adult_portal_brand_title_color !== undefined) {
    updateData.adult_portal_brand_title_color = normalizeOptionalString(
      formData.adult_portal_brand_title_color,
    )
  }
  if (formData.adult_portal_brand_eyebrow_size !== undefined) {
    updateData.adult_portal_brand_eyebrow_size = normalizeOptionalString(
      formData.adult_portal_brand_eyebrow_size,
    )
  }
  if (formData.adult_portal_brand_title_size !== undefined) {
    updateData.adult_portal_brand_title_size = normalizeOptionalString(
      formData.adult_portal_brand_title_size,
    )
  }
  if (formData.adult_portal_brand_eyebrow_weight !== undefined) {
    updateData.adult_portal_brand_eyebrow_weight = normalizeOptionalString(
      formData.adult_portal_brand_eyebrow_weight,
    )
  }
  if (formData.adult_portal_brand_title_weight !== undefined) {
    updateData.adult_portal_brand_title_weight = normalizeOptionalString(
      formData.adult_portal_brand_title_weight,
    )
  }
  if (formData.adult_portal_brand_hidden !== undefined) {
    updateData.adult_portal_brand_hidden = formData.adult_portal_brand_hidden
  }
  if (formData.adult_portal_ranking_period_start !== undefined) {
    updateData.adult_portal_ranking_period_start = normalizeOptionalString(
      formData.adult_portal_ranking_period_start,
    )
  }
  if (formData.adult_portal_ranking_period_end !== undefined) {
    updateData.adult_portal_ranking_period_end = normalizeOptionalString(
      formData.adult_portal_ranking_period_end,
    )
  }
  if (formData.adult_portal_chase_member_id !== undefined) {
    updateData.adult_portal_chase_member_id = normalizeOptionalString(
      formData.adult_portal_chase_member_id,
    )
  }
  if (formData.adult_portal_chase_label !== undefined) {
    updateData.adult_portal_chase_label = normalizeOptionalString(formData.adult_portal_chase_label)
  }
  if (formData.adult_portal_notice !== undefined) {
    updateData.adult_portal_notice = normalizeOptionalString(formData.adult_portal_notice)
  }

  const updatedFields = Object.keys(updateData).filter((key) => key !== 'updated_at')
  if (updatedFields.length === 0) {
    return { data: await getCenterSettings() }
  }

  const payload = {
    id: CENTER_SETTINGS_ID,
    ...updateData,
  }

  const { error } = await supabase.from('center_settings').upsert(payload)

  if (error) {
    console.error('Error updating center settings:', error)
    return {
      error:
        migrationHintForUpdatedFields(updatedFields) ??
        error.message,
    }
  }

  revalidateCenterSettingsPaths()
  return { data: await getCenterSettings() }
}
