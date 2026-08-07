'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { MemberCenterContactCard } from '@/components/members/member-center-contact-card'
import { getViewerCenterContact } from '@/lib/actions/member-center-contact'
import type {
  MemberCenterContactView,
  MemberCoachContactView,
} from '@/lib/center-contact'

export function MemberCenterContactDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [coach, setCoach] = useState<MemberCoachContactView | null>(null)
  const [center, setCenter] = useState<MemberCenterContactView | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setError(null)
    void getViewerCenterContact()
      .then((result) => {
        if (cancelled) return
        setCoach(result.coach)
        setCenter(result.center)
      })
      .catch(() => {
        if (!cancelled) setError('연락처를 불러오지 못했습니다.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        mobileSheet
        className="flex max-h-[min(92dvh,720px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>코치 & 센터 연락</DialogTitle>
          <DialogDescription>
            훈련·예약·결제 문의 채널을 확인합니다.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
          {loading ? (
            <div className="flex min-h-[220px] items-center justify-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : error ? (
            <p className="py-10 text-center text-sm text-destructive">{error}</p>
          ) : coach && center ? (
            <MemberCenterContactCard coach={coach} center={center} className="border-0 shadow-none" />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
