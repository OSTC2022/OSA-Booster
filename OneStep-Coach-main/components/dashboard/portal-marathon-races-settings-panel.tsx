'use client'

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { format, parseISO, differenceInCalendarDays } from 'date-fns'
import { ko } from 'date-fns/locale'
import {
  CalendarDays,
  Check,
  ExternalLink,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  addPortalMarathonRaceFromOnline,
  deletePortalMarathonRace,
  upsertPortalMarathonRace,
} from '@/lib/actions/portal-marathon-races'
import {
  formatMarathonDistances,
  MARATHON_DISTANCE_OPTIONS,
  type MarathonDistance,
  type PortalMarathonRaceView,
} from '@/lib/portal-marathon-races'
import type { MarathonOnlineRace } from '@/lib/marathon-online/parse-schedule'
import { MARATHON_ONLINE_REGIONS } from '@/lib/marathon-online/regions'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { cn } from '@/lib/utils'

type Draft = {
  id?: string
  title: string
  location: string
  race_date: string
  distances: MarathonDistance[]
  apply_url: string
  is_open_for_apply: boolean
  is_published: boolean
  notes: string
  sort_order: number
}

const EMPTY_DRAFT: Draft = {
  title: '',
  location: '',
  race_date: '',
  distances: [],
  apply_url: '',
  is_open_for_apply: true,
  is_published: true,
  notes: '',
  sort_order: 0,
}

const ALL_REGIONS = '__all__'
const ALL_MONTHS = '__all__'

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

function dateBadge(raceDate: string): string {
  try {
    return format(parseISO(raceDate), 'EEE MM/dd', { locale: ko }).replace('요일', '')
  } catch {
    return raceDate
  }
}

function raceKey(title: string, raceDate: string): string {
  return `${raceDate}::${title.trim()}`
}

