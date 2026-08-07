import {
  normalizeMarathonDistances,
  type MarathonDistance,
} from '@/lib/portal-marathon-races'
import {
  inferMarathonOnlineRegion,
  type MarathonOnlineRegion,
} from '@/lib/marathon-online/regions'

export type MarathonOnlineRace = {
  externalId: string
  title: string
  raceDate: string
  weekday: string | null
  region: MarathonOnlineRegion
  venue: string
  distancesRaw: string
  distances: MarathonDistance[]
  applyUrl: string | null
  detailUrl: string | null
  isOpenForApply: boolean
  organizer: string | null
}

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#0?39;/g, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

function decodeBasicEntities(value: string): string {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/g, "'")
    .trim()
}

function parseDistances(raw: string): MarathonDistance[] {
  const lower = raw.toLowerCase()
  const found: string[] = []
  if (/풀\s*코스|풀코스|풀마라톤|full|42\.?195|42km/.test(lower) || /(?<![0-9.])풀(?![가-힣])/.test(raw)) {
    found.push('full')
  }
  if (/하프|half|21\.?097|21km/.test(lower)) found.push('half')
  if (/(?:^|[^0-9])10\s*k(?:m)?(?:[^a-z0-9]|$)/i.test(raw) || /10km/.test(lower)) {
    found.push('10km')
  }
  if (/(?:^|[^0-9])5\s*k(?:m)?(?:[^a-z0-9]|$)/i.test(raw) || /5km/.test(lower)) {
    found.push('5km')
  }
  return normalizeMarathonDistances(found)
}

function toIsoDate(year: number, monthDay: string): string | null {
  const match = monthDay.match(/^(\d{1,2})\/(\d{1,2})$/)
  if (!match) return null
  const month = Number(match[1])
  const day = Number(match[2])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function extractHref(html: string, pattern: RegExp): string | null {
  const match = html.match(pattern)
  if (!match?.[1]) return null
  return decodeBasicEntities(match[1])
}

/**
 * roadrun.co.kr/schedule/list.php HTML 파서
 * (marathon.pe.kr/index_calendar.html 프레임 본문)
 */
export function parseMarathonOnlineScheduleHtml(
  html: string,
  options?: {
    year?: number
    forcedRegion?: MarathonOnlineRegion | null
  },
): MarathonOnlineRace[] {
  const year = options?.year ?? new Date().getFullYear()
  const forcedRegion = options?.forcedRegion ?? null
  const races: MarathonOnlineRace[] = []
  const seen = new Set<string>()

  const rowRegex =
    /<tr>\s*<td[^>]*>\s*<div[^>]*>\s*<b>\s*<font[^>]*>\s*(\d{1,2}\/\d{1,2})\s*<\/font>[\s\S]*?<\/tr>/gi

  for (const match of html.matchAll(rowRegex)) {
    const rowHtml = match[0]
    const monthDay = match[1]
    const raceDate = toIsoDate(year, monthDay)
    if (!raceDate) continue

    const weekdayMatch = rowHtml.match(/\(([월화수목금토일])\)/)
    const weekday = weekdayMatch?.[1] ?? null

    const titleMatch = rowHtml.match(
      /view\.php\?no=(\d+)[^>]*>\s*([\s\S]*?)\s*<\/a>/i,
    )
    if (!titleMatch) continue
    const externalId = titleMatch[1]!
    const title = stripTags(titleMatch[2]!).replace(/\s+/g, ' ').trim()
    if (!title) continue

    const distancesMatch = rowHtml.match(
      /<font[^>]*color=["']?#990000["']?[^>]*>\s*([\s\S]*?)\s*<\/font>/i,
    )
    const distancesRaw = distancesMatch ? stripTags(distancesMatch[1]!) : ''

    const venueMatch = rowHtml.match(
      /<td[^>]*width=["']?19%["']?[^>]*>\s*<div[^>]*>\s*([\s\S]*?)\s*<\/div>/i,
    )
    const venue = venueMatch ? stripTags(venueMatch[1]!) : ''

    const organizerMatch = rowHtml.match(
      /<td[^>]*width=["']?30%["']?[^>]*>\s*<div[^>]*>\s*([\s\S]*?)<br/i,
    )
    const organizer = organizerMatch ? stripTags(organizerMatch[1]!) : null

    const applyUrl =
      extractHref(rowHtml, /<a[^>]+href=["'](https?:\/\/[^"']+)["'][^>]*>\s*<img[^>]*home\.gif/i) ??
      extractHref(rowHtml, /href=["'](https?:\/\/(?!www\.roadrun)[^"']+)["']/i)

    const detailPath = extractHref(
      rowHtml,
      /open_window\([^)]*'(view\.php\?no=\d+)'/i,
    )
    const detailUrl = detailPath
      ? `http://www.roadrun.co.kr/schedule/${detailPath}`
      : `http://www.roadrun.co.kr/schedule/view.php?no=${externalId}`

    const openBadge =
      /접수중|신청가능|모집중/.test(rowHtml) ||
      /접수중|신청가능|모집중/.test(title + distancesRaw)

    const region =
      forcedRegion ?? inferMarathonOnlineRegion(title, venue)

    const key = `${externalId}:${raceDate}`
    if (seen.has(key)) continue
    seen.add(key)

    races.push({
      externalId,
      title,
      raceDate,
      weekday,
      region,
      venue,
      distancesRaw,
      distances: parseDistances(distancesRaw || title),
      applyUrl,
      detailUrl,
      isOpenForApply: openBadge || Boolean(applyUrl),
      organizer,
    })
  }

  return races.sort((a, b) => a.raceDate.localeCompare(b.raceDate) || a.title.localeCompare(b.title, 'ko'))
}

export function filterUpcomingMarathonOnlineRaces(
  races: ReadonlyArray<MarathonOnlineRace>,
  asOf = new Date(),
): MarathonOnlineRace[] {
  const today = asOf.toISOString().slice(0, 10)
  return races.filter((race) => race.raceDate >= today)
}
