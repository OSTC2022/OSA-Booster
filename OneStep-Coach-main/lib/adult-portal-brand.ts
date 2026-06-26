import { RUNNING_LEAGUE_EN } from '@/lib/running-league-content'
import type { CenterSettings } from '@/lib/types'

export const DEFAULT_ADULT_PORTAL_BRAND_TITLE = '내 러닝 포털'

export type AdultPortalBrandConfig = {
  eyebrow: string
  title: string
  eyebrowColor: string | null
  titleColor: string | null
  eyebrowSize: string | null
  titleSize: string | null
  eyebrowWeight: string | null
  titleWeight: string | null
  hidden: boolean
}

export const ADULT_PORTAL_BRAND_EYEBROW_SIZE_OPTIONS = [
  { value: '', label: '기본 (11px)' },
  { value: '10px', label: '10px' },
  { value: '11px', label: '11px' },
  { value: '12px', label: '12px' },
  { value: '13px', label: '13px' },
  { value: '14px', label: '14px' },
] as const

export const ADULT_PORTAL_BRAND_TITLE_SIZE_OPTIONS = [
  { value: '', label: '기본 (24px)' },
  { value: '20px', label: '20px' },
  { value: '24px', label: '24px' },
  { value: '28px', label: '28px' },
  { value: '32px', label: '32px' },
  { value: '36px', label: '36px' },
] as const

export const ADULT_PORTAL_BRAND_WEIGHT_OPTIONS = [
  { value: '', label: '기본' },
  { value: '500', label: '보통 (500)' },
  { value: '600', label: '세미볼드 (600)' },
  { value: '700', label: '볼드 (700)' },
  { value: '800', label: '엑스트라볼드 (800)' },
] as const

function normalizeOptionalText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

function normalizeHexColor(value: unknown): string | null {
  const text = normalizeOptionalText(value)
  if (!text) return null
  if (/^#[0-9A-Fa-f]{6}$/.test(text)) return text
  if (/^#[0-9A-Fa-f]{3}$/.test(text)) return text
  return null
}

export function resolveAdultPortalBrand(
  settings?: Pick<
    CenterSettings,
    | 'adult_portal_brand_eyebrow'
    | 'adult_portal_brand_title'
    | 'adult_portal_brand_eyebrow_color'
    | 'adult_portal_brand_title_color'
    | 'adult_portal_brand_eyebrow_size'
    | 'adult_portal_brand_title_size'
    | 'adult_portal_brand_eyebrow_weight'
    | 'adult_portal_brand_title_weight'
    | 'adult_portal_brand_hidden'
  > | null,
): AdultPortalBrandConfig {
  return {
    eyebrow: settings?.adult_portal_brand_eyebrow?.trim() || RUNNING_LEAGUE_EN,
    title: settings?.adult_portal_brand_title?.trim() || DEFAULT_ADULT_PORTAL_BRAND_TITLE,
    eyebrowColor: normalizeHexColor(settings?.adult_portal_brand_eyebrow_color),
    titleColor: normalizeHexColor(settings?.adult_portal_brand_title_color),
    eyebrowSize: normalizeOptionalText(settings?.adult_portal_brand_eyebrow_size),
    titleSize: normalizeOptionalText(settings?.adult_portal_brand_title_size),
    eyebrowWeight: normalizeOptionalText(settings?.adult_portal_brand_eyebrow_weight),
    titleWeight: normalizeOptionalText(settings?.adult_portal_brand_title_weight),
    hidden: Boolean(settings?.adult_portal_brand_hidden),
  }
}
