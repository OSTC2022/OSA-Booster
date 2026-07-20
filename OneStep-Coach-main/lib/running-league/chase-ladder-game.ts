import { buildMileageDistanceLeaderboard } from '@/lib/running-league/mileage-leaderboard'
import {
  resolveChaseTargetMileageKm,
  resolveChaseTargetName,
} from '@/lib/running-league/chase-leaderboard'
import type { RunningLeagueMileageLog, RunningLeagueParticipant } from '@/lib/types'
import type { MileageRecognition } from '@/lib/running-league/mileage-recognition'

export type ChaseLadderBeater = {
  memberId: string
  memberName: string
  mileageKm: number
  leadKm: number
  rank: number
}

export type ChaseLadderGameData = {
  chaseMemberId: string
  chaseName: string
  chaseKm: number
  beaters: ChaseLadderBeater[]
}

/** 인접한 두 세로줄 사이 연결 — yLeft===yRight 면 가로, 다르면 대각선 */
export type LadderBridge = {
  left: number
  yLeft: number
  yRight: number
}

/** 순간이동 포탈 a ↔ b */
export type LadderPortal = {
  id: string
  aCol: number
  aY: number
  bCol: number
  bY: number
  hue: number
}

export type LadderRung = LadderBridge

export type ChaseLadderDrawPlan = {
  columns: ChaseLadderBeater[]
  winnerMemberId: string
  startCol: number
  endCol: number
  bridges: LadderBridge[]
  portals: LadderPortal[]
  /** 경로가 좌우로 꺾인 횟수 (긴장감 지표) */
  zigZagCount: number
}

