import { TANK_HEIGHT, WORLD_HEIGHT, WORLD_WIDTH } from './constants'
import type { TerrainState, TerrainType } from './types'

function seededRandom(seed: number) {
  let value = seed >>> 0
  return () => {
    value += 0x6d2b79f5
    let result = value
    result = Math.imul(result ^ (result >>> 15), result | 1)
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61)
    return ((result ^ (result >>> 14)) >>> 0) / 4_294_967_296
  }
}

/** 부드러운 산 능선 (가운데 1, 가장자리 0) — 뾰족한 스파이크 대신 넓은 산 */
function mountainFalloff(normalizedDistance: number) {
  const t = Math.max(0, Math.min(1, normalizedDistance))
  return 0.5 * (1 + Math.cos(Math.PI * t))
}

interface MountainSpec {
  peakX: number
  rise: number
  halfWidth: number
}

function layoutMountains(
  random: () => number,
  width: number,
  height: number,
  terrainType: TerrainType,
): { baseElevation: number; mountains: MountainSpec[]; detail: number } {
  const maxRise = height * 0.52
  const baseElevation =
    terrainType === 'hills' ? height * 0.22 : terrainType === 'valley' ? height * 0.18 : height * 0.2

  if (terrainType === 'valley') {
    return {
      baseElevation: height * 0.16,
      detail: 0.012,
      mountains: [
        {
          peakX: width * (0.16 + random() * 0.08),
          rise: maxRise * (0.72 + random() * 0.22),
          halfWidth: width * (0.22 + random() * 0.08),
        },
        {
          peakX: width * (0.76 + random() * 0.08),
          rise: maxRise * (0.78 + random() * 0.2),
          halfWidth: width * (0.22 + random() * 0.1),
        },
        {
          peakX: width * (0.42 + random() * 0.16),
          rise: maxRise * (0.12 + random() * 0.12),
          halfWidth: width * (0.14 + random() * 0.06),
        },
      ],
    }
  }

  if (terrainType === 'hills') {
    const count = 4 + Math.floor(random() * 2)
    return {
      baseElevation,
      detail: 0.018,
      mountains: Array.from({ length: count }, (_, index) => ({
        peakX: width * ((index + 0.35 + random() * 0.35) / count),
        rise: maxRise * (0.28 + random() * 0.28),
        halfWidth: width * (0.12 + random() * 0.1),
      })),
    }
  }

  if (terrainType === 'mountains') {
    const primaryX = width * (0.28 + random() * 0.44)
    return {
      baseElevation: height * 0.14,
      detail: 0.01,
      mountains: [
        {
          peakX: primaryX,
          rise: maxRise * (0.85 + random() * 0.15),
          halfWidth: width * (0.28 + random() * 0.14),
        },
        {
          peakX:
            primaryX < width * 0.5
              ? width * (0.72 + random() * 0.12)
              : width * (0.14 + random() * 0.12),
          rise: maxRise * (0.45 + random() * 0.25),
          halfWidth: width * (0.16 + random() * 0.1),
        },
        {
          peakX: width * (0.45 + random() * 0.1),
          rise: maxRise * (0.15 + random() * 0.15),
          halfWidth: width * (0.1 + random() * 0.06),
        },
      ],
    }
  }

  if (terrainType === 'rough') {
    const count = 3 + Math.floor(random() * 3)
    return {
      baseElevation: height * 0.18,
      detail: 0.028,
      mountains: Array.from({ length: count }, (_, index) => ({
        peakX: width * ((index + 0.2 + random() * 0.55) / count),
        rise: maxRise * (0.4 + random() * 0.45),
        halfWidth: width * (0.14 + random() * 0.14),
      })),
    }
  }

  // random: 매 판 Scorched Earth식 대형 산 배치
  const style = Math.floor(random() * 4)
  if (style === 0) {
    return {
      baseElevation: height * 0.15,
      detail: 0.012,
      mountains: [
        {
          peakX: width * (0.42 + random() * 0.16),
          rise: maxRise * (0.8 + random() * 0.2),
          halfWidth: width * (0.3 + random() * 0.12),
        },
        {
          peakX: width * (0.12 + random() * 0.1),
          rise: maxRise * (0.25 + random() * 0.2),
          halfWidth: width * (0.12 + random() * 0.08),
        },
        {
          peakX: width * (0.82 + random() * 0.1),
          rise: maxRise * (0.3 + random() * 0.22),
          halfWidth: width * (0.12 + random() * 0.08),
        },
      ],
    }
  }
  if (style === 1) {
    return {
      baseElevation: height * 0.17,
      detail: 0.014,
      mountains: [
        {
          peakX: width * (0.2 + random() * 0.1),
          rise: maxRise * (0.7 + random() * 0.25),
          halfWidth: width * (0.2 + random() * 0.1),
        },
        {
          peakX: width * (0.72 + random() * 0.12),
          rise: maxRise * (0.72 + random() * 0.25),
          halfWidth: width * (0.2 + random() * 0.1),
        },
      ],
    }
  }
  if (style === 2) {
    const leftToRight = random() > 0.5
    return {
      baseElevation: height * 0.16,
      detail: 0.015,
      mountains: [0, 1, 2].map((step) => {
        const order = leftToRight ? step : 2 - step
        return {
          peakX: width * (0.18 + order * 0.28 + random() * 0.06),
          rise: maxRise * (0.35 + step * 0.2 + random() * 0.12),
          halfWidth: width * (0.16 + random() * 0.08),
        }
      }),
    }
  }
  return {
    baseElevation: height * 0.28,
    detail: 0.01,
    mountains: [
      {
        peakX: width * (0.55 + random() * 0.25),
        rise: maxRise * (0.75 + random() * 0.22),
        halfWidth: width * (0.26 + random() * 0.12),
      },
      {
        peakX: width * (0.18 + random() * 0.12),
        rise: maxRise * (0.2 + random() * 0.15),
        halfWidth: width * (0.18 + random() * 0.1),
      },
    ],
  }
}

