import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * Hash secrets for DB storage (one-way). Never store plaintext pairing secrets.
 */
export function hashSecret(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

export function safeEqualHash(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8')
  const bb = Buffer.from(b, 'utf8')
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}

export function generatePairingCode(): string {
  // 6 digits, cryptographically random
  const n = randomBytes(4).readUInt32BE(0) % 1_000_000
  return n.toString().padStart(6, '0')
}

export function generateConnectorSecret(): string {
  return randomBytes(32).toString('base64url')
}

export function generateCompletionToken(): string {
  return randomBytes(32).toString('base64url')
}

/** HMAC helper if needed for signed payloads (not used for token storage). */
export function hmacSha256(key: string, message: string): string {
  return createHmac('sha256', key).update(message, 'utf8').digest('hex')
}