/** mulberry32 */
function createSeededRandom(seed: number) {
  let value = seed >>> 0
  return () => {
    value += 0x6d2b79f5
    let t = value
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function buildChaseLadderGameData(input: {
  participants: ReadonlyArray<RunningLeagueParticipant>
  logs: ReadonlyArray<RunningLeagueMileageLog>
  chaseMemberId: string
  mileageRecognition?: MileageRecognition | null
  excludeMemberIds?: ReadonlyArray<string> | ReadonlySet<string>
}): ChaseLadderGameData | null {
  const chaseMemberId = input.chaseMemberId.trim()
  if (!chaseMemberId) return null

  const board = buildMileageDistanceLeaderboard(
    input.participants,
    input.logs,
    input.mileageRecognition,
  )
  const chaseKm = resolveChaseTargetMileageKm(board, chaseMemberId, input.participants)
  if (chaseKm == null) return null

  const chaseName = resolveChaseTargetName(input.participants, chaseMemberId) ?? '술래'
  const excluded = new Set(
    Array.from(input.excludeMemberIds ?? []).map((id) => id.trim()).filter(Boolean),
  )

  const beaters = board.ranked
    .filter((row) => row.memberId !== chaseMemberId && row.mileageKm > chaseKm)
    .filter((row) => !excluded.has(row.memberId))
    .map((row) => ({
      memberId: row.memberId,
      memberName: row.memberName,
      mileageKm: row.mileageKm,
      leadKm: Math.round((row.mileageKm - chaseKm) * 10) / 10,
      rank: row.rank,
    }))
    .sort((a, b) => b.leadKm - a.leadKm || a.rank - b.rank)

  return {
    chaseMemberId,
    chaseName,
    chaseKm,
    beaters,
  }
}

export function buildChaseLadderAllBeaters(input: {
  participants: ReadonlyArray<RunningLeagueParticipant>
  logs: ReadonlyArray<RunningLeagueMileageLog>
  chaseMemberId: string
  mileageRecognition?: MileageRecognition | null
}): ChaseLadderBeater[] {
  const data = buildChaseLadderGameData(input)
  return data?.beaters ?? []
}

function bridgeEntryY(bridge: LadderBridge, col: number): number | null {
  if (col === bridge.left) return bridge.yLeft
  if (col === bridge.left + 1) return bridge.yRight
  return null
}

function bridgeExit(
  bridge: LadderBridge,
  col: number,
): { col: number; y: number } | null {
  if (col === bridge.left) return { col: bridge.left + 1, y: bridge.yRight }
  if (col === bridge.left + 1) return { col: bridge.left, y: bridge.yLeft }
  return null
}

function portalEntry(
  portal: LadderPortal,
  col: number,
): { y: number; exitCol: number; exitY: number } | null {
  if (portal.aCol === col) {
    return { y: portal.aY, exitCol: portal.bCol, exitY: portal.bY }
  }
  if (portal.bCol === col) {
    return { y: portal.bY, exitCol: portal.aCol, exitY: portal.aY }
  }
  return null
}

function sortKey(bridge: LadderBridge): number {
  return Math.min(bridge.yLeft, bridge.yRight)
}

function tryAddBridge(
  bridges: LadderBridge[],
  usedOnRail: number[][],
  left: number,
  yLeft: number,
  yRight: number,
  minGap: number,
): boolean {
  const right = left + 1
  if (yLeft < 0.06 || yLeft > 0.94 || yRight < 0.06 || yRight > 0.94) return false

  if (usedOnRail[left]!.some((y) => Math.abs(y - yLeft) < minGap)) return false
  if (usedOnRail[right]!.some((y) => Math.abs(y - yRight) < minGap)) return false

  const crosses = bridges.some((existing) => {
    if (existing.left !== left) return false
    const a1 = existing.yLeft
    const a2 = existing.yRight
    const b1 = yLeft
    const b2 = yRight
    return (
      (a1 - b1) * (a2 - b2) < 0 &&
      Math.min(a1, a2) < Math.max(b1, b2) &&
      Math.min(b1, b2) < Math.max(a1, a2)
    )
  })
  if (crosses) return false

  usedOnRail[left]!.push(yLeft)
  usedOnRail[right]!.push(yRight)
  bridges.push({ left, yLeft, yRight })
  return true
}

/**
 * 촘촘한 가로·대각선 — 좌우 왕복이 많이 나오도록
 * @param reservedYs 포탈 등 미리 예약된 y (겹침 방지)
 */
export function generateLadderBridges(
  columnCount: number,
  seed: number,
  reservedYs: number[][] = [],
): LadderBridge[] {
  if (columnCount <= 1) return []

  const random = createSeededRandom(seed)
  const bridges: LadderBridge[] = []
  const usedOnRail: number[][] = Array.from({ length: columnCount }, (_, index) => [
    ...(reservedYs[index] ?? []),
  ])
  const minGap = 0.032
  const bands = 7

  // 1) 인접 쌍마다 밴드별로 강제 배치 → 밀도 확보
  for (let left = 0; left < columnCount - 1; left += 1) {
    for (let band = 0; band < bands; band += 1) {
      const bandStart = 0.08 + (band / bands) * 0.84
      const bandEnd = 0.08 + ((band + 1) / bands) * 0.84
      const yBase = bandStart + random() * (bandEnd - bandStart)
      const diagonal = random() < 0.5
      const yLeft = yBase
      const yRight = diagonal
        ? Math.min(0.93, Math.max(0.07, yBase + (random() < 0.5 ? -1 : 1) * (0.04 + random() * 0.1)))
        : yBase
      tryAddBridge(bridges, usedOnRail, left, yLeft, yRight, minGap)
    }
  }

  // 2) 추가 랜덤 채우기
  const target = Math.max(columnCount * 6, bands * (columnCount - 1) + 8)
  for (let attempt = 0; attempt < target * 12 && bridges.length < target; attempt += 1) {
    const left = Math.floor(random() * (columnCount - 1))
    const diagonal = random() < 0.55
    const yLeft = 0.07 + random() * 0.86
    const yRight = diagonal
      ? Math.min(0.93, Math.max(0.07, yLeft + (random() < 0.5 ? -1 : 1) * (0.05 + random() * 0.12)))
      : yLeft
    tryAddBridge(bridges, usedOnRail, left, yLeft, yRight, minGap)
  }

  return bridges.sort((a, b) => sortKey(a) - sortKey(b))
}

/**
 * 좌측 ↔ 우측(정반대 쪽) 포탈.
 * 바깥쪽 칸으로 점프가 나와 끝자리 당첨 확률을 끌어올림.
 */
export function generateLadderPortals(
  columnCount: number,
  seed: number,
  usedYs: number[][],
): LadderPortal[] {
  if (columnCount < 3) return []

  const random = createSeededRandom(seed ^ 0x51aced)
  const portals: LadderPortal[] = []
  const portalCount = Math.min(6, Math.max(2, Math.ceil(columnCount / 2.5)))
  const minGap = 0.07
  const mid = (columnCount - 1) / 2
  const leftCols = Array.from({ length: columnCount }, (_, i) => i).filter((i) => i < mid)
  const rightCols = Array.from({ length: columnCount }, (_, i) => i).filter((i) => i > mid)

  function tryPlace(aCol: number, bCol: number, band: number): boolean {
    if (aCol === bCol || Math.abs(aCol - bCol) < 2) return false
    const bandStart = 0.14 + (band % 4) * 0.18
    const bandEnd = Math.min(0.8, bandStart + 0.14)
    const aY = bandStart + random() * Math.max(0.03, bandEnd - bandStart)
    const bY = Math.min(0.9, aY + 0.05 + random() * 0.1)

    const conflictA = usedYs[aCol]!.some((y) => Math.abs(y - aY) < minGap)
    const conflictB = usedYs[bCol]!.some((y) => Math.abs(y - bY) < minGap)
    if (conflictA || conflictB) return false

    usedYs[aCol]!.push(aY)
    usedYs[bCol]!.push(bY)
    portals.push({
      id: `portal-${portals.length}`,
      aCol,
      aY,
      bCol,
      bY,
      // 포탈마다 확연히 다른 색 (청·자홍·라임·주황·보라·분홍)
      hue: [195, 320, 130, 28, 275, 340][portals.length % 6]!,
    })
    return true
  }

  // 1) 거울 반대편 우선 (0↔n-1, 1↔n-2, …)
  for (let i = 0; i < Math.floor(columnCount / 2) && portals.length < portalCount; i += 1) {
    const aCol = i
    const bCol = columnCount - 1 - i
    if (Math.abs(aCol - bCol) < 2) continue
    tryPlace(aCol, bCol, portals.length % 3)
  }

  // 2) 좌측 풀 ↔ 우측 풀 랜덤 (바깥쪽 비중 ↑)
  for (let attempt = 0; attempt < portalCount * 24 && portals.length < portalCount; attempt += 1) {
    if (leftCols.length === 0 || rightCols.length === 0) break
    const preferEdge = random() < 0.55
    const aCol = preferEdge
      ? leftCols[Math.min(leftCols.length - 1, Math.floor(random() * Math.min(2, leftCols.length)))]!
      : leftCols[Math.floor(random() * leftCols.length)]!
    const bCol = preferEdge
      ? rightCols[Math.max(0, rightCols.length - 1 - Math.floor(random() * Math.min(2, rightCols.length)))]!
      : rightCols[Math.floor(random() * rightCols.length)]!
    // 랜덤으로 방향 뒤집기 (우측에서 좌측으로도 진입 가능)
    if (random() < 0.5) tryPlace(aCol, bCol, attempt % 4)
    else tryPlace(bCol, aCol, attempt % 4)
  }

  return portals
}

type PathEvent =
  | { kind: 'bridge'; entryY: number; bridge: LadderBridge }
  | { kind: 'portal'; entryY: number; portal: LadderPortal; exitCol: number; exitY: number }

function nextPathEvent(
  col: number,
  y: number,
  bridges: LadderBridge[],
  portals: LadderPortal[],
  usedPortalIds: Set<string>,
): PathEvent | null {
  let best: PathEvent | null = null

  for (const bridge of bridges) {
    const entryY = bridgeEntryY(bridge, col)
    if (entryY == null || entryY <= y) continue
    if (!best || entryY < best.entryY) {
      best = { kind: 'bridge', entryY, bridge }
    }
  }

  for (const portal of portals) {
    if (usedPortalIds.has(portal.id)) continue
    const hit = portalEntry(portal, col)
    if (!hit || hit.y <= y) continue
    if (!best || hit.y < best.entryY) {
      best = {
        kind: 'portal',
        entryY: hit.y,
        portal,
        exitCol: hit.exitCol,
        exitY: hit.exitY,
      }
    }
  }

  return best
}

export function traceLadderEndColumn(
  startCol: number,
  bridges: LadderBridge[],
  portals: LadderPortal[] = [],
): number {
  let col = startCol
  let y = -0.001
  const usedPortalIds = new Set<string>()

  for (let guard = 0; guard < 400; guard += 1) {
    const event = nextPathEvent(col, y, bridges, portals, usedPortalIds)
    if (!event) break

    if (event.kind === 'bridge') {
      const exit = bridgeExit(event.bridge, col)
      if (!exit) break
      col = exit.col
      y = exit.y
    } else {
      usedPortalIds.add(event.portal.id)
      col = event.exitCol
      y = event.exitY
    }
  }

  return col
}

export function countLadderZigZags(
  startCol: number,
  bridges: LadderBridge[],
  portals: LadderPortal[] = [],
): number {
  let col = startCol
  let y = -0.001
  let zigzags = 0
  const usedPortalIds = new Set<string>()

  for (let guard = 0; guard < 400; guard += 1) {
    const event = nextPathEvent(col, y, bridges, portals, usedPortalIds)
    if (!event) break

    if (event.kind === 'bridge') {
      const exit = bridgeExit(event.bridge, col)
      if (!exit) break
      if (exit.col !== col) zigzags += 1
      col = exit.col
      y = exit.y
    } else {
      usedPortalIds.add(event.portal.id)
      if (event.exitCol !== col) zigzags += 1
      col = event.exitCol
      y = event.exitY
    }
  }

  return zigzags
}

export function buildLadderPathPoints(
  startCol: number,
  bridges: LadderBridge[],
  colXs: number[],
  topY: number,
  bottomY: number,
  portals: LadderPortal[] = [],
): Array<{ x: number; y: number; portalJump?: boolean }> {
  const legs = buildLadderPathLegs(startCol, bridges, colXs, topY, bottomY, portals)
  const points: Array<{ x: number; y: number; portalJump?: boolean }> = []
  for (let i = 0; i < legs.length; i += 1) {
    const leg = legs[i]!
    for (let j = 0; j < leg.points.length; j += 1) {
      const point = leg.points[j]!
      // 다리 이음은 중복 점 스킵
      if (
        points.length > 0 &&
        j === 0 &&
        points[points.length - 1]!.x === point.x &&
        points[points.length - 1]!.y === point.y
      ) {
        continue
      }
      points.push({ ...point })
    }
    if (leg.teleport) {
      const midX = (leg.teleport.fromX + leg.teleport.exitX) / 2
      const midY = Math.min(leg.teleport.fromY, leg.teleport.exitY) - 28
      points.push({ x: midX, y: midY, portalJump: true })
      points.push({ x: leg.teleport.exitX, y: leg.teleport.exitY, portalJump: true })
    }
  }
  return points
}

export type LadderPathTeleport = {
  portalId: string
  fromX: number
  fromY: number
  exitX: number
  exitY: number
  fromCol: number
  toCol: number
}

/** 포탈 기준으로 끊긴 낙하 구간 — 구간 끝에서 워프 후 다음 구간 */
export type LadderPathLeg = {
  points: Array<{ x: number; y: number }>
  teleport?: LadderPathTeleport
}

export function buildLadderPathLegs(
  startCol: number,
  bridges: LadderBridge[],
  colXs: number[],
  topY: number,
  bottomY: number,
  portals: LadderPortal[] = [],
): LadderPathLeg[] {
  const legs: LadderPathLeg[] = []
  let col = startCol
  let yNorm = -0.001
  const usedPortalIds = new Set<string>()
  let current: Array<{ x: number; y: number }> = [{ x: colXs[col]!, y: topY }]

  for (let guard = 0; guard < 400; guard += 1) {
    const event = nextPathEvent(col, yNorm, bridges, portals, usedPortalIds)
    if (!event) break

    const entryPixelY = topY + event.entryY * (bottomY - topY)
    current.push({ x: colXs[col]!, y: entryPixelY })

    if (event.kind === 'bridge') {
      const exit = bridgeExit(event.bridge, col)!
      const exitPixelY = topY + exit.y * (bottomY - topY)
      current.push({ x: colXs[exit.col]!, y: exitPixelY })
      col = exit.col
      yNorm = exit.y
    } else {
      usedPortalIds.add(event.portal.id)
      const exitPixelY = topY + event.exitY * (bottomY - topY)
      legs.push({
        points: current,
        teleport: {
          portalId: event.portal.id,
          fromX: colXs[col]!,
          fromY: entryPixelY,
          exitX: colXs[event.exitCol]!,
          exitY: exitPixelY,
          fromCol: col,
          toCol: event.exitCol,
        },
      })
      col = event.exitCol
      yNorm = event.exitY
      current = [{ x: colXs[col]!, y: exitPixelY }]
    }
  }

  current.push({ x: colXs[col]!, y: bottomY })
  legs.push({ points: current })
  return legs
}

function polylineLength(points: Array<{ x: number; y: number }>): number {
  let total = 0
  for (let i = 1; i < points.length; i += 1) {
    total += Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y)
  }
  return total
}

function pointAlongPolyline(
  points: Array<{ x: number; y: number }>,
  t: number,
): { x: number; y: number } {
  if (points.length === 0) return { x: 0, y: 0 }
  if (points.length === 1) return points[0]!
  const total = polylineLength(points)
  if (total <= 0) return points[0]!
  let remain = Math.min(1, Math.max(0, t)) * total
  for (let i = 1; i < points.length; i += 1) {
    const len = Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y)
    if (remain <= len) {
      const u = len === 0 ? 0 : remain / len
      const a = points[i - 1]!
      const b = points[i]!
      return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u }
    }
    remain -= len
  }
  return points[points.length - 1]!
}

