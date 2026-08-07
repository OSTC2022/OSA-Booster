'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  CloudRain,
  Crosshair,
  HeartPulse,
  LogOut,
  Pause,
  Play,
  RotateCcw,
  Shuffle,
  Snowflake,
  Sun,
  Wind,
} from 'lucide-react'
import {
  AUGMENTS,
  applyAugmentImmediate,
  chooseAiAugment,
  getAugmentMods,
} from '@/lib/tank-game/augments'
import {
  EXPLOSION_DURATION,
  GRAVITY,
  MAX_FRAME_DELTA,
  MAX_POWER,
  PHYSICS_STEP,
  PROJECTILE_RADIUS,
  TANK_HEIGHT,
  TANK_WIDTH,
  TURRET_LENGTH,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from '@/lib/tank-game/constants'
import { applyDamage, calculateBlastDamage, findWinningTanks } from '@/lib/tank-game/damage'
import {
  createGameState,
  createSnapshot,
  getCurrentTank,
  isBelowWorld,
  nextTurn,
} from '@/lib/tank-game/game-state'
import {
  calculateLaunchVelocity,
  chargePowerFromWave,
  chargeWave,
  createProjectile,
  getTurretTip,
  PERFECT_POWER_WINDOW,
  powerToGaugeRatio,
  recommendPowerForTarget,
  rollChargeProfile,
  stepProjectile,
  timingAssistStrength,
  timingHitChancePercent,
  MIN_POWER,
} from '@/lib/tank-game/physics'
import {
  carveTerrainCircle,
  fractureTerrain,
  getTankRestingY,
  isTerrainSolid,
  stepTerrainCollapse,
} from '@/lib/tank-game/terrain'
import { EQUIPMENT, WEAPONS, nextAvailableWeapon } from '@/lib/tank-game/weapons'
import type { WeaponVisual } from '@/lib/tank-game/weapons'
import type { OnlineCommand, OnlineGameSession } from '@/lib/tank-game/online'
import type {
  AiDifficulty,
  AugmentId,
  CampaignPlayer,
  ExplosionState,
  GameConfig,
  GameSnapshot,
  GameState,
  Particle,
  PlayerRoundStats,
  ProjectileState,
  RoundResult,
  TankState,
  VisualEffect,
  WeaponId,
} from '@/lib/tank-game/types'

interface TankGameCanvasProps {
  config: GameConfig
  players: CampaignPlayer[]
  round: number
  onRoundEnd: (result: RoundResult, players: CampaignPlayer[]) => void
  onMainMenu: () => void
  online?: OnlineGameSession
  seed?: number
}

interface AiPlan {
  turn: number
  elapsed: number
  angle: number
  power: number
  weaponId: WeaponId
}

function createParticles(x: number, y: number, visual: WeaponVisual): Particle[] {
  const colors = visual.particleColors
  const particles: Particle[] = []
  const count = visual.particleCount
  for (let index = 0; index < count; index += 1) {
    const angle = Math.random() * Math.PI * 2
    let speed = 70 + Math.random() * 340
    let velocityY = Math.sin(angle) * speed - 80
    let life = 0.55 + Math.random() * 1.05
    let size = 3 + Math.random() * 9
    let kind: Particle['kind'] = index % 5 === 0 ? 'smoke' : index % 3 === 0 ? 'spark' : 'ember'
    let gravity = 160 + Math.random() * 80
    let drag = 0.12
    if (visual.shape === 'drill') {
      velocityY = -Math.abs(Math.sin(angle)) * speed - 110
      life = 0.85 + Math.random() * 1.1
      size = 4 + Math.random() * 12
      kind = index % 2 ? 'shard' : 'smoke'
      gravity = 120
    } else if (visual.shape === 'diamond') {
      speed *= 0.95
      velocityY = Math.sin(angle) * speed - 130
      size = 4 + Math.random() * 12
      life = 0.8 + Math.random() * 1.15
      kind = index % 4 === 0 ? 'shard' : 'ember'
      gravity = 200
    } else if (visual.shape === 'tracer') {
      speed *= 1.85
      velocityY = Math.sin(angle) * speed
      life = 0.32 + Math.random() * 0.55
      size = 2 + Math.random() * 5
      kind = 'spark'
      gravity = 40
      drag = 0.28
    } else if (visual.shape === 'star') {
      speed *= 1.55
      velocityY = Math.sin(angle) * speed - 100
      life = 0.85 + Math.random() * 1.25
      size = 3.5 + Math.random() * 11
      kind = index % 3 === 0 ? 'spark' : 'ember'
      gravity = 140
    }
    if (kind === 'smoke') {
      speed *= 0.42
      velocityY = -30 - Math.random() * 70
      size = 12 + Math.random() * 24
      life = 1.05 + Math.random() * 1.25
      gravity = -18
      drag = 0.35
    }
    particles.push({
      x: x + (Math.random() - 0.5) * 14,
      y: y + (Math.random() - 0.5) * 14,
      velocityX: Math.cos(angle) * speed * (kind === 'smoke' ? 0.45 : 1),
      velocityY,
      life,
      maxLife: life,
      color: colors[Math.floor(Math.random() * colors.length)],
      size,
      kind,
      gravity,
      drag,
    })
  }
  // 중앙 섬광용 고속 스파크
  const sparkCount = 22 + visual.shockwaves * 10
  for (let spark = 0; spark < sparkCount; spark += 1) {
    const angle = Math.random() * Math.PI * 2
    const speed = 280 + Math.random() * 380
    const life = 0.22 + Math.random() * 0.36
    particles.push({
      x,
      y,
      velocityX: Math.cos(angle) * speed,
      velocityY: Math.sin(angle) * speed - 50,
      life,
      maxLife: life,
      color: colors[spark % colors.length],
      size: 2 + Math.random() * 3.5,
      kind: 'spark',
      gravity: 30,
      drag: 0.4,
    })
  }
  return particles
}

function tankHit(x: number, y: number, tank: TankState) {
  return (
    Math.abs(x - tank.x) <= TANK_WIDTH / 2 + PROJECTILE_RADIUS &&
    Math.abs(y - tank.y) <= TANK_HEIGHT / 2 + PROJECTILE_RADIUS
  )
}

function assistTargetOf(state: GameState, shot: ProjectileState) {
  if (!shot.assistTargetId) return null
  return state.tanks.find((tank) => tank.id === shot.assistTargetId && tank.alive) ?? null
}

/** 현재 탄도(플레이어 각도·파워로 나온 속도)로 목표 높이 착탄 X를 예측 */
function predictLandingX(
  shot: ProjectileState,
  aimY: number,
  wind: number,
  gravity: number,
) {
  let x = shot.x
  let y = shot.y
  let vx = shot.velocityX
  let vy = shot.velocityY
  let prevX = x
  let prevY = y
  const dt = 1 / 90
  for (let i = 0; i < 700; i += 1) {
    vx += wind * dt
    vy += gravity * dt
    prevX = x
    prevY = y
    x += vx * dt
    y += vy * dt
    if (vy > 0 && prevY < aimY && y >= aimY) {
      const span = y - prevY || 1
      const t = (aimY - prevY) / span
      return prevX + (x - prevX) * t
    }
    if (y > WORLD_HEIGHT + 80 || x < -160 || x > WORLD_WIDTH + 160) break
  }
  return null
}

/**
 * 퍼펙트(추천 게이지 정확)일 때만 가로 착탄을 보정해서 명중.
 * 추천과 차이가 있으면 보정 없이 순수 탄도만 사용.
 */
function applyFlightAssist(
  shot: ProjectileState,
  state: GameState,
  delta: number,
  wind: number,
  gravity: number,
) {
  if (!shot.perfectShot) return
  const target = assistTargetOf(state, shot)
  if (!target) return

  const aimX = target.x
  const aimY = target.y - 4
  const dist = Math.hypot(aimX - shot.x, aimY - shot.y)
  if (dist < 1) return

  const predictedX = predictLandingX(shot, aimY, wind, gravity)
  if (predictedX !== null) {
    const errorX = aimX - predictedX
    shot.velocityX += errorX * 3.8 * delta
  }

  if (dist <= TANK_WIDTH * 0.9) {
    const settle = Math.min(1, 16 * delta)
    shot.x += (aimX - shot.x) * settle
    shot.y += (aimY - shot.y) * settle
  }
}

function deterministicWeatherValue(seed: number, eventIndex: number, salt: number) {
  const mixed =
    Math.imul(seed ^ Math.imul(eventIndex + 1, 0x45d9f3b) ^ salt, 0x27d4eb2d) >>> 0
  return mixed / 4_294_967_296
}

function findSafeTeleportX(state: GameState, tank: TankState) {
  const enemies = state.tanks.filter((entry) => entry.alive && entry.id !== tank.id)
  const candidates = Array.from(
    { length: 14 },
    () => WORLD_WIDTH * (0.08 + Math.random() * 0.84),
  )
  return candidates.reduce((safest, candidate) => {
    const safety = Math.min(...enemies.map((enemy) => Math.abs(enemy.x - candidate)))
    const safestScore = Math.min(...enemies.map((enemy) => Math.abs(enemy.x - safest)))
    return safety > safestScore ? candidate : safest
  }, candidates[0])
}

function chooseAiWeapon(tank: TankState, target?: TankState) {
  const usable = (Object.keys(WEAPONS) as WeaponId[]).filter(
    (id) => WEAPONS[id].unlimited || tank.weapons[id] > 0,
  )
  if (tank.aiDifficulty === 'easy') return 'basic'
  if (tank.aiDifficulty === 'hard') {
    const distance = target ? Math.abs(target.x - tank.x) : Number.POSITIVE_INFINITY
    if (target?.shield && usable.includes('heavy')) return 'heavy'
    if (distance > 520 && usable.includes('triple')) return 'triple'
    if (target && target.y > tank.y + 70 && usable.includes('terrain')) return 'terrain'
    if (distance > 230 && usable.includes('mega')) return 'mega'
    return usable.sort((a, b) => WEAPONS[b].damage - WEAPONS[a].damage)[0] ?? 'basic'
  }
  const specials = usable.filter((id) => id !== 'basic')
  return specials.length && Math.random() > 0.45
    ? specials[Math.floor(Math.random() * specials.length)]
    : 'basic'
}

function planAiShot(state: GameState, difficulty: AiDifficulty): Omit<AiPlan, 'turn' | 'elapsed'> {
  const shooter = getCurrentTank(state)
  const targets = state.tanks.filter(
    (tank) =>
      tank.alive &&
      tank.id !== shooter.id &&
      (shooter.team === null || tank.team !== shooter.team),
  )
  const target = targets.sort(
    (a, b) => Math.abs(a.x - shooter.x) - Math.abs(b.x - shooter.x),
  )[0]
  if (!target) {
    return { angle: shooter.turretAngle, power: shooter.power, weaponId: 'basic' }
  }

  const angleStep = difficulty === 'hard' ? 3 : difficulty === 'normal' ? 6 : 12
  const powerStep = difficulty === 'hard' ? 4 : difficulty === 'normal' ? 7 : 12
  const pointsRight = target.x > shooter.x
  let best = { angle: pointsRight ? 45 : 135, power: 55, error: Number.POSITIVE_INFINITY }

  for (let angle = pointsRight ? 15 : 100; angle <= (pointsRight ? 80 : 165); angle += angleStep) {
    for (let power = 25; power <= MAX_POWER; power += powerStep) {
      const radians = (angle * Math.PI) / 180
      let x = shooter.x + Math.cos(radians) * TURRET_LENGTH
      let y = shooter.y - 8 - Math.sin(radians) * TURRET_LENGTH
      let velocityX = power * 6.6 * Math.cos(radians)
      let velocityY = -power * 6.6 * Math.sin(radians)
      const windFactor = state.weather === 'rain' ? 1.15 : state.weather === 'snow' ? 0.65 : 1
      const gravityFactor = state.weather === 'rain' ? 1.06 : state.weather === 'snow' ? 0.96 : 1
      let impactError = Number.POSITIVE_INFINITY
      let sawDescentNearTarget = false

      for (let sample = 0; sample < 900; sample += 1) {
        velocityX += state.wind * windFactor * 0.035
        velocityY += GRAVITY * gravityFactor * 0.035
        const prevX = x
        const prevY = y
        x += velocityX * 0.035
        y += velocityY * 0.035
        if (velocityY > 0 && prevY < target.y && y >= target.y) {
          const span = y - prevY || 1
          const t = (target.y - prevY) / span
          const crossX = prevX + (x - prevX) * t
          impactError = Math.abs(crossX - target.x)
          sawDescentNearTarget = true
          break
        }
        if (y > WORLD_HEIGHT || x < -80 || x > WORLD_WIDTH + 80) break
      }
      if (!sawDescentNearTarget) {
        impactError = Math.abs(x - target.x) + Math.abs(y - target.y) + 400
      }
      if (
        impactError < best.error - 0.75 ||
        (impactError <= best.error + 1.5 && power < best.power)
      ) {
        best = { angle, power, error: impactError }
      }
    }
  }

  const angleError = difficulty === 'easy' ? 14 : difficulty === 'normal' ? 5 : 2
  const powerError = difficulty === 'easy' ? 14 : difficulty === 'normal' ? 7 : 3
  return {
    angle: Math.max(0, Math.min(180, best.angle + (Math.random() * 2 - 1) * angleError)),
    power: Math.max(10, Math.min(MAX_POWER, best.power + (Math.random() * 2 - 1) * powerError)),
    weaponId: chooseAiWeapon(shooter, target),
  }
}

function drawTank(
  context: CanvasRenderingContext2D,
  tank: TankState,
  current: boolean,
  targeted = false,
) {
  context.save()
  if (targeted) {
    const pulse = 0.55 + Math.sin(performance.now() * 0.008) * 0.25
    context.strokeStyle = `rgba(163,230,53,${0.55 + pulse * 0.35})`
    context.lineWidth = 3
    context.setLineDash([6, 4])
    context.beginPath()
    context.arc(tank.x, tank.y - 4, 34 + pulse * 4, 0, Math.PI * 2)
    context.stroke()
    context.setLineDash([])
    context.fillStyle = 'rgba(163,230,53,.12)'
    context.beginPath()
    context.arc(tank.x, tank.y - 4, 30, 0, Math.PI * 2)
    context.fill()
  }
  if (current) {
    context.shadowColor = tank.color
    context.shadowBlur = 18
    context.strokeStyle = '#fff'
    context.lineWidth = 2
    context.strokeRect(tank.x - 27, tank.y - 22, 54, 40)
    context.fillStyle = tank.color
    context.beginPath()
    context.moveTo(tank.x, tank.y - 42)
    context.lineTo(tank.x - 7, tank.y - 51)
    context.lineTo(tank.x + 7, tank.y - 51)
    context.closePath()
    context.fill()
  }
  context.shadowBlur = 0
  const tip = getTurretTip(tank, TURRET_LENGTH)
  context.strokeStyle = '#071019'
  context.lineWidth = 6
  context.beginPath()
  context.moveTo(tank.x, tank.y - 8)
  context.lineTo(tip.x, tip.y)
  context.stroke()
  context.strokeStyle = tank.color
  context.lineWidth = 3
  context.stroke()
  context.fillStyle = '#071019'
  context.fillRect(tank.x - 21, tank.y - 3, 42, 15)
  context.fillStyle = tank.color
  context.fillRect(tank.x - 18, tank.y, 36, 9)
  context.fillRect(tank.x - 12, tank.y - 13, 24, 13)
  context.fillStyle = '#d8f9ff'
  context.fillRect(tank.x - 3, tank.y - 10, 6, 5)
  context.fillStyle = '#05080c'
  for (let offset = -15; offset <= 15; offset += 10) {
    context.beginPath()
    context.arc(tank.x + offset, tank.y + 10, 4, 0, Math.PI * 2)
    context.fill()
  }
  if (tank.shield > 0) {
    // pulsing hex-segment energy dome
    const pulse = 0.5 + Math.sin(performance.now() * 0.006) * 0.2
    context.strokeStyle = '#70e6ff'
    context.globalAlpha = pulse
    context.lineWidth = 3
    for (let segment = 0; segment < 6; segment += 1) {
      context.beginPath()
      context.arc(
        tank.x,
        tank.y - 3,
        31,
        Math.PI + (segment * Math.PI) / 6 + 0.03,
        Math.PI + ((segment + 1) * Math.PI) / 6 - 0.03,
      )
      context.stroke()
    }
    context.globalAlpha = pulse * 0.25
    context.fillStyle = '#22d3ee'
    context.beginPath()
    context.arc(tank.x, tank.y - 3, 31, Math.PI, Math.PI * 2)
    context.fill()
    context.globalAlpha = 1
  }
  context.font = 'bold 13px monospace'
  context.textAlign = 'center'
  context.fillStyle = '#e8f7ff'
  context.fillText(tank.nickname, tank.x, tank.y - 62)
  context.fillStyle = '#061018'
  context.fillRect(tank.x - 30, tank.y - 57, 60, 7)
  context.fillStyle = tank.health > 35 ? '#39ff88' : '#ff4d5e'
  context.fillRect(tank.x - 29, tank.y - 56, 58 * (tank.health / tank.maxHealth), 5)
  context.restore()
}

function drawShortAimGuide(
  context: CanvasRenderingContext2D,
  tank: TankState,
  wind: number,
  weather: GameState['weather'],
) {
  const origin = getTurretTip(tank, TURRET_LENGTH)
  const velocity = calculateLaunchVelocity(tank.turretAngle, tank.power)
  const dotCount = 5 + Math.round(((tank.power - 10) / 90) * 3)
  const maxTime = 0.15 + (tank.power / 100) * 0.12

  context.save()
  context.fillStyle = '#d8f9ff'
  context.shadowColor = '#76e9ff'
  context.shadowBlur = 5
  for (let index = 1; index <= dotCount; index += 1) {
    const time = (index / dotCount) * maxTime
    const weatherWind = weather === 'rain' ? 1.15 : weather === 'snow' ? 0.65 : 1
    const weatherGravity = weather === 'rain' ? 1.06 : weather === 'snow' ? 0.96 : 1
    const x = origin.x + velocity.x * time + 0.5 * wind * weatherWind * time ** 2
    const y = origin.y + velocity.y * time + 0.5 * GRAVITY * weatherGravity * time ** 2
    context.globalAlpha = 0.72 - (index / dotCount) * 0.42
    context.beginPath()
    context.arc(x, y, index % 2 ? 1.8 : 1.25, 0, Math.PI * 2)
    context.fill()
  }
  context.restore()
}

function drawProjectile(context: CanvasRenderingContext2D, shot: ProjectileState) {
  const visual = WEAPONS[shot.weaponId].visual
  const time = performance.now() * 0.001

  shot.trail.forEach((point, index, trail) => {
    const strength = (index + 1) / trail.length
    context.globalAlpha = strength * 0.55
    context.fillStyle = visual.trailColor
    if (visual.shape === 'diamond') {
      // heavy shell leaves a fat smoke ribbon
      const width = 2 + strength * 4
      context.fillRect(point.x - width / 2, point.y - width / 2, width, width)
    } else if (visual.shape === 'tracer') {
      context.fillRect(point.x - 1, point.y - 1, 2, index % 3 ? 2 : 5)
    } else if (visual.shape === 'star') {
      const width = 2 + strength * 5
      context.globalAlpha = strength * 0.7
      context.fillRect(point.x - width / 2, point.y - width / 2, width, width)
    } else {
      context.fillRect(point.x - 1, point.y - 1, 3, 3)
    }
  })
  context.globalAlpha = 1

  context.save()
  context.translate(shot.x, shot.y)
  context.shadowColor = visual.glowColor
  context.shadowBlur = visual.shape === 'star' ? 22 : 12
  context.fillStyle = visual.projectileColor

  if (visual.shape === 'diamond') {
    context.rotate(shot.age * 9)
    context.beginPath()
    context.moveTo(0, -7)
    context.lineTo(6, 0)
    context.lineTo(0, 7)
    context.lineTo(-6, 0)
    context.closePath()
    context.fill()
    context.strokeStyle = visual.glowColor
    context.lineWidth = 1.5
    context.stroke()
  } else if (visual.shape === 'tracer') {
    const heading = Math.atan2(shot.velocityY, shot.velocityX)
    context.rotate(heading)
    context.fillRect(-8, -2, 16, 4)
    context.fillStyle = '#ffffff'
    context.fillRect(2, -1, 6, 2)
  } else if (visual.shape === 'drill') {
    context.rotate(shot.age * 14)
    context.beginPath()
    context.moveTo(0, -8)
    context.lineTo(7, 5)
    context.lineTo(-7, 5)
    context.closePath()
    context.fill()
    context.strokeStyle = '#4a3320'
    context.lineWidth = 2
    context.beginPath()
    context.moveTo(-5, 1)
    context.lineTo(5, 1)
    context.stroke()
  } else if (visual.shape === 'star') {
    const pulse = 1 + Math.sin(time * 18) * 0.25
    context.rotate(shot.age * 5)
    context.beginPath()
    for (let point = 0; point < 8; point += 1) {
      const angle = (point * Math.PI) / 4
      const radius = (point % 2 ? 3.5 : 9) * pulse
      context.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius)
    }
    context.closePath()
    context.fill()
  } else {
    context.beginPath()
    context.arc(0, 0, PROJECTILE_RADIUS, 0, Math.PI * 2)
    context.fill()
  }
  context.restore()
}

