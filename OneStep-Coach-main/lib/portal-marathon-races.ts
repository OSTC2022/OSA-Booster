export const MARATHON_DISTANCE_OPTIONS = [
  { value: '5km', label: '5KM' },
  { value: '10km', label: '10KM' },
  { value: 'half', label: 'HALF' },
  { value: 'full', label: 'FULL' },
] as const

export type MarathonDistance = (typeof MARATHON_DISTANCE_OPTIONS)[number]['value']

export type PortalMarathonRace = {
  id: string
  title: string
  location: string | null
  race_date: string
  distances: MarathonDistance[]
  apply_url: string | null
  is_open_for_apply: boolean
  is_published: boolean
  notes: string | null
  sort_order: number
}

export type PortalMarathonRaceView = PortalMarathonRace & {
  signup_count: number
  is_signed_up: boolean
}

export function formatMarathonDistanceLabel(value: string): string {
  const found = MARATHON_DISTANCE_OPTIONS.find((item) => item.value === value)
  return found?.label ?? value
}

export function formatMarathonDistances(distances: ReadonlyArray<string>): string {
  if (distances.length === 0) return ''
  return distances.map(formatMarathonDistanceLabel).join(', ')
}

export function normalizeMarathonDistances(values: ReadonlyArray<string>): MarathonDistance[] {
  const allowed = new Set<string>(MARATHON_DISTANCE_OPTIONS.map((item) => item.value))
  return [...new Set(values.filter((value) => allowed.has(value)))] as MarathonDistance[]
}

export function raceMonthKey(raceDate: string): string {
  return raceDate.slice(0, 7)
}

export function formatRaceMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split('-')
  if (!year || !month) return monthKey
  return `${year}년 ${Number(month)}월`
}
