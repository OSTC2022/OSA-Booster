'use client'

import { useId } from 'react'
import { cn } from '@/lib/utils'

const MASCOT_KEYFRAMES = `
@keyframes boosterMascotFloat {
  0%, 100% { transform: translateY(0) rotate(-1.5deg); }
  50% { transform: translateY(-8px) rotate(1deg); }
}
@keyframes boosterMascotHand {
  0%, 100% { transform: rotate(-8deg) translate(0, 0); }
  50% { transform: rotate(-4deg) translate(1px, -2px); }
}
@keyframes boosterMascotShine {
  0%, 100% { opacity: 0.55; }
  50% { opacity: 1; }
}
@keyframes boosterMascotEnter {
  from { opacity: 0; transform: translateY(18px) scale(0.9); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes boosterMascotAura {
  0%, 100% { opacity: 0.35; transform: scale(0.92); }
  50% { opacity: 0.7; transform: scale(1.06); }
}
`

/** BooSter 마스코트 — 핸드사인 + 3D 글로시 구체 */
export function BoosterMascot({
  className,
  size = 'md',
  animated = true,
  interactive = false,
  onClick,
}: {
  className?: string
  size?: 'xs' | 'sm' | 'md' | 'lg'
  animated?: boolean
  interactive?: boolean
  onClick?: () => void
}) {
  const uid = useId().replace(/:/g, '')
  const dim = size === 'lg' ? 220 : size === 'md' ? 168 : size === 'sm' ? 104 : 64
  /** sm 이하는 얼굴이 박스에 더 크게 보이도록 크롭 */
  const viewBox = size === 'sm' || size === 'xs' ? '28 32 188 188' : '0 0 240 240'
  const ids = {
    head: `bm-head-${uid}`,
    shade: `bm-head-shade-${uid}`,
    rim: `bm-rim-${uid}`,
    glass: `bm-glass-${uid}`,
    gloss: `bm-glass-gloss-${uid}`,
    hand: `bm-hand-${uid}`,
    finger: `bm-finger-${uid}`,
    nose: `bm-nose-${uid}`,
    soft: `bm-soft-${uid}`,
    handShadow: `bm-hand-shadow-${uid}`,
  }

  const content = (
    <>
      {animated ? (
        <style dangerouslySetInnerHTML={{ __html: MASCOT_KEYFRAMES }} />
      ) : null}

      {animated ? (
        <span
          className="pointer-events-none absolute left-1/2 top-[58%] h-[55%] w-[70%] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse,rgba(255,90,40,0.35),transparent_70%)] blur-md"
          style={{ animation: 'boosterMascotAura 2.8s ease-in-out infinite' }}
        />
      ) : null}

      <svg
        viewBox={viewBox}
        width="100%"
        height="100%"
        className="relative z-[1] overflow-visible drop-shadow-[0_18px_28px_rgba(0,0,0,0.45)]"
        style={{
          animation: animated
            ? 'boosterMascotFloat 3.4s ease-in-out infinite'
            : undefined,
        }}
      >
        <defs>
          <radialGradient id={ids.head} cx="38%" cy="32%" r="68%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="42%" stopColor="#f4f6fa" />
            <stop offset="78%" stopColor="#d8dde8" />
            <stop offset="100%" stopColor="#aeb6c8" />
          </radialGradient>
          <radialGradient id={ids.shade} cx="70%" cy="78%" r="55%">
            <stop offset="0%" stopColor="#000000" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={ids.rim} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#3a3f4d" />
            <stop offset="45%" stopColor="#111318" />
            <stop offset="100%" stopColor="#4a5160" />
          </linearGradient>
          <linearGradient id={ids.glass} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#2a2e38" />
            <stop offset="45%" stopColor="#0a0b10" />
            <stop offset="100%" stopColor="#1c2029" />
          </linearGradient>
          <linearGradient id={ids.gloss} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.35" />
            <stop offset="40%" stopColor="#ffffff" stopOpacity="0.05" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={ids.hand} x1="20%" y1="10%" x2="80%" y2="90%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="55%" stopColor="#eef1f7" />
            <stop offset="100%" stopColor="#c5ccd9" />
          </linearGradient>
          <linearGradient id={ids.finger} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#d0d6e2" />
          </linearGradient>
          <linearGradient id={ids.nose} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffb06a" />
            <stop offset="50%" stopColor="#ff6a2a" />
            <stop offset="100%" stopColor="#e03a18" />
          </linearGradient>
          <filter id={ids.soft} x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow
              dx="0"
              dy="4"
              stdDeviation="3"
              floodColor="#000"
              floodOpacity="0.28"
            />
          </filter>
          <filter id={ids.handShadow} x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow
              dx="2"
              dy="5"
              stdDeviation="3.5"
              floodColor="#000"
              floodOpacity="0.35"
            />
          </filter>
        </defs>

        <ellipse cx="118" cy="214" rx="58" ry="10" fill="rgba(0,0,0,0.28)" />

        <g filter={`url(#${ids.soft})`}>
          <circle cx="112" cy="118" r="78" fill={`url(#${ids.rim})`} />
          <circle cx="112" cy="118" r="72" fill={`url(#${ids.head})`} />
          <circle cx="112" cy="118" r="72" fill={`url(#${ids.shade})`} />
          <ellipse
            cx="88"
            cy="88"
            rx="28"
            ry="16"
            fill="white"
            opacity="0.55"
            transform="rotate(-28 88 88)"
            style={{
              animation: animated
                ? 'boosterMascotShine 2.6s ease-in-out infinite'
                : undefined,
            }}
          />
          <ellipse
            cx="78"
            cy="96"
            rx="10"
            ry="5"
            fill="white"
            opacity="0.35"
            transform="rotate(-28 78 96)"
          />
        </g>

        <g>
          <path
            d="M58 108 C70 96, 154 96, 166 108"
            fill="none"
            stroke="#0a0b10"
            strokeWidth="10"
            strokeLinecap="round"
            opacity="0.9"
          />
          <rect
            x="52"
            y="96"
            width="48"
            height="34"
            rx="11"
            fill={`url(#${ids.glass})`}
            stroke="#050608"
            strokeWidth="3.5"
          />
          <rect
            x="54"
            y="98"
            width="44"
            height="30"
            rx="9"
            fill={`url(#${ids.gloss})`}
          />
          <rect
            x="124"
            y="96"
            width="48"
            height="34"
            rx="11"
            fill={`url(#${ids.glass})`}
            stroke="#050608"
            strokeWidth="3.5"
          />
          <rect
            x="126"
            y="98"
            width="44"
            height="30"
            rx="9"
            fill={`url(#${ids.gloss})`}
          />
          <g
            fill="white"
            style={{
              animation: animated
                ? 'boosterMascotShine 2.2s ease-in-out infinite'
                : undefined,
            }}
          >
            <rect x="64" y="104" width="5" height="16" rx="2" opacity="0.9" />
            <rect x="73" y="104" width="5" height="16" rx="2" opacity="0.75" />
            <rect x="136" y="104" width="5" height="16" rx="2" opacity="0.9" />
            <rect x="145" y="104" width="5" height="16" rx="2" opacity="0.75" />
          </g>
          <path
            d="M52 108 L38 104"
            stroke="#0a0b10"
            strokeWidth="5"
            strokeLinecap="round"
          />
          <path
            d="M172 108 L186 104"
            stroke="#0a0b10"
            strokeWidth="5"
            strokeLinecap="round"
          />
        </g>

        <path
          d="M108 132 C112 128, 118 128, 120 133 C122 138, 114 140, 112 136"
          fill="none"
          stroke={`url(#${ids.nose})`}
          strokeWidth="4.5"
          strokeLinecap="round"
          filter={`url(#${ids.soft})`}
        />

        <path
          d="M92 152 H132"
          stroke="#1a1d26"
          strokeWidth="4"
          strokeLinecap="round"
          opacity="0.92"
        />
        <path
          d="M94 154 H130"
          stroke="#ffffff"
          strokeWidth="1.2"
          strokeLinecap="round"
          opacity="0.25"
        />

        <g
          filter={`url(#${ids.handShadow})`}
          style={{
            transformOrigin: '178px 92px',
            animation: animated
              ? 'boosterMascotHand 2.8s ease-in-out infinite'
              : undefined,
          }}
        >
          <ellipse
            cx="186"
            cy="118"
            rx="22"
            ry="18"
            fill={`url(#${ids.hand})`}
            stroke="#1a1d26"
            strokeWidth="3.2"
            transform="rotate(-18 186 118)"
          />
          <ellipse
            cx="198"
            cy="128"
            rx="9"
            ry="7"
            fill={`url(#${ids.finger})`}
            stroke="#1a1d26"
            strokeWidth="2.6"
            transform="rotate(22 198 128)"
          />
          <ellipse
            cx="170"
            cy="126"
            rx="10"
            ry="7"
            fill={`url(#${ids.finger})`}
            stroke="#1a1d26"
            strokeWidth="2.6"
            transform="rotate(-40 170 126)"
          />
          <g transform="translate(176 56) rotate(-12)">
            <rect
              x="0"
              y="0"
              width="16"
              height="52"
              rx="8"
              fill={`url(#${ids.finger})`}
              stroke="#1a1d26"
              strokeWidth="3"
            />
            <ellipse cx="8" cy="6" rx="7" ry="5.5" fill="#ffffff" />
            <path
              d="M3 18 H13"
              stroke="#b8c0d0"
              strokeWidth="1.4"
              strokeLinecap="round"
              opacity="0.7"
            />
            <path
              d="M3 30 H13"
              stroke="#b8c0d0"
              strokeWidth="1.4"
              strokeLinecap="round"
              opacity="0.7"
            />
          </g>
          <g transform="translate(194 58) rotate(6)">
            <rect
              x="0"
              y="0"
              width="16"
              height="50"
              rx="8"
              fill={`url(#${ids.finger})`}
              stroke="#1a1d26"
              strokeWidth="3"
            />
            <ellipse cx="8" cy="6" rx="7" ry="5.5" fill="#ffffff" />
            <path
              d="M3 18 H13"
              stroke="#b8c0d0"
              strokeWidth="1.4"
              strokeLinecap="round"
              opacity="0.7"
            />
            <path
              d="M3 30 H13"
              stroke="#b8c0d0"
              strokeWidth="1.4"
              strokeLinecap="round"
              opacity="0.7"
            />
          </g>
        </g>
      </svg>
    </>
  )

  const wrapperClass = cn(
    'relative inline-flex items-center justify-center overflow-visible',
    interactive && 'cursor-pointer transition hover:scale-[1.03] active:scale-[0.98]',
    className,
  )
  const wrapperStyle = {
    width: dim,
    height: dim,
    animation: animated
      ? 'boosterMascotEnter 0.85s cubic-bezier(0.22,1,0.36,1) both'
      : undefined,
  } as const

  if (interactive) {
    return (
      <button
        type="button"
        className={wrapperClass}
        style={wrapperStyle}
        onClick={onClick}
        aria-label="운영진 카카오톡 연락처 열기"
      >
        {content}
      </button>
    )
  }

  return (
    <div className={wrapperClass} style={wrapperStyle} aria-hidden>
      {content}
    </div>
  )
}
