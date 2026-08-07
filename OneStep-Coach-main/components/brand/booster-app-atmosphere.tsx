'use client'

import { cn } from '@/lib/utils'

/** 로그인과 동일한 아스팔트 + 오렌지 글로우 분위기 (대시보드용, 잔불은 약하게) */
export function BoosterAppAtmosphere({
  className,
  intensity = 'soft',
}: {
  className?: string
  intensity?: 'soft' | 'full'
}) {
  const soft = intensity === 'soft'
  return (
    <div
      className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}
      aria-hidden
    >
      <div className="absolute inset-0 bg-[#090b12]" />
      <div
        className={cn(
          'absolute inset-0',
          soft
            ? 'bg-[radial-gradient(ellipse_at_80%_0%,rgba(255,70,50,0.12),transparent_48%)]'
            : 'bg-[radial-gradient(ellipse_at_70%_0%,rgba(255,70,50,0.18),transparent_50%)]',
        )}
      />
      <div
        className={cn(
          'absolute inset-0',
          soft
            ? 'bg-[radial-gradient(ellipse_at_40%_70%,rgba(255,100,40,0.08),transparent_55%)]'
            : 'bg-[radial-gradient(ellipse_at_40%_55%,rgba(255,100,40,0.16),transparent_55%)]',
        )}
      />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_10%_100%,rgba(20,24,40,0.85),transparent_45%)]" />
      <div
        className="absolute inset-0 opacity-[0.14] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E\")",
        }}
      />
    </div>
  )
}
