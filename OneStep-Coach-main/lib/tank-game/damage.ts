import type { TankState, Point } from './types'

export function calculateBlastDamage(explosion: Point, target: Point, radius: number, maxDamage: number) {
  const distance = Math.hypot(target.x - explosion.x, target.y - explosion.y)
  return distance >= radius ? 0 : Math.max(0, Math.round(maxDamage * (1 - distance / radius)))
}

export function applyDamage(tank: TankState, damage: number, shieldPiercing = 0) {
  const incoming = Math.max(0, damage)
  const piercing = Math.max(0, Math.min(1, shieldPiercing))
  const bypassDamage = Math.round(incoming * piercing)
  const shieldableDamage = incoming - bypassDamage
  const absorbed = Math.min(tank.shield, shieldableDamage)
  tank.shield -= absorbed
  const healthDamage = bypassDamage + shieldableDamage - absorbed
  tank.health = Math.max(0, tank.health - healthDamage)
  tank.damageTaken += healthDamage
  if (tank.health === 0) tank.alive = false
  return healthDamage
}

export function findWinner(tanks: TankState[]) {
  return findWinningTanks(tanks)[0] ?? null
}

export function findWinningTanks(tanks: TankState[]) {
  const alive = tanks.filter((tank) => tank.alive)
  if (!alive.length) return []
  const firstTeamKey =
    alive[0].team === null ? `solo:${alive[0].id}` : `team:${alive[0].team}`
  const oneSideRemains = alive.every((tank) => {
    const teamKey = tank.team === null ? `solo:${tank.id}` : `team:${tank.team}`
    return teamKey === firstTeamKey
  })
  return oneSideRemains ? alive : []
}
