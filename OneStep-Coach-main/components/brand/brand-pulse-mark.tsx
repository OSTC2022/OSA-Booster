'use client'

import Image from 'next/image'
import { cn } from '@/lib/utils'

/** UI용 — 비율 유지·정사각 캔버스 (배경 투명) */
export const BRAND_PULSE_ICON_SRC = '/brand-pulse-icon.png?v=17'

/** 컨테이너 대비 심볼 표시 비율 (여백으로 시각적 크기 조절) */
const SYMBOL_DISPLAY_SCALE = 0.84

const GLOW_CLASS =
  'drop-shadow-[0_0_8px_rgba(170,255,0,0.85)] drop-shadow-[0_0_18px_rgba(170,255,0,0.5)]'

export function BrandPulseAppIcon({
  className,
  glow = false,
}: {
  className?: string
  glow?: boolean
}) {
  return (
    <span
      className={cn(
        'relative inline-flex aspect-square shrink-0 items-center justify-center',
        glow &&
          'before:pointer-events-none before:absolute before:inset-[10%] before:rounded-full before:bg-[radial-gradient(circle,rgba(170,255,0,0.38)_0%,transparent_72%)] before:blur-md',
        className,
      )}
    >
      <Image
        src={BRAND_PULSE_ICON_SRC}
        alt=""
        width={1024}
        height={1024}
        unoptimized
        aria-hidden
        className={cn(
          'bg-transparent object-contain',
          glow && `${GLOW_CLASS} onestep-heartbeat`,
        )}
        style={{
          width: `${SYMBOL_DISPLAY_SCALE * 100}%`,
          height: `${SYMBOL_DISPLAY_SCALE * 100}%`,
        }}
      />
    </span>
  )
}

/** @deprecated Use BrandPulseAppIcon */
export const BrandPulseMark = BrandPulseAppIcon
