import {
  filterUpcomingMarathonOnlineRaces,
  parseMarathonOnlineScheduleHtml,
  type MarathonOnlineRace,
} from '@/lib/marathon-online/parse-schedule'
import {
  MARATHON_ONLINE_REGIONS,
  type MarathonOnlineRegion,
} from '@/lib/marathon-online/regions'

const SCHEDULE_URL = 'http://www.roadrun.co.kr/schedule/list.php'
const SOURCE_PAGE = 'http://www.marathon.pe.kr/index_calendar.html'

export type FetchMarathonOnlineOptions = {
  year?: number
  region?: MarathonOnlineRegion | '' | '전체'
  month?: number | null
  openOnly?: boolean
  upcomingOnly?: boolean
}

type CacheEntry = {
  expiresAt: number
  races: MarathonOnlineRace[]
}

const cache = new Map<string, CacheEntry>()
const CACHE_MS = 10 * 60 * 1000

async function decodeHtmlBody(response: Response): Promise<string> {
  const buffer = Buffer.from(await response.arrayBuffer())
  try {
    return new TextDecoder('euc-kr').decode(buffer)
  } catch {
    return buffer.toString('utf8')
  }
}

async function fetchScheduleHtml(year: number, month: number | null): Promise<string> {
  const params = new URLSearchParams()
  params.set('syear_key', String(year))
  // area_key(한글)는 EUC-KR 쿼리가 필요해 서버 필터 대신 파싱 후 지역 추론으로 처리
  if (month) params.set('smonth_key', String(month))

  const response = await fetch(`${SCHEDULE_URL}?${params.toString()}`, {
    method: 'GET',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml',
      Referer: SOURCE_PAGE,
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(25_000),
  })
  if (!response.ok) {
    throw new Error(`대회 일정을 불러오지 못했습니다. (${response.status})`)
  }
  return decodeHtmlBody(response)
}

function isRegion(value: string): value is MarathonOnlineRegion {
  return (MARATHON_ONLINE_REGIONS as readonly string[]).includes(value)
}

/** marathon.pe.kr 캘린더(= roadrun 일정) 조회 */
export async function fetchMarathonOnlineSchedule(
  options: FetchMarathonOnlineOptions = {},
): Promise<{
  races: MarathonOnlineRace[]
  year: number
  sourceUrl: string
}> {
  const year = options.year ?? new Date().getFullYear()
  const regionRaw = options.region?.trim() || ''
  const region =
    regionRaw && regionRaw !== '전체' && isRegion(regionRaw) ? regionRaw : ''
  const month =
    options.month != null && options.month >= 1 && options.month <= 12
      ? options.month
      : null

  const cacheKey = `${year}:${month ?? 'all'}`
  let races: MarathonOnlineRace[]
  const hit = cache.get(cacheKey)
  if (hit && hit.expiresAt > Date.now()) {
    races = hit.races
  } else {
    const html = await fetchScheduleHtml(year, month)
    races = parseMarathonOnlineScheduleHtml(html, { year })
    cache.set(cacheKey, { races, expiresAt: Date.now() + CACHE_MS })
  }

  if (region) {
    races = races.filter((race) => race.region === region)
  }
  if (options.openOnly) {
    races = races.filter((race) => race.isOpenForApply)
  }
  if (options.upcomingOnly !== false) {
    races = filterUpcomingMarathonOnlineRaces(races)
  }

  return {
    races,
    year,
    sourceUrl: SOURCE_PAGE,
  }
}