export function PortalMarathonRacesSettingsPanel({
  initialRaces,
  tableReady,
  loadError,
}: {
  initialRaces: PortalMarathonRaceView[]
  tableReady: boolean
  loadError?: string | null
}) {
  const router = useRouter()
  const [races, setRaces] = useState(initialRaces)
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [pending, startTransition] = useTransition()
  const [recommend, setRecommend] = useState<MarathonOnlineRace[]>([])
  const [recommendLoading, setRecommendLoading] = useState(false)
  const [recommendError, setRecommendError] = useState<string | null>(null)
  const [regionFilter, setRegionFilter] = useState(ALL_REGIONS)
  const [monthFilter, setMonthFilter] = useState(ALL_MONTHS)
  const [openOnly, setOpenOnly] = useState(false)
  const [addingKey, setAddingKey] = useState<string | null>(null)
  const year = new Date().getFullYear()

  useEffect(() => {
    setRaces(initialRaces)
  }, [initialRaces])

  const addedKeys = useMemo(
    () => new Set(races.map((race) => raceKey(race.title, race.race_date))),
    [races],
  )

  const upcomingRegistered = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    return races.filter((race) => race.race_date >= today)
  }, [races])

  const loadRecommend = useCallback(async () => {
    setRecommendLoading(true)
    setRecommendError(null)
    try {
      const params = new URLSearchParams({ year: String(year) })
      if (regionFilter !== ALL_REGIONS) params.set('region', regionFilter)
      if (monthFilter !== ALL_MONTHS) params.set('month', monthFilter)
      if (openOnly) params.set('openOnly', '1')
      const response = await fetch(`/api/marathon-online?${params.toString()}`, {
        cache: 'no-store',
      })
      const json = (await response.json()) as {
        races?: MarathonOnlineRace[]
        error?: string
      }
      if (!response.ok || json.error) {
        setRecommend([])
        setRecommendError(json.error || '외부 일정을 불러오지 못했습니다.')
        return
      }
      setRecommend(json.races ?? [])
    } catch {
      setRecommend([])
      setRecommendError('외부 일정을 불러오지 못했습니다.')
    } finally {
      setRecommendLoading(false)
    }
  }, [monthFilter, openOnly, regionFilter, year])

  useEffect(() => {
    if (!tableReady) return
    void loadRecommend()
  }, [loadRecommend, tableReady])

  function startEdit(race: PortalMarathonRaceView) {
    setDraft({
      id: race.id,
      title: race.title,
      location: race.location ?? '',
      race_date: race.race_date,
      distances: [...race.distances],
      apply_url: race.apply_url ?? '',
      is_open_for_apply: race.is_open_for_apply,
      is_published: race.is_published,
      notes: race.notes ?? '',
      sort_order: race.sort_order,
    })
  }

  function fillDraftFromOnline(race: MarathonOnlineRace) {
    setDraft({
      title: race.title,
      location: [race.region, race.venue].filter(Boolean).join(' · '),
      race_date: race.raceDate,
      distances: [...race.distances],
      apply_url: race.applyUrl ?? '',
      is_open_for_apply: race.isOpenForApply,
      is_published: true,
      notes: [race.distancesRaw ? `종목: ${race.distancesRaw}` : null, race.detailUrl]
        .filter(Boolean)
        .join('\n'),
      sort_order: 0,
    })
    toast.message('양식에 넣었습니다. 아래에서 확인 후 저장하세요.')
  }

  function toggleDistance(value: MarathonDistance) {
    setDraft((current) => ({
      ...current,
      distances: current.distances.includes(value)
        ? current.distances.filter((item) => item !== value)
        : [...current.distances, value],
    }))
  }

  function handleSave() {
    startTransition(async () => {
      const result = await upsertPortalMarathonRace({
        id: draft.id,
        title: draft.title,
        location: draft.location,
        race_date: draft.race_date,
        distances: draft.distances,
        apply_url: draft.apply_url,
        is_open_for_apply: draft.is_open_for_apply,
        is_published: draft.is_published,
        notes: draft.notes,
        sort_order: draft.sort_order,
      })
      if (result.error) {
        toast.error('저장 실패', { description: result.error })
        return
      }
      toast.success(draft.id ? '대회가 수정되었습니다.' : '대회가 추가되었습니다.')
      setDraft(EMPTY_DRAFT)
      router.refresh()
    })
  }

  function handleQuickAdd(race: MarathonOnlineRace) {
    const key = raceKey(race.title, race.raceDate)
    if (addedKeys.has(key)) {
      toast.message('이미 추가된 대회입니다.')
      return
    }
    setAddingKey(key)
    startTransition(async () => {
      const result = await addPortalMarathonRaceFromOnline({
        title: race.title,
        race_date: race.raceDate,
        region: race.region,
        venue: race.venue,
        distances: race.distances,
        distances_raw: race.distancesRaw,
        apply_url: race.applyUrl,
        is_open_for_apply: race.isOpenForApply,
        detail_url: race.detailUrl,
      })
      setAddingKey(null)
      if (result.error) {
        toast.error('추가 실패', { description: result.error })
        return
      }
      if (result.race) {
        setRaces((current) => {
          const withoutDup = current.filter(
            (item) => raceKey(item.title, item.race_date) !== key,
          )
          return [
            ...withoutDup,
            {
              ...result.race!,
              signup_count: 0,
              is_signed_up: false,
            },
          ].sort((a, b) => a.race_date.localeCompare(b.race_date))
        })
      }
      toast.success(result.alreadyAdded ? '이미 등록되어 갱신했습니다.' : '대회가 추가되었습니다.')
      router.refresh()
    })
  }

  function handleDelete(id: string) {
    if (!window.confirm('이 대회를 삭제할까요?')) return
    startTransition(async () => {
      const result = await deletePortalMarathonRace(id)
      if (result.error) {
        toast.error('삭제 실패', { description: result.error })
        return
      }
      setRaces((current) => current.filter((race) => race.id !== id))
      if (draft.id === id) setDraft(EMPTY_DRAFT)
      toast.success('대회가 삭제되었습니다.')
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarDays className="h-4 w-4 text-orange-400" />
            {year}년 대회 추천
          </CardTitle>
          <CardDescription>
            <a
              href="http://www.marathon.pe.kr/index_calendar.html"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-orange-300 hover:underline"
            >
              마라톤온라인 캘린더
              <ExternalLink className="h-3 w-3" />
            </a>
            기준으로 날짜·지역별 대회를 불러옵니다. 지난 대회는 숨깁니다. 추가 버튼만 누르면
            크루 일정에 등록됩니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={regionFilter} onValueChange={setRegionFilter}>
              <SelectTrigger className="h-9 w-[120px]">
                <SelectValue placeholder="지역" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_REGIONS}>전체 지역</SelectItem>
                {MARATHON_ONLINE_REGIONS.map((region) => (
                  <SelectItem key={region} value={region}>
                    {region}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={monthFilter} onValueChange={setMonthFilter}>
              <SelectTrigger className="h-9 w-[110px]">
                <SelectValue placeholder="월" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_MONTHS}>전체 월</SelectItem>
                {Array.from({ length: 12 }, (_, index) => String(index + 1)).map((month) => (
                  <SelectItem key={month} value={month}>
                    {month}월
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <label className="flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm">
              <Checkbox
                checked={openOnly}
                onCheckedChange={(value) => setOpenOnly(value === true)}
              />
              신청가능
            </label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9"
              disabled={recommendLoading}
              onClick={() => void loadRecommend()}
            >
              {recommendLoading ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-1 h-4 w-4" />
              )}
              새로고침
            </Button>
          </div>

          {recommendError ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {recommendError}
            </p>
          ) : null}

          <div className="max-h-[420px] divide-y divide-border overflow-y-auto rounded-lg border border-border">
            {recommendLoading && recommend.length === 0 ? (
              <p className="flex items-center justify-center gap-2 px-3 py-10 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                대회 일정을 불러오는 중…
              </p>
            ) : recommend.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                조건에 맞는 예정 대회가 없습니다.
              </p>
            ) : (
              recommend.map((race) => {
                const key = raceKey(race.title, race.raceDate)
                const added = addedKeys.has(key)
                const busy = pending && addingKey === key
                return (
                  <div
                    key={`${race.externalId}-${race.raceDate}`}
                    className="flex flex-wrap items-start justify-between gap-3 px-3 py-3"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="font-medium text-foreground">
                        {race.title}
                        {race.isOpenForApply ? (
                          <span className="ml-2 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                            신청가능
                          </span>
                        ) : null}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {[
                          race.region,
                          dateBadge(race.raceDate),
                          dDayLabel(race.raceDate),
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {[
                          race.venue,
                          race.distancesRaw || formatMarathonDistances(race.distances),
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={pending}
                        onClick={() => fillDraftFromOnline(race)}
                      >
                        양식에 넣기
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        disabled={pending || added}
                        className={cn(
                          added
                            ? 'bg-emerald-600/20 text-emerald-200 hover:bg-emerald-600/25'
                            : 'bg-emerald-600 text-white hover:bg-emerald-500',
                        )}
                        onClick={() => handleQuickAdd(race)}
                      >
                        {busy ? (
                          <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                        ) : added ? (
                          <Check className="mr-1 h-3.5 w-3.5" />
                        ) : (
                          <Plus className="mr-1 h-3.5 w-3.5" />
                        )}
                        {added ? '추가됨' : '대회 추가'}
                      </Button>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarDays className="h-4 w-4 text-orange-400" />
            마라톤 일정
          </CardTitle>
          <CardDescription>
            성인 러닝 포털에 표시됩니다. 지난 대회는 포털/목록에서 자동으로 숨깁니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {loadError ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {loadError}
            </p>
          ) : null}
          {!tableReady && !loadError ? (
            <p className="text-sm text-muted-foreground">
              supabase/add-portal-marathon-races.sql 을 실행한 뒤 새로고침하세요.
            </p>
          ) : null}

          <div className="space-y-3 rounded-lg border border-border bg-muted/10 p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="marathon-title">대회명</Label>
                <Input
                  id="marathon-title"
                  value={draft.title}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, title: event.target.value }))
                  }
                  placeholder="예) 2026 안양천 달빛 나이트런"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="marathon-date">대회 날짜</Label>
                <Input
                  id="marathon-date"
                  type="date"
                  value={draft.race_date}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, race_date: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="marathon-location">지역·장소</Label>
                <Input
                  id="marathon-location"
                  value={draft.location}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, location: event.target.value }))
                  }
                  placeholder="예) 서울 · 신정교 하부"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="marathon-url">참가신청 URL</Label>
                <Input
                  id="marathon-url"
                  value={draft.apply_url}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, apply_url: event.target.value }))
                  }
                  placeholder="https://..."
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>거리</Label>
              <div className="flex flex-wrap gap-2">
                {MARATHON_DISTANCE_OPTIONS.map((item) => {
                  const checked = draft.distances.includes(item.value)
                  return (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => toggleDistance(item.value)}
                      className={cn(
                        'rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors',
                        checked
                          ? 'border-orange-500/50 bg-orange-500/15 text-orange-100'
                          : 'border-border bg-background text-muted-foreground',
                      )}
                    >
                      {item.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={draft.is_open_for_apply}
                  onCheckedChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      is_open_for_apply: value === true,
                    }))
                  }
                />
                신청가능 배지
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={draft.is_published}
                  onCheckedChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      is_published: value === true,
                    }))
                  }
                />
                포털에 공개
              </label>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={handleSave} disabled={pending}>
                <Plus className="mr-1 h-4 w-4" aria-hidden />
                {draft.id ? '수정 저장' : '대회 추가'}
              </Button>
              {draft.id || draft.title ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending}
                  onClick={() => setDraft(EMPTY_DRAFT)}
                >
                  작성 취소
                </Button>
              ) : null}
            </div>
          </div>

          <div className="divide-y divide-border rounded-lg border border-border">
            {upcomingRegistered.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                등록된 예정 대회가 없습니다. 위에서 추가하세요.
              </p>
            ) : (
              upcomingRegistered.map((race) => (
                <div
                  key={race.id}
                  className="flex flex-wrap items-start justify-between gap-3 px-3 py-3"
                >
                  <div className="min-w-0 space-y-0.5">
                    <p className="font-medium text-foreground">
                      {race.title}
                      {race.is_open_for_apply ? (
                        <span className="ml-2 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                          신청가능
                        </span>
                      ) : null}
                      {!race.is_published ? (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          (비공개)
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {[
                        race.location,
                        dateBadge(race.race_date),
                        dDayLabel(race.race_date),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {[
                        race.apply_url,
                        formatMarathonDistances(race.distances),
                        `${race.signup_count}명 참여`,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      onClick={() => startEdit(race)}
                    >
                      <Pencil className="mr-1 h-3.5 w-3.5" aria-hidden />
                      수정
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      disabled={pending}
                      onClick={() => handleDelete(race.id)}
                      aria-label="삭제"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
