import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  AppState,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { Redirect, useRouter } from 'expo-router'
import { useAuth } from '@/src/auth/AuthContext'
import { getPublicEnv } from '@/src/lib/env'
import {
  formatDistanceKm,
  formatDuration,
  formatWorkoutDate,
  getHealthAvailability,
  hasHealthReadPermission,
  readRecentRunningWorkouts,
  requestHealthReadPermission,
} from '@/src/health/readRunning'
import {
  notifyHealthConnected,
  uploadHealthWorkouts,
} from '@/src/health/upload'
import {
  createPlatformHealthBridge,
  healthProviderLabel,
  resolveHealthProviderForOs,
} from '@/src/health/platform'
import type { NormalizedRunningWorkout } from '@/src/health/runningTypes'
import {
  bindHealthSyncMember,
  isHealthSyncLocked,
  runExclusiveHealthSync,
  shouldSkipAutoSync,
} from '@/src/health/syncSession'
import { colors } from '@/src/theme/colors'

type UiPhase =
  | 'checking'
  | 'unsupported'
  | 'unavailable'
  | 'not_connected'
  | 'permission_denied'
  | 'connected'
  | 'loading_runs'
  | 'syncing'
  | 'error'

export default function HomeScreen() {
  const router = useRouter()
  const {
    authState,
    member,
    memberResult,
    refreshing,
    signOut,
    refreshMember,
    authUserIdMasked,
    memberIdMasked,
  } = useAuth()

  const [toast, setToast] = useState<string | null>(null)
  const [phase, setPhase] = useState<UiPhase>('checking')
  const [message, setMessage] = useState<string | null>(null)
  const [syncMessage, setSyncMessage] = useState<string | null>(null)
  const [workouts, setWorkouts] = useState<NormalizedRunningWorkout[]>([])
  const [lookbackDays, setLookbackDays] = useState(7)
  const [busy, setBusy] = useState(false)
  const appState = useRef(AppState.currentState)

  const provider = useMemo(() => resolveHealthProviderForOs(Platform.OS), [])
  const bridge = useMemo(() => createPlatformHealthBridge(Platform.OS), [])
  const providerLabel = healthProviderLabel(provider)
  const memberId = member?.id ?? null

  const syncRuns = async (runs: NormalizedRunningWorkout[]) => {
    setPhase('syncing')
    setSyncMessage('동기화 중...')
    const summary = await uploadHealthWorkouts(runs)
    setSyncMessage(summary.message)
    setPhase('connected')
    return summary
  }

  const loadRuns = async (opts?: { upload?: boolean; markPrimary?: boolean }) => {
    setPhase('loading_runs')
    setMessage('최근 러닝 불러오는 중...')
    setSyncMessage(null)
    const result = await readRecentRunningWorkouts()
    if (!result.ok) {
      if (result.code === 'PERMISSION_DENIED') {
        setPhase('permission_denied')
        setMessage(result.message)
      } else if (result.code === 'UNSUPPORTED' || result.code === 'EXPO_GO') {
        setPhase('unsupported')
        setMessage(result.message)
      } else if (result.code === 'UNAVAILABLE') {
        setPhase('unavailable')
        setMessage(result.message)
      } else {
        setPhase('error')
        setMessage(result.message)
      }
      setWorkouts([])
      return
    }
    setWorkouts(result.workouts)
    setLookbackDays(result.lookbackDays)
    setMessage(null)
    setPhase('connected')
    if (opts?.markPrimary && (provider === 'APPLE_HEALTH' || provider === 'HEALTH_CONNECT')) {
      await notifyHealthConnected(provider)
    }
    if (opts?.upload) {
      await syncRuns(result.workouts)
    }
  }

  const runAutoSync = async () => {
    if (shouldSkipAutoSync()) return
    const exclusive = await runExclusiveHealthSync(async () => {
      const availability = await getHealthAvailability()
      if (!availability.ok) {
        if (availability.code === 'UNSUPPORTED' || availability.code === 'EXPO_GO') {
          setPhase('unsupported')
        } else {
          setPhase('unavailable')
        }
        setMessage(availability.message)
        return
      }

      const permitted = await hasHealthReadPermission()
      if (!permitted) {
        setPhase('not_connected')
        setMessage(null)
        return
      }

      await loadRuns({ upload: true })
    })
    if (!exclusive.started) return
  }

  useEffect(() => {
    if (authState !== 'SIGNED_IN') return
    if (memberResult?.status === 'UNLINKED' || memberResult?.status === 'ERROR') return
    const switched = bindHealthSyncMember(memberId)
    if (switched) {
      setWorkouts([])
      setSyncMessage(null)
      setPhase('checking')
    }
    void runAutoSync()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- member-bound auto sync
  }, [authState, memberResult?.status, memberId])

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      const prev = appState.current
      appState.current = next
      if (prev.match(/inactive|background/) && next === 'active') {
        if (authState !== 'SIGNED_IN') return
        if (memberResult?.status === 'UNLINKED' || memberResult?.status === 'ERROR') return
        void runAutoSync()
      }
    })
    return () => sub.remove()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authState, memberResult?.status])

  if (authState === 'LOADING') {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.muted}>회원 정보 확인 중…</Text>
      </View>
    )
  }

  if (authState === 'SIGNED_OUT') {
    return <Redirect href="/login" />
  }

  const openPortal = async () => {
    const url = getPublicEnv().webPortalUrl
    try {
      await Linking.openURL(url)
    } catch {
      setToast('러닝 포털을 열 수 없습니다.')
    }
  }

  const onConnectPress = async () => {
    if (busy || isHealthSyncLocked()) return
    setBusy(true)
    setToast(null)
    try {
      const exclusive = await runExclusiveHealthSync(async () => {
        const result = await requestHealthReadPermission()
        if (!result.ok) {
          if (result.code === 'PERMISSION_DENIED') {
            setPhase('permission_denied')
            setMessage(result.message)
          } else if (result.code === 'UNSUPPORTED' || result.code === 'EXPO_GO') {
            setPhase('unsupported')
            setMessage(result.message)
          } else {
            setPhase('unavailable')
            setMessage(result.message)
          }
          return
        }
        await loadRuns({ upload: true, markPrimary: true })
      })
      if (!exclusive.started) return
    } finally {
      setBusy(false)
    }
  }

  const onRefresh = async () => {
    if (busy || isHealthSyncLocked()) return
    setBusy(true)
    setToast(null)
    try {
      const exclusive = await runExclusiveHealthSync(async () => {
        await loadRuns({ upload: true })
      })
      if (!exclusive.started) return
    } finally {
      setBusy(false)
    }
  }

  if (memberResult?.status === 'UNLINKED') {
    return (
      <View style={styles.centerPad}>
        <Text style={styles.title}>회원 정보를 찾을 수 없습니다</Text>
        <Text style={styles.body}>
          센터에 등록된 계정과 연결이 필요합니다. 웹에서 회원 연결 후 다시 시도해주세요.
        </Text>
        <Pressable style={styles.secondaryBtn} onPress={() => void refreshMember()}>
          <Text style={styles.secondaryBtnText}>다시 시도</Text>
        </Pressable>
        <Pressable style={styles.ghostBtn} onPress={() => void signOut()}>
          <Text style={styles.ghostBtnText}>로그아웃</Text>
        </Pressable>
      </View>
    )
  }

  if (memberResult?.status === 'ERROR') {
    return (
      <View style={styles.centerPad}>
        <Text style={styles.title}>일시적인 오류</Text>
        <Text style={styles.body}>{memberResult.message}</Text>
        <Pressable style={styles.secondaryBtn} onPress={() => void refreshMember()}>
          <Text style={styles.secondaryBtnText}>다시 시도</Text>
        </Pressable>
      </View>
    )
  }

  const connected =
    phase === 'connected' || phase === 'loading_runs' || phase === 'syncing'
  const showRuns = connected

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.brand}>ONE STEP</Text>
      <Text style={styles.heading}>운동 기록 자동 연동</Text>
      <Text style={styles.lead}>
        휴대폰 Health의 러닝 기록을 읽어 ONE STEP 마일리지에 반영합니다. 중복은 자동으로
        건너뜁니다.
      </Text>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>현재 상태</Text>
        {phase === 'checking' ? (
          <Text style={styles.statusLine}>확인 중…</Text>
        ) : connected ? (
          <Text style={styles.statusOk}>🟢 운동 기록 연결됨</Text>
        ) : phase === 'permission_denied' ? (
          <Text style={styles.statusWarn}>○ 권한 필요</Text>
        ) : phase === 'unsupported' || phase === 'unavailable' ? (
          <Text style={styles.statusLine}>○ 사용 불가</Text>
        ) : (
          <Text style={styles.statusLine}>
            ○ {providerLabel} 연결 안 됨
          </Text>
        )}

        <Text style={styles.cardLabel}>기기</Text>
        {provider ? (
          <Text style={styles.statusStrong}>{providerLabel}</Text>
        ) : (
          <Text style={styles.body}>
            운동 기록 연동은 iPhone/Android 앱에서 사용할 수 있습니다. (현재: {Platform.OS})
          </Text>
        )}

        {message && phase !== 'loading_runs' ? (
          <Text style={styles.body}>{message}</Text>
        ) : null}

        {phase === 'not_connected' || phase === 'permission_denied' ? (
          <Pressable
            style={[styles.primaryBtn, (!provider || busy) && styles.btnDisabled]}
            onPress={() => void onConnectPress()}
            disabled={!provider || busy}
            accessibilityRole="button"
            accessibilityLabel={`${providerLabel} 연결하기`}
          >
            {busy ? (
              <ActivityIndicator color="#1c1917" />
            ) : (
              <Text style={styles.primaryBtnText}>
                {phase === 'permission_denied'
                  ? '다시 확인'
                  : `${providerLabel} 연결하기`}
              </Text>
            )}
          </Pressable>
        ) : null}

        {phase === 'unsupported' || phase === 'unavailable' ? (
          <Text style={styles.body}>
            {message ||
              '이 기기에서는 운동 기록 자동 연동을 사용할 수 없습니다.'}
          </Text>
        ) : null}
      </View>

      {showRuns ? (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>최근 러닝</Text>
          {phase === 'loading_runs' ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={colors.accent} />
              <Text style={styles.body}>최근 러닝 불러오는 중...</Text>
            </View>
          ) : phase === 'syncing' ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={colors.accent} />
              <Text style={styles.body}>동기화 중...</Text>
            </View>
          ) : workouts.length === 0 ? (
            <Text style={styles.body}>
              최근 {lookbackDays}일 러닝 기록이 없습니다.
            </Text>
          ) : (
            workouts.map((w) => (
              <View key={`${w.provider}:${w.externalActivityId}`} style={styles.runRow}>
                <Text style={styles.runDate}>{formatWorkoutDate(w.startedAt)}</Text>
                <Text style={styles.runStats}>
                  {formatDistanceKm(w.distanceKm)} · {formatDuration(w.durationSeconds)}
                </Text>
                {__DEV__ && w.sourceOrigin ? (
                  <Text style={styles.runSource}>{w.sourceOrigin}</Text>
                ) : null}
              </View>
            ))
          )}

          {syncMessage ? <Text style={styles.syncMsg}>{syncMessage}</Text> : null}

          <Pressable
            style={[styles.secondaryBtn, busy && styles.btnDisabled]}
            onPress={() => void onRefresh()}
            disabled={busy}
            accessibilityRole="button"
          >
            <Text style={styles.secondaryBtnText}>
              {busy ? '동기화 중...' : '새로고침'}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {member ? (
        <Text style={styles.meta}>
          {member.name}
          {refreshing ? ' · 확인 중…' : ''}
        </Text>
      ) : null}

      {toast ? <Text style={styles.toast}>{toast}</Text> : null}

      <Pressable style={styles.secondaryBtn} onPress={() => void openPortal()}>
        <Text style={styles.secondaryBtnText}>ONE STEP 러닝 포털 열기</Text>
      </Pressable>

      <Pressable style={styles.ghostBtn} onPress={() => router.push('/settings')}>
        <Text style={styles.ghostBtnText}>연동 관리</Text>
      </Pressable>

      {__DEV__ ? (
        <View style={styles.debug}>
          <Text style={styles.debugTitle}>Debug (dev only)</Text>
          <Text style={styles.debugLine}>Auth: SIGNED_IN</Text>
          <Text style={styles.debugLine}>
            Member: {member ? 'LINKED' : memberResult?.status || '—'}
          </Text>
          <Text style={styles.debugLine}>Platform: {Platform.OS.toUpperCase()}</Text>
          <Text style={styles.debugLine}>Health phase: {phase}</Text>
          <Text style={styles.debugLine}>Runs: {workouts.length}</Text>
          <Text style={styles.debugLine}>AuthUser: {authUserIdMasked}</Text>
          <Text style={styles.debugLine}>MemberId: {memberIdMasked}</Text>
          <Text style={styles.debugLine}>Bridge: {bridge.provider ?? 'none'}</Text>
        </View>
      ) : null}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingBottom: 40, gap: 14 },
  center: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  centerPad: {
    flex: 1,
    backgroundColor: colors.bg,
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  brand: {
    color: colors.accent,
    fontWeight: '700',
    letterSpacing: 1.2,
    fontSize: 13,
  },
  heading: { color: colors.text, fontSize: 24, fontWeight: '700' },
  title: { color: colors.text, fontSize: 20, fontWeight: '700' },
  lead: { color: colors.textMuted, fontSize: 14, lineHeight: 21 },
  body: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.surfaceBorder,
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    gap: 8,
  },
  cardLabel: {
    color: colors.textDim,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  statusLine: { color: colors.textMuted, fontSize: 16 },
  statusOk: { color: colors.sky, fontSize: 16, fontWeight: '600' },
  statusWarn: { color: colors.warning, fontSize: 16 },
  statusStrong: { color: colors.sky, fontSize: 17, fontWeight: '600' },
  primaryBtn: {
    marginTop: 8,
    backgroundColor: colors.accent,
    borderRadius: 12,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  primaryBtnText: { color: '#1c1917', fontWeight: '700', fontSize: 15 },
  secondaryBtn: {
    borderRadius: 12,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.accentBorder,
    backgroundColor: colors.accentSoft,
  },
  secondaryBtnText: { color: colors.accent, fontWeight: '600', fontSize: 15 },
  ghostBtn: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostBtnText: { color: colors.textMuted, fontSize: 14 },
  btnDisabled: { opacity: 0.5 },
  meta: { color: colors.textDim, fontSize: 12 },
  toast: { color: colors.warning, fontSize: 13 },
  muted: { color: colors.textMuted },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  runRow: {
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.surfaceBorder,
    gap: 2,
  },
  runDate: { color: colors.text, fontSize: 15, fontWeight: '600' },
  runStats: { color: colors.textMuted, fontSize: 14 },
  runSource: { color: colors.textDim, fontSize: 11 },
  syncMsg: { color: colors.sky, fontSize: 14, marginTop: 4 },
  debug: {
    marginTop: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    gap: 4,
  },
  debugTitle: { color: colors.textDim, fontSize: 11, marginBottom: 4 },
  debugLine: {
    color: colors.textDim,
    fontSize: 11,
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
  },
})
