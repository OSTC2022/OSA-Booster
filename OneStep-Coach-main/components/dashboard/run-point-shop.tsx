'use client'

import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import type { MemberRewardHome } from '@/lib/actions/rewards'
import type { MemberRaffleHome } from '@/lib/actions/raffles'
import { MemberRaffleEventCard } from '@/components/dashboard/member-raffle-event-card'
import { MEMBER_PORTAL_CARD_CLASS, MEMBER_PORTAL_SHELL_CLASS } from '@/lib/running-league/member-portal-layout'
import {
  ACHIEVEMENT_TIER_REWARDS,
  REWARD_RULES,
} from '@/lib/running-league/rewards/config'
import { cn } from '@/lib/utils'

type Props = {
  rewardHome: MemberRewardHome | { unlinked: true }
  raffleHome: MemberRaffleHome
}

function earnRules(): Array<{ label: string; points: number }> {
  const rows: Array<{ label: string; points: number }> = []
  for (const rule of Object.values(REWARD_RULES)) {
    if (rule.point > 0) rows.push({ label: rule.description, points: rule.point })
  }
  for (const [tier, reward] of Object.entries(ACHIEVEMENT_TIER_REWARDS)) {
    if (reward.point > 0) {
      rows.push({ label: `업적 ${tier}`, points: reward.point })
    }
  }
  return rows
}

export function RunPointShop({ rewardHome, raffleHome }: Props) {
  const points =
    rewardHome && !('unlinked' in rewardHome) ? rewardHome.totalPoints : 0
  const rules = earnRules()
  const hasOpenEvent = raffleHome.events.some((card) => card.isOpenForEntry)

  return (
    <div className={cn(MEMBER_PORTAL_SHELL_CLASS, 'space-y-3 pb-8')}>
      <Link
        href="/dashboard/my"
        className="inline-flex min-h-11 items-center gap-1 text-sm text-orange-200/90 hover:text-orange-100"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
        마이페이지
      </Link>

      <section className={cn(MEMBER_PORTAL_CARD_CLASS, 'px-3 py-4 sm:px-4')}>
        <p className="text-[11px] uppercase tracking-[0.16em] text-orange-300/80">ONE STEP</p>
        <h1 className="mt-1 text-xl font-bold text-orange-100">RUN POINT SHOP</h1>
        <p className="mt-3 text-[11px] uppercase tracking-wide text-zinc-500">보유 포인트</p>
        <p className="text-3xl font-bold tabular-nums text-orange-100">
          {points.toLocaleString('ko-KR')} P
        </p>
      </section>

      {raffleHome.tableReady && !hasOpenEvent && raffleHome.events.length === 0 ? (
        <section className={cn(MEMBER_PORTAL_CARD_CLASS, 'px-3 py-4 sm:px-4')}>
          <p className="text-sm text-zinc-300">
            현재 RUN POINT로 참여할 수 있는 이벤트가 없습니다.
          </p>
        </section>
      ) : (
        <MemberRaffleEventCard home={raffleHome} memberLinked shopMode />
      )}

      <section className={cn(MEMBER_PORTAL_CARD_CLASS, 'px-3 py-3 sm:px-4')}>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
          포인트 적립 방법
        </h2>
        {rules.length > 0 ? (
          <ul className="mt-2 space-y-1 text-sm text-zinc-300">
            {rules.map((row) => (
              <li key={row.label} className="flex justify-between gap-2">
                <span>{row.label}</span>
                <span className="tabular-nums text-orange-200">+{row.points}P</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-zinc-400">
            러닝 및 이벤트 참여로 RUN POINT를 모아보세요.
          </p>
        )}
        <p className="mt-3 text-[11px] leading-5 text-zinc-500">
          러닝 및 이벤트 참여로 RUN POINT를 모아보세요. 현금 결제로 포인트를 구매할 수 없습니다.
        </p>
      </section>
    </div>
  )
}
