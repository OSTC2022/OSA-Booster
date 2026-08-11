import Constants from 'expo-constants'

type Extra = {
  supabaseUrl?: string
  supabaseAnonKey?: string
  webPortalUrl?: string
  resolveLoginUrl?: string
}

function readExtra(): Extra {
  const extra = (Constants.expoConfig?.extra ?? {}) as Extra
  return extra
}

/**
 * Public client config only. Never put service_role / encryption keys here.
 * Values are readable from the binary — treat as public.
 */
export function getPublicEnv() {
  const extra = readExtra()
  const supabaseUrl =
    process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() ||
    extra.supabaseUrl?.trim() ||
    ''
  const supabaseAnonKey =
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    extra.supabaseAnonKey?.trim() ||
    ''
  const webPortalUrl =
    process.env.EXPO_PUBLIC_WEB_PORTAL_URL?.trim() ||
    extra.webPortalUrl?.trim() ||
    'https://onestepcoach.vercel.app'
  const resolveLoginUrl =
    process.env.EXPO_PUBLIC_RESOLVE_LOGIN_URL?.trim() ||
    extra.resolveLoginUrl?.trim() ||
    ''

  return {
    supabaseUrl,
    supabaseAnonKey,
    webPortalUrl,
    resolveLoginUrl,
  }
}

export function assertPublicEnv(): { ok: true } | { ok: false; error: string } {
  const env = getPublicEnv()
  if (!env.supabaseUrl || !env.supabaseAnonKey) {
    return {
      ok: false,
      error: '앱 설정이 없습니다. EXPO_PUBLIC_SUPABASE_URL / ANON_KEY를 확인해주세요.',
    }
  }
  if (/service_role/i.test(env.supabaseAnonKey)) {
    return { ok: false, error: '잘못된 공개 키 설정입니다.' }
  }
  return { ok: true }
}
