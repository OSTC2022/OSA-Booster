'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Gift, Search, Sparkles, Trophy, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import type { MemberRunningLeagueRankingBundle } from '@/lib/actions/running-league'
import {
  buildChaseLadderAllBeaters,
  buildChaseLadderDrawPlan,
  buildChaseLadderGameData,
  buildLadderColumnXs,
  buildLadderPathD,
  buildLadderPathLegs,
  buildLadderTrailDPartial,
  LADDER_FALL_TRAVEL_MS,
  loadChaseLadderExcludedIds,
  sampleLadderFall,
  saveChaseLadderExcludedIds,
  type ChaseLadderBeater,
  type ChaseLadderDrawPlan,
} from '@/lib/running-league/chase-ladder-game'
import { formatMileageKmDisplay } from '@/lib/running-league/mileage-leaderboard'
import { resolvePortalChaseLabel } from '@/lib/running-league/portal-chase-label'
import { cn } from '@/lib/utils'

const LADDER_TOP = 56
const LADDER_BOTTOM = 520
const LADDER_PADDING = 28
const SVG_HEIGHT = 580

/** 세로 틀 → 연결선 → 낙하(긴장감 ~15초) */
const PHASE_RAILS_MS = 1600
const PHASE_BRIDGES_MS = 5000
const PHASE_DRAW_MS = PHASE_RAILS_MS + PHASE_BRIDGES_MS
const PHASE_COUNTDOWN_MS = 2100
/** 순수 이동 시간 (포탈 대기 2초×횟수는 별도 가산) */
const PHASE_FALL_MS = LADDER_FALL_TRAVEL_MS
const PHASE_REVEAL_MS = 2000

type GamePhase =
  | 'idle'
  | 'drawing'
  | 'countdown'
  | 'falling'
  | 'reveal'
  | 'done'

type ChaseLadderGameProps = {
  rankingBundle: MemberRunningLeagueRankingBundle | null
  chaseMemberId?: string | null
  chaseLabel?: string | null
  canManageExclusions?: boolean
  className?: string
}

function truncateName(name: string, max = 4): string {
  const trimmed = name.trim()
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max)}…`
}

function svgWidthForCount(count: number): number {
  return Math.max(420, count * 72)
}

function bridgeStrokeProgress(
  bridgeIndex: number,
  bridgeCount: number,
  drawProgress: number,
): number {
  const railRatio = PHASE_RAILS_MS / PHASE_DRAW_MS
  if (drawProgress <= railRatio) return 0
  const bridgeT = (drawProgress - railRatio) / (1 - railRatio)
  const count = Math.max(bridgeCount, 1)
  const window = 0.9 / count
  const start = (bridgeIndex / count) * 0.9
  const local = (bridgeT - start) / (window + 0.08)
  return Math.min(1, Math.max(0, local))
}

/** 아르키메데스 나선 — 파란색 소용돌이 포탈용 */
function buildSwirlPath(turns = 2.35, inner = 1.2, growth = 1.55): string {
  const steps = 72
  const parts: string[] = []
  for (let i = 0; i <= steps; i += 1) {
    const t = (i / steps) * turns * Math.PI * 2
    const r = inner + growth * t
    const x = Math.cos(t) * r
    const y = Math.sin(t) * r
    parts.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`)
  }
  return parts.join(' ')
}

const PORTAL_SWIRL_D = buildSwirlPath()

function PortalSwirlGlyph({
  cx,
  cy,
  hue,
  active,
  dim,
  spinDir = 1,
}: {
  cx: number
  cy: number
  hue: number
  active: boolean
  dim: boolean
  spinDir?: 1 | -1
}) {
  const light = dim && !active ? 48 : active ? 72 : 62
  const sat = dim && !active ? 70 : 100
  const core = `hsl(${hue} ${sat}% ${light}%)`
  const rim = `hsl(${hue} ${sat}% ${Math.max(32, light - 16)}%)`
  const glow = `hsl(${hue} 100% 82%)`
  const scale = active ? 1.35 : 1

  return (
    <g transform={`translate(${cx} ${cy}) scale(${scale})`}>
      <circle r={15} fill={`hsl(${hue} 70% 12%)`} opacity={dim && !active ? 0.7 : 0.92} />
      <circle r={13.5} fill="none" stroke={rim} strokeWidth={2} opacity={0.85} />
      <g opacity={active ? 1 : 0.98}>
        <animateTransform
          attributeName="transform"
          type="rotate"
          from={`0`}
          to={`${360 * spinDir}`}
          dur={active ? '0.55s' : '2.4s'}
          repeatCount="indefinite"
        />
        <path
          d={PORTAL_SWIRL_D}
          fill="none"
          stroke={core}
          strokeWidth={2.8}
          strokeLinecap="round"
          opacity={1}
        />
        <path
          d={PORTAL_SWIRL_D}
          fill="none"
          stroke={glow}
          strokeWidth={1.35}
          strokeLinecap="round"
          opacity={0.85}
          transform="rotate(120)"
        />
        <path
          d={PORTAL_SWIRL_D}
          fill="none"
          stroke={rim}
          strokeWidth={1.9}
          strokeLinecap="round"
          opacity={0.8}
          transform="rotate(240) scale(0.72)"
        />
      </g>
      <circle r={3.4} fill={glow} opacity={1}>
        {active ? (
          <animate attributeName="r" values="2.4;4.4;2.4" dur="0.45s" repeatCount="indefinite" />
        ) : null}
      </circle>
      {active ? (
        <circle r={18} fill="none" stroke={glow} strokeWidth={1.6} opacity={0.55}>
          <animate attributeName="r" values="14;22;14" dur="0.6s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.6;0.12;0.6" dur="0.6s" repeatCount="indefinite" />
        </circle>
      ) : null}
    </g>
  )
}

