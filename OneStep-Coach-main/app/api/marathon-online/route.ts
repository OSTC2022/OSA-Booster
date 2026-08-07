import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/actions/auth'
import { canAccessSettingsArea } from '@/lib/operator-access'
import { fetchMarathonOnlineSchedule } from '@/lib/marathon-online/fetch-schedule'
import { MARATHON_ONLINE_REGIONS } from '@/lib/marathon-online/regions'

export const dynamic = 'force-dynamic'

/** 관리자·운영진 — 마라톤온라인 일정 추천 목록 */
export async function GET(request: Request) {
  try {
    const user = await requireAuth()
    if (!canAccessSettingsArea(user.role)) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
    }
  } catch {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const yearRaw = Number(searchParams.get('year') || new Date().getFullYear())
  const year = Number.isFinite(yearRaw) ? yearRaw : new Date().getFullYear()
  const region = searchParams.get('region') || '전체'
  const monthRaw = searchParams.get('month')
  const month = monthRaw ? Number(monthRaw) : null
  const openOnly = searchParams.get('openOnly') === '1'

  try {
    const result = await fetchMarathonOnlineSchedule({
      year,
      region: region === '전체' ? '전체' : (region as typeof MARATHON_ONLINE_REGIONS[number]),
      month: Number.isFinite(month as number) ? month : null,
      openOnly,
      upcomingOnly: true,
    })
    return NextResponse.json({
      ...result,
      regions: MARATHON_ONLINE_REGIONS,
    })
  } catch (error) {
    console.error('[marathon-online]', error)
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : '외부 대회 일정을 불러오지 못했습니다.',
      },
      { status: 502 },
    )
  }
}
