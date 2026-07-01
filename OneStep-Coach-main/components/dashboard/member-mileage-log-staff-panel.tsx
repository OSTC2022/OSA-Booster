'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import { Pencil, Route, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import {
  deleteMemberMileageLogForStaff,
  updateMemberMileageLogForStaffForm,
} from '@/lib/actions/running-league'
import type { MemberRunningLeagueRankingBundle } from '@/lib/actions/running-league'
import type { RunningLeagueMileageLog } from '@/lib/types'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { KoreanDatePicker } from '@/components/ui/korean-date-picker'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

type MemberMileageLogStaffPanelProps = {
  memberId: string
  memberName: string
  rankingBundle: MemberRunningLeagueRankingBundle | null
}

type EditFormState = {
  distanceKm: string
  loggedAt: string
  duration: string
  pace: string
  heartRate: string
  calories: string
  notes: string
}

function formatLogDate(value: string): string {
  try {
    return format(parseISO(value), 'M월 d일 (EEE)', { locale: ko })
  } catch {
    return value
  }
}

function formatLogShortDate(value: string): string {
  try {
    return format(parseISO(value), 'M/d', { locale: ko })
  } catch {
    return value
  }
}

function logToEditForm(log: RunningLeagueMileageLog): EditFormState {
  return {
    distanceKm: String(log.distance_km),
    loggedAt: log.logged_at,
    duration: log.duration ?? '',
    pace: log.pace ?? '',
    heartRate: log.heart_rate != null ? String(log.heart_rate) : '',
    calories: log.calories != null ? String(log.calories) : '',
    notes: log.notes ?? '',
  }
}