function LuckyLadderBoard({
  plan,
  phase,
  countdown,
  drawProgress,
  fallElapsedMs,
  onGiftClick,
}: {
  plan: ChaseLadderDrawPlan
  phase: GamePhase
  countdown: number | null
  drawProgress: number
  fallElapsedMs: number
  onGiftClick?: () => void
}) {
  const columns = plan.columns
  const columnCount = columns.length
  const svgWidth = svgWidthForCount(columnCount)
  const colXs = useMemo(
    () => buildLadderColumnXs(columnCount, svgWidth, LADDER_PADDING),
    [columnCount, svgWidth],
  )

  const pathLegs = useMemo(
    () =>
      buildLadderPathLegs(
        plan.startCol,
        plan.bridges,
        colXs,
        LADDER_TOP,
        LADDER_BOTTOM,
        plan.portals,
      ),
    [colXs, plan.bridges, plan.portals, plan.startCol],
  )

  const pathD = useMemo(
    () =>
      buildLadderPathD(
        plan.startCol,
        plan.bridges,
        colXs,
        LADDER_TOP,
        LADDER_BOTTOM,
        plan.portals,
      ),
    [colXs, plan.bridges, plan.portals, plan.startCol],
  )

  const isIdle = phase === 'idle'
  const isDrawing = phase === 'drawing'
  const ladderReady =
    phase === 'countdown' ||
    phase === 'falling' ||
    phase === 'reveal' ||
    phase === 'done'
  const showFall = phase === 'falling' || phase === 'reveal' || phase === 'done'
  const showGlow = phase === 'reveal' || phase === 'done'
  const winner = columns[plan.endCol]
  const canStart = isIdle && Boolean(onGiftClick)
  /** 시작 후: 기존 사다리는 어둡게 → 경로만 부각 */
  const dimBase = !isIdle
  /** idle: 중간(연결선) 비공개 / 시작 후: 공개 */
  const middleRevealed = !isIdle

  const progress = ladderReady ? 1 : isIdle ? 0 : drawProgress
  const railRatio = PHASE_RAILS_MS / PHASE_DRAW_MS
  const railGrow =
    isIdle || ladderReady || progress >= railRatio
      ? 1
      : Math.min(1, progress / railRatio)
  const railEndY = LADDER_TOP + railGrow * (LADDER_BOTTOM - LADDER_TOP)

  const fallSample = useMemo(() => {
    if (!showFall) {
      return sampleLadderFall(pathLegs, 0, PHASE_FALL_MS)
    }
    if (phase === 'reveal' || phase === 'done') {
      return sampleLadderFall(pathLegs, Number.MAX_SAFE_INTEGER, PHASE_FALL_MS)
    }
    return sampleLadderFall(pathLegs, fallElapsedMs, PHASE_FALL_MS)
  }, [fallElapsedMs, pathLegs, phase, showFall])

  const trailD = useMemo(() => {
    if (!showFall) return ''
    const t =
      phase === 'reveal' || phase === 'done' ? 1 : fallSample.travelProgress
    return buildLadderTrailDPartial(pathLegs, t) || pathD
  }, [fallSample.travelProgress, pathD, pathLegs, phase, showFall])

  const trailProgress = showFall
    ? phase === 'reveal' || phase === 'done'
      ? 1
      : fallSample.travelProgress
    : showGlow
      ? 1
      : 0

  const baseRailStroke = dimBase ? '#3f3f46' : '#fbbf24'
  const baseRailOpacity = dimBase ? 0.35 : 0.95
  const baseBridgeHorizontal = dimBase ? '#52525b' : '#fde047'
  const baseBridgeDiagonal = dimBase ? '#57534e' : '#fdba74'
  const baseBridgeOpacity = dimBase ? 0.32 : 0.95

  const statusLabel = isDrawing
    ? progress < railRatio
      ? `사다리 틀 그리는 중… ${Math.round(railGrow * 100)}%`
      : `연결선 공개 중… ${Math.round(((progress - railRatio) / (1 - railRatio)) * 100)}%`
    : canStart
      ? '선물 버튼을 눌러 시작 · 중간 경로 비공개'
      : fallSample.portalPhase
        ? '⚡ 순간이동 포탈!'
        : null

  const blindLeft = (colXs[0] ?? LADDER_PADDING) - 10
  const blindRight = (colXs[colXs.length - 1] ?? svgWidth - LADDER_PADDING) + 10
  const blindWidth = Math.max(40, blindRight - blindLeft)

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-amber-500/30 bg-[radial-gradient(ellipse_at_top,_rgba(251,146,60,0.14),_transparent_50%),linear-gradient(180deg,#09090b_0%,#000_40%,#1c1917_100%)]">
      {phase === 'countdown' && countdown != null ? (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-black/50 backdrop-blur-[2px]">
          <span
            key={countdown}
            className="animate-pulse text-7xl font-black tabular-nums text-amber-200 drop-shadow-[0_0_28px_rgba(251,191,36,0.65)] sm:text-8xl"
          >
            {countdown === 0 ? 'GO!' : countdown}
          </span>
        </div>
      ) : null}

      {statusLabel ? (
        <p className="absolute left-0 right-0 top-2 z-10 text-center text-sm font-semibold tracking-wide text-amber-200">
          {statusLabel}
        </p>
      ) : null}

      {showGlow ? (
        <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
          {Array.from({ length: 20 }).map((_, index) => (
            <span
              key={`spark-${index}`}
              className="absolute h-2 w-2 rounded-full bg-amber-300 animate-ping"
              style={{
                left: `${6 + ((index * 19) % 88)}%`,
                top: `${10 + ((index * 27) % 75)}%`,
                animationDelay: `${index * 90}ms`,
              }}
            />
          ))}
        </div>
      ) : null}

      <div className="flex h-full min-h-0 flex-1 flex-col overflow-auto px-2 pb-2 pt-9 sm:px-4">
        <div
          style={{ minWidth: svgWidth, minHeight: '100%' }}
          className="mx-auto flex w-full flex-col"
        >
          <div
            className="mb-2 grid shrink-0"
            style={{ gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))` }}
          >
            {columns.map((_, index) => (
              <div key={`gift-slot-${index}`} className="flex justify-center">
                {index === plan.startCol ? (
                  <button
                    type="button"
                    disabled={!canStart}
                    onClick={onGiftClick}
                    aria-label={canStart ? '경품 사다리 시작' : '경품'}
                    className={cn(
                      'flex h-14 w-14 items-center justify-center rounded-full border-2 border-amber-400/80 bg-amber-500/25 text-amber-100 shadow-[0_0_28px_rgba(251,191,36,0.5)] transition',
                      canStart &&
                        'cursor-pointer animate-pulse hover:scale-110 hover:bg-amber-400/40 hover:shadow-[0_0_36px_rgba(251,191,36,0.75)] active:scale-95',
                      !canStart && 'cursor-default',
                      showFall && fallSample.travelProgress > 0.02 && 'opacity-25',
                    )}
                  >
                    <Gift className="h-7 w-7" />
                  </button>
                ) : (
                  <div className="h-14 w-14" />
                )}
              </div>
            ))}
          </div>

          <svg
            viewBox={`0 0 ${svgWidth} ${SVG_HEIGHT}`}
            className="mx-auto block w-full flex-1"
            style={{ minHeight: 420, maxHeight: 'min(62vh, 640px)' }}
            aria-hidden
          >
            <defs>
              <filter id="lucky-ladder-glow">
                <feGaussianBlur stdDeviation="3.5" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <filter id="lucky-path-glow">
                <feGaussianBlur stdDeviation="4.5" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <filter id="lucky-portal-glow">
                <feGaussianBlur stdDeviation="5.5" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <linearGradient id="lucky-trail" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#fef08a" />
                <stop offset="50%" stopColor="#fbbf24" />
                <stop offset="100%" stopColor="#fb923c" />
              </linearGradient>
            </defs>

            {/* 1) 세로 사다리 틀 — 시작 전 밝게 / 시작 후 어둡게 */}
            {colXs.map((x, index) => (
              <line
                key={`rail-${index}`}
                x1={x}
                y1={LADDER_TOP}
                x2={x}
                y2={Math.max(LADDER_TOP + 2, railEndY)}
                stroke={baseRailStroke}
                strokeWidth={3.4}
                strokeLinecap="round"
                opacity={baseRailOpacity}
                style={{ transition: 'stroke 400ms ease, opacity 400ms ease' }}
              />
            ))}

            {/* idle: 중간 경로 블라인드 (가로·대각선·포탈 비공개, 세로줄은 유지) */}
            {isIdle ? (
              <g aria-hidden>
                <defs>
                  <pattern
                    id="lucky-blind-stripes"
                    patternUnits="userSpaceOnUse"
                    width="16"
                    height="16"
                    patternTransform="rotate(32)"
                  >
                    <rect width="16" height="16" fill="#0a0a0a" />
                    <rect width="8" height="16" fill="#1f1f23" />
                  </pattern>
                </defs>
                <rect
                  x={blindLeft}
                  y={LADDER_TOP + 12}
                  width={blindWidth}
                  height={LADDER_BOTTOM - LADDER_TOP - 24}
                  rx={12}
                  fill="url(#lucky-blind-stripes)"
                  opacity={0.88}
                  stroke="#52525b"
                  strokeWidth={1.25}
                  strokeDasharray="5 4"
                />
                <text
                  x={(blindLeft + blindRight) / 2}
                  y={(LADDER_TOP + LADDER_BOTTOM) / 2 - 8}
                  textAnchor="middle"
                  fill="#e4e4e7"
                  fontSize="17"
                  fontWeight="700"
                >
                  경로 비공개
                </text>
                <text
                  x={(blindLeft + blindRight) / 2}
                  y={(LADDER_TOP + LADDER_BOTTOM) / 2 + 16}
                  textAnchor="middle"
                  fill="#a1a1aa"
                  fontSize="12"
                >
                  시작 후 연결선이 공개됩니다
                </text>
              </g>
            ) : null}

            {/* 2) 가로·대각선 연결 — 시작 후에만 공개 */}
            {middleRevealed
              ? plan.bridges.map((bridge, index) => {
                  const x1 = colXs[bridge.left]!
                  const x2 = colXs[bridge.left + 1]!
                  const y1 = LADDER_TOP + bridge.yLeft * (LADDER_BOTTOM - LADDER_TOP)
                  const y2 = LADDER_TOP + bridge.yRight * (LADDER_BOTTOM - LADDER_TOP)
                  const t = ladderReady
                    ? 1
                    : bridgeStrokeProgress(index, plan.bridges.length, progress)
                  if (t <= 0.01) return null
                  const drawX2 = x1 + (x2 - x1) * t
                  const drawY2 = y1 + (y2 - y1) * t
                  const isDiagonal = Math.abs(bridge.yLeft - bridge.yRight) > 0.001
                  return (
                    <line
                      key={`bridge-${index}-${bridge.left}-${bridge.yLeft}`}
                      x1={x1}
                      y1={y1}
                      x2={drawX2}
                      y2={drawY2}
                      stroke={isDiagonal ? baseBridgeDiagonal : baseBridgeHorizontal}
                      strokeWidth={isDiagonal ? 3.4 : 3.1}
                      strokeLinecap="round"
                      opacity={baseBridgeOpacity}
                      style={{ transition: 'stroke 400ms ease, opacity 400ms ease' }}
                    />
                  )
                })
              : null}

            {/* 3) 순간이동 포탈 — 파란 소용돌이 (복수 시 색만 다르게) */}
            {middleRevealed
              ? plan.portals.map((portal, portalIndex) => {
                  const ax = colXs[portal.aCol]!
                  const bx = colXs[portal.bCol]!
                  const ay = LADDER_TOP + portal.aY * (LADDER_BOTTOM - LADDER_TOP)
                  const by = LADDER_TOP + portal.bY * (LADDER_BOTTOM - LADDER_TOP)
                  const showPortal =
                    ladderReady || progress > PHASE_RAILS_MS / PHASE_DRAW_MS
                  if (!showPortal) return null
                  const midX = (ax + bx) / 2
                  const midY = Math.min(ay, by) - 42
                  const active = fallSample.activePortalId === portal.id
                  const hue = portal.hue
                  const linkColor = active
                    ? `hsl(${hue} 100% 72%)`
                    : dimBase
                      ? `hsl(${hue} 65% 48%)`
                      : `hsl(${hue} 95% 62%)`
                  return (
                    <g
                      key={portal.id}
                      opacity={active ? 1 : dimBase ? 0.62 : 0.95}
                      style={{ transition: 'opacity 280ms ease' }}
                      filter={active ? 'url(#lucky-portal-glow)' : undefined}
                    >
                      <path
                        d={`M ${ax} ${ay} Q ${midX} ${midY} ${bx} ${by}`}
                        fill="none"
                        stroke={linkColor}
                        strokeWidth={active ? 2.8 : 1.8}
                        strokeDasharray={active ? '3 5' : '6 5'}
                        opacity={active ? 0.9 : 0.55}
                      >
                        {active ? (
                          <animate
                            attributeName="stroke-dashoffset"
                            values="0;36"
                            dur="0.4s"
                            repeatCount="indefinite"
                          />
                        ) : null}
                      </path>
                      <PortalSwirlGlyph
                        cx={ax}
                        cy={ay}
                        hue={hue}
                        active={active}
                        dim={dimBase}
                        spinDir={portalIndex % 2 === 0 ? 1 : -1}
                      />
                      <PortalSwirlGlyph
                        cx={bx}
                        cy={by}
                        hue={hue}
                        active={active}
                        dim={dimBase}
                        spinDir={portalIndex % 2 === 0 ? -1 : 1}
                      />
                      {active && fallSample.portalFrom && fallSample.portalTo ? (
                        <g>
                          {Array.from({ length: 10 }).map((_, spark) => {
                            const u = spark / 9
                            const x =
                              fallSample.portalFrom!.x +
                              (fallSample.portalTo!.x - fallSample.portalFrom!.x) * u
                            const y =
                              fallSample.portalFrom!.y +
                              (fallSample.portalTo!.y - fallSample.portalFrom!.y) * u -
                              Math.sin(u * Math.PI) * 36
                            return (
                              <circle
                                key={`${portal.id}-spark-${spark}`}
                                cx={x}
                                cy={y}
                                r={2.2 + (spark % 3)}
                                fill={`hsl(${hue} 100% 78%)`}
                                opacity={
                                  fallSample.portalPhase === 'warp'
                                    ? 0.95
                                    : 0.35 + u * 0.4
                                }
                              >
                                <animate
                                  attributeName="opacity"
                                  values="0.2;1;0.2"
                                  dur="0.35s"
                                  begin={`${spark * 0.04}s`}
                                  repeatCount="indefinite"
                                />
                              </circle>
                            )
                          })}
                        </g>
                      ) : null}
                    </g>
                  )
                })
              : null}

            {/* 선물이 지나가는 경로 강조 (포탈 구간은 끊김) */}
            {trailProgress > 0.001 && trailD ? (
              <g filter="url(#lucky-path-glow)">
                <path
                  d={trailD}
                  fill="none"
                  stroke="rgba(255,255,255,0.25)"
                  strokeWidth={10}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d={trailD}
                  fill="none"
                  stroke="url(#lucky-trail)"
                  strokeWidth={5.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </g>
            ) : null}

            {/* 포탈 워프 플래시 */}
            {showFall &&
            fallSample.portalPhase === 'warp' &&
            fallSample.portalFrom &&
            fallSample.portalTo ? (
              <g pointerEvents="none">
                <line
                  x1={fallSample.portalFrom.x}
                  y1={fallSample.portalFrom.y}
                  x2={fallSample.portalTo.x}
                  y2={fallSample.portalTo.y}
                  stroke="#bae6fd"
                  strokeWidth={6}
                  opacity={0.85}
                  strokeLinecap="round"
                />
                <line
                  x1={fallSample.portalFrom.x}
                  y1={fallSample.portalFrom.y}
                  x2={fallSample.portalTo.x}
                  y2={fallSample.portalTo.y}
                  stroke="#38bdf8"
                  strokeWidth={2.5}
                  opacity={0.95}
                  strokeLinecap="round"
                />
              </g>
            ) : null}

            {showFall ? (
              <g
                filter="url(#lucky-ladder-glow)"
                transform={`translate(${fallSample.x} ${fallSample.y}) scale(${fallSample.giftScale})`}
                opacity={fallSample.giftOpacity}
              >
                <circle r={16} fill="#fbbf24" />
                <circle r={22} fill="none" stroke="#fef08a" strokeWidth={2} opacity={0.7} />
                {fallSample.portalPhase === 'charge' ? (
                  <circle r={30} fill="none" stroke="#67e8f9" strokeWidth={2} opacity={0.7}>
                    <animate
                      attributeName="r"
                      values="22;34;22"
                      dur="0.4s"
                      repeatCount="indefinite"
                    />
                  </circle>
                ) : null}
                <text
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize="16"
                  style={{ pointerEvents: 'none' }}
                >
                  🎁
                </text>
              </g>
            ) : null}
          </svg>

          <div
            className="mt-2 grid shrink-0 gap-1.5"
            style={{ gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))` }}
          >
            {columns.map((beater, index) => {
              const isWinner = showGlow && index === plan.endCol
              return (
                <div
                  key={beater.memberId}
                  className={cn(
                    'rounded-xl border px-1.5 py-2.5 text-center transition-all duration-700',
                    isWinner
                      ? 'scale-105 border-amber-400/80 bg-amber-500/30 shadow-[0_0_24px_rgba(251,191,36,0.4)]'
                      : 'border-zinc-700/70 bg-zinc-950/80',
                  )}
                >
                  <p
                    className={cn(
                      'truncate text-xs font-bold sm:text-sm',
                      isWinner ? 'text-amber-50' : 'text-zinc-100',
                    )}
                    title={beater.memberName}
                  >
                    {truncateName(beater.memberName, 5)}
                  </p>
                  {isWinner ? (
                    <p className="mt-1 text-[11px] font-bold text-amber-300">당첨!</p>
                  ) : null}
                </div>
              )
            })}
          </div>

          {showGlow && winner ? (
            <p className="mt-3 shrink-0 text-center text-base font-bold text-amber-100">
              🎁 경품이 {winner.memberName} 님에게 도착!
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function ExclusionPanel({
  allBeaters,
  excludedIds,
  nameById,
  onExclude,
  onRestore,
  canManage,
  compact,
}: {
  allBeaters: ChaseLadderBeater[]
  excludedIds: string[]
  nameById: ReadonlyMap<string, string>
  onExclude: (memberId: string) => void
  onRestore: (memberId: string) => void
  canManage: boolean
  compact?: boolean
}) {
  const [query, setQuery] = useState('')
  const [openPanel, setOpenPanel] = useState(!compact)
  const excludedSet = useMemo(() => new Set(excludedIds), [excludedIds])

  const excludedMembers = useMemo(() => {
    return excludedIds.map((id) => ({
      memberId: id,
      memberName:
        allBeaters.find((row) => row.memberId === id)?.memberName
        ?? nameById.get(id)
        ?? '제외된 회원',
    }))
  }, [allBeaters, excludedIds, nameById])

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return allBeaters
      .filter((row) => !excludedSet.has(row.memberId))
      .filter((row) => row.memberName.toLowerCase().includes(q))
      .slice(0, 8)
  }, [allBeaters, excludedSet, query])

  if (!canManage && excludedMembers.length === 0) return null

  if (compact) {
    return (
      <div className="shrink-0">
        <button
          type="button"
          onClick={() => setOpenPanel((v) => !v)}
          className="text-[11px] text-zinc-400 underline-offset-2 hover:text-amber-200 hover:underline"
        >
          {openPanel ? '제외 설정 접기' : `이전 당첨 제외${excludedIds.length ? ` (${excludedIds.length})` : ''}`}
        </button>
        {openPanel ? (
          <div className="mt-2 space-y-2 rounded-lg border border-zinc-700/80 bg-black/40 p-2.5">
            {canManage ? (
              <>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="이름 검색 후 제외"
                    className="h-8 border-zinc-700 bg-zinc-950 pl-8 text-xs text-zinc-100"
                  />
                </div>
                {searchResults.map((row) => (
                  <button
                    key={row.memberId}
                    type="button"
                    onClick={() => {
                      onExclude(row.memberId)
                      setQuery('')
                    }}
                    className="flex w-full items-center justify-between rounded-md border border-zinc-700/70 px-2 py-1 text-xs text-zinc-200"
                  >
                    {row.memberName}
                    <span className="text-amber-300">제외</span>
                  </button>
                ))}
              </>
            ) : null}
            <div className="flex flex-wrap gap-1.5">
              {excludedMembers.map((row) => (
                <button
                  key={row.memberId}
                  type="button"
                  disabled={!canManage}
                  onClick={() => onRestore(row.memberId)}
                  className="inline-flex items-center gap-1 rounded-full border border-amber-500/35 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-100"
                >
                  {row.memberName}
                  {canManage ? <X className="h-3 w-3" /> : null}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="space-y-2 rounded-lg border border-zinc-700/80 bg-black/40 p-2.5">
      <p className="text-[11px] font-medium text-zinc-300">이전 당첨자 제외</p>
      {canManage ? (
        <>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="이름 검색 후 제외"
              className="h-8 border-zinc-700 bg-zinc-950 pl-8 text-xs text-zinc-100"
            />
          </div>
          {searchResults.length > 0 ? (
            <div className="max-h-24 space-y-1 overflow-y-auto">
              {searchResults.map((row) => (
                <button
                  key={row.memberId}
                  type="button"
                  onClick={() => {
                    onExclude(row.memberId)
                    setQuery('')
                  }}
                  className="flex w-full items-center justify-between rounded-md border border-zinc-700/70 bg-zinc-900/80 px-2.5 py-1.5 text-left text-xs text-zinc-200 hover:border-amber-500/40"
                >
                  <span className="truncate">{row.memberName}</span>
                  <span className="shrink-0 text-[10px] text-amber-300">제외</span>
                </button>
              ))}
            </div>
          ) : null}
        </>
      ) : null}
      {excludedMembers.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {excludedMembers.map((row) => (
            <button
              key={row.memberId}
              type="button"
              disabled={!canManage}
              onClick={() => onRestore(row.memberId)}
              className="inline-flex items-center gap-1 rounded-full border border-amber-500/35 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-100"
            >
              {row.memberName}
              {canManage ? <X className="h-3 w-3" /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function ChaseLadderGame({
  rankingBundle,
  chaseMemberId = null,
  chaseLabel = null,
  canManageExclusions = false,
  className,
}: ChaseLadderGameProps) {
  const [open, setOpen] = useState(false)
  const [phase, setPhase] = useState<GamePhase>('idle')
  const [countdown, setCountdown] = useState<number | null>(null)
  const [seed, setSeed] = useState(1)
  const [drawProgress, setDrawProgress] = useState(0)
  const [fallElapsedMs, setFallElapsedMs] = useState(0)
  const [excludedIds, setExcludedIds] = useState<string[]>([])
  const [started, setStarted] = useState(false)
  const fallRaf = useRef(0)

  const chaseTabLabel = resolvePortalChaseLabel(chaseLabel)
  const resolvedChaseMemberId = chaseMemberId?.trim() || null

  useEffect(() => {
    if (!resolvedChaseMemberId) return
    setExcludedIds(loadChaseLadderExcludedIds(resolvedChaseMemberId))
  }, [resolvedChaseMemberId])

  const allBeaters = useMemo(() => {
    if (!rankingBundle || !resolvedChaseMemberId) return []
    return buildChaseLadderAllBeaters({
      participants: rankingBundle.participants,
      logs: rankingBundle.mileageLogs,
      chaseMemberId: resolvedChaseMemberId,
      mileageRecognition: rankingBundle.mileageRecognition,
    })
  }, [rankingBundle, resolvedChaseMemberId])

  const nameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const participant of rankingBundle?.participants ?? []) {
      const name = participant.member?.name?.trim()
      if (name) map.set(participant.member_id, name)
    }
    for (const beater of allBeaters) {
      map.set(beater.memberId, beater.memberName)
    }
    return map
  }, [allBeaters, rankingBundle?.participants])

  const gameData = useMemo(() => {
    if (!rankingBundle || !resolvedChaseMemberId) return null
    return buildChaseLadderGameData({
      participants: rankingBundle.participants,
      logs: rankingBundle.mileageLogs,
      chaseMemberId: resolvedChaseMemberId,
      mileageRecognition: rankingBundle.mileageRecognition,
      excludeMemberIds: excludedIds,
    })
  }, [excludedIds, rankingBundle, resolvedChaseMemberId])

  const eligible = gameData?.beaters ?? []

  const plan = useMemo((): ChaseLadderDrawPlan | null => {
    if (!started || eligible.length === 0) return null
    return buildChaseLadderDrawPlan(eligible, seed)
  }, [eligible, seed, started])

  const winner = useMemo(() => {
    if (!plan) return null
    return plan.columns.find((row) => row.memberId === plan.winnerMemberId) ?? null
  }, [plan])

  // 천천히 펜으로 그리기
  useEffect(() => {
    if (!open || !started || !plan || phase !== 'drawing') return

    setDrawProgress(0)
    const startedAt = performance.now()
    let frame = 0

    const tick = (now: number) => {
      const t = Math.min(1, (now - startedAt) / PHASE_DRAW_MS)
      // 세로 틀은 비교적 일정, 연결선 구간은 조금 느리게
      setDrawProgress(t)
      if (t < 1) {
        frame = window.requestAnimationFrame(tick)
      } else {
        setDrawProgress(1)
        setPhase('countdown')
        setCountdown(3)
      }
    }

    frame = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(frame)
  }, [open, phase, plan, seed, started])

  useEffect(() => {
    if (phase !== 'countdown' || countdown == null) return

    if (countdown === 0) {
      const runTimer = window.setTimeout(() => {
        setFallElapsedMs(0)
        setPhase('falling')
      }, 500)
      return () => window.clearTimeout(runTimer)
    }

    const tick = window.setTimeout(
      () => setCountdown(countdown - 1),
      PHASE_COUNTDOWN_MS / 3,
    )
    return () => window.clearTimeout(tick)
  }, [countdown, phase])

  // 천천히 낙하 + 포탈에서 약 2초 워프
  useEffect(() => {
    if (phase !== 'falling' || !plan) return

    setFallElapsedMs(0)
    const startedAt = performance.now()
    const legs = buildLadderPathLegs(
      plan.startCol,
      plan.bridges,
      buildLadderColumnXs(plan.columns.length, svgWidthForCount(plan.columns.length), LADDER_PADDING),
      LADDER_TOP,
      LADDER_BOTTOM,
      plan.portals,
    )
    const totalMs = sampleLadderFall(legs, 0, PHASE_FALL_MS).totalMs

    const tick = (now: number) => {
      const elapsed = now - startedAt
      setFallElapsedMs(elapsed)
      if (elapsed < totalMs) {
        fallRaf.current = window.requestAnimationFrame(tick)
      } else {
        setFallElapsedMs(totalMs)
        setPhase('reveal')
        window.setTimeout(() => setPhase('done'), PHASE_REVEAL_MS)
      }
    }

    fallRaf.current = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(fallRaf.current)
  }, [phase, plan])

  function persistExcluded(next: string[]) {
    setExcludedIds(next)
    if (resolvedChaseMemberId) {
      saveChaseLadderExcludedIds(resolvedChaseMemberId, next)
    }
  }

  function handleExclude(memberId: string) {
    if (excludedIds.includes(memberId)) return
    persistExcluded([...excludedIds, memberId])
  }

  function handleRestore(memberId: string) {
    persistExcluded(excludedIds.filter((id) => id !== memberId))
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen)
    if (!nextOpen) {
      setPhase('idle')
      setCountdown(null)
      setDrawProgress(0)
      setFallElapsedMs(0)
      setStarted(false)
    }
  }

  function handlePrepareBoard() {
    setSeed(Date.now())
    setStarted(true)
    setDrawProgress(0)
    setFallElapsedMs(0)
    setCountdown(null)
    setPhase('idle')
  }

  function handleGiftStart() {
    if (phase !== 'idle') return
    setDrawProgress(0)
    setFallElapsedMs(0)
    setCountdown(null)
    setPhase('drawing')
  }

  function handleExcludeWinnerAndReset() {
    if (winner) handleExclude(winner.memberId)
    setOpen(false)
    setStarted(false)
    setPhase('idle')
    setCountdown(null)
    setDrawProgress(0)
    setFallElapsedMs(0)
  }

  if (!resolvedChaseMemberId) {
    return (
      <Dialog>
        <DialogTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn(
              'h-9 gap-1.5 border-orange-500/30 bg-orange-500/5 px-2.5 text-[11px] text-orange-100 hover:bg-orange-500/10',
              className,
            )}
            aria-label={`${chaseTabLabel} 경품 사다리 열기`}
          >
            <Trophy className="h-4 w-4 shrink-0 text-orange-300" />
            <span className="sm:inline">사다리</span>
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-sm border-orange-500/20 bg-zinc-950 text-zinc-100">
          <DialogHeader>
            <DialogTitle className="text-orange-100">{chaseTabLabel} 행운의 사다리</DialogTitle>
            <DialogDescription className="text-zinc-400">
              설정에서 술래(이겨라 대상)를 지정하면 사다리를 이용할 수 있습니다.
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    )
  }

  const isBusy =
    phase === 'drawing' ||
    phase === 'countdown' ||
    phase === 'falling' ||
    phase === 'reveal'

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(
            'h-9 gap-1.5 border-orange-500/30 bg-orange-500/5 px-2.5 text-[11px] text-orange-100 hover:bg-orange-500/10',
            className,
          )}
          aria-label={`${chaseTabLabel} 경품 사다리 열기`}
        >
          <Trophy className="h-4 w-4 shrink-0 text-orange-300" />
          <span className="sm:inline">사다리</span>
        </Button>
      </DialogTrigger>

      <DialogContent
        showCloseButton
        className={cn(
          'fixed inset-0 top-0 left-0 z-50 flex h-[100dvh] max-h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 bg-zinc-950 p-0 text-zinc-100 shadow-none',
          'data-[state=open]:zoom-in-100 data-[state=closed]:zoom-out-100',
        )}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-amber-500/15 bg-black/50 px-4 py-2.5 sm:px-5">
          <DialogHeader className="space-y-0.5 text-left">
            <DialogTitle className="flex items-center gap-2 text-base text-amber-100">
              <Sparkles className="h-4 w-4 text-amber-300" />
              {chaseTabLabel} 행운의 사다리
            </DialogTitle>
            <DialogDescription className="text-[11px] text-zinc-400 sm:text-xs">
              {gameData
                ? `경품 ↓ ${gameData.chaseName} 넘긴 ${eligible.length}명 중 1명`
                : '술래를 넘긴 주자가 없습니다.'}
            </DialogDescription>
          </DialogHeader>
          {started ? (
            <p className="shrink-0 text-[11px] tabular-nums text-zinc-500">
              대상 {eligible.length}명
            </p>
          ) : null}
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden p-2 sm:p-3">
          {!started ? (
            <div className="shrink-0 space-y-2">
              <ExclusionPanel
                allBeaters={allBeaters}
                excludedIds={excludedIds}
                nameById={nameById}
                onExclude={handleExclude}
                onRestore={handleRestore}
                canManage={canManageExclusions}
              />
              <div className="rounded-lg border border-white/5 bg-black/30 px-3 py-2 text-xs text-zinc-400">
                추첨 대상{' '}
                <span className="font-semibold tabular-nums text-amber-200">
                  {eligible.length}명
                </span>
                {excludedIds.length > 0 ? (
                  <span className="text-zinc-500"> · 제외 {excludedIds.length}명</span>
                ) : null}
              </div>
            </div>
          ) : (
            <ExclusionPanel
              allBeaters={allBeaters}
              excludedIds={excludedIds}
              nameById={nameById}
              onExclude={handleExclude}
              onRestore={handleRestore}
              canManage={canManageExclusions}
              compact
            />
          )}

          {eligible.length === 0 ? (
            <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-zinc-700 px-4 py-8 text-center text-sm text-zinc-500">
              {allBeaters.length === 0
                ? `아직 ${gameData?.chaseName ?? '술래'}를 넘긴 주자가 없습니다.`
                : '제외 후 남은 추첨 대상이 없습니다.'}
            </div>
          ) : !started || !plan ? (
            <div className="flex min-h-0 flex-1 flex-col gap-3">
              <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-zinc-800 bg-black/30 p-3">
                <p className="mb-2 text-[11px] font-medium text-zinc-500">추첨 대상 전원</p>
                <div className="flex flex-wrap gap-1.5">
                  {eligible.map((row) => (
                    <span
                      key={row.memberId}
                      className="rounded-full border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-[11px] text-zinc-200"
                      title={`+${formatMileageKmDisplay(row.leadKm)}`}
                    >
                      {row.memberName}
                    </span>
                  ))}
                </div>
              </div>
              <Button
                type="button"
                className="h-12 w-full shrink-0 bg-amber-500 text-base font-bold text-zinc-950 hover:bg-amber-400"
                onClick={handlePrepareBoard}
              >
                🎁 사다리 준비
              </Button>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col gap-2">
              <LuckyLadderBoard
                plan={plan}
                phase={phase}
                countdown={countdown}
                drawProgress={drawProgress}
                fallElapsedMs={fallElapsedMs}
                onGiftClick={handleGiftStart}
              />

              <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                <Button
                  type="button"
                  variant="secondary"
                  className="flex-1"
                  disabled={isBusy}
                  onClick={handlePrepareBoard}
                >
                  {isBusy ? '진행 중…' : phase === 'idle' ? '선물 버튼을 눌러 시작' : '다시 준비'}
                </Button>
                {canManageExclusions && phase === 'done' && winner ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 border-amber-500/40 text-amber-100"
                    onClick={handleExcludeWinnerAndReset}
                  >
                    당첨자 제외하고 닫기
                  </Button>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
