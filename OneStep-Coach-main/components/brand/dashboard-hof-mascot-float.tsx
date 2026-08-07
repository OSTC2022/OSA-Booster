'use client'

import { useEffect, useState } from 'react'
import { BoosterMascot } from '@/components/brand/booster-mascot'
import { BoosterSSymbol } from '@/components/brand/booster-running-crew-mark'
import { HallOfFameDialog } from '@/components/brand/hall-of-fame-dialog'
import { OperatorContactDialog } from '@/components/brand/operator-contact-dialog'
import { prefetchHallOfFameEntries } from '@/lib/hall-of-fame-client'
import { prefetchOperatorContacts } from '@/lib/operator-contacts-client'
import { cn } from '@/lib/utils'

/** 로그인 후 우측 상단 — 헤더 아이콘과 겹치지 않게 헤더 아래에 작게 표시 */
export function DashboardHofMascotFloat({ className }: { className?: string }) {
  const [hallOfFameOpen, setHallOfFameOpen] = useState(false)
  const [operatorContactOpen, setOperatorContactOpen] = useState(false)

  useEffect(() => {
    prefetchHallOfFameEntries()
    prefetchOperatorContacts()
  }, [])

  return (
    <>
      <div
        className={cn(
          'pointer-events-none fixed right-1.5 z-30 flex items-start gap-1.5 sm:right-3 sm:gap-2',
          // sticky header(h-14) + safe-area 아래로 — 알림/공유/프로필 아이콘과 겹치지 않음
          'top-[calc(3.5rem+env(safe-area-inset-top,0px)+0.35rem)]',
          className,
        )}
        onPointerEnter={() => {
          prefetchHallOfFameEntries()
          prefetchOperatorContacts()
        }}
      >
        <div className="pointer-events-auto">
          <BoosterSSymbol
            size="xs"
            interactive
            onClick={() => setHallOfFameOpen(true)}
            className="opacity-95 drop-shadow-[0_4px_12px_rgba(0,0,0,0.45)]"
          />
        </div>
        <div className="pointer-events-auto">
          <BoosterMascot
            size="xs"
            interactive
            onClick={() => setOperatorContactOpen(true)}
            className="opacity-95 drop-shadow-[0_4px_12px_rgba(0,0,0,0.45)]"
          />
        </div>
      </div>

      <HallOfFameDialog open={hallOfFameOpen} onOpenChange={setHallOfFameOpen} />
      <OperatorContactDialog
        open={operatorContactOpen}
        onOpenChange={setOperatorContactOpen}
      />
    </>
  )
}
