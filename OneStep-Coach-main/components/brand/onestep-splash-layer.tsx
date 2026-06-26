'use client'

import { useEffect, useState } from 'react'
import { OnestepSplashScreen } from '@/components/brand/onestep-splash-screen'
import {
  finishSplashBoot,
  shouldSkipSplashBoot,
  SPLASH_FADE_MS,
  SPLASH_MIN_VISIBLE_MS,
} from '@/lib/splash-boot'

/** 스플래시 표시 + 종료 — React 트리에서 언마운트 (DOM remove 금지) */
export function OnestepSplashLayer() {
  const [visible, setVisible] = useState(true)
  const [fadeOut, setFadeOut] = useState(false)

  useEffect(() => {
    if (shouldSkipSplashBoot()) {
      finishSplashBoot()
      setVisible(false)
      return
    }

    document.documentElement.classList.add('onestep-splash-active')

    const hideTimer = window.setTimeout(() => {
      setFadeOut(true)
      window.setTimeout(() => {
        finishSplashBoot()
        setVisible(false)
      }, SPLASH_FADE_MS)
    }, SPLASH_MIN_VISIBLE_MS)

    return () => {
      window.clearTimeout(hideTimer)
    }
  }, [])

  if (!visible) return null

  return (
    <OnestepSplashScreen
      id="onestep-app-splash"
      fixed
      fading={fadeOut}
    />
  )
}

/** @deprecated Use OnestepSplashLayer */
export const OnestepSplashStatic = OnestepSplashLayer

/** @deprecated Merged into OnestepSplashLayer */
export function AppInitialLoader() {
  return null
}
