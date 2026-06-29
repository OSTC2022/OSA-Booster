import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { requireDashboardProfile } from '@/lib/auth/dashboard-user'
import { canAccessSettingsArea } from '@/lib/operator-access'
import { SettingsNav } from './settings-nav'

export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const user = await requireDashboardProfile()
  if (!canAccessSettingsArea(user.role)) redirect('/unauthorized')

  return (
    <div className="w-full min-w-0 max-w-full space-y-6 pt-12 lg:pt-0">
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold lg:text-3xl">설정</h1>
          <p className="mt-1 text-muted-foreground">
            {user.role === 'operator'
              ? '가입 승인·성인 러닝 포털·스케줄·공지를 관리합니다.'
              : '계정·권한·센터 연락 채널을 관리합니다.'}
          </p>
        </div>
        <SettingsNav userRole={user.role} />
      </div>
      {children}
    </div>
  )
}
