import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

/**
 * Authenticated encryption for Garmin DI tokens (SERVER ONLY).
 * token_format_version = 2 (AES-256-GCM).
 * Compatible with garmin-worker Python decrypt (v2 path).
 *
 * Env: GARMIN_TOKEN_ENCRYPTION_KEY (never NEXT_PUBLIC_*)
 */

export const TOKEN_FORMAT_VERSION_AES_GCM = 2

export type DiTokenPayload = {
  di_token: string
  di_refresh_token: string
  di_client_id: string
}

function resolveKeyBytes(): Buffer {
  const raw = (process.env.GARMIN_TOKEN_ENCRYPTION_KEY || '').trim()
  if (!raw) {
    throw new Error('GARMIN_TOKEN_ENCRYPTION_KEY missing')
  }
  // Fernet keys are urlsafe-b64 32-byte material — try decode first
  try {
    const decoded = Buffer.from(raw, 'base64url')
    if (decoded.length === 32) return decoded
  } catch {
    // fall through
  }
  try {
    const decoded = Buffer.from(raw, 'base64')
    if (decoded.length === 32) return decoded
  } catch {
    // fall through
  }
  return createHash('sha256').update(raw, 'utf8').digest()
}

export function serializeDiTokens(tokens: DiTokenPayload): string {
  if (!tokens.di_token || !tokens.di_refresh_token) {
    throw new Error('TOKEN_PAYLOAD_INVALID')
  }
  return JSON.stringify({
    di_token: tokens.di_token,
    di_refresh_token: tokens.di_refresh_token,
    di_client_id: tokens.di_client_id || '',
  })
}

export function encryptDiTokens(tokens: DiTokenPayload): {
  ciphertext: string
  tokenFormatVersion: number
} {
  const key = resolveKeyBytes()
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const plaintext = Buffer.from(serializeDiTokens(tokens), 'utf8')
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const tag = cipher.getAuthTag()
  const packed = Buffer.concat([iv, encrypted, tag])
  return {
    ciphertext: packed.toString('base64url'),
    tokenFormatVersion: TOKEN_FORMAT_VERSION_AES_GCM,
  }
}

/** Decrypt only on server — never call from client components. */
export function decryptDiTokens(
  ciphertext: string,
  tokenFormatVersion: number,
): DiTokenPayload {
  if (tokenFormatVersion !== TOKEN_FORMAT_VERSION_AES_GCM) {
    throw new Error('TOKEN_FORMAT_UNSUPPORTED')
  }
  const key = resolveKeyBytes()
  const packed = Buffer.from(ciphertext, 'base64url')
  if (packed.length < 12 + 16 + 1) {
    throw new Error('TOKEN_DECRYPT_FAILED')
  }
  const iv = packed.subarray(0, 12)
  const tag = packed.subarray(packed.length - 16)
  const data = packed.subarray(12, packed.length - 16)
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  const plain = Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
  const parsed = JSON.parse(plain) as DiTokenPayload
  if (!parsed.di_token || !parsed.di_refresh_token) {
    throw new Error('TOKEN_PAYLOAD_INVALID')
  }
  return {
    di_token: String(parsed.di_token),
    di_refresh_token: String(parsed.di_refresh_token),
    di_client_id: String(parsed.di_client_id || ''),
  }
}
