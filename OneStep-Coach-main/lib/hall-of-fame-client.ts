'use client'

import type { HallOfFamePublicEntry } from '@/lib/hall-of-fame'

let cachedEntries: HallOfFamePublicEntry[] | null = null
let inflight: Promise<HallOfFamePublicEntry[]> | null = null
let cachedAt = 0

const CLIENT_CACHE_MS = 30_000

async function fetchFromApi(): Promise<HallOfFamePublicEntry[]> {
  // 서버에서 최근 3시간 등록분 자동 공개 처리
  const response = await fetch('/api/hall-of-fame', { cache: 'no-store' })
  const json = (await response.json()) as { entries?: HallOfFamePublicEntry[] }
  return json.entries ?? []
}

/** API 경유 조회 — 최근 등록 자동 공개 반영 */
export async function loadHallOfFameEntries(): Promise<HallOfFamePublicEntry[]> {
  if (cachedEntries && Date.now() - cachedAt < CLIENT_CACHE_MS) {
    return cachedEntries
  }
  if (inflight) return inflight

  inflight = (async () => {
    try {
      cachedEntries = await fetchFromApi()
      cachedAt = Date.now()
      return cachedEntries
    } catch {
      return cachedEntries ?? []
    } finally {
      inflight = null
    }
  })()

  return inflight
}

/** 로그인 화면 진입·호버 시 미리 받아 두기 */
export function prefetchHallOfFameEntries(): void {
  void loadHallOfFameEntries()
}

export function getCachedHallOfFameEntries(): HallOfFamePublicEntry[] | null {
  return cachedEntries
}
