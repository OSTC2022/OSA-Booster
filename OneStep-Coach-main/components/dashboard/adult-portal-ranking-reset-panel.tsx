'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { resetAdultPortalMileageAttendanceChase } from '@/lib/actions/adult-portal-ranking-reset'
import type { PortalRankingPeriod } from '@/lib/running-league/ranking-period'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

type AdultPortalRankingResetPanelProps = {
  rankingPeriod: PortalRankingPeriod
}

export function AdultPortalRankingResetPanel({
  rankingPeriod,
}: AdultPortalRankingResetPanelProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  async function handleConfirm() {
    setBusy(true)
    const result = await resetAdultPortalMileageAttendanceChase()
    setBusy(false)

    if (!result.ok) {
      toast.error('초기화 실패', { description: result.error })
      return
    }

    setOpen(false)
    toast.success('마일리지·출석·이겨라가 초기화되었습니다.', {
      description: `${result.periodLabel} 기준 기록 ${result.deletedLogCount}건이 삭제되었습니다.`,
    })
    router.refresh()
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="border-rose-500/40 text-rose-200 hover:bg-rose-500/10 hover:text-rose-100"
        >
          <RotateCcw className="mr-1.5 h-4 w-4" />
          마일리지·출석·이겨라 초기화
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>랭킹을 초기화할까요?</AlertDialogTitle>
          <AlertDialogDescription className="space-y-2 text-left">
            <span className="block">
              현재 집계 기간 <strong>{rankingPeriod.label}</strong>의 마일리지 기록·출석·이겨라
              순위가 모두 삭제됩니다.
            </span>
            <span className="block text-muted-foreground">
              이겨라 술래 설정도 해제됩니다. PB 기록은 유지됩니다. 이 작업은 되돌릴 수 없습니다.
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>아니요</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            className="bg-rose-600 text-white hover:bg-rose-600/90"
            onClick={(event) => {
              event.preventDefault()
              void handleConfirm()
            }}
          >
            {busy ? '처리 중…' : '예'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
