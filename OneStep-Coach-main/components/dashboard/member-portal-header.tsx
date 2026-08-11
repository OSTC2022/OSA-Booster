'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Download, LogOut, Share2, User as UserIcon } from 'lucide-react'
import { BrandPulseAppIcon } from '@/components/brand/brand-pulse-mark'
import { MemberCenterContactDialog } from '@/components/members/member-center-contact-dialog'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { NotificationBell } from '@/components/dashboard/notification-bell'
import { MemberBoardPopover } from '@/components/dashboard/member-board-popover'
import { UserAvatar } from '@/components/dashboard/user-avatar'
import { InstallAppButton } from '@/components/pwa/install-app-button'
import { ShareWebsiteButton, shareLoginUrl } from '@/components/pwa/share-website-button'
import { isStandaloneDisplay, triggerPwaInstall } from '@/lib/pwa/install-prompt'
import type { User } from '@/lib/types'
import { isAdultPortalUser } from '@/lib/member-portal-routes'
import { toast } from 'sonner'

function portalTitle(pathname: string, hash: string, role?: string | null): string {
  const isAdult = isAdultPortalUser(role)
  if (pathname.startsWith('/dashboard/my/running-league')) return '러닝 챌린지'
  if (pathname.startsWith('/dashboard/my/profile')) return '프로필'
  if (pathname.startsWith('/dashboard/my/body')) {
    return hash === '#today-record' ? (isAdult ? '컨디션' : '오늘 기록') : isAdult ? '컨디션' : '리포트'
  }
  if (pathname.startsWith('/dashboard/my/sessions')) return '수업'
  if (pathname.startsWith('/dashboard/my/run-point')) return 'RUN POINT SHOP'
  return isAdult ? '내 러닝 포털' : '내 선수 리포트'
}

function portalBrandLabel(role?: string | null): string {
  return isAdultPortalUser(role) ? 'BOOSTER RUNNING CREW' : 'Booster Athlete'
}

interface MemberPortalHeaderProps {
  user: User
}

export function MemberPortalHeader({ user }: MemberPortalHeaderProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [hash, setHash] = useState('')
  const [centerContactOpen, setCenterContactOpen] = useState(false)

  useEffect(() => {
    function syncHash() {
      setHash(window.location.hash)
    }
    syncHash()
    window.addEventListener('hashchange', syncHash)
    return () => window.removeEventListener('hashchange', syncHash)
  }, [pathname])

  const title = portalTitle(pathname, hash, user.role)
  const brandLabel = portalBrandLabel(user.role)

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    toast.success('로그아웃 되었습니다.')
    router.push('/auth/login')
    router.refresh()
  }

  async function handleShareFromMenu() {
    const result = await shareLoginUrl()
    if (result === 'copied') {
      toast.success('로그인 주소가 복사되었습니다.')
      return
    }
    if (result === 'shared') return
    toast.error('링크 복사에 실패했습니다.')
  }

  async function handleInstallFromMenu() {
    if (isStandaloneDisplay()) {
      toast.success('이미 앱으로 실행 중입니다.')
      return
    }
    const outcome = await triggerPwaInstall()
    if (outcome === 'accepted') {
      toast.success('홈 화면에 추가되었습니다.')
      return
    }
    if (outcome === 'dismissed') return
    toast.error('지금은 자동 설치를 사용할 수 없습니다.')
  }

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-primary/15 bg-[#090b12]/85 pt-[env(safe-area-inset-top,0px)] backdrop-blur supports-[backdrop-filter]:bg-[#090b12]/70">
        <div className="mx-auto flex h-14 max-w-[1120px] items-center gap-2 px-3 pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] sm:gap-3 sm:px-6 lg:px-8">
          <Link
            href="/dashboard/my"
            className="flex min-w-0 flex-1 items-center sm:flex-none"
          >
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-bold text-foreground">{brandLabel}</p>
              <p className="truncate text-[11px] text-muted-foreground">{title}</p>
            </div>
          </Link>

          <div className="hidden flex-1 sm:block" />

          <div className="relative z-[1] flex shrink-0 items-center gap-0.5 sm:gap-1">
            <MemberBoardPopover
              userId={user.id}
              kind="notice"
              audience={isAdultPortalUser(user.role) ? 'adult' : 'general'}
            />
            <MemberBoardPopover
              userId={user.id}
              kind="event"
              audience={isAdultPortalUser(user.role) ? 'adult' : 'general'}
            />

            {/* 알림 > 링크 > 앱설치 > 원스텝심볼 > 프로필 */}
            <NotificationBell userId={user.id} />
            <ShareWebsiteButton />
            <InstallAppButton showLabel={false} size="icon" className="h-9 w-9 shrink-0" />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0 touch-manipulation"
              aria-label="코치 & 센터 연락"
              title="코치 & 센터 연락"
              onClick={() => setCenterContactOpen(true)}
            >
              <BrandPulseAppIcon className="h-7 w-7" glow />
            </Button>

            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  className="relative h-10 w-10 shrink-0 rounded-full p-0 touch-manipulation"
                  aria-label="프로필 메뉴"
                >
                  <UserAvatar user={user} className="pointer-events-none h-9 w-9" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end" sideOffset={8}>
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">
                      {user.full_name || '사용자'}
                    </p>
                    <p className="text-xs leading-none text-muted-foreground">
                      {user.email}
                    </p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/dashboard/my/profile">
                    <UserIcon className="mr-2 h-4 w-4" />
                    <span>프로필 수정</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem className="md:hidden" onClick={() => void handleShareFromMenu()}>
                  <Share2 className="mr-2 h-4 w-4" />
                  <span>로그인 주소 복사</span>
                </DropdownMenuItem>
                <DropdownMenuItem className="md:hidden" onClick={() => void handleInstallFromMenu()}>
                  <Download className="mr-2 h-4 w-4" />
                  <span>앱 설치</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => void handleSignOut()}
                  className="text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>로그아웃</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>
      <MemberCenterContactDialog
        open={centerContactOpen}
        onOpenChange={setCenterContactOpen}
      />
    </>
  )
}