export function MemberMileageLogStaffPanel({
  memberId,
  memberName,
  rankingBundle,
}: MemberMileageLogStaffPanelProps) {
  const router = useRouter()
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null)
  const [editingLog, setEditingLog] = useState<RunningLeagueMileageLog | null>(null)
  const [editForm, setEditForm] = useState<EditFormState | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<RunningLeagueMileageLog | null>(null)

  const memberLogs = useMemo(() => {
    if (!rankingBundle) return []
    const { start, end } = rankingBundle.rankingPeriod
    return rankingBundle.mileageLogs
      .filter((log) => log.member_id === memberId)
      .filter((log) => log.logged_at >= start && log.logged_at <= end)
      .sort((a, b) => b.logged_at.localeCompare(a.logged_at) || b.created_at.localeCompare(a.created_at))
  }, [memberId, rankingBundle])

  const totalKm = useMemo(
    () => Math.round(memberLogs.reduce((sum, log) => sum + Number(log.distance_km ?? 0), 0) * 10) / 10,
    [memberLogs],
  )

  function startEdit(log: RunningLeagueMileageLog) {
    setEditingLog(log)
    setEditForm(logToEditForm(log))
    setSelectedLogId(log.id)
  }

  function cancelEdit() {
    setEditingLog(null)
    setEditForm(null)
  }

  async function submitEdit() {
    if (!editingLog || !editForm) return
    const parsedDistance = Number(editForm.distanceKm)
    if (!Number.isFinite(parsedDistance) || parsedDistance <= 0) {
      toast.error('거리(km)를 입력해주세요.')
      return
    }

    setSaving(true)
    try {
      const formData = new FormData()
      formData.append(
        'payload',
        JSON.stringify({
          distance_km: parsedDistance,
          logged_at: editForm.loggedAt,
          duration: editForm.duration || null,
          pace: editForm.pace || null,
          heart_rate: editForm.heartRate ? Number(editForm.heartRate) : null,
          calories: editForm.calories ? Number(editForm.calories) : null,
          notes: editForm.notes,
          verification_status: 'manual' as const,
        }),
      )

      const result = await updateMemberMileageLogForStaffForm(memberId, editingLog.id, formData)
      if (!result.ok) {
        toast.error(result.error)
        return
      }

      toast.success('러닝 기록이 수정되었습니다.')
      cancelEdit()
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    const result = await deleteMemberMileageLogForStaff(memberId, deleteTarget.id)
    setDeleting(false)
    setDeleteTarget(null)

    if (!result.ok) {
      toast.error(result.error)
      return
    }

    if (editingLog?.id === deleteTarget.id) {
      cancelEdit()
    }
    if (selectedLogId === deleteTarget.id) {
      setSelectedLogId(null)
    }

    toast.success('러닝 기록이 삭제되었습니다.')
    router.refresh()
  }

  return (
    <>
      <div className="rounded-xl border border-lime-500/25 bg-black/30 p-3 sm:p-4">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs font-medium text-lime-300/90">
              <Route className="h-3.5 w-3.5 shrink-0" />
              러닝 기록 관리
            </p>
            <p className="mt-1 truncate text-sm font-semibold text-lime-50">{memberName}</p>
            <p className="mt-0.5 text-[11px] text-zinc-400">
              이번 달 {memberLogs.length}건 · 합계 {totalKm.toFixed(1)}km
            </p>
          </div>
        </div>

        {memberLogs.length === 0 ? (
          <p className="rounded-lg border border-dashed border-zinc-700 px-3 py-4 text-center text-xs text-zinc-500">
            이번 달 등록된 러닝 기록이 없습니다.
          </p>
        ) : (
          <ul className="max-h-56 space-y-1 overflow-y-auto">
            {memberLogs.map((log) => {
              const selected = selectedLogId === log.id
              const editing = editingLog?.id === log.id
              return (
                <li key={log.id}>
                  <div
                    className={cn(
                      'flex items-center gap-1 rounded-lg border px-1 py-1',
                      selected || editing
                        ? 'border-lime-400/40 bg-lime-500/10'
                        : 'border-white/10 bg-black/20',
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedLogId((current) => (current === log.id ? null : log.id))}
                      className="min-w-0 flex-1 rounded-md px-1.5 py-1 text-left text-xs"
                    >
                      <span className="block font-medium text-zinc-100">
                        {formatLogShortDate(log.logged_at)} · {Number(log.distance_km).toFixed(1)}km
                        {log.duration ? ` · ${log.duration}` : ''}
                      </span>
                      {log.pace ? (
                        <span className="text-[10px] text-zinc-500">페이스 {log.pace}/km</span>
                      ) : null}
                    </button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 shrink-0 text-lime-200 hover:text-lime-50"
                      onClick={() => startEdit(log)}
                      aria-label="기록 수정"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 shrink-0 text-red-300 hover:text-red-200"
                      onClick={() => setDeleteTarget(log)}
                      disabled={deleting}
                      aria-label="기록 삭제"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  {selected && !editing ? (
                    <div className="mt-1 space-y-0.5 rounded-lg border border-white/10 bg-black/30 px-2.5 py-2 text-[11px] text-zinc-400">
                      <p>
                        <span className="text-zinc-300">기록 날짜</span> {formatLogDate(log.logged_at)}
                      </p>
                      {log.heart_rate != null ? (
                        <p>
                          <span className="text-zinc-300">심박</span> {log.heart_rate}bpm
                        </p>
                      ) : null}
                      {log.calories != null ? (
                        <p>
                          <span className="text-zinc-300">칼로리</span> {log.calories}kcal
                        </p>
                      ) : null}
                      {log.notes.trim() ? <p className="truncate">메모: {log.notes}</p> : null}
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}

        {editingLog && editForm ? (
          <div className="mt-3 space-y-3 rounded-lg border border-lime-500/20 bg-lime-500/5 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-lime-200">기록 수정</p>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-zinc-400"
                onClick={cancelEdit}
                aria-label="수정 취소"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-[11px] text-zinc-400">거리 (km)</Label>
                <Input
                  className="h-9 border-white/10 bg-black/40"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={editForm.distanceKm}
                  onChange={(event) =>
                    setEditForm((current) =>
                      current ? { ...current, distanceKm: event.target.value } : current,
                    )
                  }
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-[11px] text-zinc-400">날짜</Label>
                <KoreanDatePicker
                  value={editForm.loggedAt}
                  onChange={(value) =>
                    setEditForm((current) => (current ? { ...current, loggedAt: value } : current))
                  }
                  compact
                  placeholder="날짜 선택"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-zinc-400">총 시간</Label>
                <Input
                  className="h-9 border-white/10 bg-black/40"
                  placeholder="1:00:27"
                  value={editForm.duration}
                  onChange={(event) =>
                    setEditForm((current) =>
                      current ? { ...current, duration: event.target.value } : current,
                    )
                  }
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-zinc-400">페이스 (/km)</Label>
                <Input
                  className="h-9 border-white/10 bg-black/40"
                  placeholder="4:29"
                  value={editForm.pace}
                  onChange={(event) =>
                    setEditForm((current) =>
                      current ? { ...current, pace: event.target.value } : current,
                    )
                  }
                />
              </div>
            </div>
            <Button
              type="button"
              className="w-full bg-lime-500 text-zinc-950 hover:bg-lime-400"
              disabled={saving}
              onClick={submitEdit}
            >
              {saving ? '저장 중…' : '수정 저장'}
            </Button>
          </div>
        ) : null}
      </div>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>러닝 기록을 삭제할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `${formatLogDate(deleteTarget.logged_at)} · ${Number(deleteTarget.distance_km).toFixed(1)}km 기록이 삭제됩니다.`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>취소</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleting}
              onClick={(event) => {
                event.preventDefault()
                void confirmDelete()
              }}
            >
              {deleting ? '삭제 중…' : '삭제'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
