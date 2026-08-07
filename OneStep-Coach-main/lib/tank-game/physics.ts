import { GRAVITY, MAX_POWER, POWER_SCALE, PROJECTILE_RADIUS, TANK_WIDTH, TURRET_LENGTH, WORLD_HEIGHT, WORLD_WIDTH } from './constants'
import { isTerrainSolid } from './terrain'
import type { ProjectileState, TankState, TerrainState, WeatherType } from './types'

export const MIN_POWER = 10
/** 왕복 주기(초) — 부드럽고 반동 없이 */
export const CHARGE_CYCLE_SECONDS = 2.1
/** 퍼펙트(확정 명중) 판정 폭 — 이 안일 때만 궤적 보정 */
export const PERFECT_POWER_WINDOW = 2
/** UI용: 추천과의 거리 표시 범위 (비행 보정에는 사용하지 않음) */
export const ASSIST_POWER_FALLOFF = 10

export function calculateLaunchVelocity(angle: number, power: number, scale = POWER_SCALE) {
  const radians = angle * Math.PI / 180
  return { x: power * scale * Math.cos(radians), y: -power * scale * Math.sin(radians) }
}

export function getTurretTip(tank: TankState, length: number) {
  const radians = tank.turretAngle * Math.PI / 180
  return { x: tank.x + Math.cos(radians) * length, y: tank.y - 8 - Math.sin(radians) * length }
}

export function weatherWindFactor(weather: WeatherType) {
  return weather === 'rain' ? 1.15 : weather === 'snow' ? 0.65 : 1
}

export function weatherGravityFactor(weather: WeatherType) {
  return weather === 'rain' ? 1.06 : weather === 'snow' ? 0.96 : 1
}

/** 퍼펙트 구간만 1, 그 외는 0 — 어중간한 타이밍은 보정 없음 */
export function timingAssistStrength(power: number, recommended: number) {
  return Math.abs(power - recommended) <= PERFECT_POWER_WINDOW ? 1 : 0
}

/** UI 근접도(참고용). 실제 확정 명중은 퍼펙트(100)만 */
export function timingHitChancePercent(power: number, recommended: number) {
  const diff = Math.abs(power - recommended)
  if (diff <= PERFECT_POWER_WINDOW) return 100
  if (diff >= ASSIST_POWER_FALLOFF) return 0
  const t = (diff - PERFECT_POWER_WINDOW) / (ASSIST_POWER_FALLOFF - PERFECT_POWER_WINDOW)
  // 퍼펙트 밖은 최대 35%까지만 표시 — “맞을 것 같은” 착각 방지
  return Math.round((1 - t) * 35)
}

export interface ChargeProfile {
  /** 꽉 참→빔 한 왕복 시간 */
  cycleSeconds: number
  /** 호환용 (사인파는 대칭이라 미사용에 가깝게 유지) */
  riseRatio: number
}

/** 홀드마다 아주 약한 속도 차이만 */
export function rollChargeProfile(seed = Math.random()): ChargeProfile {
  const mixed = Math.imul(Math.floor(seed * 1_000_000_000) ^ 0x9e3779b9, 0x85ebca6b) >>> 0
  const t = mixed / 4_294_967_296
  return {
    cycleSeconds: 1.9 + t * 0.5,
    riseRatio: 0.5,
  }
}

/**
 * 사인파 0→1→0 왕복.
 * 꼭대기/바닥에서 속도가 0이 되어 삼각형 파동처럼 튕기는 반동이 없다.
 */
export function chargeWave(
  elapsedSeconds: number,
  cycleSeconds = CHARGE_CYCLE_SECONDS,
  _riseRatio = 0.5,
) {
  const period = Math.max(0.35, cycleSeconds)
  const phase = ((elapsedSeconds % period) + period) % period
  // cos: 1 → -1 → 1  ⇒  wave: 0 → 1 → 0 (MAX까지 부드럽게 도달)
  return 0.5 - 0.5 * Math.cos((phase / period) * Math.PI * 2)
}

export function chargePowerFromWave(wave: number) {
  const clamped = Math.min(1, Math.max(0, wave))
  const power = Math.round(MIN_POWER + clamped * (MAX_POWER - MIN_POWER))
  return Math.max(MIN_POWER, Math.min(MAX_POWER, power))
}

export function powerToGaugeRatio(power: number) {
  return Math.max(0, Math.min(1, (power - MIN_POWER) / (MAX_POWER - MIN_POWER)))
}

/**
 * 플레이어가 잡은 각도 기준으로, 그 각도·파워 탄도가 목표에 가장 가깝게
 * 떨어지는 파워를 추천한다. (각도 자체는 바꾸지 않음)
 */