export const LADDER_PORTAL_HOLD_MS = 2000
export const LADDER_FALL_TRAVEL_MS = 15000

export type LadderFallSample = {
  x: number
  y: number
  giftOpacity: number
  giftScale: number
  /** 이동한 경로 비율 (포탈 대기 제외) */
  travelProgress: number
  activePortalId: string | null
  portalPhase: 'charge' | 'warp' | 'arrive' | null
  portalPhaseT: number
  portalFrom: { x: number; y: number } | null
  portalTo: { x: number; y: number } | null
  done: boolean
  totalMs: number
}

export function ladderFallTotalMs(legs: LadderPathLeg[], travelMs = LADDER_FALL_TRAVEL_MS): number {
  const portalCount = legs.filter((leg) => leg.teleport).length
  return travelMs + portalCount * LADDER_PORTAL_HOLD_MS
}

/** elapsedMs 기준 낙하·포탈 워프 샘플 */
export function sampleLadderFall(
  legs: LadderPathLeg[],
  elapsedMs: number,
  travelMs = LADDER_FALL_TRAVEL_MS,
): LadderFallSample {
  const lengths = legs.map((leg) => Math.max(1, polylineLength(leg.points)))
  const totalLen = lengths.reduce((a, b) => a + b, 0)
  const totalMs = ladderFallTotalMs(legs, travelMs)
  const empty: LadderFallSample = {
    x: legs[0]?.points[0]?.x ?? 0,
    y: legs[0]?.points[0]?.y ?? 0,
    giftOpacity: 1,
    giftScale: 1,
    travelProgress: 0,
    activePortalId: null,
    portalPhase: null,
    portalPhaseT: 0,
    portalFrom: null,
    portalTo: null,
    done: false,
    totalMs,
  }
  if (legs.length === 0) return { ...empty, done: true }

  let cursor = Math.max(0, elapsedMs)
  let traveled = 0

  for (let i = 0; i < legs.length; i += 1) {
    const leg = legs[i]!
    const legTravel = travelMs * (lengths[i]! / totalLen)

    if (cursor < legTravel) {
      const localT = legTravel <= 0 ? 1 : cursor / legTravel
      const pos = pointAlongPolyline(leg.points, localT)
      return {
        ...empty,
        x: pos.x,
        y: pos.y,
        travelProgress: (traveled + lengths[i]! * localT) / totalLen,
        totalMs,
      }
    }

    cursor -= legTravel
    traveled += lengths[i]!

    if (leg.teleport) {
      if (cursor < LADDER_PORTAL_HOLD_MS) {
        const t = cursor / LADDER_PORTAL_HOLD_MS
        const from = { x: leg.teleport.fromX, y: leg.teleport.fromY }
        const to = { x: leg.teleport.exitX, y: leg.teleport.exitY }
        let phase: 'charge' | 'warp' | 'arrive' = 'charge'
        let giftOpacity = 1
        let giftScale = 1
        let x = from.x
        let y = from.y

        if (t < 0.38) {
          phase = 'charge'
          const u = t / 0.38
          giftScale = 1 + u * 0.55
          giftOpacity = 1 - u * 0.15
        } else if (t < 0.62) {
          phase = 'warp'
          const u = (t - 0.38) / 0.24
          giftScale = Math.max(0.05, 1.55 * (1 - u))
          giftOpacity = Math.max(0, 1 - u * 1.2)
          x = from.x
          y = from.y
        } else {
          phase = 'arrive'
          const u = (t - 0.62) / 0.38
          giftScale = 0.2 + u * 0.9
          giftOpacity = Math.min(1, u * 1.4)
          x = to.x
          y = to.y
        }

        return {
          x,
          y,
          giftOpacity,
          giftScale,
          travelProgress: traveled / totalLen,
          activePortalId: leg.teleport.portalId,
          portalPhase: phase,
          portalPhaseT: t,
          portalFrom: from,
          portalTo: to,
          done: false,
          totalMs,
        }
      }
      cursor -= LADDER_PORTAL_HOLD_MS
    }
  }

  const last = legs[legs.length - 1]!.points
  const end = last[last.length - 1]!
  return {
    ...empty,
    x: end.x,
    y: end.y,
    travelProgress: 1,
    done: true,
    totalMs,
  }
}

