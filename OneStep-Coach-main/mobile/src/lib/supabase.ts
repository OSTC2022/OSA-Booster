import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getPublicEnv } from '@/src/lib/env'
import { LargeSecureStore } from '@/src/lib/secure-store'

let client: SupabaseClient | null = null

/**
 * Mobile Supabase client — anon key + user session only.
 * Never configure SERVICE_ROLE here.
 */
export function getSupabase(): SupabaseClient {
  if (client) return client
  const { supabaseUrl, supabaseAnonKey } = getPublicEnv()
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('MISSING_PUBLIC_SUPABASE_ENV')
  }
  client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      storage: LargeSecureStore,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  })
  return client
}

/** Test helper — clears singleton between tests. */
export function __resetSupabaseForTests(): void {
  client = null
}
