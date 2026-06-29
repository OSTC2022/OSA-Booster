import type { UserRole } from '@/lib/types'
import { isAdultPortalUser } from '@/lib/operator-access'

export function isMemberPortalRole(role: UserRole | string | null | undefined): boolean {
  return (
    role === 'member' ||
    role === 'guardian' ||
    role === 'adult_member' ||
    role === 'operator'
  )
}

export { isAdultPortalUser }

export function isMemberPortalPath(pathname: string): boolean {
  return pathname === '/dashboard/my' || pathname.startsWith('/dashboard/my/')
}

/** 성인회원 포털 전용 레이아웃(하단 탭·포털 헤더). 운영진은 사이드바 레이아웃 사용 */
export function usesMemberPortalShell(role: UserRole | string | null | undefined): boolean {
  return isMemberPortalRole(role) && role !== 'operator'
}
