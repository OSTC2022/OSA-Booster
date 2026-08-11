import { useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { Redirect } from 'expo-router'
import { useAuth } from '@/src/auth/AuthContext'
import { colors } from '@/src/theme/colors'

export default function LoginScreen() {
  const { authState, signInWithPassword } = useAuth()
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  if (authState === 'SIGNED_IN') {
    return <Redirect href="/home" />
  }

  if (authState === 'LOADING') {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.muted}>Session 확인 중…</Text>
      </View>
    )
  }

  const onSubmit = async () => {
    if (pending) return
    setError(null)
    setPending(true)
    try {
      const result = await signInWithPassword(login, password)
      if (result.error) setError(result.error)
    } finally {
      setPending(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.card}>
        <Text style={styles.brand}>ONE STEP</Text>
        <Text style={styles.title}>러닝 기록 자동 연동</Text>
        <Text style={styles.subtitle}>
          기존 ONE STEP 계정으로 로그인하세요. 모바일 전용 계정을 만들 필요가 없습니다.
        </Text>

        <Text style={styles.label}>이메일 또는 로그인 ID</Text>
        <TextInput
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          placeholder="email@example.com"
          placeholderTextColor={colors.textDim}
          value={login}
          onChangeText={setLogin}
          editable={!pending}
        />

        <Text style={styles.label}>비밀번호</Text>
        <TextInput
          style={styles.input}
          secureTextEntry
          placeholder="••••••••"
          placeholderTextColor={colors.textDim}
          value={password}
          onChangeText={setPassword}
          editable={!pending}
          onSubmitEditing={() => void onSubmit()}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          style={[styles.button, pending && styles.buttonDisabled]}
          onPress={() => void onSubmit()}
          disabled={pending}
          accessibilityRole="button"
        >
          {pending ? (
            <ActivityIndicator color={colors.bg} />
          ) : (
            <Text style={styles.buttonText}>로그인</Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
    justifyContent: 'center',
    padding: 20,
  },
  center: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.surfaceBorder,
    borderWidth: 1,
    borderRadius: 16,
    padding: 20,
    gap: 10,
  },
  brand: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 8,
  },
  label: {
    color: colors.textDim,
    fontSize: 12,
    marginTop: 4,
  },
  input: {
    backgroundColor: colors.inputBg,
    borderColor: colors.inputBorder,
    borderWidth: 1,
    borderRadius: 10,
    color: colors.text,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    minHeight: 48,
  },
  button: {
    marginTop: 12,
    backgroundColor: colors.accent,
    borderRadius: 12,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: { opacity: 0.7 },
  buttonText: {
    color: '#1c1917',
    fontSize: 16,
    fontWeight: '700',
  },
  error: {
    color: colors.danger,
    fontSize: 13,
  },
  muted: { color: colors.textMuted },
})