function drawExplosion(context: CanvasRenderingContext2D, explosion: ExplosionState) {
  const visual = WEAPONS[explosion.weaponId].visual
  const palette = visual.particleColors
  const progress = explosion.age / explosion.duration
  const radius = explosion.radius * Math.min(1, progress * 1.75)
  const fade = Math.max(0, 1 - progress)
  const flash = Math.max(0, 1 - progress * 3.6)
  const mid = Math.max(0, 1 - Math.abs(progress - 0.22) * 3.2)
  const colorAt = (index: number) => palette[index % palette.length]

  const polygon = (points: number, outer: number, inner = outer) => {
    context.beginPath()
    for (let point = 0; point < points; point += 1) {
      const angle = (point * Math.PI * 2) / points - Math.PI / 2
      const distance = point % 2 ? inner : outer
      const x = explosion.x + Math.cos(angle) * distance
      const y = explosion.y + Math.sin(angle) * distance
      point ? context.lineTo(x, y) : context.moveTo(x, y)
    }
    context.closePath()
  }

  context.save()

  if (flash > 0.05) {
    context.globalAlpha = flash * 0.9
    const bloom = context.createRadialGradient(
      explosion.x,
      explosion.y,
      0,
      explosion.x,
      explosion.y,
      radius * 2.35,
    )
    bloom.addColorStop(0, '#ffffff')
    bloom.addColorStop(0.18, visual.coreColor)
    bloom.addColorStop(0.4, colorAt(1))
    bloom.addColorStop(0.62, visual.glowColor)
    bloom.addColorStop(0.82, colorAt(3))
    bloom.addColorStop(1, 'rgba(0,0,0,0)')
    context.fillStyle = bloom
    context.beginPath()
    context.arc(explosion.x, explosion.y, radius * 2.35, 0, Math.PI * 2)
    context.fill()
  }

  for (let wave = 0; wave < visual.shockwaves + 2; wave += 1) {
    const waveProgress = Math.min(1, Math.max(0, progress * 1.9 - wave * 0.1))
    if (waveProgress <= 0) continue
    const ringRadius = radius * (0.5 + wave * 0.42) * (0.3 + waveProgress * 1.05)
    context.globalAlpha = fade * (0.62 - wave * 0.08) * (1 - waveProgress * 0.65)
    context.strokeStyle = wave % 3 === 0 ? '#ffffff' : colorAt(wave + 1)
    context.lineWidth = Math.max(2, (10 - wave * 1.2) * fade)
    context.shadowColor = colorAt(wave)
    context.shadowBlur = 26 * fade
    context.beginPath()
    context.arc(explosion.x, explosion.y, ringRadius, 0, Math.PI * 2)
    context.stroke()
  }
  context.shadowBlur = 0
  context.globalAlpha = fade

  if (explosion.weaponId === 'basic') {
    const fire = context.createRadialGradient(
      explosion.x,
      explosion.y,
      0,
      explosion.x,
      explosion.y,
      radius * 1.15,
    )
    fire.addColorStop(0, progress < 0.25 ? '#ffffff' : visual.coreColor)
    fire.addColorStop(0.25, colorAt(1))
    fire.addColorStop(0.45, colorAt(3))
    fire.addColorStop(0.7, colorAt(5))
    fire.addColorStop(1, 'rgba(95,57,45,0)')
    context.fillStyle = fire
    context.beginPath()
    context.arc(explosion.x, explosion.y, radius * 1.15, 0, Math.PI * 2)
    context.fill()
    context.strokeStyle = colorAt(2)
    context.lineWidth = 10 * fade + 2
    context.stroke()
    context.globalAlpha = fade * 0.92
    polygon(12, radius * 1.35, radius * 0.5)
    context.fillStyle = progress < 0.3 ? colorAt(0) : colorAt(4)
    context.fill()
  } else if (explosion.weaponId === 'heavy') {
    context.fillStyle = progress < 0.3 ? colorAt(0) : colorAt(2)
    context.strokeStyle = colorAt(5)
    context.lineWidth = 6 * fade + 1
    context.shadowColor = colorAt(6)
    context.shadowBlur = 28
    polygon(8, radius * 1.2, radius * 0.42)
    context.fill()
    context.stroke()
    context.shadowBlur = 0
    context.globalAlpha = fade * 0.85
    context.strokeStyle = colorAt(3)
    context.lineWidth = 6 * fade + 1
    const spread = radius * 1.55
    context.beginPath()
    context.moveTo(explosion.x - spread, explosion.y)
    context.lineTo(explosion.x - radius * 0.35, explosion.y - radius * 0.2)
    context.moveTo(explosion.x + radius * 0.35, explosion.y + radius * 0.2)
    context.lineTo(explosion.x + spread, explosion.y)
    context.moveTo(explosion.x, explosion.y - spread)
    context.lineTo(explosion.x + radius * 0.2, explosion.y - radius * 0.35)
    context.moveTo(explosion.x - radius * 0.2, explosion.y + radius * 0.35)
    context.lineTo(explosion.x, explosion.y + spread)
    context.stroke()
    for (let wedge = 0; wedge < 8; wedge += 1) {
      const angle = (wedge / 8) * Math.PI * 2 + progress * 0.8
      context.globalAlpha = fade * 0.75
      context.fillStyle = colorAt(wedge)
      context.beginPath()
      context.moveTo(explosion.x, explosion.y)
      context.lineTo(
        explosion.x + Math.cos(angle) * radius * 1.35,
        explosion.y + Math.sin(angle) * radius * 1.35,
      )
      context.lineTo(
        explosion.x + Math.cos(angle + 0.22) * radius * 0.55,
        explosion.y + Math.sin(angle + 0.22) * radius * 0.55,
      )
      context.closePath()
      context.fill()
    }
  } else if (explosion.weaponId === 'triple') {
    context.fillStyle = progress < 0.25 ? '#ffffff' : colorAt(2)
    context.strokeStyle = colorAt(6)
    context.lineWidth = 3 * fade
    context.shadowColor = colorAt(4)
    context.shadowBlur = 26
    polygon(12, radius * 1.15, radius * 0.18)
    context.fill()
    context.stroke()
    context.shadowBlur = 0
    for (let arm = 0; arm < 10; arm += 1) {
      const angle = (arm * Math.PI) / 5 + progress * 2
      context.strokeStyle = colorAt(arm)
      context.lineWidth = 2.5 * fade
      context.beginPath()
      context.moveTo(explosion.x, explosion.y)
      let jointX = explosion.x
      let jointY = explosion.y
      for (let segment = 1; segment <= 5; segment += 1) {
        jointX += Math.cos(angle + (segment % 2 ? 0.55 : -0.55)) * radius * 0.36
        jointY += Math.sin(angle + (segment % 2 ? 0.55 : -0.55)) * radius * 0.36
        context.lineTo(jointX, jointY)
      }
      context.stroke()
    }
  } else if (explosion.weaponId === 'terrain') {
    const plumeHeight = radius * 2.2
    const plumeWidth = radius * 0.95
    const plume = context.createLinearGradient(0, explosion.y, 0, explosion.y - plumeHeight)
    plume.addColorStop(0, colorAt(5))
    plume.addColorStop(0.35, colorAt(2))
    plume.addColorStop(0.65, colorAt(0))
    plume.addColorStop(1, 'rgba(214,255,126,0)')
    context.globalAlpha = fade * 0.9
    context.fillStyle = plume
    context.beginPath()
    context.moveTo(explosion.x - plumeWidth, explosion.y)
    context.lineTo(explosion.x - plumeWidth * 0.35, explosion.y - plumeHeight * 0.45)
    context.lineTo(explosion.x - plumeWidth * 0.1, explosion.y - plumeHeight)
    context.lineTo(explosion.x + plumeWidth * 0.28, explosion.y - plumeHeight * 0.5)
    context.lineTo(explosion.x + plumeWidth, explosion.y)
    context.closePath()
    context.fill()
    const crackGrowth = Math.min(1, progress * 2.2)
    const crackCount = 22
    const flatten = 0.35
    for (let crack = 0; crack < crackCount; crack += 1) {
      const rawAngle =
        (crack / crackCount) * Math.PI * 2 +
        Math.sin(crack * 12.9898 + explosion.x * 0.01) * 0.18
      const angle = Math.atan2(Math.sin(rawAngle) * flatten, Math.cos(rawAngle))
      const reach =
        radius *
        (1.85 + ((Math.sin(crack * 7.31 + explosion.y * 0.02) + 1) / 2) * 1.5) *
        crackGrowth
      const points = [{ x: explosion.x, y: explosion.y }]
      for (let segment = 1; segment <= 4; segment += 1) {
        const bend = Math.sin(crack * 3.7 + segment * 4.91) * radius * 0.12
        const distance = reach * (segment / 4)
        points.push({
          x: explosion.x + Math.cos(angle) * distance + Math.cos(angle + Math.PI / 2) * bend,
          y: explosion.y + Math.sin(angle) * distance + Math.sin(angle + Math.PI / 2) * bend * flatten,
        })
      }
      context.strokeStyle = 'rgba(35,22,13,.9)'
      context.lineWidth = (6 - (crack % 3)) * fade
      context.beginPath()
      points.forEach((point, index) =>
        index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y),
      )
      context.stroke()
      context.strokeStyle = colorAt(crack)
      context.lineWidth = Math.max(1.5, 2.8 * fade)
      context.stroke()
      if (crack % 2 === 0) {
        const joint = points[2]
        const branchAngle = angle + (crack % 4 ? 0.55 : -0.55)
        context.beginPath()
        context.moveTo(joint.x, joint.y)
        context.lineTo(
          joint.x + Math.cos(branchAngle) * reach * 0.32,
          joint.y + Math.sin(branchAngle) * reach * 0.32 * flatten,
        )
        context.stroke()
      }
    }
    for (let ring = 1; ring <= 4; ring += 1) {
      const ringReach = radius * (0.55 + ring * 0.58) * crackGrowth
      context.strokeStyle = colorAt(ring + 2)
      context.lineWidth = Math.max(1, (3.5 - ring * 0.5) * fade)
      const segments = 28
      for (let segment = 0; segment < segments; segment += 1) {
        if ((segment * 7 + ring * 5) % 9 === 0) continue
        const from = (segment / segments) * Math.PI * 2
        const to = ((segment + 1) / segments) * Math.PI * 2
        const wobble = 1 + Math.sin(segment * 5.17 + ring * 2.3) * 0.09
        context.beginPath()
        context.moveTo(
          explosion.x + Math.cos(from) * ringReach * wobble,
          explosion.y + Math.sin(from) * ringReach * flatten * wobble,
        )
        context.lineTo(
          explosion.x + Math.cos(to) * ringReach * wobble,
          explosion.y + Math.sin(to) * ringReach * flatten * wobble,
        )
        context.stroke()
      }
    }
  } else {
    const columnHeight = radius * 2.85 * Math.min(1, progress * 1.7)
    const column = context.createLinearGradient(0, explosion.y, 0, explosion.y - columnHeight)
    column.addColorStop(0, colorAt(2))
    column.addColorStop(0.3, colorAt(3))
    column.addColorStop(0.55, colorAt(4))
    column.addColorStop(0.8, colorAt(1))
    column.addColorStop(1, 'rgba(255,224,138,0)')
    context.fillStyle = column
    const columnWidth = radius * (0.72 - progress * 0.2)
    context.beginPath()
    context.moveTo(explosion.x - columnWidth, explosion.y)
    context.lineTo(explosion.x - columnWidth * 0.28, explosion.y - columnHeight)
    context.lineTo(explosion.x + columnWidth * 0.34, explosion.y - columnHeight * 0.82)
    context.lineTo(explosion.x + columnWidth, explosion.y)
    context.closePath()
    context.fill()
    context.shadowColor = colorAt(3)
    context.shadowBlur = 36
    context.fillStyle = progress < 0.25 ? '#ffffff' : colorAt(2)
    polygon(18, radius * 1.35, radius * 0.26)
    context.fill()
    context.shadowBlur = 0
    for (let ray = 0; ray < 16; ray += 1) {
      const angle = (ray * Math.PI) / 8 + progress * 0.55
      context.strokeStyle = colorAt(ray)
      context.lineWidth = 3.5 * fade
      context.globalAlpha = fade * (0.55 + (ray % 2) * 0.4)
      context.beginPath()
      context.moveTo(
        explosion.x + Math.cos(angle) * radius * 0.2,
        explosion.y + Math.sin(angle) * radius * 0.2,
      )
      context.lineTo(
        explosion.x + Math.cos(angle) * radius * (1.45 + mid * 0.4),
        explosion.y + Math.sin(angle) * radius * (1.45 + mid * 0.4),
      )
      context.stroke()
    }
  }

  explosion.particles.forEach((particle) => {
    const lifeRatio = Math.max(0, particle.life / particle.maxLife)
    context.globalAlpha = lifeRatio * fade
    if (particle.kind === 'smoke') {
      context.fillStyle = particle.color
      context.globalAlpha = lifeRatio * fade * 0.38
      context.beginPath()
      context.arc(particle.x, particle.y, particle.size * (1.35 - lifeRatio * 0.3), 0, Math.PI * 2)
      context.fill()
    } else if (particle.kind === 'spark') {
      context.strokeStyle = particle.color
      context.lineWidth = Math.max(1.2, particle.size * 0.85)
      context.shadowColor = particle.color
      context.shadowBlur = 12
      const tipX = particle.x - particle.velocityX * 0.02
      const tipY = particle.y - particle.velocityY * 0.02
      context.beginPath()
      context.moveTo(tipX, tipY)
      context.lineTo(particle.x, particle.y)
      context.stroke()
      context.shadowBlur = 0
    } else if (particle.kind === 'shard') {
      context.fillStyle = particle.color
      context.shadowColor = particle.color
      context.shadowBlur = 8
      context.beginPath()
      context.moveTo(particle.x, particle.y - particle.size)
      context.lineTo(particle.x + particle.size * 0.7, particle.y + particle.size * 0.4)
      context.lineTo(particle.x - particle.size * 0.7, particle.y + particle.size * 0.4)
      context.closePath()
      context.fill()
      context.shadowBlur = 0
    } else {
      context.fillStyle = particle.color
      context.shadowColor = particle.color
      context.shadowBlur = 10
      context.fillRect(
        particle.x - particle.size / 2,
        particle.y - particle.size / 2,
        particle.size,
        particle.size,
      )
      context.shadowBlur = 0
    }
  })
  context.restore()
}

