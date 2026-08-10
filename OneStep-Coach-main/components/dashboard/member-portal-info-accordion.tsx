'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { CalendarDays, ChevronDown, Megaphone } from 'lucide-react'
import { MemberPortalNoticePanel } from '@/components/dashboard/member-portal-notice-panel'
import { MemberPortalMarathonSchedule } from '@/components/dashboard/member-portal-marathon-schedule'
import { MemberRunningLeagueTrainingSchedule } from '@/components/dashboard/member-running-league-training-schedule'
import type { RunningLeagueTrainingScheduleDayView } from '@/lib/running-league/training-schedule'
import type { PortalMarathonRaceView } from '@/lib/portal-marathon-races'
import type { CenterBoardPost } from '@/lib/types'
import { MEMBER_PORTAL_CARD_CLASS } from '@/lib/running-league/member-portal-layout'
import { cn } from '@/lib/utils'

type PanelId = 'notice' | 'training' | 'race'

const TAB_LABEL_CLASS =
  'truncate text-[13px] font-semibold leading-tight tracking-tight text-inherit sm:text-sm'

const ACCORDION_STORAGE_KEY = 'member-portal-info-accordion'

function readStoredPanel(): PanelId | null {
  if (typeof window === 'undefined') return null
  try {
    const value = sessionStorage.getItem(ACCORDION_STORAGE_KEY)
    if (value === 'notice' || value === 'training' || value === 'race') return value
  } catch {
    // ignore
  }
  return null
}

type MemberPortalInfoAccordionProps = {
  notice?: string | null
  boardPosts?: CenterBoardPost[]
  trainingDays: RunningLeagueTrainingScheduleDayView[]
  trainingTableReady: boolean
  marathonRaces: PortalMarathonRaceView[]
  marathonTableReady: boolean
  canParticipate?: boolean
  readOnly?: boolean
  className?: string
}

export function MemberPortalInfoAccordion({
  notice = null,
  boardPosts = [],
  trainingDays,
  trainingTableReady,
  marathonRaces,
  marathonTableReady,
  canParticipate = true,
  readOnly = false,
  className,
}: MemberPortalInfoAccordionProps) {
  const [active, setActive] = useState<PanelId | null>(null)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setActive(readStoredPanel())
    setHydrated(true)
  }, [])

  function select(id: PanelId) {
    setActive((current) => {
      const next = current === id ? null : id
      try {
        if (next) sessionStorage.setItem(ACCORDION_STORAGE_KEY, next)
        else sessionStorage.removeItem(ACCORDION_STORAGE_KEY)
      } catch {
        // ignore
      }
      return next
    })
  }

  return (
    <div className={cn('space-y-2', className)}>
      <div className="grid grid-cols-3 gap-2" role="tablist">
        <AccordionTab
          id="notice"
          label="공지사항"
          icon={<Megaphone className="h-3.5 w-3.5 shrink-0" aria-hidden />}
          active={active === 'notice'}
          onSelect={() => select('notice')}
        />
        <AccordionTab
          id="training"
          label="훈련 일정"
          icon={<CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden />}
          active={active === 'training'}
          onSelect={() => select('training')}
        />
        <AccordionTab
          id="race"
          label="대회 일정"
          icon={<CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden />}
          active={active === 'race'}
          onSelect={() => select('race')}
        />
      </div>

      <div
        className={cn(
          MEMBER_PORTAL_CARD_CLASS,
          hydrated && active === 'notice' ? 'block' : 'hidden',
        )}
        role="tabpanel"
        aria-labelledby="portal-info-tab-notice"
        hidden={!hydrated || active !== 'notice'}
      >
        <MemberPortalNoticePanel
          notice={notice}
          boardPosts={boardPosts}
          alwaysShow
          contentOnly
        />
      </div>

      <div
        className={cn(
          MEMBER_PORTAL_CARD_CLASS,
          hydrated && active === 'training' ? 'block' : 'hidden',
        )}
        role="tabpanel"
        aria-labelledby="portal-info-tab-training"
        hidden={!hydrated || active !== 'training'}
      >
        <MemberRunningLeagueTrainingSchedule
          days={trainingDays}
          tableReady={trainingTableReady}
          canParticipate={canParticipate}
          readOnly={readOnly}
          embedded
          contentOnly
        />
      </div>

      <div
        className={cn(
          MEMBER_PORTAL_CARD_CLASS,
          hydrated && active === 'race' ? 'block' : 'hidden',
        )}
        role="tabpanel"
        aria-labelledby="portal-info-tab-race"
        hidden={!hydrated || active !== 'race'}
      >
        <MemberPortalMarathonSchedule
          races={marathonRaces}
          tableReady={marathonTableReady}
          canParticipate={canParticipate}
          readOnly={readOnly}
          contentOnly
        />
      </div>
    </div>
  )
}

function AccordionTab({
  id,
  label,
  icon,
  active,
  onSelect,
}: {
  id: PanelId
  label: string
  icon: ReactNode
  active: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      role="tab"
      id={`portal-info-tab-${id}`}
      aria-selected={active}
      aria-expanded={active}
      onClick={onSelect}
      className={cn(
        'flex min-w-0 items-center justify-center gap-1 rounded-xl border px-1.5 py-2.5 transition-all duration-200 sm:gap-1.5 sm:px-2',
        active
          ? 'border-orange-400/70 bg-orange-500/20 text-orange-50 shadow-[0_0_14px_rgba(255,106,42,0.35)]'
          : 'border-primary/30 bg-[#0b1422]/95 text-orange-100/85 hover:border-orange-400/40 hover:bg-orange-500/10',
      )}
    >
      <span
        className={cn(
          'transition-colors duration-200',
          active ? 'text-orange-300' : 'text-orange-400/75',
        )}
      >
        {icon}
      </span>
      <span className={TAB_LABEL_CLASS}>{label}</span>
      <ChevronDown
        className={cn(
          'h-3.5 w-3.5 shrink-0 text-zinc-500 transition-transform duration-200',
          active && 'rotate-180 text-orange-300',
        )}
        aria-hidden
      />
    </button>
  )
}
