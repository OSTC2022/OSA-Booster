'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { Watch } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { MEMBER_PORTAL_CARD_CLASS } from '@/lib/running-league/member-portal-layout'
import { cn } from '@/lib/utils'
import {
  cancelGarminPairingSession,
  disconnectMyGarminConnection,
  getMyGarminConnectionStatus,
  getMyGarminPairingSessionStatus,
  requestMyGarminManualSync,
  startGarminPairingSession,
  type ActivityConnectionStatus,
  type GarminPairingPublicSession,
} from '@/lib/actions/garmin-connections'
import { MemberGarminReviewPanel } from '@/components/dashboard/member-garmin-review-panel'

type MemberGarminConnectCardProps = {
  initialConnection: ActivityConnectionStatus | null
  memberLinked?: boolean
  readOnly?: boolean
  className?: string
}

function formatWhen(iso: string | null): string {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    return new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(d)
  } catch {
    return '—'
  }
}

function formatPairingCode(code: string): string {
  const digits = code.replace(/\D/g, '').padStart(6, '0').slice(0, 6)
  return `${digits.slice(0, 3)} ${digits.slice(3)}`
}

function remainingLabel(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now()
  if (ms <= 0) return '00:00'
  const total = Math.floor(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function isMobileUa(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
}

export function MemberGarminConnectCard({
  initialConnection,
  memberLinked = true,
  readOnly = false,
  className,
}: MemberGarminConnectCardProps) {
  const [connection, setConnection] = useState<ActivityConnectionStatus | null>(initialConnection)
  const [session, setSession] = useState<GarminPairingPublicSession | null>(null)
  const [phase, setPhase] = useState<'idle' | 'pairing' | 'manage'>('idle')
  const [sessionStatus, setSessionStatus] = useState<string | null>(null)
  const [countdown, setCountdown] = useState('—')
  const [pending, startTransition] = useTransition()
  const [confirmReplace, setConfirmReplace] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [mobileHint] = useState(() => (typeof window !== 'undefined' ? isMobileUa() : false))

  const refreshStatus = useCallback(async () => {
    const result = await getMyGarminConnectionStatus()
    if (result.ok) setConnection(result.connection)
  }, [])

  useEffect(() => {
    if (phase !== 'pairing' || !session) return
    const tick = () => setCountdown(remainingLabel(session.expiresAt))
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [phase, session])

  useEffect(() => {
    if (phase !== 'pairing' || !session) return
    let stopped = false
    const poll = async () => {
      const result = await getMyGarminPairingSessionStatus(session.sessionId)
      if (stopped || !result.ok) return
      setSessionStatus(result.status)
      if (result.status === 'COMPLETED') {
        stopped = true
        await refreshStatus()
        setPhase('idle')
        setSession(null)
        toast.success('Garmin 연결이 완료되었습니다.')
        return
      }
      if (['EXPIRED', 'FAILED', 'CANCELLED'].includes(result.status)) {
        stopped = true
        setPhase('idle')
        setSession(null)
        if (result.status === 'EXPIRED') {
          toast.error('연결 시간이 만료되었습니다. 다시 시작해 주세요.')
        }
      }
    }
    const id = window.setInterval(() => {
      void poll()
    }, session.pollIntervalMs || 2500)
    void poll()
    return () => {
      stopped = true
      window.clearInterval(id)
    }
  }, [phase, session, refreshStatus])

  const doManualSync = () => {
    setSyncing(true)
    startTransition(async () => {
      try {
        const result = await requestMyGarminManualSync()
        if (!result.ok) {
          toast.error(result.error)
          return
        }
        toast.success('동기화 요청이 등록되었습니다. 잠시 후 결과가 반영됩니다.')
        await refreshStatus()
      } finally {
        setSyncing(false)
      }
    })
  }

  const beginPairing = (replace: boolean) => {
    startTransition(async () => {
      const result = await startGarminPairingSession({ confirmReplace: replace })
      if (!result.ok) {
        if (result.needsConfirm) {
          setConfirmReplace(true)
          return
        }
        toast.error(result.error)
        return
      }
      setConfirmReplace(false)
      setSession(result.session)
      setSessionStatus('PENDING')
      setPhase('pairing')
      setCountdown(remainingLabel(result.session.expiresAt))
    })
  }

  const cancelPairing = () => {
    if (!session) {
      setPhase('idle')
      return
    }
    startTransition(async () => {
      await cancelGarminPairingSession(session.sessionId)
      setSession(null)
      setPhase('idle')
      toast.message('연결을 취소했습니다.')
    })
  }

  const copyCode = async () => {
    if (!session) return
    const text = `${session.pairingCode}-${session.connectorSecret}`
    try {
      await navigator.clipboard.writeText(text)
      toast.success('연결 코드가 복사되었습니다.')
    } catch {
      toast.error('복사에 실패했습니다.')
    }
  }

  const doDisconnect = () => {
    if (
      !window.confirm(
        'Garmin 자동 동기화를 중지하시겠습니까?\n이미 등록된 러닝 기록은 삭제되지 않습니다.',
      )
    ) {
      return
    }
    startTransition(async () => {
      const result = await disconnectMyGarminConnection()
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      await refreshStatus()
      setPhase('idle')
      toast.success('Garmin 연결을 해제했습니다. 기존 기록은 유지됩니다.')
    })
  }

  if (!memberLinked) return null

  const status = connection?.status || 'DISCONNECTED'
  const isConnected = status === 'CONNECTED'
  const needsReauth = status === 'REAUTH_REQUIRED'
  const isError = status === 'ERROR'

  return (
    <section className={cn(MEMBER_PORTAL_CARD_CLASS, 'px-3 py-3 sm:px-4', className)}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Watch className="h-4 w-4 shrink-0 text-sky-300" aria-hidden />
          <h2 className="text-sm font-semibold text-sky-50 sm:text-base">Garmin Connect 연동</h2>
        </div>
        <span className="shrink-0 rounded border border-sky-500/30 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-sky-200/90">
          BETA
        </span>
      </div>

      <p className="mt-2 text-sm text-zinc-400">
        가민 러닝 기록을 자동으로 원스텝 마일리지에 반영합니다.
      </p>

      {phase === 'pairing' && session ? (
        <div className="mt-3 space-y-3 rounded-lg border border-sky-500/20 bg-black/30 p-3">
          <p className="text-sm font-medium text-sky-50">Garmin 연결 준비</p>
          {mobileHint ? (
            <p className="text-xs text-amber-200/90">
              최초 연결은 PC에서 Garmin 연결 도우미로 진행해 주세요.
            </p>
          ) : null}
          <ol className="list-decimal space-y-1.5 pl-4 text-sm text-zinc-300">
            <li>PC에서 Garmin 연결 도우미를 실행하세요.</li>
            <li>
              연결 코드 입력
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <code className="rounded bg-zinc-900 px-2 py-1 font-mono text-base tracking-widest text-sky-100">
                  {formatPairingCode(session.pairingCode)}
                </code>
                <Button type="button" size="sm" variant="outline" onClick={() => void copyCode()}>
                  코드 복사
                </Button>
              </div>
            </li>
            <li>Garmin 로그인 창이 열리면 Garmin에서 직접 로그인하세요.</li>
          </ol>
          <p className="text-xs text-zinc-500">
            Garmin 비밀번호는 원스텝에 저장되지 않습니다. Garmin 로그인 화면에서 직접 입력합니다.
          </p>
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="text-zinc-400">
              상태:{' '}
              {sessionStatus === 'CLAIMED' || sessionStatus === 'AUTHENTICATING'
                ? 'Garmin 로그인 진행 중...'
                : sessionStatus === 'COMPLETED'
                  ? '연결 완료!'
                  : 'Garmin 연결 도우미 대기 중...'}
            </span>
            <span className="tabular-nums text-zinc-300">남은 시간 {countdown}</span>
          </div>
          {!readOnly ? (
            <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={cancelPairing}>
              연결 취소
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-zinc-500">현재 상태</p>
            {isConnected ? (
              <p className="mt-0.5 text-sm font-medium text-emerald-300">자동 동기화 중</p>
            ) : needsReauth ? (
              <p className="mt-0.5 text-sm font-medium text-amber-300">다시 연결 필요</p>
            ) : isError ? (
              <p className="mt-0.5 text-sm font-medium text-amber-200">Garmin 동기화 지연</p>
            ) : (
              <p className="mt-0.5 text-sm font-medium text-zinc-300">연결되지 않음</p>
            )}
          </div>

          {isConnected || needsReauth || isError ? (
            <div className="grid gap-2 text-sm text-zinc-400 sm:grid-cols-2">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-zinc-500">마지막 동기화</p>
                <p className="text-zinc-200">{formatWhen(connection?.lastSyncAt ?? null)}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-zinc-500">최근 성공</p>
                <p className="text-zinc-200">{formatWhen(connection?.lastSuccessAt ?? null)}</p>
              </div>
              {isConnected && connection?.nextSyncAt ? (
                <div className="sm:col-span-2">
                  <p className="text-[11px] uppercase tracking-wide text-zinc-500">다음 자동 동기화</p>
                  <p className="text-zinc-200">{formatWhen(connection.nextSyncAt)}</p>
                </div>
              ) : null}
            </div>
          ) : null}

          {connection?.lastImportSummary && (connection.lastImportSummary.imported ?? 0) > 0 ? (
            <p className="text-xs text-zinc-400">
              최근 반영: {connection.lastImportSummary.imported}건
              {connection.lastImportSummary.added_km != null
                ? ` · ${Number(connection.lastImportSummary.added_km).toFixed(2)} km`
                : ''}
            </p>
          ) : null}

          {connection?.recentGarminKm != null ? (
            <div className="rounded-lg border border-white/5 bg-black/20 px-2.5 py-2 text-sm">
              <p className="text-[11px] uppercase tracking-wide text-zinc-500">최근 Garmin 기록</p>
              <p className="mt-0.5 text-zinc-100">
                {connection.recentGarminLoggedAt?.slice(5).replace('-', '/')} ·{' '}
                {connection.recentGarminKm.toFixed(2)} km
                {connection.recentGarminDuration ? ` · ${connection.recentGarminDuration}` : ''}
              </p>
            </div>
          ) : null}

          <MemberGarminReviewPanel
            openCountHint={connection?.openDuplicateCandidates ?? 0}
            onResolved={() => void refreshStatus()}
          />

          {needsReauth ? (
            <p className="text-xs text-amber-200/90">Garmin 인증이 만료되었습니다.</p>
          ) : null}

          <p className="text-xs text-zinc-500">
            Garmin Connect에 업로드된 러닝은 주기적 자동 동기화 후 원스텝 마일리지에 반영됩니다.
            반영까지 시간이 걸릴 수 있습니다.
          </p>

          {!isConnected && !needsReauth ? (
            <p className="text-xs text-zinc-500">
              Garmin을 사용하지 않아도 기존 수동 기록 기능은 계속 사용할 수 있습니다.
            </p>
          ) : null}

          {confirmReplace ? (
            <div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-950/20 p-2.5 text-sm text-amber-50">
              <p>
                현재 Garmin이 연결되어 있습니다. 다시 연결하면 기존 인증 정보가 교체됩니다. 이미
                등록된 러닝 기록은 삭제되지 않습니다.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" disabled={pending || readOnly} onClick={() => beginPairing(true)}>
                  다시 연결
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setConfirmReplace(false)}
                >
                  취소
                </Button>
              </div>
            </div>
          ) : null}

          {!readOnly && phase === 'idle' && !confirmReplace ? (
            <div className="flex flex-wrap gap-2">
              {!isConnected && !needsReauth ? (
                <Button type="button" size="sm" disabled={pending} onClick={() => beginPairing(false)}>
                  Garmin 연결하기
                </Button>
              ) : null}
              {needsReauth || isError ? (
                <Button type="button" size="sm" disabled={pending} onClick={() => beginPairing(true)}>
                  다시 연결
                </Button>
              ) : null}
              {isConnected ? (
                <>
                  <Button
                    type="button"
                    size="sm"
                    disabled={pending || syncing}
                    onClick={doManualSync}
                  >
                    {syncing ? '동기화 요청 중...' : '지금 동기화'}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() => setPhase('manage')}
                  >
                    연결 관리
                  </Button>
                </>
              ) : null}
            </div>
          ) : null}

          {phase === 'manage' && isConnected && !readOnly ? (
            <div className="space-y-2 rounded-lg border border-white/10 bg-black/25 p-2.5">
              <p className="text-sm text-zinc-300">연결 관리</p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => beginPairing(false)}>
                  다시 연결
                </Button>
                <Button type="button" size="sm" variant="destructive" disabled={pending} onClick={doDisconnect}>
                  Garmin 연결 해제
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setPhase('idle')}>
                  닫기
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </section>
  )
}
