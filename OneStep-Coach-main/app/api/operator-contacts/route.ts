import { NextResponse } from 'next/server'
import { listOperatorPublicContacts } from '@/lib/operator-contacts'

export const dynamic = 'force-dynamic'

/** 로그인 화면 마스코트용 공개 운영진 연락처 */
export async function GET() {
  const contacts = await listOperatorPublicContacts()
  return NextResponse.json(
    { contacts },
    {
      headers: {
        // 브라우저/중간 캐시로 재요청 지연 줄이기 (클라이언트도 별도 캐시)
        'Cache-Control': 'public, max-age=30, s-maxage=60, stale-while-revalidate=300',
      },
    },
  )
}
