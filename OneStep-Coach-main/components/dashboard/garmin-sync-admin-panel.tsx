'use client'

import { useEffect, useState } from 'react'
import {
  getGarminAdminOverview,
  type GarminAdminOverview,
} from '@/lib/actions/garmin-connections'
import { getAdminGarminReviewStats } from '@/lib/actions/garmin-reconciliation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function GarminSyncAdminPanel() {
  const [overview, setOverview] = useState<GarminAdminOverview | null>(null)
  const [reviewOpen, setReviewOpen] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      const [result, review] = await Promise.all([
        getGarminAdminOverview(),
        getAdminGarminReviewStats(),
      ])
      if (!result.ok) {
        setError(result.error)
        return
      }
      setOverview(result.overview)
      if (review.ok) setReviewOpen(review.openCount)
    })()
  }, [])

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Garmin Sync</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">{error}</CardContent>
      </Card>
    )
  }

  if (!overview) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Garmin Sync</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">불러오는 중…</CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Garmin Sync (BETA)</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
        <p>연결: {overview.connected}명</p>
        <p>재인증 필요: {overview.reauthRequired}명</p>
        <p>동기화 지연/오류: {overview.error}명</p>
        <p>미연결(해제): {overview.disconnected}명</p>
        <p>Rate Limited: {overview.rateLimited ? 'YES' : 'NO'}</p>
        <p>최근 24시간 Imported: {overview.importedLast24h}건</p>
        <p className="sm:col-span-2">
          검토 필요: {reviewOpen == null ? '—' : `${reviewOpen}건`}
        </p>
        <p className="sm:col-span-2 text-muted-foreground">
          Worker heartbeat:{' '}
          {overview.lastWorkerHeartbeat
            ? new Date(overview.lastWorkerHeartbeat).toLocaleString('ko-KR')
            : '없음'}
        </p>
        <p className="sm:col-span-2 text-xs text-muted-foreground">
          전체 즉시 Sync 버튼은 제공하지 않습니다. Worker가 순차 처리합니다. Token은 표시하지
          않습니다.
        </p>
      </CardContent>
    </Card>
  )
}
