import assert from 'node:assert/strict'
import {
  assignBalancedTeams,
  assignRandomTeams,
  buildTeamBattleScoreboard,
  calculateBaselinesFromLogs,
  formatBattleCountdown,
  getBaselineDateRange,
  resolveBattleWinner,
  validateBattleRosterSize,
} from '../lib/running-league/team-battle.ts'

const battleBase = {
  id: 'b1',
  title: 'SUMMER BATTLE',
  description: null,
  start_at: '2026-08-10',
  end_at: '2026-08-16',
  status: 'active',
  assignment_mode: 'balanced',
  scoring_mode: 'average_distance',
  created_by: null,
}

// baseline range: start-28 .. start-1
{
  const range = getBaselineDateRange('2026-08-10')
  assert.equal(range.start, '2026-07-13')
  assert.equal(range.end, '2026-08-09')
}

// roster size
{
  assert.ok(validateBattleRosterSize(0))
  assert.ok(validateBattleRosterSize(1))
  assert.equal(validateBattleRosterSize(2), null)
}

// CASE balanced: higher baselines split, |count| diff ≤ 1
{
  const members = [
    { memberId: 'a', memberName: 'A', baselineKm: 100 },
    { memberId: 'b', memberName: 'B', baselineKm: 92 },
    { memberId: 'c', memberName: 'C', baselineKm: 60 },
    { memberId: 'd', memberName: 'D', baselineKm: 55 },
  ]
  const assigned = assignBalancedTeams(members)
  const red = assigned.filter((r) => r.teamCode === 'RED')
  const blue = assigned.filter((r) => r.teamCode === 'BLUE')
  assert.equal(Math.abs(red.length - blue.length) <= 1, true)
  assert.equal(assigned.length, 4)
  // A(100) → RED, B(92) → BLUE (redSum higher), C(60) → BLUE? redSum=100 blue=92 → C to BLUE? wait redSum<=blueSum? 100>92 so C→BLUE? 
  // Algorithm: equal counts → lower sum. After A red=100, B blue=92, counts equal, redSum>blueSum → C to BLUE → blue=152, D: redSum 100 < blue 152 → D to RED
  assert.equal(red.find((r) => r.memberId === 'a')?.teamCode, 'RED')
  assert.equal(blue.find((r) => r.memberId === 'b')?.teamCode, 'BLUE')
}

// CASE random keeps |diff| ≤ 1
{
  let seed = 0
  const random = () => {
    seed = (seed * 9301 + 49297) % 233280
    return seed / 233280
  }
  for (const n of [2, 3, 5, 10, 11]) {
    const members = Array.from({ length: n }, (_, i) => ({
      memberId: `m${i}`,
      memberName: `M${i}`,
      baselineKm: i,
    }))
    const assigned = assignRandomTeams(members, random)
    const red = assigned.filter((r) => r.teamCode === 'RED').length
    const blue = assigned.filter((r) => r.teamCode === 'BLUE').length
    assert.equal(Math.abs(red - blue) <= 1, true, `n=${n}`)
  }
}

// CASE average uses roster size (incl non-participants)
{
  const roster = [
    { battle_id: 'b1', member_id: 'r1', member_name: 'R1', team_code: 'RED', baseline_distance: 10 },
    { battle_id: 'b1', member_id: 'r2', member_name: 'R2', team_code: 'RED', baseline_distance: 10 },
    { battle_id: 'b1', member_id: 'b1m', member_name: 'B1', team_code: 'BLUE', baseline_distance: 10 },
    { battle_id: 'b1', member_id: 'b2m', member_name: 'B2', team_code: 'BLUE', baseline_distance: 10 },
  ]
  const logs = [
    { member_id: 'r1', distance_km: 50, logged_at: '2026-08-11' },
    { member_id: 'b1m', distance_km: 40, logged_at: '2026-08-11' },
    { member_id: 'b2m', distance_km: 40, logged_at: '2026-08-12' },
  ]
  const board = buildTeamBattleScoreboard({
    battle: battleBase,
    roster,
    logs,
    viewerMemberId: 'r1',
    asOfDateKey: '2026-08-12',
  })
  // RED: 50 / 2 = 25, BLUE: 80 / 2 = 40 → BLUE wins on average
  assert.equal(board.red.averageDistanceKm, 25)
  assert.equal(board.blue.averageDistanceKm, 40)
  assert.equal(board.winner, 'BLUE')
  assert.equal(board.red.participationRate, 50)
  assert.equal(board.blue.participationRate, 100)
  assert.equal(board.myTeam, 'RED')
  assert.equal(board.myContributionKm, 50)
}