export function buildLadderPathD(
  startCol: number,
  bridges: LadderBridge[],
  colXs: number[],
  topY: number,
  bottomY: number,
  portals: LadderPortal[] = [],
): string {
  const legs = buildLadderPathLegs(startCol, bridges, colXs, topY, bottomY, portals)
  return legs
    .map((leg) => {
      if (leg.points.length === 0) return ''
      return leg.points
        .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
        .join(' ')
    })
    .filter(Boolean)
    .join(' ')
}

/** 이동한 구간만 이어 그린 trail path */
export function buildLadderTrailDPartial(legs: LadderPathLeg[], travelProgress: number): string {
  const lengths = legs.map((leg) => Math.max(1, polylineLength(leg.points)))
  const totalLen = lengths.reduce((a, b) => a + b, 0)
  let remain = Math.min(1, Math.max(0, travelProgress)) * totalLen
  const parts: string[] = []

  for (let i = 0; i < legs.length; i += 1) {
    const leg = legs[i]!
    const len = lengths[i]!
    if (remain <= 0) break
    if (remain >= len) {
      parts.push(
        leg.points
          .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
          .join(' '),
      )
      remain -= len
      continue
    }
    const localT = remain / len
    const cut: Array<{ x: number; y: number }> = [leg.points[0]!]
    let walked = 0
    for (let j = 1; j < leg.points.length; j += 1) {
      const a = leg.points[j - 1]!
      const b = leg.points[j]!
      const seg = Math.hypot(b.x - a.x, b.y - a.y)
      if (walked + seg >= localT * len) {
        const u = seg === 0 ? 0 : (localT * len - walked) / seg
        cut.push({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u })
        break
      }
      cut.push(b)
      walked += seg
    }
    parts.push(cut.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' '))
    remain = 0
  }

  return parts.join(' ')
}

