import type { AppRole, UserRole } from '@/lib/types'
import { isMemberPortalPath } from '@/lib/member-portal-routes'
import type { SettingsAssignableRole } from '@/lib/settings-accounts-types'

export const ADMIN_OR_OPERATOR_ROLES: UserRole[] = ['admin', 'operator']

export function isOperatorRole(
  role: UserRole | AppRole | string | null | undefined,
): boolean {
  return role === 'operator'
}

export function canManagePendingApprovals(
  role: UserRole | AppRole | string | null | undefined,
): boolean {
  return role === 'admin' || role === 'operator'
}

export function canAccessSettingsArea(
  role: UserRole | AppRole | string | null | undefined,
): boolean {
  return role === 'admin' || role === 'operator'
}

/** 성인 러닝 포털 플레이어(마이페이지·PB·기록) */
export function isAdultPortalUser(
  role: UserRole | AppRole | string | null | undefined,
): boolean {
  return role === 'adult_member' || role === 'operator'
}

export function isOperatorApprovalRoleAllowed(role: SettingsAssignableRole): boolean {
  return role !== 'admin'
}

const OPERATOR_SETTINGS_PATHS = [
  '/dashboard/settings',
  '/dashboard/settings/adult-running-portal',
  '/dashboard/settings/running-schedule',
  '/dashboard/settings/center-board',
  '/dashboard/settings/adult-center-board',
] as const

export function canOperatorAccessPath(pathname: string): boolean {
  if (isMemberPortalPath(pathname)) return true
  return OPERATOR_SETTINGS_PATHS.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  )
}

const OPERATOR_SETTINGS_NAV_HREFS = new Set<string>([
  '/dashboard/settings',
  '/dashboard/settings/adult-running-portal',
  '/dashboard/settings/running-schedule',
  '/dashboard/settings/center-board',
  '/dashboard/settings/adult-center-board',
])

export function isOperatorSettingsNavHref(href: string): boolean {
  return OPERATOR_SETTINGS_NAV_HREFS.has(href)
}

const OPERATOR_CENTER_SETTINGS_FIELDS = new Set([
  'adult_portal_blind_member_usage',
  'adult_portal_brand_eyebrow',
  'adult_portal_brand_title',
  'adult_portal_brand_eyebrow_color',
  'adult_portal_brand_title_color',
  'adult_portal_brand_eyebrow_size',
  'adult_portal_brand_title_size',
  'adult_portal_brand_eyebrow_weight',
  'adult_portal_brand_title_weight',
  'adult_portal_brand_hidden',
  'adult_portal_ranking_period_start',
  'adult_portal_ranking_period_end',
  'adult_portal_chase_member_id',
  'adult_portal_chase_label',
  'adult_portal_notice',
  'adult_portal_mileage_min_km_enabled',
  'adult_portal_mileage_min_km',
])

export function filterCenterSettingsForOperator<T extends Record<string, unknown>>(
  formData: T,
): T {
  const next = { ...formData }
  for (const key of Object.keys(next)) {
    if (!OPERATOR_CENTER_SETTINGS_FIELDS.has(key)) {
      delete next[key]
    }
  }
  return next
}
