/**
 * Chunked SecureStore adapter for Supabase session persistence.
 * Based on Supabase React Native guidance (SecureStore 2KB item limit).
 */
import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'

const CHUNK = 1800

async function deleteItem(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      globalThis.localStorage?.removeItem(key)
    } catch {
      // ignore
    }
    return
  }
  const meta = await SecureStore.getItemAsync(`${key}_meta`)
  if (meta) {
    const count = Number(meta)
    const deletes: Promise<void>[] = [SecureStore.deleteItemAsync(`${key}_meta`)]
    for (let i = 0; i < count; i += 1) {
      deletes.push(SecureStore.deleteItemAsync(`${key}_${i}`))
    }
    await Promise.all(deletes)
  } else {
    await SecureStore.deleteItemAsync(key)
  }
}

export const LargeSecureStore = {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === 'web') {
      try {
        return globalThis.localStorage?.getItem(key) ?? null
      } catch {
        return null
      }
    }
    const meta = await SecureStore.getItemAsync(`${key}_meta`)
    if (!meta) {
      return SecureStore.getItemAsync(key)
    }
    const count = Number(meta)
    const parts: string[] = []
    for (let i = 0; i < count; i += 1) {
      const part = await SecureStore.getItemAsync(`${key}_${i}`)
      if (part == null) return null
      parts.push(part)
    }
    return parts.join('')
  },

  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') {
      try {
        globalThis.localStorage?.setItem(key, value)
      } catch {
        // ignore
      }
      return
    }
    await deleteItem(key)
    if (value.length <= CHUNK) {
      await SecureStore.setItemAsync(key, value)
      return
    }
    const chunks = Math.ceil(value.length / CHUNK)
    await SecureStore.setItemAsync(`${key}_meta`, String(chunks))
    for (let i = 0; i < chunks; i += 1) {
      await SecureStore.setItemAsync(
        `${key}_${i}`,
        value.slice(i * CHUNK, (i + 1) * CHUNK),
      )
    }
  },

  async removeItem(key: string): Promise<void> {
    await deleteItem(key)
  },
}