export function buildLadderColumnXs(columnCount: number, width: number, padding: number): number[] {
  if (columnCount <= 0) return []
  if (columnCount === 1) return [width / 2]
  const inner = width - padding * 2
  const step = inner / (columnCount - 1)
  return Array.from({ length: columnCount }, (_, index) => padding + index * step)
}

function shuffleWithSeed<T>(items: readonly T[], seed: number): T[] {
  const random = createSeededRandom(seed)
  const next = [...items]
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    ;[next[i], next[j]] = [next[j]!, next[i]!]
  }
  return next
}

/**
 * 당첨 칸을 먼저 균등 추첨 → 그 도착으로 이어지는 사다리·반대편 포탈을 맞춤.
 * 가는 길에 워프 포탈을 최소 1번은 반드시 경유한다 (열 3개 이상).
 */
export function buildChaseLadderDrawPlan(
  eligible: ReadonlyArray<ChaseLadderBeater>,
  seed: number,
): ChaseLadderDrawPlan | null {
  if (eligible.length === 0) return null

  const random = createSeededRandom(seed)
  const columns = shuffleWithSeed(eligible, seed ^ 0x9e3779b9)
  const startCol = Math.floor(random() * columns.length)
  /** 자리(끝칸 포함) 균등 당첨 */
  const targetEndCol = Math.floor(random() * columns.length)

  if (columns.length === 1) {
    return {
      columns,
      winnerMemberId: columns[0]!.memberId,
      startCol: 0,
      endCol: 0,
      bridges: [],
      portals: [],
      zigZagCount: 0,
    }
  }

  const minZigZag = Math.min(12, Math.max(6, columns.length + 2))
  const requirePortal = columns.length >= 3
  let best: ChaseLadderDrawPlan | null = null
  let bestScore = -1

  for (let attempt = 0; attempt < 96; attempt += 1) {
    const attemptSeed = seed + attempt * 131 + 17
    const usedYs = Array.from({ length: columns.length }, () => [] as number[])
    let portals = generateLadderPortals(columns.length, attemptSeed, usedYs)
    let bridges = generateLadderBridges(columns.length, attemptSeed, usedYs)

    // 시작 세로줄 상단에 반대편 포탈을 강제 → 경로상 최소 1회 워프 보장
    if (requirePortal) {
      const forced = ensureForcedPathPortal(
        startCol,
        columns.length,
        bridges,
        portals,
        usedYs,
        attemptSeed,
      )
      bridges = forced.bridges
      portals = forced.portals
    }

    const endCol = traceLadderEndColumn(startCol, bridges, portals)
    const zigZagCount = countLadderZigZags(startCol, bridges, portals)
    const portalHits = countPathPortalHits(startCol, bridges, portals)

    const candidate: ChaseLadderDrawPlan = {
      columns,
      winnerMemberId: columns[endCol]!.memberId,
      startCol,
      endCol,
      bridges,
      portals,
      zigZagCount,
    }

    if (requirePortal && portalHits < 1) continue

    const matchesTarget = endCol === targetEndCol
    const score =
      (matchesTarget ? 1000 : 0) +
      portalHits * 80 +
      Math.min(zigZagCount, 24) * 3

    if (score > bestScore) {
      bestScore = score
      best = candidate
    }

    if (matchesTarget && zigZagCount >= minZigZag && portalHits >= 1) {
      return candidate
    }
  }

  // 최선 후보에도 포탈이 없으면 한 번 더 강제
  if (best && requirePortal && countPathPortalHits(best.startCol, best.bridges, best.portals) < 1) {
    const usedYs = Array.from({ length: columns.length }, () => [] as number[])
    for (const portal of best.portals) {
      usedYs[portal.aCol]!.push(portal.aY)
      usedYs[portal.bCol]!.push(portal.bY)
    }
    const forced = ensureForcedPathPortal(
      best.startCol,
      columns.length,
      best.bridges,
      best.portals,
      usedYs,
      seed ^ 0xabcdef,
    )
    const endCol = traceLadderEndColumn(best.startCol, forced.bridges, forced.portals)
    return {
      ...best,
      bridges: forced.bridges,
      portals: forced.portals,
      endCol,
      winnerMemberId: columns[endCol]!.memberId,
      zigZagCount: countLadderZigZags(best.startCol, forced.bridges, forced.portals),
    }
  }

  return best
}