/**
 * 넓은 큰 산/계곡 지형.
 * 고주파 톱니 대신 소수 대형 능선을 부드럽게 합성한다.
 */
export function createTerrain(
  seed: number,
  width = WORLD_WIDTH,
  height = WORLD_HEIGHT,
  terrainType: TerrainType = 'random',
) {
  const random = seededRandom(seed)
  const { baseElevation, mountains, detail } = layoutMountains(random, width, height, terrainType)

  const heights = Array.from({ length: width }, (_, x) => {
    let elevation = baseElevation
    mountains.forEach((mountain) => {
      const distance = Math.abs(x - mountain.peakX) / Math.max(1, mountain.halfWidth)
      if (distance < 1) elevation += mountain.rise * mountainFalloff(distance)
    })
    elevation +=
      Math.sin(x * 0.0045 + seed * 0.0011) * height * detail +
      Math.sin(x * 0.011 + seed * 0.002) * height * detail * 0.45
    return Math.round(Math.max(height * 0.28, Math.min(height * 0.9, height - elevation)))
  })

  const smoothed = heights.slice()
  for (let pass = 0; pass < 2; pass += 1) {
    for (let x = 2; x < width - 2; x += 1) {
      smoothed[x] = Math.round(
        (heights[x - 2] +
          heights[x - 1] * 2 +
          heights[x] * 3 +
          heights[x + 1] * 2 +
          heights[x + 2]) /
          9,
      )
    }
    for (let x = 0; x < width; x += 1) heights[x] = smoothed[x]
  }

  const mask = new Uint8Array(width * height)
  for (let x = 0; x < width; x += 1) {
    for (let y = heights[x]; y < height; y += 1) mask[y * width + x] = 1
  }
  return { width, height, seed, mask, heights, revision: 0 } satisfies TerrainState
}

export function isTerrainSolid(terrain: TerrainState, x: number, y: number) {
  const pixelX = Math.round(x)
  const pixelY = Math.round(y)
  if (pixelX < 0 || pixelX >= terrain.width || pixelY < 0 || pixelY >= terrain.height) return false
  return terrain.mask[pixelY * terrain.width + pixelX] === 1
}

export function findSurface(terrain: TerrainState, x: number, startY = 0): number | null {
  const pixelX = Math.max(0, Math.min(terrain.width - 1, Math.round(x)))
  for (let y = Math.max(0, Math.round(startY)); y < terrain.height; y += 1) {
    if (terrain.mask[y * terrain.width + pixelX] === 1) return y
  }
  return null
}

export function flattenSpawn(terrain: TerrainState, centerX: number, radius = 64) {
  const centerY = findSurface(terrain, centerX) ?? terrain.height - 1
  const minX = Math.max(0, Math.floor(centerX - radius))
  const maxX = Math.min(terrain.width - 1, Math.ceil(centerX + radius))
  for (let x = minX; x <= maxX; x += 1) {
    const edge = Math.abs(x - centerX) / radius
    const blend = edge * edge * (3 - 2 * edge)
    const surface = Math.round(centerY * (1 - blend) + terrain.heights[x] * blend)
    terrain.heights[x] = surface
    for (let y = 0; y < terrain.height; y += 1) {
      terrain.mask[y * terrain.width + x] = y >= surface ? 1 : 0
    }
  }
  terrain.revision += 1
}

