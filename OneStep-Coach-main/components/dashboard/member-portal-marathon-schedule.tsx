'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { format, parseISO, differenceInCalendarDays } from 'date-fns'
import { ko } from 'date-fns/locale'
import {
  CalendarDays,
  ChevronDown,
  ExternalLink,
  MapPin,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { togglePortalMarathonRaceSignup } from '@/lib/actions/portal-marathon-races'
import {
  formatMarathonDistances,
  formatRaceMonthLabel,
  MARATHON_DISTANCE_OPTIONS,
  raceMonthKey,
  type MarathonDistance,
  type PortalMarathonRaceView,
} from '@/lib/portal-marathon-races'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ParticipationToggle } from '@/components/dashboard/participation-toggle'
import { MEMBER_PORTAL_CARD_CLASS } from '@/lib/running-league/member-portal-layout'
import { cn } from '@/lib/utils'

const ALL_MONTHS = '__all__'
const ALL_DISTANCES = '__all__'

function dDayLabel(raceDate: string): string {
  try {
    const days = differenceInCalendarDays(parseISO(raceDate), new Date())
    if (days === 0) return 'D-Day'
    if (days > 0) return `D-${days}`
    return `D+${Math.abs(days)}`
  } catch {
    return ''
  }
}

function weekdayBadge(raceDate: string): string {
  try {
    return format(parseISO(raceDate), 'EEE', { locale: ko }).replace('요일', '')
  } catch {
    return ''
  }
}

function dateBadge(raceDate: string): string {
  try {
    return format(parseISO(raceDate), 'MM/dd')
  } catch {
    return raceDate
  }
}