export function recommendPowerForTarget(
  shooter: TankState,
  target: { x: number; y: number },
  wind: number,
  weather: WeatherType,
  angle = shooter.turretAngle,
  terrain: TerrainState | null = null,
): {
  power: number
  error: number
  windFactor: number
  gravityFactor: number
  powerCalm: number
  windBias: number
} {
  const radians = (angle * Math.PI) / 180
  const tip = {
    x: shooter.x + Math.cos(radians) * TURRET_LENGTH,
    y: shooter.y - 8 - Math.sin(radians) * TURRET_LENGTH,
  }
  const aimX = target.x
  const aimY = target.y - 4
  const hitRadius = TANK_WIDTH / 2 + PROJECTILE_RADIUS + 2
  const windFactor = weatherWindFactor(weather)
  const gravityFactor = weatherGravityFactor(weather)
  const dt = 1 / 120

  const simulate = (testWind: number, testWindFactor: number, testGravityFactor: number) => {
    let best = {
      power: Math.round((MIN_POWER + MAX_POWER) / 2),
      error: Number.POSITIVE_INFINITY,
    }
    const appliedWind = testWind * testWindFactor
    const appliedGravity = GRAVITY * testGravityFactor

    for (let power = MIN_POWER; power <= MAX_POWER; power += 1) {
      let x = tip.x
      let y = tip.y
      let velocityX = power * POWER_SCALE * Math.cos(radians)
      let velocityY = -power * POWER_SCALE * Math.sin(radians)
      let prevX = x
      let prevY = y
      let closest = Number.POSITIVE_INFINITY
      let scored = false

      for (let sample = 0; sample < 1100; sample += 1) {
        velocityX += appliedWind * dt
        velocityY += appliedGravity * dt
        prevX = x
        prevY = y
        x += velocityX * dt
        y += velocityY * dt

        const near = Math.hypot(x - aimX, y - aimY)
        if (near < closest) closest = near

        // 실제 탱크 히트박스에 들어가면 최적
        if (near <= hitRadius) {
          closest = 0
          scored = true
          break
        }

        if (terrain && isTerrainSolid(terrain, x, y)) {
          closest = Math.min(closest, near + 40)
          scored = true
          break
        }

        // 하강 중 목표 높이를 지나는 순간의 가로 오차
        if (velocityY > 0 && prevY < aimY && y >= aimY) {
          const span = y - prevY || 1
          const t = (aimY - prevY) / span
          const crossX = prevX + (x - prevX) * t
          closest = Math.min(closest, Math.abs(crossX - aimX))
          scored = true
          break
        }

        if (y > WORLD_HEIGHT + 40 || x < -120 || x > WORLD_WIDTH + 120) {
          scored = true
          break
        }
      }

      if (!scored) {
        closest = Math.min(closest, Math.hypot(x - aimX, y - aimY) + 200)
      }

      // 비슷한 오차면 더 낮은 파워 선호
      if (
        closest < best.error - 0.5 ||
        (closest <= best.error + 1.25 && power < best.power)
      ) {
        best = { power, error: closest }
      }
    }
    return best
  }

  const withWeather = simulate(wind, windFactor, gravityFactor)
  const calm = simulate(0, 1, 1)
  return {
    power: withWeather.power,
    error: withWeather.error,
    windFactor,
    gravityFactor,
    powerCalm: calm.power,
    windBias: withWeather.power - calm.power,
  }
}

export function createProjectile(
  tank: TankState,
  turretLength: number,
  angleOffset = 0,
  options: {
    perfectShot?: boolean
    assistStrength?: number
    assistTargetId?: string | null
  } = {},
): ProjectileState {
  const launchAngle = tank.turretAngle + angleOffset
  const radians = launchAngle * Math.PI / 180
  const origin = {
    x: tank.x + Math.cos(radians) * turretLength,
    y: tank.y - 8 - Math.sin(radians) * turretLength,
  }
  const velocity = calculateLaunchVelocity(launchAngle, tank.power)
  return {
    ...origin,
    velocityX: velocity.x,
    velocityY: velocity.y,
    ownerId: tank.id,
    weaponId: tank.selectedWeapon,
    age: 0,
    trail: [origin],
    perfectShot: Boolean(options.perfectShot),
    assistStrength: Math.max(0, Math.min(1, options.assistStrength ?? 0)),
    assistTargetId: options.assistTargetId ?? null,
  }
}

export function stepProjectile(projectile: ProjectileState, deltaTime: number, wind: number, gravity = GRAVITY) {
  projectile.velocityX += wind * deltaTime
  projectile.velocityY += gravity * deltaTime
  projectile.x += projectile.velocityX * deltaTime
  projectile.y += projectile.velocityY * deltaTime
  projectile.age += deltaTime
}

export function sampleTrajectory(tank: TankState, wind: number, length: number) {
  const origin = getTurretTip(tank, length)
  const velocity = calculateLaunchVelocity(tank.turretAngle, tank.power)
  return Array.from({ length: 24 }, (_, index) => {
    const time = index * 0.08
    return {
      x: origin.x + velocity.x * time + 0.5 * wind * time ** 2,
      y: origin.y + velocity.y * time + 0.5 * GRAVITY * time ** 2,
    }
  })
}