/**
 * 각 열(column)에서 공중에 뜬 지형 조각을 아래로 떨어뜨린다.
 * 아래가 비어 있으면 바닥부터 다시 쌓이도록 압축한다.
 */
export function collapseFloatingTerrain(
  terrain: TerrainState,
  fromX = 0,
  toX = terrain.width - 1,
) {
  const minX = Math.max(0, Math.floor(fromX))
  const maxX = Math.min(terrain.width - 1, Math.ceil(toX))
  let changed = false

  for (let x = minX; x <= maxX; x += 1) {
    let solidCount = 0
    for (let y = 0; y < terrain.height; y += 1) {
      if (terrain.mask[y * terrain.width + x] === 1) solidCount += 1
    }

    const surface = solidCount === 0 ? terrain.height : terrain.height - solidCount
    for (let y = 0; y < terrain.height; y += 1) {
      const next = y >= surface ? 1 : 0
      const index = y * terrain.width + x
      if (terrain.mask[index] !== next) {
        terrain.mask[index] = next
        changed = true
      }
    }

    if (terrain.heights[x] !== surface) {
      terrain.heights[x] = surface
      changed = true
    }
  }

  if (changed) terrain.revision += 1
  return changed
}

/**
 * 공중에 뜬 지형을 한 프레임에 최대 maxDrop 픽셀씩만 떨어뜨린다.
 * 아직 떨어질 조각이 남아 있으면 true를 반환해 다음 프레임에도 이어서 무너진다.
 */
export function stepTerrainCollapse(
  terrain: TerrainState,
  fromX: number,
  toX: number,
  maxDrop: number,
) {
  const minX = Math.max(0, Math.floor(fromX))
  const maxX = Math.min(terrain.width - 1, Math.ceil(toX))
  let stillFalling = false
  let changed = false

  for (let x = minX; x <= maxX; x += 1) {
    const solids: number[] = []
    for (let y = 0; y < terrain.height; y += 1) {
      if (terrain.mask[y * terrain.width + x] === 1) solids.push(y)
    }
    if (!solids.length) {
      if (terrain.heights[x] !== terrain.height) {
        terrain.heights[x] = terrain.height
        changed = true
      }
      continue
    }

    // 아래쪽 조각부터 바닥에 쌓일 목표 위치로 조금씩 이동시킨다.
    const newYs = new Array<number>(solids.length)
    let target = terrain.height - 1
    for (let index = solids.length - 1; index >= 0; index -= 1) {
      const y = solids[index]
      const newY = y >= target ? target : Math.min(target, y + maxDrop)
      if (newY !== y) changed = true
      if (newY < target) stillFalling = true
      newYs[index] = newY
      target = newY - 1
    }

    for (let y = 0; y < terrain.height; y += 1) {
      terrain.mask[y * terrain.width + x] = 0
    }
    newYs.forEach((y) => {
      terrain.mask[y * terrain.width + x] = 1
    })
    if (terrain.heights[x] !== newYs[0]) {
      terrain.heights[x] = newYs[0]
      changed = true
    }
  }

  if (changed) terrain.revision += 1
  return stillFalling
}

function clearTerrainDisk(
  terrain: TerrainState,
  centerX: number,
  centerY: number,
  radius: number,
) {
  const minX = Math.max(0, Math.floor(centerX - radius))
  const maxX = Math.min(terrain.width - 1, Math.ceil(centerX + radius))
  const minY = Math.max(0, Math.floor(centerY - radius))
  const maxY = Math.min(terrain.height - 1, Math.ceil(centerY + radius))
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if ((x - centerX) ** 2 + (y - centerY) ** 2 <= radius ** 2) {
        terrain.mask[y * terrain.width + x] = 0
      }
    }
  }
}

/**
 * 지형 파괴탄 전용 균열. 작은 중심 구멍에서 여러 갈래의 굵기와 길이가
 * 다른 균열 및 가지 균열을 뻗어 지반이 열마다 불규칙하게 붕괴되게 한다.
 */
