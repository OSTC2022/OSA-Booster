'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { LogOut, User as UserIcon } from 'lucide-react'
import { toast } from 'sonner'
import type { User } from '@/lib/types'
import { NotificationBell } from '@/components/dashboard/notification-bell'
import { MemberBackupHeaderMenu } from '@/components/dashboard/member-backup-header-menu'
import { UserAvatar } from '@/components/dashboard/user-avatar'
import { InstallAppButton } from '@/components/pwa/install-app-button'
import { ShareWebsiteButton } from '@/components/pwa/share-website-button'
import { BrandPulseAppIcon } from '@/components/brand/brand-pulse-mark'
import { MemberCenterContactDialog } from '@/components/members/member-center-contact-dialog'

interface DashboardHeaderProps {
  user: User | null
}

export function DashboardHeader({ user }: DashboardHeaderProps) {
  const router = useRouter()
  const [centerContactOpen, setCenterContactOpen] = useState(false)

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    toast.success('로그아웃 되었습니다.')
    router.push('/auth/login')
    router.refresh()
  }

  return (
    <>
      <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-border bg-background px-4 md:bg-background/95 md:backdrop-blur md:supports-[backdrop-filter]:bg-background/60 sm:gap-3">
        <SidebarTrigger className="-ml-1" />

        <div className="flex-1" />

        {/* 알림 > 링크 > 앱설치 > 원스텝심볼 > 프로필 */}
        {user ? <NotificationBell userId={user.id} /> : null}
        <ShareWebsiteButton />
        <InstallAppButton showLabel={false} size="icon" className="h-9 w-9 shrink-0" />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0"
          aria-label="코치 & 센터 연락"
          title="코치 & 센터 연락"
          onClick={() => setCenterContactOpen(true)}
        >
          <BrandPulseAppIcon className="h-7 w-7" glow />
        </Button>
        {user?.role === 'admin' ? <MemberBackupHeaderMenu /> : null}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-9 w-9 rounded-full p-0">
              <UserAvatar user={user ?? {}} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="end" forceMount>
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">
                  {user?.full_name || '사용자'}
                </p>
                <p className="text-xs leading-none text-muted-foreground">
                  {user?.email}
                </p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/dashboard/profile">
                <UserIcon className="mr-2 h-4 w-4" />
                <span>프로필 수정</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleSignOut}
              className="text-destructive focus:text-destructive"
            >
              <LogOut className="mr-2 h-4 w-4" />
              <span>로그아웃</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>
      <MemberCenterContactDialog
        open={centerContactOpen}
        onOpenChange={setCenterContactOpen}
      />
    </>
  )
}
