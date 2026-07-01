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

export function buildAttendanceRouletteSlots(
  members: ReadonlyArray<AttendanceRouletteMember>,
  colorForMember: (memberId: string, memberIndex: number) => string,
): AttendanceRouletteSlot[] {
  const slots: AttendanceRouletteSlot[] = []
  let slotIndex = 0

  members.forEach((member, memberIndex) => {
    if (member.attendanceDays <= 0) return
    const color = colorForMember(member.memberId, memberIndex)
    for (let day = 0; day < member.attendanceDays; day += 1) {
      slots.push({
        memberId: member.memberId,
        memberName: member.memberName,
        color,
        slotIndex,
      })
      slotIndex += 1
    }
  })

  return slots
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