function drawEffects(context: CanvasRenderingContext2D, effects: VisualEffect[]) {
  effects.forEach((effect) => {
    const progress = effect.age / effect.duration
    const fade = Math.max(0, 1 - progress)
    context.save()
    if (effect.kind === 'muzzleFlash') {
      context.translate(effect.x, effect.y)
      context.rotate(effect.angle ?? 0)
      context.globalAlpha = fade
      context.fillStyle = effect.color
      context.shadowColor = effect.color
      context.shadowBlur = 14
      const length = 20 * (1 - progress * 0.4)
      context.beginPath()
      context.moveTo(0, -5)
      context.lineTo(length, 0)
      context.lineTo(0, 5)
      context.closePath()
      context.fill()
    } else if (effect.kind === 'shieldHit') {
      // hex-cell flash where the shield absorbed damage
      context.globalAlpha = fade * 0.9
      context.strokeStyle = effect.color
      context.lineWidth = 2.5
      const size = 14 + progress * 16
      context.beginPath()
      for (let corner = 0; corner < 6; corner += 1) {
        const angle = (corner * Math.PI) / 3 - Math.PI / 6
        const cornerX = effect.x + Math.cos(angle) * size
        const cornerY = effect.y + Math.sin(angle) * size
        corner ? context.lineTo(cornerX, cornerY) : context.moveTo(cornerX, cornerY)
      }
      context.closePath()
      context.stroke()
      context.globalAlpha = fade * 0.3
      context.fillStyle = effect.color
      context.fill()
    } else if (effect.kind === 'repairHeal') {
      context.globalAlpha = fade * 0.8
      context.strokeStyle = effect.color
      context.lineWidth = 2
      context.beginPath()
      context.arc(effect.x, effect.y - 4, 24 + progress * 20, Math.PI * 0.95, Math.PI * 2.05)
      context.stroke()
      // rising crosses
      context.fillStyle = effect.color
      for (let cross = 0; cross < 5; cross += 1) {
        const offsetX = Math.sin(cross * 2.3 + progress * 5) * 20
        const riseY = effect.y - 6 - progress * 52 - cross * 9
        context.globalAlpha = fade * (0.9 - cross * 0.14)
        context.fillRect(effect.x + offsetX - 1.5, riseY - 5, 3, 10)
        context.fillRect(effect.x + offsetX - 5, riseY - 1.5, 10, 3)
      }
    } else if (effect.kind === 'teleportOut' || effect.kind === 'teleportIn') {
      const grow = effect.kind === 'teleportIn' ? fade : progress
      // vertical warp beam
      const beam = context.createLinearGradient(0, effect.y - 120, 0, effect.y + 14)
      beam.addColorStop(0, 'rgba(192,132,252,0)')
      beam.addColorStop(0.7, effect.color)
      beam.addColorStop(1, 'rgba(255,255,255,.9)')
      context.globalAlpha = fade * 0.85
      context.fillStyle = beam
      const beamWidth = 8 + grow * 26
      context.fillRect(effect.x - beamWidth / 2, effect.y - 120, beamWidth, 134)
      // lightning zigzags around the beam
      context.strokeStyle = '#e9d5ff'
      context.lineWidth = 1.5
      for (let bolt = 0; bolt < 3; bolt += 1) {
        const side = bolt % 2 ? 1 : -1
        context.beginPath()
        context.moveTo(effect.x + side * beamWidth * 0.7, effect.y - 100 + bolt * 18)
        context.lineTo(effect.x + side * beamWidth * 1.3, effect.y - 78 + bolt * 18)
        context.lineTo(effect.x + side * beamWidth * 0.5, effect.y - 58 + bolt * 18)
        context.stroke()
      }
      // expanding ground ring
      context.globalAlpha = fade * 0.7
      context.strokeStyle = effect.color
      context.lineWidth = 3 * fade
      context.beginPath()
      context.ellipse(effect.x, effect.y + 10, 12 + progress * 42, 5 + progress * 14, 0, 0, Math.PI * 2)
      context.stroke()
    } else if (effect.kind === 'megaFlash') {
      // full-screen white flash right after a mega detonation
      context.globalAlpha = fade * 0.55
      context.fillStyle = '#fff'
      context.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT)
    } else if (effect.kind === 'perfectShot') {
      context.globalAlpha = fade * 0.35
      context.fillStyle = '#fff8c8'
      context.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT)
      context.globalAlpha = fade
      context.strokeStyle = '#ffe566'
      context.fillStyle = '#fff7b0'
      context.shadowColor = '#ffcf33'
      context.shadowBlur = 36
      context.lineWidth = 4
      const burst = 36 + progress * 110
      context.beginPath()
      context.arc(effect.x, effect.y, burst, 0, Math.PI * 2)
      context.stroke()
      for (let ring = 0; ring < 3; ring += 1) {
        context.globalAlpha = fade * (0.7 - ring * 0.18)
        context.beginPath()
        context.arc(effect.x, effect.y, burst * (0.45 + ring * 0.28), 0, Math.PI * 2)
        context.stroke()
      }
      context.globalAlpha = fade
      for (let ray = 0; ray < 16; ray += 1) {
        const angle = (ray / 16) * Math.PI * 2 + progress * 2.4
        context.beginPath()
        context.moveTo(effect.x + Math.cos(angle) * 14, effect.y + Math.sin(angle) * 14)
        context.lineTo(
          effect.x + Math.cos(angle) * burst * 1.25,
          effect.y + Math.sin(angle) * burst * 1.25,
        )
        context.stroke()
      }
      context.shadowBlur = 0
      context.font = 'bold 34px monospace'
      context.textAlign = 'center'
      context.fillStyle = '#fff4a8'
      context.strokeStyle = '#7a4a00'
      context.lineWidth = 5
      context.globalAlpha = fade
      context.strokeText('PERFECT HIT!', effect.x, effect.y - 48 - progress * 36)
      context.fillText('PERFECT HIT!', effect.x, effect.y - 48 - progress * 36)
      context.font = 'bold 16px monospace'
      context.fillStyle = '#ffe08a'
      context.fillText('100% 명중', effect.x, effect.y - 22 - progress * 24)
    }
    context.restore()
  })
  context.globalAlpha = 1
}

function makeTerrainCanvas(state: GameState) {
  const canvas = document.createElement('canvas')
  canvas.width = state.terrain.width
  canvas.height = state.terrain.height
  const context = canvas.getContext('2d')
  if (!context) return canvas
  const image = context.createImageData(canvas.width, canvas.height)
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      if (!state.terrain.mask[y * canvas.width + x]) continue
      const offset = (y * canvas.width + x) * 4
      const depth = Math.max(0, y - state.terrain.heights[x])
      const fleck = (x * 13 + y * 7) % 31 === 0
      image.data[offset] = fleck ? 91 : Math.min(90, 38 + depth * 0.09)
      image.data[offset + 1] = fleck ? 105 : Math.min(105, 67 + depth * 0.05)
      image.data[offset + 2] = fleck ? 67 : Math.min(62, 38 + depth * 0.03)
      image.data[offset + 3] = 255
    }
  }
  context.putImageData(image, 0, 0)
  context.strokeStyle = '#b8db68'
  context.lineWidth = 3
  context.beginPath()
  state.terrain.heights.forEach((height, x) =>
    x ? context.lineTo(x, height) : context.moveTo(x, height),
  )
  context.stroke()
  return canvas
}