/**
 * 시작 줄 상단에 반대편 워프를 심고, 그보다 위쪽 연결선은 제거해
 * 선물이 내려오자마자 포탈에 걸리게 한다.
 */
function ensureForcedPathPortal(
  startCol: number,
  columnCount: number,
  bridges: LadderBridge[],
  portals: LadderPortal[],
  usedYs: number[][],
  seed: number,
): { bridges: LadderBridge[]; portals: LadderPortal[] } {
  if (columnCount < 3) return { bridges, portals }
  if (countPathPortalHits(startCol, bridges, portals) >= 1) {
    return { bridges, portals }
  }

  const random = createSeededRandom(seed ^ 0x70f7a1)
  const mid = (columnCount - 1) / 2
  let bCol = columnCount - 1 - startCol
  if (Math.abs(bCol - startCol) < 2) {
    bCol = startCol <= mid ? columnCount - 1 : 0
  }
  if (Math.abs(bCol - startCol) < 2) {
    bCol = startCol === 0 ? columnCount - 1 : 0
  }

  const aY = 0.12 + random() * 0.1
  const bY = Math.min(0.88, aY + 0.05 + random() * 0.08)

  // 시작줄에서 포탈보다 먼저 걸리는 다리 제거
  const trimmed = bridges.filter((bridge) => {
    const entry = bridgeEntryY(bridge, startCol)
    return entry == null || entry > aY + 0.015
  })

  const forced: LadderPortal = {
    id: `portal-forced-${portals.length}`,
    aCol: startCol,
    aY,
    bCol,
    bY,
    hue: [195, 320, 130, 28, 275, 340][portals.length % 6]!,
  }

  usedYs[startCol]!.push(aY)
  usedYs[bCol]!.push(bY)

  return {
    bridges: trimmed,
    portals: [forced, ...portals],
  }
}

