/** Mask identifiers for logs / debug UI — not for auth. */
export function maskId(id: string): string {
  if (id.length <= 8) return '••••'
  return `${id.slice(0, 4)}…${id.slice(-4)}`
}
