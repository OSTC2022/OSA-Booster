/** 출석 횟수 = 돌림판 칸 수 (칸당 당첨 확률 동일) */

export type AttendanceRouletteMember = {
  memberId: string
  memberName: string
  attendanceDays: number
}

export type AttendanceRouletteSlot = {
  memberId: string
  memberName: string
  color: string
  slotIndex: number
}

function circularSlotDistance(a: number, b: number, totalSlots: number): number {
  const delta = Math.abs(a - b)
  return Math.min(delta, totalSlots - delta)
}

/** 같은 회원 칸은 붙지 않도록, 기존 칸과 최대한 멀리(가능하면 1칸 이상 띄워) 배치 */
function findBestRouletteSlotPosition(
  existingSameMemberPositions: number[],
  totalSlots: number,
  slots: ReadonlyArray<AttendanceRouletteSlot | null>,
): number {
  const emptyIndices: number[] = []
  for (let index = 0; index < totalSlots; index += 1) {
    if (slots[index] == null) emptyIndices.push(index)
  }
  if (emptyIndices.length === 0) return 0
  if (emptyIndices.length === 1) return emptyIndices[0]!

  const occupiedIndices = slots
    .map((slot, index) => (slot != null ? index : -1))
    .filter((index) => index >= 0)

  let bestPosition = emptyIndices[0]!
  let bestScore = -1

  for (const candidate of emptyIndices) {
    const minDistance =
      existingSameMemberPositions.length > 0
        ? Math.min(
            ...existingSameMemberPositions.map((position) =>
              circularSlotDistance(candidate, position, totalSlots),
            ),
          )
        : occupiedIndices.length === 0
          ? totalSlots
          : Math.min(
              ...occupiedIndices.map((position) =>
                circularSlotDistance(candidate, position, totalSlots),
              ),
            )

    const gapBonus = minDistance >= 2 ? 10_000 : 0
    const score = minDistance * 1_000 + gapBonus - candidate

    if (score > bestScore) {
      bestScore = score
      bestPosition = candidate
    }
  }

  return bestPosition
}

export function buildAttendanceRouletteSlots(
  members: ReadonlyArray<AttendanceRouletteMember>,
  colorForMember: (memberId: string, memberIndex: number) => string,
): AttendanceRouletteSlot[] {
  const activeMembers = members.filter((member) => member.attendanceDays > 0)
  const totalSlots = activeMembers.reduce((sum, row) => sum + row.attendanceDays, 0)
  if (totalSlots === 0) return []

  const slots: Array<AttendanceRouletteSlot | null> = Array.from({ length: totalSlots }, () => null)
  const positionsByMember = new Map<string, number[]>()
  const maxDays = Math.max(...activeMembers.map((member) => member.attendanceDays))

  const additions: Array<{ member: AttendanceRouletteMember; memberIndex: number }> = []
  for (let layer = 0; layer < maxDays; layer += 1) {
    activeMembers.forEach((member, memberIndex) => {
      if (member.attendanceDays > layer) {
        additions.push({ member, memberIndex })
      }
    })
  }

  for (const { member, memberIndex } of additions) {
    const existingPositions = positionsByMember.get(member.memberId) ?? []
    const position = findBestRouletteSlotPosition(existingPositions, totalSlots, slots)
    const color = colorForMember(member.memberId, memberIndex)

    slots[position] = {
      memberId: member.memberId,
      memberName: member.memberName,
      color,
      slotIndex: position,
    }
    positionsByMember.set(member.memberId, [...existingPositions, position])
  }

  return slots as AttendanceRouletteSlot[]
}

export function pickAttendanceRouletteWinner(slots: ReadonlyArray<AttendanceRouletteSlot>): {
  slotIndex: number
  winner: AttendanceRouletteSlot
} {
  if (slots.length === 0) {
    throw new Error('출석 기록이 있는 회원이 없습니다.')
  }
  const slotIndex = Math.floor(Math.random() * slots.length)
  return { slotIndex, winner: slots[slotIndex]! }
}

/** 포인터(12시)에 당첨 칸 중앙이 오도록 시계 방향 회전 각도 */
export function computeAttendanceRouletteRotationDegrees(
  slotIndex: number,
  totalSlots: number,
  extraSpins = 6,
): number {
  if (totalSlots <= 0) return 0
  const slotAngle = 360 / totalSlots
  const slotCenter = slotIndex * slotAngle + slotAngle / 2
  return extraSpins * 360 + (360 - slotCenter)
}

/** 회전 각도에서 포인터(12시) 아래 슬롯 인덱스 역산 */
export function resolveAttendanceRouletteSlotFromRotation(
  rotationDegrees: number,
  totalSlots: number,
): number {
  if (totalSlots <= 0) return 0
  const slotAngle = 360 / totalSlots
  const normalized = ((rotationDegrees % 360) + 360) % 360
  const center = (360 - normalized) % 360
  const slotIndex = Math.floor(center / slotAngle)
  return Math.min(Math.max(slotIndex, 0), totalSlots - 1)
}

export function summarizeAttendanceRouletteOdds(
  members: ReadonlyArray<AttendanceRouletteMember>,
): Array<AttendanceRouletteMember & { slotCount: number; oddsPercent: number }> {
  const totalSlots = members.reduce((sum, row) => sum + Math.max(0, row.attendanceDays), 0)
  if (totalSlots <= 0) return []

  return members
    .filter((row) => row.attendanceDays > 0)
    .map((row) => ({
      ...row,
      slotCount: row.attendanceDays,
      oddsPercent: Math.round((row.attendanceDays / totalSlots) * 1000) / 10,
    }))
    .sort((a, b) => b.slotCount - a.slotCount || a.memberName.localeCompare(b.memberName, 'ko'))
}
