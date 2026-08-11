import { useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { useAuth } from '@/src/auth/AuthContext'
import { getPublicEnv } from '@/src/lib/env'
import { getSupabase } from '@/src/lib/supabase'
import { colors } from '@/src/theme/colors'

export default function SettingsScreen() {
  const { member, signOut, authUserIdMasked, memberIdMasked } = useAuth()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const onDisconnectHealth = async () => {
    if (busy) return
    setBusy(true)
    setMsg(null)
    try {
      const supabase = getSupabase()
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      if (!token) {
        setMsg('로그인이 필요합니다.')
        return
      }
      const base = getPublicEnv().webPortalUrl.replace(/\/$/, '')
      const res = await fetch(`${base}/api/health-bridge/disconnect`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: '{}',
      })
      if (!res.ok) {
        setMsg('연결 해제에 실패했습니다. 다시 시도해주세요.')
        return
      }
      setMsg(
        'Health 우선 연동을 해제했습니다. Garmin 연결이 있으면 자동 동기화가 다시 켜질 수 있습니다.',
      )
    } catch {
      setMsg('연결 해제에 실패했습니다. 다시 시도해주세요.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={styles.root}>
      <Text style={styles.title}>연동 관리</Text>
      <Text style={styles.body}>
        Health 권한은 OS 설정에서 관리됩니다. 로그아웃은 ONE STEP 세션만 종료하며, OS Health
        권한을 강제 해제하지 않습니다.
      </Text>
      {member ? (
        <Text style={styles.meta}>
          {member.name}
          {'\n'}
          member {memberIdMasked} · auth {authUserIdMasked}
        </Text>
      ) : null}

      <Pressable
        style={[styles.secondaryBtn, busy && styles.disabled]}
        onPress={() => void onDisconnectHealth()}
        disabled={busy}
        accessibilityRole="button"
      >
        {busy ? (
          <ActivityIndicator color={colors.accent} />
        ) : (
          <Text style={styles.secondaryText}>Health 우선 연동 해제</Text>
        )}
      </Pressable>
      {msg ? <Text style={styles.msg}>{msg}</Text> : null}

      <Pressable style={styles.dangerBtn} onPress={() => void signOut()} accessibilityRole="button">
        <Text style={styles.dangerText}>로그아웃</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
    padding: 20,
    gap: 12,
  },
  title: { color: colors.text, fontSize: 20, fontWeight: '700' },
  body: { color: colors.textMuted, fontSize: 14, lineHeight: 21 },
  meta: { color: colors.textDim, fontSize: 12, lineHeight: 18 },
  secondaryBtn: {
    marginTop: 8,
    minHeight: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.accentBorder,
    backgroundColor: colors.accentSoft,
  },
  secondaryText: { color: colors.accent, fontWeight: '600', fontSize: 15 },
  disabled: { opacity: 0.5 },
  msg: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  dangerBtn: {
    marginTop: 16,
    minHeight: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.4)',
    backgroundColor: 'rgba(248,113,113,0.12)',
  },
  dangerText: { color: colors.danger, fontWeight: '700', fontSize: 15 },
})