function countPathPortalHits(
  startCol: number,
  bridges: LadderBridge[],
  portals: LadderPortal[],
): number {
  let col = startCol
  let y = -0.001
  let hits = 0
  const usedPortalIds = new Set<string>()

  for (let guard = 0; guard < 400; guard += 1) {
    const event = nextPathEvent(col, y, bridges, portals, usedPortalIds)
    if (!event) break
    if (event.kind === 'bridge') {
      const exit = bridgeExit(event.bridge, col)
      if (!exit) break
      col = exit.col
      y = exit.y
    } else {
      usedPortalIds.add(event.portal.id)
      hits += 1
      col = event.exitCol
      y = event.exitY
    }
  }

  return hits
}

export const CHASE_LADDER_EXCLUDE_STORAGE_KEY = 'chase-ladder-excluded-v1'

export function loadChaseLadderExcludedIds(chaseMemberId: string): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(CHASE_LADDER_EXCLUDE_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as Record<string, string[]>
    const list = parsed[chaseMemberId]
    return Array.isArray(list) ? list.filter((id) => typeof id === 'string') : []
  } catch {
    return []
  }
}

export function saveChaseLadderExcludedIds(chaseMemberId: string, memberIds: string[]): void {
  if (typeof window === 'undefined') return
  try {
    const raw = window.localStorage.getItem(CHASE_LADDER_EXCLUDE_STORAGE_KEY)
    const parsed = raw ? (JSON.parse(raw) as Record<string, string[]>) : {}
    parsed[chaseMemberId] = memberIds
    window.localStorage.setItem(CHASE_LADDER_EXCLUDE_STORAGE_KEY, JSON.stringify(parsed))
  } catch {
    // ignore
  }
}
