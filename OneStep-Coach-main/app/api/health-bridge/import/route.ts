import { NextResponse } from 'next/server'
import {
  resolveMemberForAuthUserId,
  resolveUserFromBearer,
} from '@/lib/health-bridge/auth-member'
import { importHealthWorkoutsForMember } from '@/lib/health-bridge/import-workouts'
import type { HealthImportActivityInput } from '@/lib/health-bridge/validate'

export const runtime = 'nodejs'

type ImportBody = {
  activities?: HealthImportActivityInput[]
  /** Never trusted — ignored. */
  memberId?: unknown
  member_id?: unknown
}

/**
 * Mobile Health → ONE STEP mileage (G3).
 * Auth: Bearer JWT. Member resolved from auth.uid() only.
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

    let body: ImportBody
    try {
      body = (await request.json()) as ImportBody
    } catch {
      return NextResponse.json({ ok: false, error: 'INVALID_BODY' }, { status: 400 })
    }

    const activities = Array.isArray(body.activities) ? body.activities : []
    if (activities.length === 0) {
      return NextResponse.json({
        ok: true,
        imported: 0,
        alreadyImported: 0,
        duplicateCandidates: 0,
        invalid: 0,
        errors: 0,
        importedDistanceKm: 0,
        results: [],
        mileageKm: null,
        message: '새로운 러닝 기록이 없습니다.',
      })
    }

    const result = await importHealthWorkoutsForMember({ member, activities })
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: 'IMPORT_FAILED' }, { status: 500 })
    }

    let message = '새로운 러닝 기록이 없습니다.'
    if (result.imported > 0) {
      message = `러닝 기록 ${result.imported}건이 반영되었습니다. 총 ${result.importedDistanceKm.toFixed(2)}km`
    } else if (result.duplicateCandidates > 0 && result.alreadyImported === 0) {
      message = '비슷한 기록이 있어 검토가 필요합니다.'
    } else if (result.alreadyImported > 0) {
      message = '이미 반영된 러닝 기록입니다.'
    }

    return NextResponse.json({ ...result, message })
  } catch (error) {
    console.error('[health-bridge/import]', error instanceof Error ? error.message : 'error')
    return NextResponse.json({ ok: false, error: 'ERROR' }, { status: 500 })
  }
}
