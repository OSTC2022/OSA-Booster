import { useEffect } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { Redirect } from 'expo-router'
import { useAuth } from '@/src/auth/AuthContext'
import { colors } from '@/src/theme/colors'

export default function IndexScreen() {
  const { authState, configError, memberResult } = useAuth()

  useEffect(() => {
    // Session restore handled in AuthProvider
  }, [])

  if (authState === 'LOADING') {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} size="large" />
        <Text style={styles.hint}>Session 확인 중…</Text>
      </View>
    )
  }

  if (authState === 'ERROR') {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>앱을 시작할 수 없습니다</Text>
        <Text style={styles.hint}>{configError || '설정을 확인해주세요.'}</Text>
      </View>
    )
  }

  if (authState === 'SIGNED_OUT') {
    return <Redirect href="/login" />
  }

  if (memberResult?.status === 'UNLINKED') {
    return <Redirect href="/home" />
  }

  return <Redirect href="/home" />
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  hint: {
    color: colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
  },
})
