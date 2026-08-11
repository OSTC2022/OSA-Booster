import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session } from '@supabase/supabase-js'
import { getSupabase } from '@/src/lib/supabase'
import { assertPublicEnv } from '@/src/lib/env'
import { bootstrapMember, maskId } from '@/src/member/bootstrap'
import type { AuthUiState, LinkedMember, MemberBootstrapResult } from '@/src/auth/types'
import { getPublicEnv } from '@/src/lib/env'
import { resetHealthSyncSession } from '@/src/health/syncSession'

type AuthContextValue = {
  authState: AuthUiState
  session: Session | null
  memberResult: MemberBootstrapResult | null
  member: LinkedMember | null
  authUserIdMasked: string | null
  memberIdMasked: string | null
  configError: string | null
  refreshing: boolean
  signInWithPassword: (login: string, password: string) => Promise<{ error?: string }>
  signOut: () => Promise<void>
  refreshMember: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

async function resolveAuthEmail(loginInput: string): Promise<{ email: string; error?: string }> {
  const trimmed = loginInput.trim()
  if (!trimmed) {
    return { email: '', error: '이메일 또는 로그인 ID를 입력해주세요.' }
  }
  if (trimmed.includes('@')) {
    return { email: trimmed.toLowerCase() }
  }

  const { resolveLoginUrl, webPortalUrl } = getPublicEnv()
  const endpoint =
    resolveLoginUrl ||
    `${webPortalUrl.replace(/\/$/, '')}/api/mobile/resolve-login`

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: trimmed }),
    })
    const json = (await res.json()) as { email?: string; error?: string }
    if (!res.ok || json.error || !json.email) {
      return {
        email: '',
        error: json.error || '로그인 ID를 확인할 수 없습니다. 이메일로 로그인해주세요.',
      }
    }
    return { email: json.email.toLowerCase() }
  } catch {
    return {
      email: '',
      error: '로그인 ID 확인에 실패했습니다. 이메일로 로그인하거나 인터넷을 확인해주세요.',
    }
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authState, setAuthState] = useState<AuthUiState>('LOADING')
  const [session, setSession] = useState<Session | null>(null)
  const [memberResult, setMemberResult] = useState<MemberBootstrapResult | null>(null)
  const [configError, setConfigError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const loadMember = useCallback(async () => {
    setRefreshing(true)
    try {
      const result = await bootstrapMember(getSupabase())
      setMemberResult(result)
    } finally {
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    const cfg = assertPublicEnv()
    if (!cfg.ok) {
      setConfigError(cfg.error)
      setAuthState('ERROR')
      return
    }

    let mounted = true
    const supabase = getSupabase()

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      const next = data.session
      setSession(next)
      if (next) {
        setAuthState('SIGNED_IN')
        void loadMember()
      } else {
        setAuthState('SIGNED_OUT')
        setMemberResult(null)
        resetHealthSyncSession()
      }
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      if (nextSession) {
        setAuthState('SIGNED_IN')
        void loadMember()
      } else {
        setAuthState('SIGNED_OUT')
        setMemberResult(null)
        resetHealthSyncSession()
      }
    })

    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [loadMember])

  const signInWithPassword = useCallback(
    async (login: string, password: string) => {
      if (!password) {
        return { error: '비밀번호를 입력해주세요.' }
      }
      const resolved = await resolveAuthEmail(login)
      if (resolved.error || !resolved.email) {
        return { error: resolved.error || '로그인 정보를 확인해주세요.' }
      }

      const { error } = await getSupabase().auth.signInWithPassword({
        email: resolved.email,
        password,
      })

      if (error) {
        // Never log password / tokens
        console.warn('[auth] signIn failed', error.name)
        return { error: '로그인 정보를 확인해주세요.' }
      }
      return {}
    },
    [],
  )

  const signOut = useCallback(async () => {
    resetHealthSyncSession()
    setMemberResult(null)
    await getSupabase().auth.signOut()
  }, [])

  const value = useMemo<AuthContextValue>(() => {
    const member =
      memberResult?.status === 'LINKED' ? memberResult.member : null
    const authUserId =
      memberResult && 'authUserId' in memberResult
        ? memberResult.authUserId
        : session?.user?.id ?? null

    return {
      authState,
      session,
      memberResult,
      member,
      authUserIdMasked: authUserId ? maskId(authUserId) : null,
      memberIdMasked: member ? maskId(member.id) : null,
      configError,
      refreshing,
      signInWithPassword,
      signOut,
      refreshMember: loadMember,
    }
  }, [
    authState,
    session,
    memberResult,
    configError,
    refreshing,
    signInWithPassword,
    signOut,
    loadMember,
  ])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return ctx
}
