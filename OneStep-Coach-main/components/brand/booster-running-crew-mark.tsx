'use client'

import { useId } from 'react'
import { Permanent_Marker, Russo_One } from 'next/font/google'
import { cn } from '@/lib/utils'

/** 브러시 마커 느낌 — 첨부 BooSter 로고와 가까운 톤 */
const boosterBrush = Permanent_Marker({
  weight: '400',
  subsets: ['latin'],
  display: 'swap',
})

const boosterCrew = Russo_One({
  weight: '400',
  subsets: ['latin'],
  display: 'swap',
})

export const BOOSTER_LOGO_SRC = '/brand/booster-logo.png'

const BOOSTER_KEYFRAMES = `
@keyframes boosterRise {
  from { opacity: 0; transform: translateY(14px) scale(0.96); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes boosterFloat {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-5px); }
}
@keyframes boosterSGlow {
  0%, 100% {
    filter: drop-shadow(0 0 4px rgba(255, 210, 90, 0.75))
            drop-shadow(0 0 12px rgba(255, 110, 30, 0.7))
            drop-shadow(0 0 22px rgba(255, 40, 40, 0.45));
  }
  50% {
    filter: drop-shadow(0 0 7px rgba(255, 240, 160, 0.95))
            drop-shadow(0 0 18px rgba(255, 140, 40, 0.9))
            drop-shadow(0 0 32px rgba(255, 50, 60, 0.55));
  }
}
@keyframes boosterFlameFlicker {
  0%, 100% { opacity: 0.4; transform: translateY(0) scale(1); }
  35% { opacity: 0.85; transform: translateY(-3px) scale(1.06); }
  65% { opacity: 0.55; transform: translateY(-1px) scale(0.98); }
}
@keyframes boosterSPulse {
  0%, 100% {
    filter: drop-shadow(0 0 4px rgba(255, 210, 90, 0.7))
            drop-shadow(0 0 12px rgba(255, 90, 30, 0.65));
    transform: scale(1);
  }
  50% {
    filter: drop-shadow(0 0 8px rgba(255, 230, 140, 0.95))
            drop-shadow(0 0 20px rgba(255, 70, 40, 0.75));
    transform: scale(1.04);
  }
}
@keyframes boosterLaurelGlow {
  0%, 100% {
    transform: perspective(560px) rotateY(-10deg) rotateX(8deg) translateY(0) scale(1);
  }
  50% {
    transform: perspective(560px) rotateY(10deg) rotateX(5deg) translateY(-3px) scale(1.03);
  }
}
@keyframes boosterLaurelAura {
  0%, 100% { opacity: 0.55; transform: scale(0.92); }
  50% { opacity: 0.95; transform: scale(1.08); }
}
@keyframes boosterLaurelRay {
  0% { transform: rotate(0deg); opacity: 0.35; }
  50% { opacity: 0.55; }
  100% { transform: rotate(360deg); opacity: 0.35; }
}
@keyframes boosterLaurelSpark {
  0%, 100% { opacity: 0.15; transform: scale(0.6); }
  40% { opacity: 1; transform: scale(1.15); }
  70% { opacity: 0.35; transform: scale(0.85); }
}
@keyframes boosterLaurelShine {
  0% { filter: drop-shadow(0 0 6px rgba(255, 190, 60, 0.45)) drop-shadow(0 8px 12px rgba(80, 40, 0, 0.45)); }
  50% { filter: drop-shadow(0 0 14px rgba(255, 230, 140, 0.85)) drop-shadow(0 10px 16px rgba(80, 40, 0, 0.35)); }
  100% { filter: drop-shadow(0 0 6px rgba(255, 190, 60, 0.45)) drop-shadow(0 8px 12px rgba(80, 40, 0, 0.45)); }
}
@keyframes boosterAura {
  0%, 100% { opacity: 0.28; transform: translate(-50%, -50%) scale(0.94); }
  50% { opacity: 0.65; transform: translate(-50%, -50%) scale(1.05); }
}
@keyframes boosterEmber {
  0% { transform: translate3d(0, 8px, 0); opacity: 0; }
  18% { opacity: 0.9; }
  100% { transform: translate3d(var(--ex, 10px), -130px, 0); opacity: 0; }
}
`