function drawWeather(context: CanvasRenderingContext2D, state: GameState) {
  const time = performance.now() * 0.001
  if (state.weather === 'rain') {
    context.save()
    context.strokeStyle = 'rgba(145,210,255,.48)'
    context.lineWidth = 1.2
    const slant = state.wind * 0.42
    for (let drop = 0; drop < 115; drop += 1) {
      const speed = 360 + (drop % 9) * 18
      const x = ((drop * 97 + time * slant * 22) % (WORLD_WIDTH + 100)) - 50
      const y = (drop * 61 + time * speed) % WORLD_HEIGHT
      context.beginPath()
      context.moveTo(x, y)
      context.lineTo(x + slant, y + 13)
      context.stroke()
    }
    context.restore()
  } else if (state.weather === 'snow') {
    context.save()
    context.fillStyle = 'rgba(235,248,255,.72)'
    for (let flake = 0; flake < 85; flake += 1) {
      const size = 1 + (flake % 4) * 0.55
      const x =
        (flake * 137 + Math.sin(time * 0.8 + flake) * 18 + time * state.wind * 2) %
        WORLD_WIDTH
      const y = (flake * 79 + time * (28 + (flake % 7) * 5)) % WORLD_HEIGHT
      context.globalAlpha = 0.45 + (flake % 5) * 0.1
      context.beginPath()
      context.arc(x, y, size, 0, Math.PI * 2)
      context.fill()
    }
    context.restore()
  }

  const lightning = state.lightning
  if (!lightning) return
  const strikeY = state.terrain.heights[Math.max(0, Math.min(state.terrain.width - 1, Math.round(lightning.x)))]
  context.save()
  if (lightning.age < lightning.strikeAt) {
    const warning = lightning.age / lightning.strikeAt
    context.globalAlpha = 0.25 + Math.sin(lightning.age * 22) * 0.16
    context.strokeStyle = '#fff59d'
    context.lineWidth = 2
    context.setLineDash([8, 8])
    context.beginPath()
    context.moveTo(lightning.x, 20)
    context.lineTo(lightning.x, strikeY)
    context.stroke()
    context.setLineDash([])
    context.globalAlpha = 0.5 + warning * 0.3
    context.strokeStyle = '#ffe66d'
    context.beginPath()
    context.ellipse(lightning.x, strikeY, 18 + warning * 22, 6 + warning * 7, 0, 0, Math.PI * 2)
    context.stroke()
  } else {
    const strikeProgress =
      (lightning.age - lightning.strikeAt) / (lightning.duration - lightning.strikeAt)
    context.globalAlpha = Math.max(0, 1 - strikeProgress)
    context.shadowColor = '#bde8ff'
    context.shadowBlur = 18
    context.strokeStyle = '#ffffff'
    context.lineWidth = 5 - strikeProgress * 3
    context.beginPath()
    context.moveTo(lightning.x + 38, 0)
    let boltX = lightning.x + 38
    const segments = 9
    for (let segment = 1; segment <= segments; segment += 1) {
      boltX += Math.sin(segment * 9.73 + lightning.x) * 22
      context.lineTo(boltX, (strikeY * segment) / segments)
    }
    context.lineTo(lightning.x, strikeY)
    context.stroke()
    context.strokeStyle = '#7dd3fc'
    context.lineWidth = 2
    for (const side of [-1, 1]) {
      context.beginPath()
      context.moveTo(lightning.x, strikeY)
      context.lineTo(lightning.x + side * 34, strikeY - 26)
      context.lineTo(lightning.x + side * 58, strikeY - 13)
      context.stroke()
    }
  }
  context.restore()
}

function drawWorld(
  context: CanvasRenderingContext2D,
  state: GameState,
  terrain: HTMLCanvasElement,
  config: GameConfig,
  selectedTargetId: string | null,
) {
  const sky = context.createLinearGradient(0, 0, 0, WORLD_HEIGHT)
  sky.addColorStop(0, '#030716')
  sky.addColorStop(0.56, '#10284a')
  sky.addColorStop(1, '#ef7d45')
  context.fillStyle = sky
  context.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT)
  for (let index = 0; index < 70; index += 1) {
    const x = (index * 197 + state.terrain.seed * 0.13) % WORLD_WIDTH
    const y = (index * 83 + state.terrain.seed * 0.07) % (WORLD_HEIGHT * 0.48)
    context.globalAlpha = 0.45 + Math.sin(performance.now() * 0.002 + index) * 0.25
    context.fillStyle = index % 7 ? '#fff' : '#76e9ff'
    context.fillRect(Math.round(x), Math.round(y), index % 5 ? 1 : 2, 1)
  }
  context.globalAlpha = 1
  context.fillStyle = 'rgba(8,18,35,.5)'
  context.beginPath()
  const ridgeBase = WORLD_HEIGHT * 0.72
  const ridgeMid = WORLD_HEIGHT * 0.63
  context.moveTo(0, ridgeBase)
  for (let x = 0; x <= WORLD_WIDTH; x += 80) {
    context.lineTo(x, ridgeMid + Math.sin(x * 0.015) * (WORLD_HEIGHT * 0.055))
  }
  context.lineTo(WORLD_WIDTH, WORLD_HEIGHT)
  context.lineTo(0, WORLD_HEIGHT)
  context.fill()
  context.drawImage(terrain, 0, 0)

  const shooter = state.tanks[state.currentTankIndex]
  const locked = selectedTargetId
    ? state.tanks.find((tank) => tank.id === selectedTargetId && tank.alive)
    : null
  if (locked && shooter?.alive) {
    context.save()
    context.strokeStyle = 'rgba(163,230,53,.45)'
    context.lineWidth = 1.5
    context.setLineDash([8, 6])
    context.beginPath()
    context.moveTo(shooter.x, shooter.y - 8)
    context.lineTo(locked.x, locked.y - 4)
    context.stroke()
    context.setLineDash([])
    context.restore()
  }

  state.tanks.forEach((tank, index) => {
    if (tank.alive) {
      drawTank(
        context,
        tank,
        index === state.currentTankIndex,
        tank.id === selectedTargetId,
      )
    }
  })

  const aimingTank = state.tanks[state.currentTankIndex]
  if (state.phase === 'aiming' && aimingTank?.alive && aimingTank.playerType === 'human') {
    drawShortAimGuide(context, aimingTank, state.wind, state.weather)
  }

  state.projectiles.forEach((projectile) => drawProjectile(context, projectile))
  state.explosions.forEach((explosion) => drawExplosion(context, explosion))
  drawEffects(context, state.effects)
  drawWeather(context, state)
  context.globalAlpha = 1
  state.damageNumbers.forEach((number) => {
    context.globalAlpha = Math.min(1, number.life * 2)
    context.font = 'bold 24px monospace'
    context.textAlign = 'center'
    context.lineWidth = 4
    context.strokeStyle = '#531313'
    context.fillStyle = '#fff5b8'
    context.strokeText(`-${number.value}`, number.x, number.y)
    context.fillText(`-${number.value}`, number.x, number.y)
  })
  context.globalAlpha = 1
  if (config.crtEffect) {
    context.fillStyle = 'rgba(0,0,0,.09)'
    for (let y = 0; y < WORLD_HEIGHT; y += 4) context.fillRect(0, y, WORLD_WIDTH, 1)
  }
}

function windLabel(wind: number) {
  if (!wind) return '바람 없음'
  const strength = Math.abs(wind) < 10 ? '약함' : Math.abs(wind) < 20 ? '보통' : '강함'
  return `${wind < 0 ? '←' : '→'} ${Math.abs(wind)} · ${strength}`
}

function weatherKorean(weather: GameState['weather']) {
  return weather === 'rain' ? '비' : weather === 'snow' ? '눈' : '맑음'
}

function accuracyHint(error: number) {
  if (error <= 36) return '명중 예상'
  if (error <= 90) return '근접 · 각도 미세 조절'
  return '각도 조절 필요'
}

function computeRecommendForTarget(state: GameState, targetId: string | null) {
  const shooter = getCurrentTank(state)
  const target =
    (targetId && state.tanks.find((tank) => tank.id === targetId && tank.alive)) ||
    null
  if (!target) return null
  if (
    target.id === shooter.id ||
    (shooter.team !== null && target.team === shooter.team)
  ) {
    return null
  }
  const result = recommendPowerForTarget(
    shooter,
    target,
    state.wind,
    state.weather,
    shooter.turretAngle,
    state.terrain,
  )
  const windPart =
    state.wind === 0
      ? '바람 없음'
      : `바람 ${state.wind < 0 ? '←' : '→'}${Math.abs(state.wind)} ×${result.windFactor.toFixed(2)}`
  const weatherPart =
    state.weather === 'clear'
      ? '맑음'
      : `${weatherKorean(state.weather)} · 중력 ×${result.gravityFactor.toFixed(2)}`
  const bias =
    result.windBias === 0
      ? '보정 없음'
      : `바람·날씨 보정 ${result.windBias > 0 ? '+' : ''}${result.windBias}`
  return {
    targetId: target.id,
    targetName: target.nickname,
    power: result.power,
    error: result.error,
    powerCalm: result.powerCalm,
    windBias: result.windBias,
    summary: `${windPart} · ${weatherPart}`,
    biasLabel: bias,
    hint: accuracyHint(result.error),
  }
}

function pickTankAtWorldPoint(state: GameState, worldX: number, worldY: number, shooter: TankState) {
  const hitRadius = 48
  const candidates = state.tanks.filter((tank) => {
    if (!tank.alive || tank.id === shooter.id) return false
    if (shooter.team !== null && tank.team === shooter.team) return false
    return Math.hypot(tank.x - worldX, tank.y - 4 - worldY) <= hitRadius
  })
  return candidates.sort(
    (a, b) =>
      Math.hypot(a.x - worldX, a.y - worldY) - Math.hypot(b.x - worldX, b.y - worldY),
  )[0] ?? null
}

function WeatherIndicator({ weather }: { weather: GameState['weather'] }) {
  if (weather === 'rain') {
    return <span className="flex items-center gap-1 text-sky-200" title="탄도 낙하 증가 · 지형 붕괴 가속 · 무작위 낙뢰">
      <CloudRain className="h-3 w-3" /> 비 · 낙뢰
    </span>
  }
  if (weather === 'snow') {
    return <span className="flex items-center gap-1 text-cyan-100" title="바람 영향 감소 · 지형 붕괴 둔화">
      <Snowflake className="h-3 w-3" /> 눈
    </span>
  }
  return <span className="flex items-center gap-1 text-yellow-200" title="추가 날씨 영향 없음">
    <Sun className="h-3 w-3" /> 맑음
  </span>
}

function battlePlayersFromState(state: GameState, source: CampaignPlayer[]) {
  return source.map((player) => {
    const tank = state.tanks.find((entry) => entry.id === player.id)
    if (!tank) return player
    return {
      ...player,
      coins: tank.coins,
      weapons: { ...tank.weapons },
      equipment: { ...tank.equipment },
    }
  })
}

function buildRoundResult(state: GameState): RoundResult {
  const ordered = [...state.tanks].sort(
    (a, b) => Number(b.alive) - Number(a.alive) || b.health - a.health || b.damageDealt - a.damageDealt,
  )
  const stats: PlayerRoundStats[] = ordered.map((tank, index) => ({
    playerId: tank.id,
    rank: index + 1,
    damageDealt: tank.damageDealt,
    damageTaken: tank.damageTaken,
    kills: tank.roundKills,
    coinsEarned:
      300 +
      tank.damageDealt * 3 +
      tank.kills * 400 +
      (state.winnerIds.includes(tank.id) ? 1000 : 0) +
      Math.max(0, state.tanks.length - index - 1) * 150,
    usedWeapons: { ...tank.weaponUses },
  }))
  return {
    round: state.round,
    winnerId: state.winnerId,
    winnerIds: [...state.winnerIds],
    stats,
  }
}

