import { NextResponse } from 'next/server'
import {
  resolveMemberForAuthUserId,
  resolveUserFromBearer,
} from '@/lib/health-bridge/auth-member'
import { isHealthSourceApp } from '@/lib/health-bridge/validate'
import { setHealthPrimaryProvider } from '@/lib/health-bridge/primary-provider'

export const runtime = 'nodejs'

/**
 * Mark Health as primary sync provider and pause Garmin AUTO sync.
 */
export async function POST(request: Request) {
  try {
    const user = await resolveUserFromBearer(request)
    if (!user) {
      return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 })
    }

    const member = await resolveMemberForAuthUserId(user.id)
    if (!member) {
      return NextResponse.json({ ok: false, error: 'MEMBER_UNLINKED' }, { status: 403 })
    }

    let body: { provider?: string }
    try {
      body = (await request.json()) as { provider?: string }
    } catch {
      return NextResponse.json({ ok: false, error: 'INVALID_BODY' }, { status: 400 })
    }

    const provider = String(body.provider || '').trim().toUpperCase()
    if (!isHealthSourceApp(provider)) {
      return NextResponse.json({ ok: false, error: 'INVALID_PROVIDER' }, { status: 400 })
    }

    const result = await setHealthPrimaryProvider({
      memberId: member.id,
      provider,
    })
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: 'CONNECT_FAILED' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, preferred: provider })
  } catch (error) {
    console.error('[health-bridge/connect]', error instanceof Error ? error.message : 'error')
    return NextResponse.json({ ok: false, error: 'ERROR' }, { status: 500 })
  }
}
