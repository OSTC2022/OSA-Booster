'use client'

import { ChevronDown, Megaphone } from 'lucide-react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { MEMBER_PORTAL_CARD_CLASS } from '@/lib/running-league/member-portal-layout'
import { cn } from '@/lib/utils'

type MemberPortalNoticePanelProps = {
  notice?: string | null
  className?: string
}

export function MemberPortalNoticePanel({
  notice,
  className,
}: MemberPortalNoticePanelProps) {
  const trimmed = notice?.trim()
  if (!trimmed) return null

  return (
    <Collapsible
      defaultOpen={false}
      className={cn('group', MEMBER_PORTAL_CARD_CLASS, className)}
    >
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left transition-colors hover:bg-lime-500/5">
        <span className="flex min-w-0 items-center gap-2">
          <Megaphone className="h-4 w-4 shrink-0 text-lime-300" aria-hidden />
          <span className="text-sm font-semibold text-lime-100">공지사항</span>
        </span>
        <ChevronDown
          className="h-4 w-4 shrink-0 text-zinc-400 transition-transform group-data-[state=open]:rotate-180"
          aria-hidden
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="border-t border-lime-500/15 px-3 py-3">
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">{trimmed}</p>
      </CollapsibleContent>
    </Collapsible>
  )
}
