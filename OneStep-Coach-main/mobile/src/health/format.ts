/** Pure helpers for distance/duration display (no native deps). */

export function metersToKm(meters: number): number {
  return meters / 1000
}

export function quantityToKm(quantity: number, unit: string): number {
  const u = unit.toLowerCase()
  if (u === 'km' || u === 'kilometer' || u === 'kilometers') return quantity
  if (u === 'm' || u === 'meter' || u === 'meters') return metersToKm(quantity)
  if (u === 'mi' || u === 'mile' || u === 'miles') return quantity * 1.609344
  // Default assume meters if unknown numeric from HealthKit
  return metersToKm(quantity)
}

export function formatDistanceKm(km: number): string {
  return `${km.toFixed(2)} km`
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  }
  return `${m}:${String(sec).padStart(2, '0')}`
}

export function formatWorkoutDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const month = d.getMonth() + 1
  const day = d.getDate()
  return `${month}/${day}`
}

export function lookbackStart(days: number, now = new Date()): Date {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - (days - 1))
  return start
}
