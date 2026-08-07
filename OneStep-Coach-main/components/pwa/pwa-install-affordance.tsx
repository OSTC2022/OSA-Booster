'use client'

import { usePathname } from 'next/navigation'
import { InstallAppButton } from '@/components/pwa/install-app-button'
import { ShareWebsiteButton } from '@/components/pwa/share-website-button'

/** 대시보드 헤더가 없는 화면(로그인·승인 대기 등)용 고정 설치 버튼 */
export function PwaInstallAffordance() {
  const pathname = usePathname() ?? ''

  if (pathname.startsWith('/dashboard')) return null

  const showShare = pathname.startsWith('/auth/login')

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[70] flex justify-start gap-2 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pl-[max(0.75rem,env(safe-area-inset-left))] pr-24 sm:px-4 sm:pr-28">
      <div className="pointer-events-auto flex items-center gap-2">
        {showShare ? <ShareWebsiteButton /> : null}
        <InstallAppButton showLabel className="shadow-sm" />
      </div>
    </div>
  )
}
