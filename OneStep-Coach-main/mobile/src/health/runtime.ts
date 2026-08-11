import Constants from 'expo-constants'

/** Native Health modules need a Development Build — Expo Go is not supported. */
export function isExpoGoRuntime(): boolean {
  return Constants.appOwnership === 'expo'
}
