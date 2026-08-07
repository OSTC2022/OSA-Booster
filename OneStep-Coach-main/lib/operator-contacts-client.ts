'use client'

import type { OperatorPublicContact } from '@/lib/operator-contacts'

let cachedContacts: OperatorPublicContact[] | null = null
let inflight: Promise<OperatorPublicContact[]> | null = null
let cachedAt = 0

const CLIENT_CACHE_MS = 60_000

async function fetchFromApi(): Promise<OperatorPublicContact[]> {
  const response = await fetch('/api/operator-contacts')
  const json = (await response.json()) as { contacts?: OperatorPublicContact[] }
  return json.contacts ?? []
}

export async function loadOperatorContacts(): Promise<OperatorPublicContact[]> {
  if (cachedContacts && Date.now() - cachedAt < CLIENT_CACHE_MS) {
    return cachedContacts
  }
  if (inflight) return inflight

  inflight = (async () => {
    try {
      cachedContacts = await fetchFromApi()
      cachedAt = Date.now()
      return cachedContacts
    } catch {
      return cachedContacts ?? []
    } finally {
      inflight = null
    }
  })()

  return inflight
}

/** 로그인 화면 진입·호버 시 미리 받아 두기 */
export function prefetchOperatorContacts(): void {
  void loadOperatorContacts()
}

export function getCachedOperatorContacts(): OperatorPublicContact[] | null {
  return cachedContacts
}
