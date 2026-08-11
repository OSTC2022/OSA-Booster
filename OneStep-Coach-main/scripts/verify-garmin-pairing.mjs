/**
 * Unit-style checks for Garmin pairing crypto + token AES-GCM (no network).
 */
import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import assert from 'node:assert/strict'
import {
  generateConnectorSecret,
  generatePairingCode,
  hashSecret,
  safeEqualHash,
} from '../lib/garmin/pairing-crypto.ts'
import {
  decryptDiTokens,
  encryptDiTokens,
  TOKEN_FORMAT_VERSION_AES_GCM,
} from '../lib/garmin/token-crypto.ts'

process.env.GARMIN_TOKEN_ENCRYPTION_KEY =
  process.env.GARMIN_TOKEN_ENCRYPTION_KEY ||
  Buffer.from(createHash('sha256').update('test-key-for-verify').digest()).toString('base64url')

const code = generatePairingCode()
assert.match(code, /^\d{6}$/)

const secret = generateConnectorSecret()
assert.ok(secret.length >= 32)

const h1 = hashSecret('abc')
const h2 = hashSecret('abc')
assert.equal(h1, h2)
assert.equal(safeEqualHash(h1, h2), true)
assert.equal(safeEqualHash(h1, hashSecret('xyz')), false)

const enc = encryptDiTokens({
  di_token: 'access-test',
  di_refresh_token: 'refresh-test',
  di_client_id: 'client-test',
})
assert.equal(enc.tokenFormatVersion, TOKEN_FORMAT_VERSION_AES_GCM)
assert.ok(!enc.ciphertext.includes('access-test'))

const dec = decryptDiTokens(enc.ciphertext, enc.tokenFormatVersion)
assert.equal(dec.di_token, 'access-test')
assert.equal(dec.di_refresh_token, 'refresh-test')

console.log('verify:garmin-pairing PASS')
