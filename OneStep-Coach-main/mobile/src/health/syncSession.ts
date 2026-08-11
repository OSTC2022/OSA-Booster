/** In-process Health sync lock + cooldown. No Health history persistence. */

const AUTO_COOLDOWN_MS = 3 * 60 * 1000

let syncInFlight = false
let lastAutoSyncAt = 0
let lastMemberId: string | null = null

export function resetHealthSyncSession(): void {
  lastAutoSyncAt = 0
  lastMemberId = null
}

export function bindHealthSyncMember(memberId: string | null): boolean {
  if (memberId !== lastMemberId) {
    lastMemberId = memberId
    lastAutoSyncAt = 0
    return true
  }
  return false
}

export function isHealthSyncLocked(): boolean {
  return syncInFlight
}

export function shouldSkipAutoSync(now = Date.now()): boolean {
  if (syncInFlight) return true
  if (lastAutoSyncAt > 0 && now - lastAutoSyncAt < AUTO_COOLDOWN_MS) return true
  return false
}

export async function runExclusiveHealthSync<T>(
  work: () => Promise<T>,
): Promise<{ started: false } | { started: true; result: T }> {
  if (syncInFlight) return { started: false }
  syncInFlight = true
  try {
    const result = await work()
    lastAutoSyncAt = Date.now()
    return { started: true, result }
  } finally {
    syncInFlight = false
  }
}
