import { NextResponse } from 'next/server'
import { listPublishedHallOfFame } from '@/lib/hall-of-fame'

export const dynamic = 'force-dynamic'

/** 로그인 화면 명예의 전당 (풀코스) — 최근 3시간 등록분 자동 공개 */
export async function GET() {
  const entries = await listPublishedHallOfFame()
  return NextResponse.json(
    { entries },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  )
}