/** 첨부 로고 느낌 — 글씨만, 원/사각 배경 없음 */
export function BoosterRunningCrewMark({
  className,
  size = 'md',
  animated = true,
}: {
  className?: string
  size?: 'sm' | 'md' | 'lg'
  animated?: boolean
}) {
  const uid = useId().replace(/:/g, '')
  const width = size === 'lg' ? 380 : size === 'sm' ? 230 : 310
  const sGrad = `booster-s-${uid}`
  const sHi = `booster-s-hi-${uid}`
  const sGlow = `booster-s-glow-${uid}`
  const sRim = `booster-s-rim-${uid}`
  const ink = `booster-ink-${uid}`

  return (
    <div
      className={cn(
        'relative mx-auto flex items-center justify-center overflow-visible',
        boosterBrush.className,
        className,
      )}
      style={{
        width: className?.includes('w-full') ? '100%' : width,
        maxWidth: width,
        aspectRatio: '720 / 340',
      }}
      role="img"
      aria-label="BooSter Running Crew"
    >
      <span className={cn('sr-only', boosterCrew.className)} aria-hidden>
        Running Crew
      </span>
      {animated ? (
        <style dangerouslySetInnerHTML={{ __html: BOOSTER_KEYFRAMES }} />
      ) : null}

      {animated ? (
        <span
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-[42%] h-[50%] w-[55%] -translate-x-1/2 -translate-y-1/2 bg-[radial-gradient(ellipse,rgba(255,120,40,0.4),rgba(255,40,50,0.12)_45%,transparent_72%)] blur-2xl"
          style={{ animation: 'boosterAura 2.8s ease-in-out infinite' }}
        />
      ) : null}

      <svg
        viewBox="0 0 720 340"
        width="100%"
        height="100%"
        className="relative z-[1] overflow-visible"
        style={{
          animation: animated
            ? 'boosterRise 0.75s cubic-bezier(0.22,1,0.36,1) both, boosterFloat 3.2s 0.75s ease-in-out infinite'
            : undefined,
        }}
      >
        <defs>
          {/* 위(핫핑크·레드) → 아래(골드) 불꽃 그라데이션 */}
          <linearGradient id={sGrad} x1="30%" y1="0%" x2="60%" y2="100%">
            <stop offset="0%" stopColor="#ff1e5c" />
            <stop offset="22%" stopColor="#ff3a24" />
            <stop offset="48%" stopColor="#ff6b12" />
            <stop offset="72%" stopColor="#ffab2e" />
            <stop offset="100%" stopColor="#ffe56a" />
          </linearGradient>
          <linearGradient id={sHi} x1="15%" y1="5%" x2="80%" y2="95%">
            <stop offset="0%" stopColor="#fff7d2" stopOpacity="0.85" />
            <stop offset="35%" stopColor="#ffd978" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#ff7a28" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={sRim} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#ff6a8a" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#ffc040" stopOpacity="0.25" />
          </linearGradient>
          <linearGradient id={ink} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#eceff5" />
          </linearGradient>
          <filter id={sGlow} x="-80%" y="-70%" width="260%" height="240%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="3.5" result="blur" />
            <feFlood floodColor="#ff8a20" floodOpacity="0.9" result="color" />
            <feComposite in="color" in2="blur" operator="in" result="glow" />
            <feGaussianBlur in="SourceAlpha" stdDeviation="8" result="blur2" />
            <feFlood floodColor="#ff2a40" floodOpacity="0.55" result="color2" />
            <feComposite in="color2" in2="blur2" operator="in" result="glow2" />
            <feMerge>
              <feMergeNode in="glow2" />
              <feMergeNode in="glow" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* BOOSTER 워드마크 — 시각 중심을 뷰박스 중앙(360)에 맞춤
            (Boo가 ter보다 넓어 S만 중앙에 두면 전체가 왼쪽으로 치우침) */}
        <g transform="translate(28 0)">
        {/* 영어 S */}
        <g
          style={{
            animation: animated ? 'boosterSGlow 2.1s ease-in-out infinite' : undefined,
          }}
        >
          <g
            style={{
              animation: animated
                ? 'boosterFlameFlicker 1.15s ease-in-out infinite'
                : undefined,
            }}
          >
            <path
              d="M 348 72 C 336 62 332 46 344 34 C 342 48 350 58 348 72 Z"
              fill="#ffc14a"
              opacity="0.7"
              transform="translate(20 0)"
            />
            <path
              d="M 370 68 C 364 52 374 36 388 30 C 376 44 376 56 370 68 Z"
              fill="#ffe08a"
              opacity="0.65"
              transform="translate(20 0)"
            />
            <path
              d="M 316 248 C 304 260 294 272 288 286 C 300 272 312 260 316 248 Z"
              fill="#ff7a30"
              opacity="0.55"
              transform="translate(20 0)"
            />
          </g>

          <text
            x="360"
            y="178"
            textAnchor="middle"
            fill={`url(#${sRim})`}
            fontSize="132"
            opacity="0.55"
            style={{ fontFamily: boosterBrush.style.fontFamily }}
            aria-hidden
          >
            S
          </text>

          <text
            x="360"
            y="178"
            textAnchor="middle"
            fill={`url(#${sGrad})`}
            fontSize="128"
            filter={`url(#${sGlow})`}
            style={{ fontFamily: boosterBrush.style.fontFamily }}
          >
            S
          </text>

          <text
            x="357"
            y="175"
            textAnchor="middle"
            fill={`url(#${sHi})`}
            fontSize="128"
            opacity="0.55"
            style={{ fontFamily: boosterBrush.style.fontFamily }}
            aria-hidden
          >
            S
          </text>
        </g>

        {/* Boo — S 왼쪽, 끝 기준 정렬 */}
        <text
          x="292"
          y="168"
          textAnchor="end"
          fill="rgba(0,0,0,0.32)"
          fontSize="104"
          style={{ fontFamily: boosterBrush.style.fontFamily }}
          aria-hidden
        >
          Boo
        </text>
        <text
          x="290"
          y="164"
          textAnchor="end"
          fill={`url(#${ink})`}
          fontSize="104"
          style={{ fontFamily: boosterBrush.style.fontFamily }}
        >
          Boo
        </text>

        {/* ter — S 오른쪽, 시작 기준 정렬 */}
        <text
          x="430"
          y="172"
          textAnchor="start"
          fill="rgba(0,0,0,0.32)"
          fontSize="104"
          style={{ fontFamily: boosterBrush.style.fontFamily }}
          aria-hidden
        >
          ter
        </text>
        <text
          x="428"
          y="168"
          textAnchor="start"
          fill={`url(#${ink})`}
          fontSize="104"
          style={{ fontFamily: boosterBrush.style.fontFamily }}
        >
          ter
        </text>
        </g>

        {/* RUNNING CREW — 워드마크 전체 중앙 (letterSpacing 보정) */}
        <text
          x="363"
          y="248"
          textAnchor="middle"
          fill="#f3f5fa"
          fontSize="22"
          letterSpacing="5"
          fontStyle="italic"
          fontWeight="700"
          style={{ fontFamily: boosterCrew.style.fontFamily }}
        >
          RUNNING CREW
        </text>
      </svg>
    </div>
  )
}

