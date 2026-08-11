import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { AuthProvider } from '@/src/auth/AuthContext'
import { colors } from '@/src/theme/colors'

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.text,
          headerTitleStyle: { fontWeight: '600' },
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ title: '로그인', headerShown: false }} />
        <Stack.Screen name="home" options={{ title: '운동 기록 연동', headerShown: false }} />
        <Stack.Screen name="settings" options={{ title: '연동 관리' }} />
      </Stack>
    </AuthProvider>
  )
}
