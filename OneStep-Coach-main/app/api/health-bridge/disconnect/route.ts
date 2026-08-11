import { NextResponse } from 'next/server'
import {
  resolveMemberForAuthUserId,
  resolveUserFromBearer,
} from '@/lib/health-bridge/auth-member'
import { clearHealthPrimaryProvider } from '@/lib/health-bridge/primary-provider'

export const runtime = 'nodejs'

/**
 * Clear Health primary; restore Garmin AUTO if still CONNECTED (tokens kept).
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

    const result = await clearHealthPrimaryProvider({ memberId: member.id })
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: 'DISCONNECT_FAILED' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[health-bridge/disconnect]', error instanceof Error ? error.message : 'error')
    return NextResponse.json({ ok: false, error: 'ERROR' }, { status: 500 })
  }
}