const LAUREL_WREATH_HOF_SRC = '/brand/laurel-wreath-hof.png?v=1'

const LAUREL_SPARKS = [
  { top: '8%', left: '18%', delay: '0s', size: 3 },
  { top: '14%', left: '78%', delay: '0.6s', size: 2.5 },
  { top: '42%', left: '6%', delay: '1.1s', size: 2 },
  { top: '48%', left: '90%', delay: '0.3s', size: 3 },
  { top: '72%', left: '22%', delay: '1.5s', size: 2 },
  { top: '78%', left: '74%', delay: '0.9s', size: 2.5 },
  { top: '4%', left: '48%', delay: '1.8s', size: 2 },
] as const

/** 우측 상단 — 명예의 전당 골드 월계관 */
export function BoosterSSymbol({
  className,
  animated = true,
  interactive = false,
  onClick,
  size = 'md',
}: {
  className?: string
  animated?: boolean
  interactive?: boolean
  onClick?: () => void
  size?: 'xs' | 'sm' | 'md'
}) {
  const dim = size === 'xs' ? 52 : size === 'sm' ? 72 : 104
  const starClass =
    size === 'xs'
      ? 'h-2.5 w-2.5'
      : size === 'sm'
        ? 'h-3 w-3'
        : 'h-3.5 w-3.5 sm:h-4 sm:w-4'

  const inner = (
    <span className="relative block" style={{ width: dim, height: dim }}>
      {animated ? (
        <style dangerouslySetInnerHTML={{ __html: BOOSTER_KEYFRAMES }} />
      ) : null}

      {/* 후광 */}
      <span
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-[120%] w-[120%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(255,200,70,0.45)_0%,rgba(255,140,40,0.18)_42%,transparent_70%)] blur-[6px]"
        style={{
          animation: animated ? 'boosterLaurelAura 2.6s ease-in-out infinite' : undefined,
        }}
      />

      {/* 빛살 */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-[-18%] opacity-50"
        style={{
          background:
            'conic-gradient(from 0deg, transparent 0deg, rgba(255,220,120,0.35) 8deg, transparent 16deg, transparent 40deg, rgba(255,200,80,0.28) 48deg, transparent 56deg, transparent 80deg, rgba(255,220,120,0.3) 88deg, transparent 96deg, transparent 120deg, rgba(255,200,80,0.25) 128deg, transparent 136deg, transparent 160deg, rgba(255,220,120,0.3) 168deg, transparent 176deg, transparent 200deg, rgba(255,200,80,0.25) 208deg, transparent 216deg, transparent 240deg, rgba(255,220,120,0.28) 248deg, transparent 256deg, transparent 280deg, rgba(255,200,80,0.25) 288deg, transparent 296deg, transparent 320deg, rgba(255,220,120,0.3) 328deg, transparent 336deg, transparent 360deg)',
          maskImage: 'radial-gradient(circle, transparent 28%, black 48%, transparent 72%)',
          WebkitMaskImage:
            'radial-gradient(circle, transparent 28%, black 48%, transparent 72%)',
          animation: animated ? 'boosterLaurelRay 18s linear infinite' : undefined,
        }}
      />

      {/* 중앙 별 */}
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        className={cn(
          'pointer-events-none absolute left-1/2 top-[46%] z-[1] -translate-x-1/2 -translate-y-1/2',
          starClass,
        )}
        style={{
          filter: 'drop-shadow(0 0 4px rgba(255,220,120,0.9))',
          animation: animated ? 'boosterLaurelSpark 2.4s ease-in-out infinite' : undefined,
        }}
      >
        <path
          d="M12 2.2 L13.7 9.1 L20.8 9.1 L15.1 13.3 L17.1 20.3 L12 15.9 L6.9 20.3 L8.9 13.3 L3.2 9.1 L10.3 9.1 Z"
          fill="url(#hof-star)"
        />
        <defs>
          <linearGradient id="hof-star" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#fff6c8" />
            <stop offset="55%" stopColor="#ffc84a" />
            <stop offset="100%" stopColor="#ff8a1e" />
          </linearGradient>
        </defs>
      </svg>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={LAUREL_WREATH_HOF_SRC}
        alt=""
        width={dim}
        height={dim}
        draggable={false}
        className="relative z-[2] h-full w-full bg-transparent object-contain"
        style={{
          transformStyle: 'preserve-3d',
          animation: animated
            ? 'boosterLaurelGlow 3.4s ease-in-out infinite, boosterLaurelShine 2.4s ease-in-out infinite'
            : undefined,
        }}
      />

      {/* 스파클 */}
      {LAUREL_SPARKS.map((spark, index) => (
        <span
          key={index}
          aria-hidden
          className="pointer-events-none absolute z-[3] rounded-full bg-[#fff4c0]"
          style={{
            top: spark.top,
            left: spark.left,
            width: Math.max(1.5, spark.size * (dim / 104)),
            height: Math.max(1.5, spark.size * (dim / 104)),
            boxShadow: '0 0 6px 1px rgba(255,220,120,0.9)',
            animation: animated
              ? `boosterLaurelSpark 2.2s ease-in-out ${spark.delay} infinite`
              : undefined,
          }}
        />
      ))}
    </span>
  )

  if (interactive) {
    return (
      <button
        type="button"
        className={cn(
          'relative inline-flex shrink-0 cursor-pointer transition hover:scale-105 active:scale-95',
          className,
        )}
        style={{ perspective: 640 }}
        onClick={onClick}
        aria-label="명예의 전당 열기"
      >
        {inner}
      </button>
    )
  }

  return (
    <div
      className={cn('pointer-events-none relative inline-flex shrink-0', className)}
      style={{ perspective: 640 }}
      aria-hidden
    >
      {inner}
    </div>
  )
}

