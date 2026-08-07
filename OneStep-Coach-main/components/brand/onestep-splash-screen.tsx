'use client'

import { useEffect, useState } from 'react'
import {
  BoosterAtmosphere,
  BoosterRunningCrewMark,
  BoosterSSymbol,
} from '@/components/brand/booster-running-crew-mark'
import { BoosterMascot } from '@/components/brand/booster-mascot'
import { cn } from '@/lib/utils'

const SPINNER_CSS = `
@keyframes boosterSpin {
  to { transform: rotate(360deg); }
}
`

function SplashLoader() {
  const [dots, setDots] = useState(0)

  useEffect(() => {
    const timer = window.setInterval(() => {
      setDots((value) => (value + 1) % 4)
    }, 420)
    return () => window.clearInterval(timer)
  }, [])

  return (
    <div className="flex flex-col items-center gap-4 pb-[max(2.5rem,env(safe-area-inset-bottom))]">
      <style dangerouslySetInnerHTML={{ __html: SPINNER_CSS }} />
      <div className="relative h-12 w-12" aria-hidden>
        <svg
          className="h-full w-full"
          viewBox="0 0 50 50"
          style={{ animation: 'boosterSpin 1.05s linear infinite' }}
        >
          <circle
            cx="25"
            cy="25"
            r="20"
            fill="none"
            stroke="currentColor"
            strokeWidth="3.5"
            className="text-white/12"
          />
          <circle
            cx="25"
            cy="25"
            r="20"
            fill="none"
            stroke="#ff6a2a"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeDasharray="36 89.5"
            transform="rotate(-90 25 25)"
          />
        </svg>
      </div>
      <p className="min-w-[8.5rem] text-center text-[11px] font-semibold tracking-[0.32em] text-white/80">
        LOADING{'.'.repeat(dots)}
      </p>
    </div>
  )
}

type OnestepSplashScreenProps = {
  fading?: boolean
  fixed?: boolean
  className?: string
  id?: string
}

export function OnestepSplashScreen({
  fading = false,
  fixed = false,
  className,
  id,
}: OnestepSplashScreenProps) {
  return (
    <div
      id={id}
      role="status"
      aria-live="polite"
      aria-label="로딩 중"
      className={cn(
        'onestep-app-splash relative flex min-h-svh w-full flex-col overflow-x-hidden overflow-y-auto bg-[#090b12] text-white',
        fixed && 'fixed inset-0 z-[9999]',
        fading && 'onestep-splash-fade-out pointer-events-none',
        className,
      )}
    >
      <BoosterAtmosphere />
      <div className="absolute right-2 top-1.5 z-20 flex items-center gap-3 sm:right-5 sm:top-3 sm:gap-4">
        <BoosterSSymbol />
        <BoosterMascot
          size="sm"
          className="pointer-events-none"
        />
      </div>

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center overflow-visible px-6 py-12">
        <div className="w-full max-w-[min(88vw,380px)] overflow-visible px-2">
          <BoosterRunningCrewMark size="lg" className="w-full max-w-none" />
        </div>
      </div>

      <div className="relative z-10">
        <SplashLoader />
      </div>
    </div>
  )
}
