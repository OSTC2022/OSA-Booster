'use server'

import { isOperatorApprovalRoleAllowed, filterCenterSettingsForOperator } from '@/lib/operator-access'
import { requireAuth } from '@/lib/actions/auth'
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
  const user = await requireAuth()
  const input =
    user.role === 'operator' ? filterCenterSettingsForOperator(formData) : formData
  if (user.role !== 'admin' && user.role !== 'operator') {
    return { error: '권한이 없습니다.' }
  }
  const supabase = await settingsClient()

  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }

  if (input.name !== undefined) {
    updateData.name = input.name.trim() || '센터'
  }
  if (input.kakao_id !== undefined) {
    updateData.kakao_id = normalizeOptionalString(input.kakao_id)
  }
  if (input.instagram_id !== undefined) {
    updateData.instagram_id = normalizeOptionalString(input.instagram_id)
  }
  if (input.blog_url !== undefined) {
    updateData.blog_url = normalizeOptionalString(input.blog_url)
  }
  if (input.center_phone !== undefined) {
    updateData.center_phone = normalizeOptionalString(input.center_phone)
  }
  if (input.naver_place_url !== undefined) {
    updateData.naver_place_url = normalizeOptionalString(input.naver_place_url)
  }
  if (input.center_address !== undefined) {
    updateData.center_address = normalizeOptionalString(input.center_address)
  }
  if (input.business_hours !== undefined) {
    updateData.business_hours = normalizeOptionalString(input.business_hours)
  }
  if (input.show_instructor_contact !== undefined) {
    updateData.show_instructor_contact = input.show_instructor_contact
  }
  if (input.adult_portal_blind_member_usage !== undefined) {
    updateData.adult_portal_blind_member_usage = input.adult_portal_blind_member_usage
  }
  if (input.adult_portal_brand_eyebrow !== undefined) {
    updateData.adult_portal_brand_eyebrow = normalizeOptionalString(input.adult_portal_brand_eyebrow)
  }
  if (input.adult_portal_brand_title !== undefined) {
    updateData.adult_portal_brand_title = normalizeOptionalString(input.adult_portal_brand_title)
  }
  if (input.adult_portal_brand_eyebrow_color !== undefined) {
    updateData.adult_portal_brand_eyebrow_color = normalizeOptionalString(
      input.adult_portal_brand_eyebrow_color,
    )
  }
  if (input.adult_portal_brand_title_color !== undefined) {
    updateData.adult_portal_brand_title_color = normalizeOptionalString(
      input.adult_portal_brand_title_color,
    )
  }
  if (input.adult_portal_brand_eyebrow_size !== undefined) {
    updateData.adult_portal_brand_eyebrow_size = normalizeOptionalString(
      input.adult_portal_brand_eyebrow_size,
    )
  }
  if (input.adult_portal_brand_title_size !== undefined) {
    updateData.adult_portal_brand_title_size = normalizeOptionalString(
      input.adult_portal_brand_title_size,
    )
  }
  if (input.adult_portal_brand_eyebrow_weight !== undefined) {
    updateData.adult_portal_brand_eyebrow_weight = normalizeOptionalString(
      input.adult_portal_brand_eyebrow_weight,
    )
  }
  if (input.adult_portal_brand_title_weight !== undefined) {
    updateData.adult_portal_brand_title_weight = normalizeOptionalString(
      input.adult_portal_brand_title_weight,
    )
  }
  if (input.adult_portal_brand_hidden !== undefined) {
    updateData.adult_portal_brand_hidden = input.adult_portal_brand_hidden
  }
  if (input.adult_portal_ranking_period_start !== undefined) {
    updateData.adult_portal_ranking_period_start = normalizeOptionalString(
      input.adult_portal_ranking_period_start,
    )
  }
  if (input.adult_portal_ranking_period_end !== undefined) {
    updateData.adult_portal_ranking_period_end = normalizeOptionalString(
      input.adult_portal_ranking_period_end,
    )
  }
  if (input.adult_portal_chase_member_id !== undefined) {
    updateData.adult_portal_chase_member_id = normalizeOptionalString(
      input.adult_portal_chase_member_id,
    )
  }
  if (input.adult_portal_chase_label !== undefined) {
    updateData.adult_portal_chase_label = normalizeOptionalString(input.adult_portal_chase_label)
  }
  if (input.adult_portal_notice !== undefined) {
    updateData.adult_portal_notice = normalizeOptionalString(input.adult_portal_notice)
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