// CASE total_distance mode
{
  const roster = [
    { battle_id: 'b1', member_id: 'r1', member_name: 'R1', team_code: 'RED', baseline_distance: 0 },
    { battle_id: 'b1', member_id: 'b1m', member_name: 'B1', team_code: 'BLUE', baseline_distance: 0 },
  ]
  const board = buildTeamBattleScoreboard({
    battle: { ...battleBase, scoring_mode: 'total_distance' },
    roster,
    logs: [
      { member_id: 'r1', distance_km: 30, logged_at: '2026-08-11' },
      { member_id: 'b1m', distance_km: 20, logged_at: '2026-08-11' },
    ],
    asOfDateKey: '2026-08-12',
  })
  assert.equal(board.winner, 'RED')
  assert.equal(board.scoreLabel, '총거리')
}

// CASE tie → participation → total → TIED
{
  const red = {
    teamCode: 'RED',
    memberCount: 2,
    participantCount: 2,
    totalDistanceKm: 40,
    averageDistanceKm: 20,
    participationRate: 100,
    topRunners: [],
    members: [],
    baselineTotalKm: 0,
  }
  const blue = { ...red, teamCode: 'BLUE' }
  assert.equal(resolveBattleWinner(red, blue, 'average_distance'), 'TIED')

  const blueLowPart = { ...blue, participantCount: 1, participationRate: 50 }
  assert.equal(resolveBattleWinner(red, blueLowPart, 'average_distance'), 'RED')
}

// CASE outside period excluded
{
  const roster = [
    { battle_id: 'b1', member_id: 'r1', member_name: 'R1', team_code: 'RED', baseline_distance: 0 },
    { battle_id: 'b1', member_id: 'b1m', member_name: 'B1', team_code: 'BLUE', baseline_distance: 0 },
  ]
  const board = buildTeamBattleScoreboard({
    battle: battleBase,
    roster,
    logs: [
      { member_id: 'r1', distance_km: 99, logged_at: '2026-08-09' },
      { member_id: 'r1', distance_km: 10, logged_at: '2026-08-10' },
      { member_id: 'r1', distance_km: 99, logged_at: '2026-08-17' },
    ],
    asOfDateKey: '2026-08-16',
  })
  assert.equal(board.red.totalDistanceKm, 10)
}

// CASE baseline from pre-start logs only
{
  const baselines = calculateBaselinesFromLogs(
    [
      { memberId: 'a', memberName: 'A' },
      { memberId: 'b', memberName: 'B' },
    ],
    [
      { member_id: 'a', distance_km: 20, logged_at: '2026-08-01' },
      { member_id: 'a', distance_km: 5, logged_at: '2026-08-10' },
      { member_id: 'b', distance_km: 7, logged_at: '2026-07-20' },
    ],
    '2026-08-10',
  )
  assert.equal(baselines.find((r) => r.memberId === 'a')?.baselineKm, 20)
  assert.equal(baselines.find((r) => r.memberId === 'b')?.baselineKm, 7)
}

// countdown
{
  assert.match(formatBattleCountdown(battleBase, '2026-08-12'), /D-/)
  assert.equal(formatBattleCountdown(battleBase, '2026-08-17'), '종료')
  assert.match(formatBattleCountdown({ ...battleBase, status: 'active', start_at: '2026-08-20' }, '2026-08-12'), /시작/)
}

console.log('verify-team-battle: PASS')
