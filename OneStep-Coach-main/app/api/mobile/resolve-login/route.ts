import { NextResponse } from 'next/server'
import { resolveLoginAuthEmail } from '@/lib/auth/login-resolve'

/**
 * Mobile Companion (G1): resolve login ID → Auth email.
 * Public endpoint — returns only email or error, never tokens/service role.
 * Rate-limit at edge later if needed.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { login?: string }
    const login = typeof body.login === 'string' ? body.login : ''
    const resolved = await resolveLoginAuthEmail(login)
    if (resolved.error || !resolved.email) {
      return NextResponse.json(
        { error: resolved.error || '로그인 ID를 확인할 수 없습니다.' },
        { status: 400 },
      )
    }
    return NextResponse.json({ email: resolved.email })
  } catch {
    return NextResponse.json({ error: '요청을 처리할 수 없습니다.' }, { status: 500 })
  }
}