export function TankGameCanvas({
  config,
  players,
  round,
  onRoundEnd,
  onMainMenu,
  online,
  seed,
}: TankGameCanvasProps) {
  const initialStateRef = useRef<GameState | null>(null)
  if (!initialStateRef.current) {
    initialStateRef.current = createGameState(seed, config, players, round)
  }
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const gameRef = useRef<GameState>(initialStateRef.current)
  const terrainCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const terrainRevisionRef = useRef(-1)
  const terrainLastPaintRef = useRef(0)
  const cameraXRef = useRef(0)
  const cameraYRef = useRef(0)
  const viewScaleRef = useRef(1)
  const lockedTargetIdRef = useRef<string | null>(null)
  const [lockedTargetId, setLockedTargetId] = useState<string | null>(null)
  const aiPlanRef = useRef<AiPlan | null>(null)
  const fireRef = useRef<
    (options?: {
      perfectShot?: boolean
      assistStrength?: number
      assistTargetId?: string | null
    }) => void
  >(() => undefined)
  const beginChargeRef = useRef<() => void>(() => undefined)
  const releaseChargeRef = useRef<() => void>(() => undefined)
  const gaugeFillRef = useRef<HTMLDivElement>(null)
  const chargeRef = useRef({
    active: false,
    elapsed: 0,
    power: 58,
    wave: 0,
    recommended: 0,
    hasRecommend: false,
    spaceHeld: false,
    cycleSeconds: 2.1,
    riseRatio: 0.5,
  })
  const [chargeUi, setChargeUi] = useState({
    active: false,
    power: 58,
    fillRatio: 0,
    recommended: 0,
    hasRecommend: false,
    perfectZone: false,
    hitChance: 0,
    cycleLabel: '',
    targetName: '',
    weatherSummary: '',
    biasLabel: '',
    hint: '',
  })
  const pickAugmentRef = useRef<(augmentId: AugmentId) => void>(() => undefined)
  const onlineCommandHandlerRef = useRef<(command: OnlineCommand) => void>(() => undefined)
  const roundReportedRef = useRef(false)
  const collapseRegionsRef = useRef<Array<{ minX: number; maxX: number }>>([])
  const [snapshot, setSnapshot] = useState<GameSnapshot>(() =>
    createSnapshot(initialStateRef.current as GameState),
  )
  const [paused, setPaused] = useState(false)

  const sync = useCallback(() => setSnapshot(createSnapshot(gameRef.current)), [])
  const applyTargetRecommend = useCallback(
    (targetId: string | null, options: { syncAim?: boolean } = {}) => {
      const state = gameRef.current
      const advise = computeRecommendForTarget(state, targetId)
      lockedTargetIdRef.current = advise?.targetId ?? null
      setLockedTargetId(advise?.targetId ?? null)
      if (!advise) {
        chargeRef.current.recommended = 0
        chargeRef.current.hasRecommend = false
        setChargeUi((current) => ({
          ...current,
          recommended: 0,
          hasRecommend: false,
          perfectZone: false,
          hitChance: 0,
          targetName: '',
          weatherSummary: '',
          biasLabel: '',
          hint: '적 탱크를 클릭/터치하면 추천 파워 표시',
        }))
        return
      }
      chargeRef.current.recommended = advise.power
      chargeRef.current.hasRecommend = true
      setChargeUi((current) => ({
        ...current,
        recommended: advise.power,
        hasRecommend: true,
        perfectZone:
          current.active &&
          Math.abs(current.power - advise.power) <= PERFECT_POWER_WINDOW,
        hitChance: current.active
          ? timingHitChancePercent(current.power, advise.power)
          : 0,
        targetName: advise.targetName,
        weatherSummary: advise.summary,
        biasLabel: advise.biasLabel,
        hint: advise.hint,
      }))
      if (options.syncAim) sync()
    },
    [sync],
  )
  const sendOnlineCommand = useCallback(
    (command: OnlineCommand) => {
      if (!online) return
      void online.channel.send({
        type: 'broadcast',
        event: `game-command-${round}`,
        payload: command,
      })
    },
    [online, round],
  )

  const resetRound = useCallback(() => {
    gameRef.current = createGameState(seed, config, players, round)
    terrainRevisionRef.current = -1
    terrainLastPaintRef.current = 0
    cameraXRef.current = 0
    cameraYRef.current = 0
    aiPlanRef.current = null
    roundReportedRef.current = false
    collapseRegionsRef.current = []
    setPaused(false)
    sync()
  }, [config, players, round, seed, sync])

  const aim = useCallback(
    (key: 'turretAngle' | 'power', value: number) => {
      const state = gameRef.current
      const tank = getCurrentTank(state)
      if (
        state.phase !== 'aiming' ||
        tank.playerType !== 'human' ||
        paused ||
        chargeRef.current.active ||
        (online && tank.id !== online.localPlayerId)
      ) return
      tank[key] =
        key === 'turretAngle'
          ? Math.max(0, Math.min(180, value))
          : Math.max(MIN_POWER, Math.min(MAX_POWER, value))
      if (key === 'turretAngle') {
        applyTargetRecommend(lockedTargetIdRef.current)
      }
      sync()
      sendOnlineCommand({ kind: 'aim', playerId: tank.id, key, value: tank[key] })
    },
    [applyTargetRecommend, online, paused, sendOnlineCommand, sync],
  )

  const selectWeapon = useCallback(
    (weaponId: WeaponId) => {
      const state = gameRef.current
      const tank = getCurrentTank(state)
      if (
        state.phase !== 'aiming' ||
        tank.playerType !== 'human' ||
        (online && tank.id !== online.localPlayerId) ||
        (!WEAPONS[weaponId].unlimited && tank.weapons[weaponId] <= 0)
      ) {
        return
      }
      tank.selectedWeapon = weaponId
      sync()
      sendOnlineCommand({ kind: 'selectWeapon', playerId: tank.id, weaponId })
    },
    [online, sendOnlineCommand, sync],
  )

  const useRepair = useCallback(() => {
    const state = gameRef.current
    const tank = getCurrentTank(state)
    if (
      state.phase !== 'aiming' ||
      tank.playerType !== 'human' ||
      (online && tank.id !== online.localPlayerId) ||
      tank.equipment.repair <= 0 ||
      tank.health >= config.startingHealth
    ) {
      return
    }
    tank.equipment.repair -= 1
    tank.health = Math.min(tank.maxHealth, tank.health + 30)
    state.effects.push({
      kind: 'repairHeal',
      x: tank.x,
      y: tank.y - 6,
      age: 0,
      duration: 1.8,
      color: EQUIPMENT.repair.theme,
    })
    state.logs.push(`${tank.nickname} 수리 키트 사용 · 공격 대신 턴 종료`)
    sendOnlineCommand({ kind: 'repair', playerId: tank.id })
    nextTurn(state)
    sync()
  }, [online, sendOnlineCommand, sync])

  const useTeleport = useCallback(() => {
    const state = gameRef.current
    const tank = getCurrentTank(state)
    if (
      state.phase !== 'aiming' ||
      tank.playerType !== 'human' ||
      (online && tank.id !== online.localPlayerId) ||
      tank.equipment.teleport <= 0
    ) {
      return
    }
    tank.equipment.teleport -= 1
    state.effects.push({
      kind: 'teleportOut',
      x: tank.x,
      y: tank.y,
      age: 0,
      duration: 1.05,
      color: EQUIPMENT.teleport.theme,
    })
    tank.x = findSafeTeleportX(state, tank)
    tank.y = getTankRestingY(state.terrain, tank.x)
    state.effects.push({
      kind: 'teleportIn',
      x: tank.x,
      y: tank.y,
      age: 0,
      duration: 1.35,
      color: EQUIPMENT.teleport.theme,
    })
    state.logs.push(`${tank.nickname} 안전 지대로 순간 이동 · 턴 종료`)
    sendOnlineCommand({ kind: 'teleport', playerId: tank.id, targetX: tank.x })
    nextTurn(state)
    sync()
  }, [online, sendOnlineCommand, sync])

  useEffect(() => {
    if (!online) return
    online.channel.on(
      'broadcast',
      { event: `game-command-${round}` },
      ({ payload }) => onlineCommandHandlerRef.current(payload as OnlineCommand),
    )
    return () => {
      onlineCommandHandlerRef.current = () => undefined
    }
  }, [online, round])

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    let frameId = 0
    let previous = performance.now()
    let accumulator = 0
    let shownSecond = config.turnTimeSeconds
    let finishedElapsed = 0
    let augmentAiTimer = 0
    let lastChargeUiPower = -1
    let lastChargeUiPerfect = false
    let chargeUiAcc = 0

    const resolveAugmentPick = (augmentId: AugmentId, broadcast: boolean) => {
      const state = gameRef.current
      const tank = getCurrentTank(state)
      if (state.phase !== 'augment' || !state.augmentChoices.includes(augmentId)) return
      applyAugmentImmediate(tank, augmentId)
      const def = AUGMENTS[augmentId]
      state.logs.push(`${tank.nickname} 증강 · ${def.icon} ${def.name}`)
      state.augmentChoices = []
      state.phase = 'aiming'
      state.message = `${tank.nickname}의 차례`
      augmentAiTimer = 0
      if (broadcast) {
        sendOnlineCommand({ kind: 'pickAugment', playerId: tank.id, augmentId })
      }
      sync()
    }
    pickAugmentRef.current = (augmentId) => {
      const state = gameRef.current
      const tank = getCurrentTank(state)
      if (
        state.phase !== 'augment' ||
        tank.playerType !== 'human' ||
        paused ||
        (online && tank.id !== online.localPlayerId)
      ) {
        return
      }
      resolveAugmentPick(augmentId, true)
    }

    const launch = (
      options: {
        perfectShot?: boolean
        assistStrength?: number
        assistTargetId?: string | null
      } = {},
    ) => {
      const state = gameRef.current
      const tank = getCurrentTank(state)
      if (state.phase !== 'aiming' || !tank.alive) return
      chargeRef.current.active = false
      chargeRef.current.spaceHeld = false
      let weapon = WEAPONS[tank.selectedWeapon]
      if (!weapon.unlimited && tank.weapons[weapon.id] <= 0) {
        tank.selectedWeapon = 'basic'
        weapon = WEAPONS.basic
      }
      if (!weapon.unlimited) tank.weapons[weapon.id] -= 1
      tank.weaponUses[weapon.id] += 1

      const mods = getAugmentMods(tank.augments)
      const savedPower = tank.power
      tank.power = Math.min(MAX_POWER + 40, tank.power + mods.powerBonus)

      let assistStrength = options.assistStrength
      let assistTargetId = options.assistTargetId ?? null
      if (assistStrength === undefined) {
        const advise = computeRecommendForTarget(state, lockedTargetIdRef.current)
        if (advise) {
          assistStrength = timingAssistStrength(savedPower, advise.power)
          assistTargetId = advise.targetId
        } else {
          assistStrength = 0
          assistTargetId = null
        }
      }
      assistStrength = Math.max(0, Math.min(1, assistStrength ?? 0))
      const perfectShot = Boolean(options.perfectShot) || assistStrength >= 1

      const angleOffsets = weapon.id === 'triple' ? [-4, 0, 4] : [0]
      state.projectiles = angleOffsets.map((angleOffset) =>
        createProjectile(tank, TURRET_LENGTH, angleOffset, {
          perfectShot,
          assistStrength,
          assistTargetId,
        }),
      )
      tank.power = savedPower
      angleOffsets.forEach((angleOffset) => {
        const radians = ((tank.turretAngle + angleOffset) * Math.PI) / 180
        state.effects.push({
          kind: 'muzzleFlash',
          x: tank.x + Math.cos(radians) * TURRET_LENGTH,
          y: tank.y - 8 - Math.sin(radians) * TURRET_LENGTH,
          age: 0,
          duration: 0.32,
          color: weapon.visual.glowColor,
          angle: -radians,
        })
      })
      if (perfectShot) {
        const tip = getTurretTip(tank, TURRET_LENGTH)
        state.effects.push({
          kind: 'perfectShot',
          x: tip.x,
          y: tip.y,
          age: 0,
          duration: 1.35,
          color: '#ffe566',
        })
        state.screenShake = config.screenShake
          ? Math.max(state.screenShake, 18)
          : 0
        state.logs.push(`${tank.nickname} · PERFECT TIMING!`)
      }
      state.phase = 'flying'
      state.message = perfectShot
        ? `${tank.nickname} · PERFECT · ${weapon.name}!`
        : `${tank.nickname} · ${weapon.name} 발사!`
      state.logs.push(state.message)
      setChargeUi((current) => ({ ...current, active: false, hitChance: 0 }))
      if (gaugeFillRef.current) gaugeFillRef.current.style.width = '0%'
      lockedTargetIdRef.current = null
      setLockedTargetId(null)
      chargeRef.current.hasRecommend = false
      chargeRef.current.recommended = 0
      sync()
    }
    fireRef.current = (options) => {
      const current = getCurrentTank(gameRef.current)
      if (
        current.playerType === 'human' &&
        !paused &&
        (!online || current.id === online.localPlayerId)
      ) {
        launch(options)
        sendOnlineCommand({
          kind: 'fire',
          playerId: current.id,
          angle: current.turretAngle,
          power: current.power,
          weaponId: current.selectedWeapon,
          perfectShot: options?.perfectShot,
          assistStrength: options?.assistStrength,
          assistTargetId: options?.assistTargetId,
        })
      }
    }

    beginChargeRef.current = () => {
      const state = gameRef.current
      const tank = getCurrentTank(state)
      if (
        state.phase !== 'aiming' ||
        tank.playerType !== 'human' ||
        paused ||
        (online && tank.id !== online.localPlayerId) ||
        chargeRef.current.active
      ) {
        return
      }
      const advise = computeRecommendForTarget(state, lockedTargetIdRef.current)
      const recommended = advise?.power ?? 0
      const profile = rollChargeProfile(
        state.terrain.seed * 0.001 + state.turnNumber * 17.3 + Math.random(),
      )
      chargeRef.current = {
        active: true,
        elapsed: 0,
        power: MIN_POWER,
        wave: 0,
        recommended,
        hasRecommend: Boolean(advise),
        spaceHeld: chargeRef.current.spaceHeld,
        cycleSeconds: profile.cycleSeconds,
        riseRatio: profile.riseRatio,
      }
      tank.power = MIN_POWER
      setChargeUi((current) => ({
        ...current,
        active: true,
        power: MIN_POWER,
        fillRatio: 0,
        recommended,
        hasRecommend: Boolean(advise),
        perfectZone:
          Boolean(advise) && Math.abs(MIN_POWER - recommended) <= PERFECT_POWER_WINDOW,
        hitChance: advise ? timingHitChancePercent(MIN_POWER, recommended) : 0,
        cycleLabel: `${profile.cycleSeconds.toFixed(2)}s`,
        targetName: advise?.targetName ?? current.targetName,
        weatherSummary: advise?.summary ?? current.weatherSummary,
        biasLabel: advise?.biasLabel ?? current.biasLabel,
        hint: advise?.hint ?? '적 탱크를 먼저 선택하세요',
      }))
      if (gaugeFillRef.current) gaugeFillRef.current.style.width = '0%'
      sync()
    }

    releaseChargeRef.current = () => {
      const state = gameRef.current
      const tank = getCurrentTank(state)
      if (!chargeRef.current.active) return
      if (
        state.phase !== 'aiming' ||
        tank.playerType !== 'human' ||
        paused ||
        (online && tank.id !== online.localPlayerId)
      ) {
        chargeRef.current.active = false
        chargeRef.current.spaceHeld = false
        setChargeUi((current) => ({ ...current, active: false }))
        return
      }
      const power = chargeRef.current.power
      const recommended = chargeRef.current.recommended
      const assistStrength = chargeRef.current.hasRecommend
        ? timingAssistStrength(power, recommended)
        : 0
      const assistTargetId = lockedTargetIdRef.current
      const perfectShot = assistStrength >= 1
      // 퍼펙트 구간이면 추천 파워로 발사 → 그 각도용 계산 탄도와 일치
      tank.power = perfectShot && chargeRef.current.hasRecommend ? recommended : power
      chargeRef.current.active = false
      chargeRef.current.spaceHeld = false
      fireRef.current({ perfectShot, assistStrength, assistTargetId })
    }

    onlineCommandHandlerRef.current = (command) => {
      const state = gameRef.current
      const tank = getCurrentTank(state)
      if (command.kind === 'pickAugment') {
        if (
          state.phase !== 'augment' ||
          command.playerId !== tank.id ||
          !state.augmentChoices.includes(command.augmentId)
        ) {
          return
        }
        applyAugmentImmediate(tank, command.augmentId)
        const def = AUGMENTS[command.augmentId]
        state.logs.push(`${tank.nickname} 증강 · ${def.icon} ${def.name}`)
        state.augmentChoices = []
        state.phase = 'aiming'
        state.message = `${tank.nickname}의 차례`
        sync()
        return
      }
      if (command.playerId !== tank.id || state.phase !== 'aiming') return
      if (command.kind === 'aim') {
        tank[command.key] =
          command.key === 'turretAngle'
            ? Math.max(0, Math.min(180, command.value))
            : Math.max(10, Math.min(MAX_POWER, command.value))
        sync()
      } else if (command.kind === 'selectWeapon') {
        const weapon = WEAPONS[command.weaponId]
        if (weapon && (weapon.unlimited || tank.weapons[command.weaponId] > 0)) {
          tank.selectedWeapon = command.weaponId
          sync()
        }
      } else if (command.kind === 'fire') {
        tank.turretAngle = Math.max(0, Math.min(180, command.angle))
        tank.power = Math.max(MIN_POWER, Math.min(MAX_POWER, command.power))
        if (
          WEAPONS[command.weaponId] &&
          (WEAPONS[command.weaponId].unlimited || tank.weapons[command.weaponId] > 0)
        ) {
          tank.selectedWeapon = command.weaponId
        }
        launch({
          perfectShot: command.perfectShot,
          assistStrength: command.assistStrength,
          assistTargetId: command.assistTargetId,
        })
      } else if (command.kind === 'repair' && tank.equipment.repair > 0) {
        tank.equipment.repair -= 1
        tank.health = Math.min(tank.maxHealth, tank.health + 30)
        state.effects.push({
          kind: 'repairHeal',
          x: tank.x,
          y: tank.y - 6,
          age: 0,
          duration: 1.8,
          color: EQUIPMENT.repair.theme,
        })
        state.logs.push(`${tank.nickname} 수리 키트 사용 · 턴 종료`)
        nextTurn(state)
        sync()
      } else if (command.kind === 'teleport' && tank.equipment.teleport > 0) {
        const previousX = tank.x
        const previousY = tank.y
        tank.equipment.teleport -= 1
        tank.x = Math.max(TANK_WIDTH, Math.min(WORLD_WIDTH - TANK_WIDTH, command.targetX))
        tank.y = getTankRestingY(state.terrain, tank.x)
        state.effects.push(
          {
            kind: 'teleportOut',
            x: previousX,
            y: previousY,
            age: 0,
            duration: 1.05,
            color: EQUIPMENT.teleport.theme,
          },
          {
            kind: 'teleportIn',
            x: tank.x,
            y: tank.y,
            age: 0,
            duration: 1.35,
            color: EQUIPMENT.teleport.theme,
          },
        )
        state.logs.push(`${tank.nickname} 안전 지대로 순간 이동 · 턴 종료`)
        nextTurn(state)
        sync()
      } else if (command.kind === 'timeout') {
        state.logs.push(`${tank.nickname} 시간 초과`)
        nextTurn(state)
        sync()
      }
    }

    const explode = (
      x: number,
      y: number,
      weaponId: WeaponId,
      ownerId: string,
      options: { chain?: boolean; perfectShot?: boolean } = {},
    ) => {
      const state = gameRef.current
      const weapon = WEAPONS[weaponId]
      const owner = state.tanks.find((tank) => tank.id === ownerId)
      const mods = getAugmentMods(owner?.augments ?? [])
      const chainScale = options.chain ? 0.48 : 1
      const perfectScale = options.perfectShot && !options.chain ? 1.35 : 1
      const blastRadius = weapon.blastRadius * mods.blastMult * chainScale * (options.perfectShot && !options.chain ? 1.08 : 1)
      const terrainRadius = weapon.terrainRadius * mods.terrainMult * chainScale
      const baseDamage = Math.round(weapon.damage * mods.damageMult * chainScale * perfectScale)
      const particleBoost = options.perfectShot && !options.chain ? 1.55 : options.chain ? 0.55 : 1
      const visualScale =
        weaponId === 'mega' ? 1.7 : weaponId === 'heavy' ? 1.55 : weaponId === 'terrain' ? 1.6 : 1.45
      state.explosions.push({
        x,
        y,
        radius: blastRadius * visualScale,
        age: 0,
        duration:
          weaponId === 'mega'
            ? EXPLOSION_DURATION * 1.55
            : options.perfectShot && !options.chain
              ? EXPLOSION_DURATION * 1.4
              : options.chain
                ? EXPLOSION_DURATION * 0.75
                : EXPLOSION_DURATION,
        weaponId,
        particles: createParticles(x, y, {
          ...weapon.visual,
          particleCount: Math.round(weapon.visual.particleCount * particleBoost),
        }),
      })
      state.screenShake = config.screenShake
        ? Math.max(
            state.screenShake,
            weapon.visual.shake *
              (options.chain ? 0.55 : options.perfectShot ? 1.45 : 1),
          )
        : 0
      if (options.perfectShot && !options.chain) {
        state.effects.push({
          kind: 'perfectShot',
          x,
          y,
          age: 0,
          duration: 1.55,
          color: '#ffe566',
        })
        state.effects.push({
          kind: 'megaFlash',
          x,
          y,
          age: 0,
          duration: 0.55,
          color: '#fff8c8',
        })
      } else if (weaponId === 'mega' && !options.chain) {
        state.effects.push({
          kind: 'megaFlash',
          x,
          y,
          age: 0,
          duration: 0.72,
          color: '#ffffff',
        })
      } else if (!options.chain) {
        state.effects.push({
          kind: 'muzzleFlash',
          x,
          y,
          age: 0,
          duration: 0.28,
          color: weapon.visual.coreColor,
          angle: -Math.PI / 2,
        })
      }
      const collapseRegion =
        weaponId === 'terrain'
          ? fractureTerrain(state.terrain, x, y, terrainRadius)
          : carveTerrainCircle(state.terrain, x, y, terrainRadius)
      collapseRegionsRef.current.push(collapseRegion)
      state.tanks.forEach((tank) => {
        if (!tank.alive) return
        if (
          owner &&
          owner.id !== tank.id &&
          owner.team !== null &&
          owner.team === tank.team
        ) {
          return
        }
        if (owner && owner.id === tank.id && mods.selfDamageImmune) return
        const rawDamage = calculateBlastDamage({ x, y }, tank, blastRadius, baseDamage)
        if (!rawDamage) return
        const directHit = tankHit(x, y, tank)
        let tacticalDamage = Math.round(
          rawDamage + (directHit ? weapon.directHitBonus * mods.directHitMult * chainScale : 0),
        )
        const isCrit =
          !options.chain &&
          deterministicWeatherValue(
            state.terrain.seed,
            state.turnNumber + Math.floor(x) + Math.floor(y) * 17,
            71,
          ) < mods.critChance
        if (isCrit) tacticalDamage = Math.round(tacticalDamage * 2)
        const wasAlive = tank.alive
        const shieldBefore = tank.shield
        const healthDamage = applyDamage(tank, tacticalDamage, weapon.shieldPiercing)
        if (shieldBefore > tank.shield) {
          state.effects.push({
            kind: 'shieldHit',
            x: tank.x + (x > tank.x ? 16 : -16),
            y: tank.y - 14,
            age: 0,
            duration: 0.85,
            color: EQUIPMENT.shield.theme,
          })
        }
        if (owner && owner.id !== tank.id) {
          owner.damageDealt += healthDamage
          if (mods.vampRatio > 0 && healthDamage > 0) {
            const heal = Math.round(healthDamage * mods.vampRatio)
            owner.health = Math.min(owner.maxHealth, owner.health + heal)
          }
        }
        if (healthDamage > 0 && weapon.knockback > 0) {
          const direction = Math.sign(tank.x - x) || (owner && owner.x < tank.x ? 1 : -1)
          tank.fallStartY ??= tank.y
          tank.x = Math.max(
            TANK_WIDTH,
            Math.min(
              WORLD_WIDTH - TANK_WIDTH,
              tank.x + direction * weapon.knockback * mods.knockbackMult * chainScale,
            ),
          )
        }
        if (owner && wasAlive && !tank.alive && owner.id !== tank.id) {
          owner.kills += 1
          owner.roundKills += 1
        }
        state.damageNumbers.push({
          x: tank.x,
          y: tank.y - 32,
          value: tacticalDamage,
          life: isCrit ? 1.45 : 1.15,
        })
      })
      if (!options.chain && mods.chainBlast) {
        explode(x + 48, y - 12, weaponId, ownerId, { chain: true })
        explode(x - 42, y + 8, weaponId, ownerId, { chain: true })
      }
      state.message = options.chain
        ? `${weapon.name} 연쇄 폭발!`
        : options.perfectShot
          ? `PERFECT HIT · ${weapon.name} 100%!`
          : `${weapon.name} 명중!`
      state.logs.push(state.message)
      sync()
    }

    const updateAi = (delta: number) => {
      const state = gameRef.current
      const tank = getCurrentTank(state)
      if (state.phase !== 'aiming' || tank.playerType !== 'ai') {
        aiPlanRef.current = null
        return
      }
      if (online && !online.isHost) return
      if (!aiPlanRef.current || aiPlanRef.current.turn !== state.turnNumber) {
        if (tank.health <= tank.maxHealth * 0.4 && tank.equipment.repair > 0) {
          tank.equipment.repair -= 1
          tank.health = Math.min(tank.maxHealth, tank.health + 30)
          state.effects.push({
            kind: 'repairHeal',
            x: tank.x,
            y: tank.y - 6,
            age: 0,
            duration: 1.8,
            color: EQUIPMENT.repair.theme,
          })
          state.logs.push(`${tank.nickname} 위기 수리 · 턴 종료`)
          sendOnlineCommand({ kind: 'repair', playerId: tank.id })
          nextTurn(state)
          sync()
          return
        }
        if (tank.health <= tank.maxHealth * 0.25 && tank.equipment.teleport > 0) {
          const previousX = tank.x
          const previousY = tank.y
          tank.equipment.teleport -= 1
          tank.x = findSafeTeleportX(state, tank)
          tank.y = getTankRestingY(state.terrain, tank.x)
          state.effects.push(
            {
              kind: 'teleportOut',
              x: previousX,
              y: previousY,
              age: 0,
              duration: 1.05,
              color: EQUIPMENT.teleport.theme,
            },
            {
              kind: 'teleportIn',
              x: tank.x,
              y: tank.y,
              age: 0,
              duration: 1.35,
              color: EQUIPMENT.teleport.theme,
            },
          )
          state.logs.push(`${tank.nickname} 위험 지역 이탈 · 턴 종료`)
          sendOnlineCommand({ kind: 'teleport', playerId: tank.id, targetX: tank.x })
          nextTurn(state)
          sync()
          return
        }
        const plan = planAiShot(state, tank.aiDifficulty)
        aiPlanRef.current = { ...plan, turn: state.turnNumber, elapsed: 0 }
        tank.selectedWeapon = plan.weaponId
        state.message = `${tank.nickname} 조준 계산 중...`
        sync()
      }
      const plan = aiPlanRef.current
      plan.elapsed += delta
      const speed = plan.elapsed > 2.35 ? 1000 : 55
      const angleDifference = plan.angle - tank.turretAngle
      const powerDifference = plan.power - tank.power
      tank.turretAngle += Math.sign(angleDifference) * Math.min(Math.abs(angleDifference), speed * delta)
      tank.power += Math.sign(powerDifference) * Math.min(Math.abs(powerDifference), speed * delta)
      if (
        plan.elapsed >= 1.45 &&
        (Math.abs(angleDifference) < 1.5 || plan.elapsed > 2.4) &&
        (Math.abs(powerDifference) < 1.5 || plan.elapsed > 2.4)
      ) {
        launch()
        sendOnlineCommand({
          kind: 'fire',
          playerId: tank.id,
          angle: tank.turretAngle,
          power: tank.power,
          weaponId: tank.selectedWeapon,
        })
        aiPlanRef.current = null
      }
    }

    const update = (delta: number) => {
      if (paused && !online) return
      const state = gameRef.current
      state.screenShake = Math.max(0, state.screenShake - delta * 28)
      state.effects.forEach((effect) => {
        effect.age += delta
      })
      state.effects = state.effects.filter((effect) => effect.age < effect.duration)

      state.weatherTime += delta
      if (
        state.weather === 'rain' &&
        state.phase !== 'finished' &&
        !state.lightning &&
        state.weatherTime >= state.nextLightningAt
      ) {
        state.lightning = {
          x:
            WORLD_WIDTH *
            (0.06 +
              deterministicWeatherValue(
                state.terrain.seed,
                state.weatherEventIndex,
                17,
              ) *
                0.88),
          age: 0,
          strikeAt: 1.25,
          duration: 1.9,
          struck: false,
        }
        state.logs.push('낙뢰 경고 · 점멸 지점에서 이탈하세요')
        sync()
      }
      if (state.lightning) {
        const lightning = state.lightning
        lightning.age += delta
        if (!lightning.struck && lightning.age >= lightning.strikeAt) {
          lightning.struck = true
          state.screenShake = config.screenShake ? Math.max(state.screenShake, 15) : 0
          state.tanks.forEach((tank) => {
            if (!tank.alive) return
            const distance = Math.abs(tank.x - lightning.x)
            if (distance >= 58) return
            const damage = Math.max(5, Math.round(22 * (1 - distance / 58)))
            applyDamage(tank, damage, 0.2)
            state.damageNumbers.push({
              x: tank.x,
              y: tank.y - 38,
              value: damage,
              life: 1.35,
            })
          })
          state.logs.push(`낙뢰 발생 · ${Math.round(lightning.x)} 지점`)
          if (!getCurrentTank(state).alive && state.phase === 'aiming') {
            state.phase = 'settling'
          }
          sync()
        }
        if (lightning.age >= lightning.duration) {
          state.lightning = null
          state.weatherEventIndex += 1
          state.nextLightningAt =
            state.weatherTime +
            7 +
            deterministicWeatherValue(
              state.terrain.seed,
              state.weatherEventIndex,
              29,
            ) *
              8
        }
      }

      // 파인 지형 위의 흙이 프레임마다 조금씩 흘러내리도록 부드럽게 붕괴시킨다.
      if (collapseRegionsRef.current.length) {
        const collapseSpeed = state.weather === 'rain' ? 320 : state.weather === 'snow' ? 120 : 190
        const maxDrop = Math.max(1, Math.round(collapseSpeed * delta))
        collapseRegionsRef.current = collapseRegionsRef.current.filter((region) =>
          stepTerrainCollapse(state.terrain, region.minX, region.maxX, maxDrop),
        )
      }

      state.explosions.forEach((explosion) => {
        explosion.age += delta
        explosion.particles.forEach((particle) => {
          particle.life -= delta
          particle.velocityX *= Math.max(0, 1 - particle.drag * delta * 8)
          particle.velocityY *= Math.max(0, 1 - particle.drag * delta * 4)
          particle.velocityY += particle.gravity * delta
          particle.x += particle.velocityX * delta
          particle.y += particle.velocityY * delta
          if (particle.kind === 'smoke') {
            particle.size += 12 * delta
          }
        })
      })
      state.explosions = state.explosions.filter(
        (explosion) => explosion.age < explosion.duration,
      )
      state.damageNumbers.forEach((number) => {
        number.life -= delta
        number.y -= delta * 28
      })
      state.damageNumbers = state.damageNumbers.filter((number) => number.life > 0)

      if (state.phase === 'augment') {
        const tank = getCurrentTank(state)
        if ((!online || online.isHost) && tank.playerType === 'ai' && state.augmentChoices.length) {
          augmentAiTimer += delta
          if (augmentAiTimer >= 1.05) {
            const choice = chooseAiAugment(state.augmentChoices, tank)
            resolveAugmentPick(choice, true)
          }
        }
      } else {
        augmentAiTimer = 0
        if (state.phase === 'aiming') {
          updateAi(delta)
          if (chargeRef.current.active) {
            chargeRef.current.elapsed += delta
            const wave = chargeWave(
              chargeRef.current.elapsed,
              chargeRef.current.cycleSeconds,
              chargeRef.current.riseRatio,
            )
            const power = chargePowerFromWave(wave)
            chargeRef.current.power = power
            chargeRef.current.wave = wave
            const tank = getCurrentTank(state)
            tank.power = power
            // DOM에 직접 반영 → React 리렌더 끊김/반동 없이 부드럽게
            if (gaugeFillRef.current) {
              gaugeFillRef.current.style.width = `${wave * 100}%`
            }
            const recommended = chargeRef.current.recommended
            const perfectZone =
              chargeRef.current.hasRecommend &&
              Math.abs(power - recommended) <= PERFECT_POWER_WINDOW
            const hitChance = chargeRef.current.hasRecommend
              ? timingHitChancePercent(power, recommended)
              : 0
            chargeUiAcc += delta
            // 숫자·퍼펙트 표시만 약 30fps로 갱신
            if (
              chargeUiAcc >= 1 / 30 ||
              power !== lastChargeUiPower ||
              perfectZone !== lastChargeUiPerfect
            ) {
              chargeUiAcc = 0
              lastChargeUiPower = power
              lastChargeUiPerfect = perfectZone
              setChargeUi((current) => ({
                ...current,
                active: true,
                power,
                fillRatio: wave,
                recommended,
                hasRecommend: chargeRef.current.hasRecommend,
                perfectZone,
                hitChance,
              }))
            }
          } else {
            lastChargeUiPower = -1
            chargeUiAcc = 0
          }
          state.turnTimeLeft -= delta
          const second = Math.max(0, Math.ceil(state.turnTimeLeft))
          if (second !== shownSecond) {
            shownSecond = second
            sync()
          }
          if (state.turnTimeLeft <= 0) {
            state.turnTimeLeft = 0
            if (!online || online.isHost) {
              const timedOut = getCurrentTank(state)
              state.logs.push(`${timedOut.nickname} 시간 초과`)
              if (online) {
                sendOnlineCommand({ kind: 'timeout', playerId: timedOut.id })
              }
              chargeRef.current.active = false
              chargeRef.current.spaceHeld = false
              setChargeUi((current) => ({ ...current, active: false }))
              nextTurn(state)
              aiPlanRef.current = null
              sync()
            }
          }
        } else if (state.phase === 'flying') {
          const remaining: ProjectileState[] = []
          state.projectiles.forEach((shot) => {
            const windFactor = state.weather === 'rain' ? 1.15 : state.weather === 'snow' ? 0.65 : 1
            const gravityFactor = state.weather === 'rain' ? 1.06 : state.weather === 'snow' ? 0.96 : 1
            const appliedWind = state.wind * windFactor
            const appliedGravity = GRAVITY * gravityFactor
            stepProjectile(shot, delta, appliedWind, appliedGravity)
            applyFlightAssist(shot, state, delta, appliedWind, appliedGravity)
            if (shot.age * 60 > shot.trail.length) {
              shot.trail.push({ x: shot.x, y: shot.y })
              if (shot.trail.length > 90) shot.trail.shift()
            }
            const hitTank = state.tanks.some(
              (tank) =>
                tank.alive &&
                (tank.id !== shot.ownerId || shot.age > 0.35) &&
                tankHit(shot.x, shot.y, tank),
            )
            const terrainHit = isTerrainSolid(state.terrain, shot.x, shot.y)
            const outOfBounds =
              shot.x <= 0 || shot.x >= WORLD_WIDTH || shot.y >= WORLD_HEIGHT
            if (hitTank || terrainHit || outOfBounds) {
              const impactX = outOfBounds
                ? Math.max(1, Math.min(WORLD_WIDTH - 1, shot.x))
                : shot.x
              const impactY = outOfBounds
                ? Math.max(1, Math.min(WORLD_HEIGHT - 1, shot.y))
                : shot.y
              // 폭발/데미지는 폭탄이 실제로 닿은 위치만. 퍼펙트 FX도 탱크에 맞았을 때만.
              explode(impactX, impactY, shot.weaponId, shot.ownerId, {
                perfectShot: Boolean(shot.perfectShot && hitTank),
              })
            } else {
              remaining.push(shot)
            }
          })
          state.projectiles = remaining
          if (!remaining.length) {
            state.phase = state.explosions.length ? 'exploding' : 'settling'
          }
        } else if (state.phase === 'exploding' && !state.explosions.length) {
          state.phase = 'settling'
        } else if (state.phase === 'settling') {
          // 지형이 아직 흘러내리는 중이면 탱크도 함께 계속 내려앉는다.
          let settled = collapseRegionsRef.current.length === 0
          state.tanks.forEach((tank) => {
            if (!tank.alive) return
            const target = getTankRestingY(state.terrain, tank.x, tank.y + TANK_HEIGHT / 2)
            if (target > tank.y + 1) {
              if (tank.fallStartY === null) tank.fallStartY = tank.y
              tank.y = Math.min(target, tank.y + 210 * delta)
              settled = false
            } else if (target < tank.y - 2) {
              tank.y = target
            } else if (tank.fallStartY !== null) {
              const fallDistance = tank.y - tank.fallStartY
              if (config.fallDamage && fallDistance > 80) {
                applyDamage(tank, Math.min(35, Math.round((fallDistance - 60) / 5)))
              }
              tank.fallStartY = null
            }
            if (isBelowWorld(tank)) {
              tank.health = 0
              tank.alive = false
            }
          })
          if (settled) {
            const winners = findWinningTanks(state.tanks)
            if (winners.length > 0 || state.tanks.every((tank) => !tank.alive)) {
              state.winnerIds = winners.map((tank) => tank.id)
              state.winnerId = winners[0]?.id ?? null
              state.phase = 'finished'
              state.message =
                winners.length > 1
                  ? `${winners[0].nickname} 색상 팀 라운드 승리!`
                  : winners[0]
                    ? `${winners[0].nickname} 라운드 승리!`
                    : '라운드 무승부'
              state.logs.push(state.message)
              sync()
            } else {
              nextTurn(state)
              aiPlanRef.current = null
              sync()
            }
          }
        } else if (state.phase === 'finished') {
          finishedElapsed += delta
          if (finishedElapsed >= 1.1 && !roundReportedRef.current) {
            roundReportedRef.current = true
            onRoundEnd(
              buildRoundResult(state),
              battlePlayersFromState(state, players),
            )
          }
        }
      }
    }

    const resize = () => {
      const rectangle = canvas.getBoundingClientRect()
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      const width = Math.max(1, Math.round(rectangle.width * ratio))
      const height = Math.max(1, Math.round(rectangle.height * ratio))
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
      }
    }
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    resize()

    const render = (time: number) => {
      accumulator += Math.min(MAX_FRAME_DELTA, (time - previous) / 1000)
      previous = time
      while (accumulator >= PHYSICS_STEP) {
        update(PHYSICS_STEP)
        accumulator -= PHYSICS_STEP
      }
      const state = gameRef.current
      if (
        !terrainCanvasRef.current ||
        (
          terrainRevisionRef.current !== state.terrain.revision &&
          time - terrainLastPaintRef.current >= 45
        )
      ) {
        terrainCanvasRef.current = makeTerrainCanvas(state)
        terrainRevisionRef.current = state.terrain.revision
        terrainLastPaintRef.current = time
      }
      // cover: 캔버스를 꽉 채우고 남는 검은 여백을 없앤다
      const scale = Math.max(canvas.width / WORLD_WIDTH, canvas.height / WORLD_HEIGHT)
      viewScaleRef.current = scale
      const visibleWorldWidth = canvas.width / scale
      const visibleWorldHeight = canvas.height / scale
      const currentTank = getCurrentTank(state)
      const focusX = state.projectiles.length
        ? state.projectiles.reduce((sum, projectile) => sum + projectile.x, 0) /
          state.projectiles.length
        : state.explosions.length
          ? state.explosions[state.explosions.length - 1].x
          : currentTank.x
      const focusY = state.projectiles.length
        ? state.projectiles.reduce((sum, projectile) => sum + projectile.y, 0) /
          state.projectiles.length
        : state.explosions.length
          ? state.explosions[state.explosions.length - 1].y
          : currentTank.y
      const targetCameraX = Math.max(
        0,
        Math.min(
          Math.max(0, WORLD_WIDTH - visibleWorldWidth),
          focusX - visibleWorldWidth / 2,
        ),
      )
      const targetCameraY = Math.max(
        0,
        Math.min(
          Math.max(0, WORLD_HEIGHT - visibleWorldHeight),
          focusY - visibleWorldHeight / 2,
        ),
      )
      cameraXRef.current += (targetCameraX - cameraXRef.current) * 0.11
      cameraYRef.current += (targetCameraY - cameraYRef.current) * 0.11
      const shakeX = state.screenShake ? (Math.random() - 0.5) * state.screenShake : 0
      const shakeY = state.screenShake ? (Math.random() - 0.5) * state.screenShake : 0
      context.setTransform(1, 0, 0, 1, 0, 0)
      context.clearRect(0, 0, canvas.width, canvas.height)
      context.setTransform(
        scale,
        0,
        0,
        scale,
        (-cameraXRef.current + shakeX) * scale,
        (-cameraYRef.current + shakeY) * scale,
      )
      drawWorld(
        context,
        state,
        terrainCanvasRef.current,
        config,
        lockedTargetIdRef.current,
      )
      frameId = requestAnimationFrame(render)
    }
    frameId = requestAnimationFrame(render)

    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setPaused((current) => !current)
        return
      }
      const state = gameRef.current
      const tank = getCurrentTank(state)
      if (
        state.phase !== 'aiming' ||
        tank.playerType !== 'human' ||
        paused ||
        (online && tank.id !== online.localPlayerId)
      ) return
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault()
        if (chargeRef.current.active) return
        aim('turretAngle', tank.turretAngle + (event.key === 'ArrowLeft' ? 1 : -1))
      } else if (event.code === 'Space') {
        event.preventDefault()
        if (event.repeat) return
        chargeRef.current.spaceHeld = true
        beginChargeRef.current()
      } else if (event.key === 'Tab') {
        event.preventDefault()
        if (chargeRef.current.active) return
        tank.selectedWeapon = nextAvailableWeapon(
          tank.selectedWeapon,
          tank.weapons,
          event.shiftKey ? -1 : 1,
        )
        sendOnlineCommand({
          kind: 'selectWeapon',
          playerId: tank.id,
          weaponId: tank.selectedWeapon,
        })
        sync()
      }
    }
    const keyup = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return
      if (!chargeRef.current.spaceHeld && !chargeRef.current.active) return
      event.preventDefault()
      chargeRef.current.spaceHeld = false
      releaseChargeRef.current()
    }
    window.addEventListener('keydown', keyboard)
    window.addEventListener('keyup', keyup)
    return () => {
      cancelAnimationFrame(frameId)
      observer.disconnect()
      window.removeEventListener('keydown', keyboard)
      window.removeEventListener('keyup', keyup)
    }
  }, [aim, config, onRoundEnd, online, paused, players, sendOnlineCommand, sync])

  const current = snapshot.tanks.find((tank) => tank.id === snapshot.currentTankId)
  const currentWeapon = current ? WEAPONS[current.selectedWeapon] : WEAPONS.basic
  const humanTurn = current?.playerType === 'human'
  const localTurn =
    humanTurn && (!online || current?.id === online.localPlayerId)
  const canAim = snapshot.phase === 'aiming' && localTurn && !paused
  const recommendedPower = chargeUi.recommended
  const showRecommend = chargeUi.hasRecommend
  const gaugePower = chargeUi.active ? chargeUi.power : snapshot.power
  const gaugeRatio = chargeUi.active ? chargeUi.fillRatio : powerToGaugeRatio(gaugePower)
  const recommendRatio = powerToGaugeRatio(recommendedPower)
  const perfectLow = powerToGaugeRatio(recommendedPower - PERFECT_POWER_WINDOW)
  const perfectHigh = powerToGaugeRatio(recommendedPower + PERFECT_POWER_WINDOW)
  const canPickAugment =
    snapshot.phase === 'augment' && localTurn && !paused && snapshot.augmentChoices.length > 0
  const rarityStyle = (rarity: 'common' | 'rare' | 'epic') => {
    if (rarity === 'epic') return 'border-orange-300/70 bg-[#2a1408] shadow-[0_0_24px_rgba(251,146,60,.25)]'
    if (rarity === 'rare') return 'border-cyan-300/60 bg-[#071824] shadow-[0_0_18px_rgba(34,211,238,.2)]'
    return 'border-white/20 bg-[#0b1220]'
  }

  useEffect(() => {
    lockedTargetIdRef.current = null
    setLockedTargetId(null)
    applyTargetRecommend(null)
  }, [applyTargetRecommend, snapshot.turnNumber, snapshot.currentTankId])

  useEffect(() => {
    if (!lockedTargetIdRef.current) return
    if (snapshot.phase !== 'aiming') return
    applyTargetRecommend(lockedTargetIdRef.current)
  }, [applyTargetRecommend, snapshot.angle, snapshot.wind, snapshot.weather, snapshot.phase])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== undefined && event.button !== 0) return
      const state = gameRef.current
      const tank = getCurrentTank(state)
      if (
        paused ||
        chargeRef.current.active ||
        state.phase !== 'aiming' ||
        tank.playerType !== 'human' ||
        (online && tank.id !== online.localPlayerId)
      ) {
        return
      }
      const rect = canvas.getBoundingClientRect()
      const scale = viewScaleRef.current || 1
      const canvasX = ((event.clientX - rect.left) / rect.width) * canvas.width
      const canvasY = ((event.clientY - rect.top) / rect.height) * canvas.height
      const worldX = canvasX / scale + cameraXRef.current
      const worldY = canvasY / scale + cameraYRef.current
      const hit = pickTankAtWorldPoint(state, worldX, worldY, tank)
      if (!hit) {
        applyTargetRecommend(null)
        return
      }
      applyTargetRecommend(hit.id)
      state.message = `${hit.nickname} 락온 · 추천 파워 산출`
      state.logs.push(`${hit.nickname} 타겟 · 바람·날씨 반영 추천`)
      sync()
    }
    canvas.addEventListener('pointerdown', onPointerDown)
    return () => canvas.removeEventListener('pointerdown', onPointerDown)
  }, [applyTargetRecommend, online, paused, sync])


  return (
    <main className="h-auto min-h-[100dvh] bg-[#03050b] text-cyan-50 lg:h-[100dvh] lg:min-h-0 lg:overflow-hidden">
      <div className="mx-auto flex h-full w-full max-w-[1920px] flex-col gap-2 p-2">
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border border-cyan-400/20 bg-[#07111d] px-3 py-2">
          <div>
            <p className="font-mono text-[9px] tracking-[0.25em] text-lime-300">
              ONE STEP ARTILLERY ARENA
            </p>
            <h1 className="font-mono text-sm font-black text-white sm:text-base">
              ROUND {round} / {config.totalRounds}
            </h1>
            {online && (
              <p className="font-mono text-[9px] text-cyan-300">
                ONLINE · ROOM {online.room.code} · {players.length} PLAYERS
              </p>
            )}
          </div>
          <div className="flex items-center gap-4 font-mono text-[10px] sm:text-xs">
            <span>TURN {snapshot.turnNumber}</span>
            <span className="text-cyan-100/55">
              QHD · {WORLD_WIDTH}×{WORLD_HEIGHT} · 16:9
            </span>
            {current?.team !== null && current?.team !== undefined && (
              <span style={{ color: current.color }}>TEAM {current.team + 1} TURN</span>
            )}
            <span className={snapshot.turnTimeLeft <= 5 ? 'text-red-400' : ''}>
              TIME {snapshot.turnTimeLeft}s
            </span>
            <span className="flex items-center gap-1 text-orange-200">
              <Wind className="h-3 w-3" /> {windLabel(snapshot.wind)}
            </span>
            <WeatherIndicator weather={snapshot.weather} />
            <button type="button" onClick={() => setPaused(true)}
              className="grid h-8 w-8 place-items-center border border-cyan-400/25 hover:bg-cyan-300/10"
              aria-label="일시정지"><Pause className="h-4 w-4" /></button>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 gap-2 lg:grid-cols-[minmax(0,1fr)_270px]">
          <section className="flex min-h-0 flex-col gap-2">
            <div className="relative min-h-[280px] flex-1 overflow-hidden border-2 border-cyan-400/30 bg-black lg:min-h-0">
              <canvas ref={canvasRef} aria-label="턴제 포병 전장"
                className="block h-full min-h-[280px] w-full touch-none cursor-crosshair [image-rendering:pixelated] lg:min-h-0" />
              <div className="pointer-events-none absolute left-2 top-2 border border-white/10 bg-black/60 px-2 py-1 font-mono text-[10px]">
                <span style={{ color: current?.color }}>{snapshot.message}</span>
              </div>
              {snapshot.phase === 'augment' && (
                <div className="absolute inset-0 z-20 grid place-items-center bg-black/70 p-3 backdrop-blur-[2px]">
                  <div className="w-full max-w-3xl">
                    <p className="text-center font-mono text-[10px] tracking-[0.28em] text-lime-300">
                      AUGMENT SELECT · EVERY 3 TURNS
                    </p>
                    <h2 className="mt-1 text-center font-mono text-lg font-black text-white sm:text-xl">
                      {canPickAugment ? '증강 카드 3장 중 하나를 고르세요' : '상대 증강 선택 중...'}
                    </h2>
                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      {snapshot.augmentChoices.map((augmentId) => {
                        const card = AUGMENTS[augmentId]
                        return (
                          <button
                            key={augmentId}
                            type="button"
                            disabled={!canPickAugment}
                            onClick={() => pickAugmentRef.current(augmentId)}
                            className={`border-2 p-3 text-left transition enabled:hover:-translate-y-1 enabled:hover:brightness-110 disabled:opacity-60 ${rarityStyle(card.rarity)}`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <span className="text-2xl" aria-hidden>{card.icon}</span>
                              <span className="font-mono text-[9px] uppercase tracking-wider text-cyan-100/50">
                                {card.rarity}
                              </span>
                            </div>
                            <p className="mt-2 font-mono text-sm font-black text-white">{card.name}</p>
                            <p className="mt-1 font-mono text-[10px] text-cyan-100/70">{card.description}</p>
                            <p className="mt-2 font-mono text-[9px] text-lime-300/80">{card.summary}</p>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="shrink-0 border border-cyan-400/20 bg-[#07111d] p-2">
              <div className="grid gap-2 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)_240px]">
                <label className="font-mono text-[10px] text-cyan-200">
                  <span className="flex justify-between">
                    각도 <b className="text-sm text-white">{snapshot.angle}°</b>
                  </span>
                  <input
                    type="range"
                    min="0"
                    max="180"
                    value={snapshot.angle}
                    disabled={!canAim || chargeUi.active}
                    onChange={(event) => aim('turretAngle', Number(event.target.value))}
                    className="h-8 w-full accent-cyan-300 disabled:opacity-40"
                  />
                  <span className="mt-1 block text-[9px] text-cyan-100/45">
                    ← → 각도 · 충전 중에는 고정
                  </span>
                </label>

                <div className="font-mono text-[10px] text-orange-200">
                  <div className="flex justify-between gap-2">
                    <span>
                      파워 타이밍{' '}
                      <b className={`text-sm ${chargeUi.perfectZone && chargeUi.active ? 'text-lime-300' : 'text-white'}`}>
                        {gaugePower}
                      </b>
                    </span>
                    <span className="text-right text-[9px] text-lime-300">
                      {showRecommend ? (
                        <>
                          <span className="block text-[10px] font-black">
                            {chargeUi.targetName} · 추천 {recommendedPower}
                            {chargeUi.active
                              ? chargeUi.perfectZone
                                ? ' · PERFECT 100%'
                                : ` · 추천까지 ${Math.abs(gaugePower - recommendedPower)}`
                              : ''}
                          </span>
                          <span className="block text-cyan-100/70">{chargeUi.weatherSummary}</span>
                          <span className="block text-orange-200/80">{chargeUi.biasLabel}</span>
                        </>
                      ) : (
                        <span className="text-cyan-100/55">탱크 클릭 → 추천</span>
                      )}
                    </span>
                  </div>
                  <div
                    className={`relative mt-1 h-11 overflow-hidden border ${
                      chargeUi.perfectZone && chargeUi.active
                        ? 'border-lime-300 bg-[#14220c]'
                        : 'border-orange-300/40 bg-black/50'
                    }`}
                    aria-label="파워 충전 게이지"
                  >
                    {showRecommend && (
                      <>
                        <div
                          className="absolute inset-y-0 bg-lime-300/20"
                          style={{
                            left: `${perfectLow * 100}%`,
                            width: `${Math.max(1.2, (perfectHigh - perfectLow) * 100)}%`,
                          }}
                        />
                        <div
                          className="absolute inset-y-0 z-10 w-0.5 bg-lime-300 shadow-[0_0_10px_#a3e635]"
                          style={{ left: `${recommendRatio * 100}%` }}
                        />
                        <div
                          className="absolute top-0 z-10 -translate-x-1/2 font-mono text-[8px] font-black text-lime-300"
                          style={{ left: `${recommendRatio * 100}%` }}
                        >
                          ▲추천
                        </div>
                      </>
                    )}
                    <div
                      className={`absolute inset-y-1 left-1 right-1 overflow-hidden rounded-sm ${
                        chargeUi.active ? 'bg-black/40' : 'bg-black/25'
                      }`}
                    >
                      <div
                        ref={gaugeFillRef}
                        className={`absolute inset-y-0 left-0 will-change-[width] ${
                          chargeUi.perfectZone && chargeUi.active
                            ? 'bg-gradient-to-r from-lime-400 via-yellow-300 to-orange-400'
                            : 'bg-gradient-to-r from-orange-600 via-amber-400 to-yellow-200'
                        }`}
                        style={{ width: `${gaugeRatio * 100}%` }}
                      />
                    </div>
                    <div className="pointer-events-none absolute inset-0 flex items-end justify-between px-2 pb-0.5 text-[8px] text-white/55">
                      <span>{MIN_POWER}</span>
                      <span>
                        {showRecommend
                          ? chargeUi.hint
                          : chargeUi.active
                            ? `MAX ${MAX_POWER}`
                            : '적 탱크 터치/클릭'}
                      </span>
                      <span>{MAX_POWER}</span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={!canAim}
                  onPointerDown={(event) => {
                    event.preventDefault()
                    beginChargeRef.current()
                  }}
                  onPointerUp={(event) => {
                    event.preventDefault()
                    releaseChargeRef.current()
                  }}
                  onPointerCancel={() => releaseChargeRef.current()}
                  onContextMenu={(event) => event.preventDefault()}
                  className={`inline-flex h-12 touch-none items-center justify-center gap-2 border-2 px-4 font-mono text-sm font-black shadow-[4px_4px_0_#6b2c0c] disabled:border-zinc-600 disabled:bg-zinc-700 disabled:text-zinc-400 disabled:shadow-none ${
                    chargeUi.active
                      ? chargeUi.perfectZone
                        ? 'border-lime-300 bg-lime-300 text-[#102000]'
                        : 'border-yellow-300 bg-orange-400 text-[#1a0900]'
                      : 'border-orange-300 bg-orange-400 text-[#1a0900]'
                  }`}
                >
                  <Crosshair className="h-5 w-5" />
                  {!localTurn
                    ? humanTurn
                      ? 'OPPONENT TURN'
                      : 'AI THINKING...'
                    : chargeUi.active
                      ? chargeUi.perfectZone
                        ? 'PERFECT 100%! 떼면 발사'
                        : '추천 벗어나면 그대로 비행'
                      : '길게 눌러 충전'}
                </button>
              </div>
              <p className="mt-1 font-mono text-[9px] text-cyan-100/45">
                각도용 추천 파워 · 초록 구간에 정확히 맞춰야 확정 명중 · 벗어나면 보정 없이 그대로 날아감
              </p>

              <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                {(Object.keys(WEAPONS) as WeaponId[]).map((weaponId) => {
                  const weapon = WEAPONS[weaponId]
                  const quantity = current?.weapons[weaponId] ?? 0
                  const disabled = !weapon.unlimited && quantity <= 0
                  const selected = current?.selectedWeapon === weaponId
                  return (
                    <button key={weaponId} type="button" disabled={!canAim || chargeUi.active || disabled}
                      onClick={() => selectWeapon(weaponId)}
                      title={`${weapon.tacticalRole} · ${weapon.mechanic}`}
                      style={selected ? {
                        borderColor: weapon.visual.theme,
                        backgroundColor: `${weapon.visual.theme}1a`,
                        boxShadow: `0 0 10px ${weapon.visual.theme}55`,
                      } : undefined}
                      className={`min-w-32 border px-2 py-1.5 text-left font-mono text-[10px] disabled:opacity-30 ${
                        selected ? '' : 'border-cyan-400/20 bg-black/20'
                      }`}>
                      <span className="flex justify-between">
                        <b style={{ color: weapon.visual.theme }}>{weapon.icon} {weapon.name}</b>
                        <span>{weapon.unlimited ? '∞' : quantity}</span></span>
                      <span className="mt-1 block" style={{ color: weapon.visual.theme }}>
                        {weapon.tacticalRole}
                      </span>
                      <span className="mt-1 block text-cyan-100/45">DMG {weapon.damage} · R {weapon.blastRadius}</span>
                    </button>
                  )
                })}
                <button type="button" onClick={useRepair}
                  disabled={!canAim || chargeUi.active || !current?.equipment.repair}
                  className="min-w-28 border border-cyan-400/20 px-2 font-mono text-[10px] disabled:opacity-30">
                  <HeartPulse className="mx-auto mb-1 h-4 w-4" />수리 {current?.equipment.repair ?? 0}
                  <span className="block text-[8px] text-cyan-100/40">공격 대신 사용</span>
                </button>
                <button type="button" onClick={useTeleport}
                  disabled={!canAim || chargeUi.active || !current?.equipment.teleport}
                  className="min-w-28 border border-cyan-400/20 px-2 font-mono text-[10px] disabled:opacity-30">
                  <Shuffle className="mx-auto mb-1 h-4 w-4" />이동 {current?.equipment.teleport ?? 0}
                  <span className="block text-[8px] text-cyan-100/40">안전 이동 · 턴 종료</span>
                </button>
              </div>
            </div>
          </section>

          <aside className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] border border-cyan-400/20 bg-[#07111d]">
            <div className="border-b border-cyan-400/15 p-2 font-mono text-[10px]">
              <div className="flex justify-between text-cyan-100/60"><span>현재 무기</span><span>자금</span></div>
              <div className="mt-1 flex justify-between"><b style={{ color: currentWeapon.visual.theme }}>{currentWeapon.icon} {currentWeapon.name}</b>
                <b>{current?.coins.toLocaleString()} C</b></div>
              <p className="mt-1 text-cyan-100/45">{currentWeapon.mechanic}</p>
            </div>
            <div className="min-h-0 space-y-1.5 overflow-y-auto p-2">
              {snapshot.tanks.map((tank) => (
                <div key={tank.id} className={`border p-2 text-[10px] ${
                  tank.id === snapshot.currentTankId && tank.alive
                    ? 'border-white/45 bg-white/5'
                    : 'border-white/10'
                }`}>
                  <div className="flex justify-between font-mono">
                    <b style={{ color: tank.color }}>{tank.nickname}</b>
                    <span>
                      {online && tank.id === online.localPlayerId ? 'YOU · ' : ''}
                      {tank.alive ? `${tank.health} HP${tank.shield ? ` +${tank.shield}` : ''}` : 'DESTROYED'}
                    </span>
                  </div>
                  <div className="mt-1 flex justify-between text-cyan-100/45">
                    <span>
                      {tank.playerType === 'ai' ? 'AI' : 'HUMAN'}
                      {tank.team !== null ? ` · TEAM ${tank.team + 1}` : ''}
                    </span>
                    <span>W {tank.roundWins} · K {tank.kills} · DMG {tank.damageDealt}</span>
                  </div>
                  {tank.augments.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {tank.augments.map((augmentId, index) => (
                        <span
                          key={`${tank.id}-${augmentId}-${index}`}
                          title={AUGMENTS[augmentId].description}
                          className="border border-white/10 bg-black/30 px-1 py-0.5 font-mono text-[8px] text-cyan-100/80"
                        >
                          {AUGMENTS[augmentId].icon} {AUGMENTS[augmentId].name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="border-t border-cyan-400/15 p-2">
              <p className="mb-1 font-mono text-[9px] tracking-wider text-cyan-300">GAME LOG</p>
              <div className="max-h-20 space-y-0.5 overflow-y-auto text-[9px] text-cyan-100/50">
                {snapshot.logs.map((log, index) => <p key={`${log}-${index}`}>› {log}</p>)}
              </div>
            </div>
          </aside>
        </div>
      </div>

      {paused && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm border-2 border-cyan-300/50 bg-[#06111d] p-5 text-center">
            <Pause className="mx-auto h-7 w-7 text-cyan-300" />
            <h2 className="mt-3 font-mono text-xl font-black">PAUSED</h2>
            <div className="mt-5 grid gap-2">
              <button type="button" onClick={() => setPaused(false)}
                className="inline-flex h-11 items-center justify-center gap-2 border border-lime-300 bg-lime-300 font-mono text-sm font-bold text-black">
                <Play className="h-4 w-4" /> 계속하기
              </button>
              {!online && (
                <button type="button" onClick={resetRound}
                  className="inline-flex h-11 items-center justify-center gap-2 border border-cyan-400/30 font-mono text-sm">
                  <RotateCcw className="h-4 w-4" /> 라운드 다시 시작
                </button>
              )}
              <button type="button" onClick={onMainMenu}
                className="inline-flex h-11 items-center justify-center gap-2 border border-red-400/30 text-red-200 font-mono text-sm">
                <LogOut className="h-4 w-4" /> 메인 메뉴로 나가기
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
