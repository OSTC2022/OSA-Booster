import assert from 'node:assert/strict'
import {
  GRAVITY,
  MAX_DAMAGE,
  MAX_POWER,
  POWER_SCALE,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from '../lib/tank-game/constants'
import {
  DEFAULT_CONFIG,
  PLAYER_COLORS,
  createCampaignPlayers,
  createSave,
  parseSave,
  purchaseItem,
} from '../lib/tank-game/campaign'
import {
  applyDamage,
  calculateBlastDamage,
  findWinner,
  findWinningTanks,
} from '../lib/tank-game/damage'
import { createGameState, nextTurn } from '../lib/tank-game/game-state'
import { calculateLaunchVelocity, createProjectile, stepProjectile } from '../lib/tank-game/physics'
import {
  createOnlineConfig,
  createOnlinePlayers,
  type OnlinePresencePlayer,
} from '../lib/tank-game/online'
import {
  carveTerrainCircle,
  collapseFloatingTerrain,
  createTerrain,
  fractureTerrain,
  isTerrainSolid,
  stepTerrainCollapse,
} from '../lib/tank-game/terrain'
import {
  createEquipmentInventory,
  createWeaponInventory,
  nextAvailableWeapon,
  WEAPONS,
} from '../lib/tank-game/weapons'
import type { ProjectileState, TankState } from '../lib/tank-game/types'

const makeTank = (id: string, health = 100): TankState => ({
  id, nickname: id, color: '#fff', x: 100, y: 100,
  playerType: 'human', aiDifficulty: 'normal', team: null, turretAngle: 45, power: 50,
  health, maxHealth: 100, shield: 0, alive: health > 0, selectedWeapon: 'basic',
  weapons: createWeaponInventory(), equipment: createEquipmentInventory(),
  coins: 5000, kills: 0, roundKills: 0, roundWins: 0,
  damageDealt: 0, damageTaken: 0, fallStartY: null,
  weaponUses: { basic: 0, heavy: 0, triple: 0, terrain: 0, mega: 0 },
  augments: [],
})

const terrainA = createTerrain(12345, 320, 180)
const terrainB = createTerrain(12345, 320, 180)
assert.deepEqual(terrainA.heights, terrainB.heights, '같은 seed의 지형 높이')
assert.deepEqual(terrainA.mask, terrainB.mask, '같은 seed의 지형 마스크')

const velocity = calculateLaunchVelocity(45, 50, 1)
assert.ok(Math.abs(velocity.x - 35.355) < 0.01, '45도 X 속도')
assert.ok(Math.abs(velocity.y + 35.355) < 0.01, 'Canvas Y축 발사 속도')

const volleyTank = makeTank('volley')
volleyTank.selectedWeapon = 'triple'
const tripleVolley = [-4, 0, 4].map((offset) => createProjectile(volleyTank, 24, offset))
assert.equal(tripleVolley.length, 3, '삼연발탄은 동시에 세 발 생성')
assert.ok(
  tripleVolley[0].velocityX !== tripleVolley[1].velocityX &&
    tripleVolley[1].velocityX !== tripleVolley[2].velocityX,
  '삼연발탄은 서로 다른 궤적을 가짐',
)

const projectile = (): ProjectileState => ({
  x: 0, y: 0, velocityX: 10, velocityY: 0, ownerId: 'p1',
  weaponId: 'basic', age: 0, trail: [],
})
const left = projectile()
const right = projectile()
stepProjectile(left, 1, -20, 0)
stepProjectile(right, 1, 20, 0)
assert.ok(left.x < right.x, '바람 방향에 따른 X축 이동')

const surfaceX = 150
const surfaceY = terrainA.heights[surfaceX]
assert.equal(isTerrainSolid(terrainA, surfaceX, surfaceY), true, '지형 표면 충돌')
carveTerrainCircle(terrainA, surfaceX, surfaceY, 12)
assert.equal(isTerrainSolid(terrainA, surfaceX, surfaceY), false, '원형 지형 파괴')

// 공중 지형: 가운데를 파내면 위쪽 흙이 아래로 떨어져야 함
const floating = createTerrain(999, 80, 60)
const column = 40
const originalSurface = floating.heights[column]
// 중간 구간만 제거해 overhang 생성
for (let y = originalSurface + 8; y < originalSurface + 20; y += 1) {
  floating.mask[y * floating.width + column] = 0
}
assert.equal(isTerrainSolid(floating, column, originalSurface), true, '붕괴 전 상단 지형 존재')
assert.equal(isTerrainSolid(floating, column, originalSurface + 12), false, '붕괴 전 중간 공동')
collapseFloatingTerrain(floating, column, column)
assert.equal(isTerrainSolid(floating, column, originalSurface), false, '붕괴 후 상단 overhang 제거')
assert.equal(
  isTerrainSolid(floating, column, floating.height - 1),
  true,
  '붕괴 후 바닥부터 다시 쌓임',
)
for (let y = floating.heights[column]; y < floating.height; y += 1) {
  assert.equal(isTerrainSolid(floating, column, y), true, `붕괴 후 표면 이하 연속 지형 y=${y}`)
}
for (let y = 0; y < floating.heights[column]; y += 1) {
  assert.equal(isTerrainSolid(floating, column, y), false, `붕괴 후 표면 위는 비어 있음 y=${y}`)
}

// 점진 붕괴: 한 프레임에 maxDrop 픽셀까지만 떨어지고, 반복하면 완전히 압축된다
const gradual = createTerrain(4242, 80, 60)
const gradualColumn = 40
const gradualSurface = gradual.heights[gradualColumn]
for (let y = gradualSurface + 6; y < gradualSurface + 18; y += 1) {
  gradual.mask[y * gradual.width + gradualColumn] = 0
}
const firstStep = stepTerrainCollapse(gradual, gradualColumn, gradualColumn, 3)
assert.equal(firstStep, true, '한 스텝만으로는 붕괴가 끝나지 않음')
assert.equal(
  isTerrainSolid(gradual, gradualColumn, gradualSurface + 3),
  true,
  '첫 스텝에서 상단 조각이 3픽셀만 하강',
)
let guard = 0
while (stepTerrainCollapse(gradual, gradualColumn, gradualColumn, 3) && guard < 200) guard += 1
assert.ok(guard < 200, '점진 붕괴는 유한 스텝 안에 종료')
for (let y = gradual.heights[gradualColumn]; y < gradual.height; y += 1) {
  assert.equal(isTerrainSolid(gradual, gradualColumn, y), true, `점진 붕괴 후 연속 지형 y=${y}`)
}

const fractured = createTerrain(7070, 160, 100)
const fractureX = 80
const fractureY = Math.min(fractured.height - 8, fractured.heights[fractureX] + 14)
const beforeFracture = fractured.mask.slice()
const fractureRegion = fractureTerrain(fractured, fractureX, fractureY, 36)
let remoteCrackPixels = 0
let maxHorizontalReach = 0
let maxDownwardReach = 0
for (let y = 0; y < fractured.height; y += 1) {
  for (let x = 0; x < fractured.width; x += 1) {
    const index = y * fractured.width + x
    if (beforeFracture[index] !== 1 || fractured.mask[index] !== 0) continue
    const distance = Math.hypot(x - fractureX, y - fractureY)
    if (distance > 15 && distance < 48) remoteCrackPixels += 1
    maxHorizontalReach = Math.max(maxHorizontalReach, Math.abs(x - fractureX))
    maxDownwardReach = Math.max(maxDownwardReach, y - fractureY)
  }
}
assert.ok(remoteCrackPixels > 20, '지형 파괴탄은 중심 밖까지 다중 균열 생성')
assert.ok(
  maxHorizontalReach > maxDownwardReach,
  '균열은 아래보다 앞쪽(좌우)으로 더 멀리 퍼짐',
)
assert.ok(fractureRegion.maxX - fractureRegion.minX > 72, '균열 전체 범위를 점진 붕괴 대상으로 지정')

assert.equal(calculateBlastDamage({ x: 0, y: 0 }, { x: 0, y: 0 }, 50, MAX_DAMAGE), MAX_DAMAGE)
assert.equal(calculateBlastDamage({ x: 0, y: 0 }, { x: 50, y: 0 }, 50, MAX_DAMAGE), 0)

const defeated = makeTank('defeated', 20)
applyDamage(defeated, 20)
assert.equal(defeated.alive, false, '체력 0 사망')
const shielded = makeTank('shielded')
shielded.shield = 30
applyDamage(shielded, 40)
assert.equal(shielded.shield, 0, '방어막 우선 흡수')
assert.equal(shielded.health, 90, '방어막 초과 피해만 체력 차감')
const pierced = makeTank('pierced')
pierced.shield = 100
applyDamage(pierced, 40, 0.5)
assert.equal(pierced.shield, 80, '관통되지 않은 피해만 방어막 흡수')
assert.equal(pierced.health, 80, '관통 피해는 방어막을 우회')
const survivor = makeTank('survivor')
assert.equal(findWinner([survivor, defeated])?.id, survivor.id, '생존자 1명 승리')
const teammateA = makeTank('team-a')
const teammateB = makeTank('team-b')
teammateA.team = 3
teammateB.team = 3
assert.equal(
  findWinningTanks([teammateA, teammateB, defeated]).length,
  2,
  '같은 색상 팀원들이 함께 생존하면 공동 승리',
)

const campaignPlayers = createCampaignPlayers(DEFAULT_CONFIG)
const buyer = campaignPlayers[0]
const coinsBefore = buyer.coins
assert.equal(purchaseItem(buyer, 'heavy'), true, '상점 구매 성공')
assert.equal(buyer.coins, coinsBefore - 600, '구매 자금 차감')
assert.equal(buyer.weapons.heavy, 1, '구매 탄약 추가')
assert.equal(nextAvailableWeapon('basic', buyer.weapons, 1), 'heavy', '보유 무기만 순환')

const save = createSave('shopping', DEFAULT_CONFIG, campaignPlayers, 2, [])
assert.equal(parseSave(JSON.stringify(save))?.currentRound, 2, '버전 저장 복구')
assert.equal(parseSave('{"version":999}'), null, '잘못된 저장 버전 거부')

const sixPlayerConfig = {
  ...DEFAULT_CONFIG,
  playerCount: 6,
  humanCount: 1,
  aiCount: 5,
}
const sixPlayers = createCampaignPlayers(sixPlayerConfig)
const roundTwo = createGameState(777, sixPlayerConfig, sixPlayers, 2)
assert.equal(roundTwo.tanks.length, 6, '2~6인 전투 상태 생성')
assert.equal(roundTwo.currentTankIndex, 1, '라운드마다 첫 플레이어 순환')

const onlineParticipants: OnlinePresencePlayer[] = Array.from({ length: 10 }, (_, index) => ({
  playerId: index === 9 ? 'online-ai-9' : `online-${index}`,
  nickname: `ONLINE ${index + 1}`,
  seat: index,
  joinedAt: index,
  color: PLAYER_COLORS[index],
}))
onlineParticipants[1].color = onlineParticipants[0].color
const onlineConfig = createOnlineConfig(onlineParticipants.length, 9)
const onlinePlayers = createOnlinePlayers(onlineParticipants)
const onlineStateA = createGameState(123_456, onlineConfig, onlinePlayers, 1)
const onlineStateB = createGameState(123_456, onlineConfig, onlinePlayers, 1)
assert.equal(onlineStateA.tanks.length, 10, '온라인 전투는 최대 10명 생성')
assert.equal(onlineStateA.terrain.width, WORLD_WIDTH, 'QHD 맵 너비')
assert.equal(onlineStateA.terrain.height, WORLD_HEIGHT, 'QHD 맵 높이')
assert.ok(
  Math.abs(WORLD_WIDTH / WORLD_HEIGHT - 16 / 9) < 0.01,
  '와이드 없이 표준 16:9',
)
assert.ok(
  (MAX_POWER * POWER_SCALE) ** 2 / GRAVITY > WORLD_WIDTH * 0.8,
  '최대 파워로 맵 양 끝 교전 가능',
)
assert.ok(WEAPONS.mega.blastRadius >= 150, '대형 맵에 맞춘 메가 폭발 범위')
assert.equal(onlinePlayers[9].type, 'ai', '빈 온라인 좌석은 COM으로 채울 수 있음')
assert.equal(onlinePlayers[0].team, onlinePlayers[1].team, '같은 색상은 같은 팀으로 배정')
assert.equal(onlinePlayers[0].weapons.triple, 2, '온라인 기본 전략 무장 지급')
assert.equal(onlineStateA.wind, onlineStateB.wind, '같은 온라인 시드의 바람 동기화')
assert.equal(onlineStateA.weather, onlineStateB.weather, '같은 온라인 시드의 날씨 동기화')
nextTurn(onlineStateA)
nextTurn(onlineStateB)
assert.equal(onlineStateA.wind, onlineStateB.wind, '온라인 다음 턴 바람도 결정적으로 동기화')
assert.equal(onlineStateA.currentTankIndex, onlineStateB.currentTankIndex, '온라인 턴 순서 동기화')

const teamTurnPlayers = createOnlinePlayers([
  { playerId: 'a1', nickname: 'A1', seat: 0, joinedAt: 0, color: '#aa0000' },
  { playerId: 'a2', nickname: 'A2', seat: 1, joinedAt: 1, color: '#aa0000' },
  { playerId: 'b1', nickname: 'B1', seat: 2, joinedAt: 2, color: '#0000aa' },
  { playerId: 'b2', nickname: 'B2', seat: 3, joinedAt: 3, color: '#0000aa' },
])
const teamTurnState = createGameState(
  999,
  createOnlineConfig(4),
  teamTurnPlayers,
  1,
)
assert.equal(teamTurnState.tanks[teamTurnState.currentTankIndex].id, 'a1', 'A팀 첫 사수')
nextTurn(teamTurnState)
assert.equal(teamTurnState.tanks[teamTurnState.currentTankIndex].id, 'b1', 'B팀 첫 사수')
nextTurn(teamTurnState)
assert.equal(teamTurnState.tanks[teamTurnState.currentTankIndex].id, 'a2', 'A팀 다음 사수')
nextTurn(teamTurnState)
assert.equal(teamTurnState.tanks[teamTurnState.currentTankIndex].id, 'b2', 'B팀 다음 사수')

const augmentState = createGameState(4242, createOnlineConfig(2), createOnlinePlayers([
  { playerId: 'p1', nickname: 'P1', seat: 0, joinedAt: 0, color: '#aa0000' },
  { playerId: 'p2', nickname: 'P2', seat: 1, joinedAt: 1, color: '#0000aa' },
]), 1)
nextTurn(augmentState)
nextTurn(augmentState)
assert.equal(augmentState.turnNumber, 3, '3턴마다 증강')
assert.equal(augmentState.phase, 'augment', '3턴에 증강 페이즈')
assert.equal(augmentState.augmentChoices.length, 3, '증강 카드 3장')

console.log('Tank game campaign and physics verification passed.')