export function fractureTerrain(
  terrain: TerrainState,
  centerX: number,
  centerY: number,
  radius: number,
) {
  const random = seededRandom(
    Math.floor(terrain.seed + centerX * 73856093 + centerY * 19349663 + terrain.revision),
  )
  clearTerrainDisk(terrain, centerX, centerY, radius * 0.3)

  const carveCrack = (
    startX: number,
    startY: number,
    angle: number,
    length: number,
    thickness: number,
    bend: number,
  ) => {
    const steps = Math.max(4, Math.ceil(length / 4))
    let x = startX
    let y = startY
    let heading = angle
    for (let step = 0; step <= steps; step += 1) {
      const progress = step / steps
      heading += (random() - 0.5) * bend
      x += Math.cos(heading) * (length / steps)
      y += Math.sin(heading) * (length / steps)
      clearTerrainDisk(
        terrain,
        x,
        y,
        Math.max(1.4, thickness * (1 - progress * 0.55)),
      )

      // 중간중간 짧은 가지 균열을 만들어 수직 압축 결과도 고르지 않게 한다.
      if (step > 1 && step < steps - 1 && random() < 0.22) {
        const branchAngle = heading + (random() > 0.5 ? 1 : -1) * (0.45 + random() * 0.55)
        const branchLength = length * (0.12 + random() * 0.2)
        const branchSteps = Math.max(2, Math.ceil(branchLength / 5))
        for (let branch = 1; branch <= branchSteps; branch += 1) {
          const distance = (branch / branchSteps) * branchLength
          clearTerrainDisk(
            terrain,
            x + Math.cos(branchAngle) * distance,
            y + Math.sin(branchAngle) * distance,
            Math.max(1, thickness * 0.48 * (1 - branch / branchSteps)),
          )
        }
      }
    }
  }

  // 세로 성분을 눌러 균열이 아래가 아니라 앞뒤(좌우)로 길게 뻗는다.
  const flattenAngle = (rawAngle: number) =>
    Math.atan2(Math.sin(rawAngle) * 0.35, Math.cos(rawAngle))

  const crackCount = 18
  for (let crack = 0; crack < crackCount; crack += 1) {
    const angle = flattenAngle(
      (crack / crackCount) * Math.PI * 2 + (random() - 0.5) * 0.45,
    )
    carveCrack(
      centerX,
      centerY,
      angle,
      radius * (0.95 + random() * 1.25),
      radius * (0.03 + random() * 0.04),
      0.2 + random() * 0.25,
    )
  }

  // 방사형 균열을 잇는 동심원 거미줄 가닥. 군데군데 끊겨 불규칙하다.
  for (let ring = 1; ring <= 3; ring += 1) {
    const ringRadius = radius * (0.32 + ring * 0.42)
    const segments = 30
    for (let segment = 0; segment <= segments; segment += 1) {
      if (random() < 0.18) continue
      const theta = (segment / segments) * Math.PI * 2
      clearTerrainDisk(
        terrain,
        centerX + Math.cos(theta) * ringRadius * (1 + (random() - 0.5) * 0.14),
        centerY + Math.sin(theta) * ringRadius * 0.35 * (1 + (random() - 0.5) * 0.25),
        Math.max(1.2, radius * (0.018 + random() * 0.016)),
      )
    }
  }

  // 크기가 다른 공동도 좌우로 넓게 섞어 붕괴 높이가 열마다 달라지게 한다.
  for (let pocket = 0; pocket < 9; pocket += 1) {
    const angle = flattenAngle(random() * Math.PI * 2)
    const distance = radius * (0.35 + random() * 1.2)
    clearTerrainDisk(
      terrain,
      centerX + Math.cos(angle) * distance,
      centerY + Math.sin(angle) * distance,
      radius * (0.035 + random() * 0.065),
    )
  }

  terrain.revision += 1
  return {
    minX: centerX - radius * 2.4,
    maxX: centerX + radius * 2.4,
  }
}

export function carveTerrainCircle(terrain: TerrainState, centerX: number, centerY: number, radius: number) {
  const minX = Math.max(0, Math.floor(centerX - radius))
  const maxX = Math.min(terrain.width - 1, Math.ceil(centerX + radius))
  const minY = Math.max(0, Math.floor(centerY - radius))
  const maxY = Math.min(terrain.height - 1, Math.ceil(centerY + radius))
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if ((x - centerX) ** 2 + (y - centerY) ** 2 <= radius ** 2) {
        terrain.mask[y * terrain.width + x] = 0
      }
    }
  }
  terrain.revision += 1
  // 즉시 무너뜨리지 않고 붕괴 구간을 돌려줘 프레임 단위로 부드럽게 떨어지게 한다.
  const collapseMargin = Math.ceil(radius * 0.35) + 2
  return { minX: minX - collapseMargin, maxX: maxX + collapseMargin }
}

export function getTankRestingY(terrain: TerrainState, x: number, startY = 0) {
  const surfaces = [-15, 0, 15]
    .map((offset) => findSurface(terrain, x + offset, startY))
    .filter((surface): surface is number => surface !== null)
  return (surfaces.length ? Math.min(...surfaces) : terrain.height + TANK_HEIGHT) - TANK_HEIGHT / 2
}