export function MemberPortalMarathonSchedule({
  races,
  tableReady,
  canParticipate = true,
  readOnly = false,
  className,
  contentOnly = false,
}: {
  races: PortalMarathonRaceView[]
  tableReady: boolean
  canParticipate?: boolean
  readOnly?: boolean
  className?: string
  /** 상위 아코디언에서 헤더 없이 본문만 표시 */
  contentOnly?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [monthKey, setMonthKey] = useState(ALL_MONTHS)
  const [distanceFilter, setDistanceFilter] = useState<string>(ALL_DISTANCES)
  const [pendingRaceId, setPendingRaceId] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [localRaces, setLocalRaces] = useState(races)

  useEffect(() => {
    setLocalRaces(races)
  }, [races])

  const filtered = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    return localRaces.filter((race) => {
      if (race.race_date < today) return false
      if (monthKey !== ALL_MONTHS && raceMonthKey(race.race_date) !== monthKey) return false
      if (
        distanceFilter !== ALL_DISTANCES &&
        !race.distances.includes(distanceFilter as MarathonDistance)
      ) {
        return false
      }
      return true
    })
  }, [distanceFilter, localRaces, monthKey])

  const upcomingLocalRaces = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    return localRaces.filter((race) => race.race_date >= today)
  }, [localRaces])

  const monthOptions = useMemo(() => {
    const keys = [...new Set(upcomingLocalRaces.map((race) => raceMonthKey(race.race_date)))].sort()
    return keys
  }, [upcomingLocalRaces])

  const signedCount = upcomingLocalRaces.filter((race) => race.is_signed_up).length
  const collapsedSummary =
    upcomingLocalRaces.length > 0
      ? `${upcomingLocalRaces.length}개${signedCount > 0 ? ` · ${signedCount}개 참여` : ''}`
      : tableReady
        ? '등록된 대회 없음'
        : '준비 중'

  function handleToggle(race: PortalMarathonRaceView) {
    if (readOnly || !canParticipate) {
      toast.error('로그인 후 참여할 수 있습니다.')
      return
    }
    const previous = race.is_signed_up
    setLocalRaces((current) =>
      current.map((item) =>
        item.id === race.id
          ? {
              ...item,
              is_signed_up: !previous,
              signup_count: Math.max(0, item.signup_count + (previous ? -1 : 1)),
            }
          : item,
      ),
    )
    setPendingRaceId(race.id)
    startTransition(async () => {
      const result = await togglePortalMarathonRaceSignup(race.id)
      setPendingRaceId(null)
      if (!result.ok) {
        setLocalRaces((current) =>
          current.map((item) =>
            item.id === race.id
              ? {
                  ...item,
                  is_signed_up: previous,
                  signup_count: Math.max(0, item.signup_count + (previous ? 1 : -1)),
                }
              : item,
          ),
        )
        toast.error(result.error)
        return
      }
      // router.refresh() 하지 않음 — 모바일/태블릿에서 스크롤·필터·탭이 초기화됨
      toast.success(result.signedUp ? '참여로 표시했습니다.' : '참여를 취소했습니다.')
    })
  }

  const body = (
        <div className={cn('space-y-3 px-3 py-3 sm:px-4', !contentOnly && 'border-t border-orange-500/15')}>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={monthKey} onValueChange={setMonthKey}>
              <SelectTrigger className="h-8 w-[140px] border-orange-500/20 bg-black/30 text-xs">
                <SelectValue placeholder="월 선택" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_MONTHS}>전체 월</SelectItem>
                {monthOptions.map((key) => (
                  <SelectItem key={key} value={key}>
                    {formatRaceMonthLabel(key)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                onClick={() => setDistanceFilter(ALL_DISTANCES)}
                className={cn(
                  'rounded-md px-2 py-1 text-[10px] font-semibold',
                  distanceFilter === ALL_DISTANCES
                    ? 'bg-orange-500/25 text-orange-100'
                    : 'bg-black/30 text-zinc-500',
                )}
              >
                ALL
              </button>
              {MARATHON_DISTANCE_OPTIONS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setDistanceFilter(item.value)}
                  className={cn(
                    'rounded-md px-2 py-1 text-[10px] font-semibold',
                    distanceFilter === item.value
                      ? 'bg-orange-500/25 text-orange-100'
                      : 'bg-black/30 text-zinc-500',
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {!tableReady ? (
            <p className="py-4 text-center text-xs text-zinc-500">
              대회 일정 기능을 준비 중입니다.
            </p>
          ) : filtered.length === 0 ? (
            <p className="py-4 text-center text-xs text-zinc-500">표시할 대회가 없습니다.</p>
          ) : (
            <div className="divide-y divide-orange-500/10">
              {filtered.map((race) => {
                const busy = pending && pendingRaceId === race.id
                return (
                  <div
                    key={race.id}
                    className="flex gap-2.5 py-3 first:pt-1 last:pb-1"
                  >
                    <div className="flex w-11 shrink-0 flex-col items-center gap-1">
                      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-orange-500/20 text-[11px] font-bold text-orange-200">
                        {weekdayBadge(race.race_date)}
                      </span>
                      <span className="text-[10px] tabular-nums text-zinc-400">
                        {dateBadge(race.race_date)}
                      </span>
                    </div>

                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="text-sm font-medium text-zinc-100">{race.title}</p>
                        <span className="rounded bg-sky-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-sky-200">
                          {dDayLabel(race.race_date)}
                        </span>
                        {race.is_open_for_apply ? (
                          <span className="rounded bg-orange-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-orange-200">
                            신청가능
                          </span>
                        ) : null}
                      </div>
                      {race.location ? (
                        <p className="flex items-center gap-1 text-xs text-zinc-400">
                          <MapPin className="h-3 w-3 shrink-0" aria-hidden />
                          <span className="truncate">{race.location}</span>
                        </p>
                      ) : null}
                      {race.distances.length > 0 ? (
                        <p className="text-xs text-zinc-500">
                          {formatMarathonDistances(race.distances)}
                        </p>
                      ) : null}
                      <div className="flex flex-wrap items-center gap-2 pt-0.5">
                        {race.apply_url ? (
                          <Button
                            asChild
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 border-orange-500/30 bg-orange-500/5 px-2 text-[11px] text-orange-100"
                          >
                            <a
                              href={race.apply_url}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              참가신청
                              <ExternalLink className="ml-1 h-3 w-3" aria-hidden />
                            </a>
                          </Button>
                        ) : null}
                        <span className="inline-flex items-center gap-1 text-[11px] text-zinc-500">
                          <Users className="h-3 w-3" aria-hidden />
                          {race.signup_count}명 참여
                        </span>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-start">
                      <ParticipationToggle
                        active={race.is_signed_up}
                        pending={busy}
                        disabled={readOnly || !canParticipate}
                        onToggle={() => handleToggle(race)}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
  )

  if (contentOnly) {
    return body
  }

  return (
    <div className={cn(MEMBER_PORTAL_CARD_CLASS, className)}>
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left transition-colors hover:bg-orange-500/5 sm:px-4"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <div className="flex min-w-0 items-center gap-2">
          <CalendarDays className="h-4 w-4 shrink-0 text-orange-400" aria-hidden />
          <h2 className="text-sm font-semibold text-orange-100">대회 일정</h2>
          {!open ? (
            <span className="truncate text-xs text-zinc-500">{collapsedSummary}</span>
          ) : null}
        </div>
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 text-zinc-500 transition-transform',
            open && 'rotate-180',
          )}
          aria-hidden
        />
      </button>

      {open ? body : null}
    </div>
  )
}