export function BoosterCornerFrame({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
  animated?: boolean
}) {
  return <div className={cn('relative overflow-visible', className)}>{children}</div>
}

export function BoosterAtmosphere({ className }: { className?: string }) {
  return (
    <div className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}>
      <style dangerouslySetInnerHTML={{ __html: BOOSTER_KEYFRAMES }} />
      <div className="absolute inset-0 bg-[#090b12]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_70%_0%,rgba(255,70,50,0.18),transparent_50%)]" />
      <div
        className="absolute inset-0 bg-[radial-gradient(ellipse_at_40%_55%,rgba(255,100,40,0.16),transparent_55%)]"
        style={{ animation: 'boosterAura 3.4s ease-in-out infinite' }}
      />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_10%_100%,rgba(20,24,40,0.9),transparent_45%)]" />
      <div
        className="absolute inset-0 opacity-[0.22] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E\")",
        }}
      />
      {[
        { left: '12%', delay: '0s', ex: '-16px' },
        { left: '28%', delay: '0.8s', ex: '12px' },
        { left: '46%', delay: '1.5s', ex: '-8px' },
        { left: '63%', delay: '0.4s', ex: '18px' },
        { left: '78%', delay: '1.9s', ex: '-12px' },
        { left: '90%', delay: '1.1s', ex: '6px' },
      ].map((ember, index) => (
        <span
          key={index}
          className="absolute bottom-[16%] h-1.5 w-1.5 rounded-full bg-[#ff8a45]"
          style={{
            left: ember.left,
            animation: 'boosterEmber 4s ease-out infinite',
            animationDelay: ember.delay,
            ['--ex' as string]: ember.ex,
            boxShadow: '0 0 10px rgba(255,120,50,0.9)',
          }}
        />
      ))}
    </div>
  )
}
