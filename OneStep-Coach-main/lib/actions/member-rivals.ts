'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getMemberForCurrentUser } from '@/lib/actions/auth'
import type { MemberRunningLeagueHome } from '@/lib/actions/running-league'
import type { MileageDistanceLeaderboard } from '@/lib/running-league/mileage-leaderboard'
import {
  buildRivalComparison,
  findBoardMember,
  flattenMileageBoardMembers,
  getRecommendedRivals,
  type BoardMemberRow,
  type RivalCandidate,
  type RivalComparison,
} from '@/lib/running-league/member-rivals'

export type MemberRivalHome =
  | {
      tableReady: boolean
      periodLabel: string
      memberId: string
      memberName: string
      rivalMemberId: string | null
      comparison: RivalComparison | null
      recommendations: RivalCandidate[]
      candidates: BoardMemberRow[]
    }
  | { unlinked: true }

function isMissingTableError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  if (error.code === '42P01') return true
  const message = error.message?.toLowerCase() ?? ''
  return message.includes('member_rivals')
}

function revalidateRivalPaths() {
  revalidatePath('/dashboard/my')
  revalidatePath('/dashboard/settings/adult-running-portal')
}

function buildHomeFromBoard(input: {
  memberId: string
  memberName: string
  rivalMemberId: string | null
  rivalName: string | null
  tableReady: boolean
  periodLabel: string
  board: MileageDistanceLeaderboard
}): Exclude<MemberRivalHome, { unlinked: true }> {
  const candidates = flattenMileageBoardMembers(input.board)
  const user =
    findBoardMember(candidates, input.memberId) ??
    ({
      memberId: input.memberId,
      memberName: input.memberName,
      mileageKm: 0,
      rank: null,
    } satisfies BoardMemberRow)

  let comparison: RivalComparison | null = null
  if (input.rivalMemberId) {
    const rival =
      findBoardMember(candidates, input.rivalMemberId) ??
      (input.rivalName
        ? {
            memberId: input.rivalMemberId,
            memberName: input.rivalName,
            mileageKm: 0,
            rank: null,
          }
        : null)
    if (rival) {
      comparison = buildRivalComparison({
        user,
        rival,
        periodLabel: input.periodLabel,
      })
    }
  }

  return {
    tableReady: input.tableReady,
    periodLabel: input.periodLabel,
    memberId: input.memberId,
    memberName: input.memberName,
    rivalMemberId: input.rivalMemberId,
    comparison,
    recommendations: getRecommendedRivals(candidates, input.memberId, 3),
    candidates,
  }
}

export async function getMemberRivalHome(input?: {
  memberId?: string | null
  memberName?: string | null
  runningLeagueHome?: MemberRunningLeagueHome | null
}): Promise<MemberRivalHome> {
  let memberId = input?.memberId?.trim() || null
  let memberName = input?.memberName?.trim() || ''

  if (!memberId) {
    const member = await getMemberForCurrentUser()
    if (!member) return { unlinked: true }
    memberId = member.id
    memberName = member.name
  }

  const home = input?.runningLeagueHome
  const periodLabel = home?.rankingPeriod?.label ?? '이번 달'
  const board = home?.mileageLeaderboard ?? { ranked: [], unranked: [] }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('member_rivals')
    .select('rival_member_id')
    .eq('member_id', memberId)
    .maybeSingle()

  if (error) {
    if (isMissingTableError(error)) {
      return buildHomeFromBoard({
        memberId,
        memberName,
        rivalMemberId: null,
        rivalName: null,
        tableReady: false,
        periodLabel,
        board,
      })
    }
    console.error('getMemberRivalHome', error.message)
    return buildHomeFromBoard({
      memberId,
      memberName,
      rivalMemberId: null,
      rivalName: null,
      tableReady: true,
      periodLabel,
      board,
    })
  }

  const rivalMemberId = data?.rival_member_id ? String(data.rival_member_id) : null
  let rivalName: string | null = null
  if (rivalMemberId) {
    const fromBoard = findBoardMember(
      flattenMileageBoardMembers(board),
      rivalMemberId,
    )
    rivalName = fromBoard?.memberName ?? null
    if (!rivalName) {
      const { data: rivalRow } = await supabase
        .from('members')
        .select('name')
        .eq('id', rivalMemberId)
        .maybeSingle()
      rivalName = rivalRow?.name?.trim() || null
    }
  }

  return buildHomeFromBoard({
    memberId,
    memberName,
    rivalMemberId,
    rivalName,
    tableReady: true,
    periodLabel,
    board,
  })
}

export async function setMyRival(
  rivalMemberId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const member = await getMemberForCurrentUser()
  if (!member) {
    return { ok: false, error: '러닝 회원 정보가 연결되어 있지 않습니다.' }
  }

  const rivalId = rivalMemberId.trim()
  if (!rivalId) return { ok: false, error: '라이벌을 선택해주세요.' }
  if (rivalId === member.id) {
    return { ok: false, error: '자기 자신을 라이벌로 지정할 수 없습니다.' }
  }

  const supabase = await createClient()

  const { data: rivalMember, error: rivalLookupError } = await supabase
    .from('members')
    .select('id')
    .eq('id', rivalId)
    .maybeSingle()

  if (rivalLookupError) {
    return { ok: false, error: '라이벌 확인에 실패했습니다.' }
  }
  if (!rivalMember) {
    return { ok: false, error: '선택한 회원을 찾을 수 없습니다.' }
  }

  const { error } = await supabase.from('member_rivals').upsert(
    {
      member_id: member.id,
      rival_member_id: rivalId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'member_id' },
  )

  if (error) {
    if (isMissingTableError(error)) {
      return {
        ok: false,
        error: '라이벌 테이블이 없습니다. supabase/add-member-rivals.sql 을 실행해주세요.',
      }
    }
    console.error('setMyRival', error.message)
    return { ok: false, error: '라이벌 설정에 실패했습니다.' }
  }

  revalidateRivalPaths()
  const { evaluateAchievementsForMemberQuiet } = await import('@/lib/actions/achievements')
  void evaluateAchievementsForMemberQuiet(member.id)
  return { ok: true }
}

export async function clearMyRival(): Promise<{ ok: true } | { ok: false; error: string }> {
  const member = await getMemberForCurrentUser()
  if (!member) {
    return { ok: false, error: '러닝 회원 정보가 연결되어 있지 않습니다.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('member_rivals').delete().eq('member_id', member.id)

  if (error) {
    if (isMissingTableError(error)) {
      return {
        ok: false,
        error: '라이벌 테이블이 없습니다. supabase/add-member-rivals.sql 을 실행해주세요.',
      }
    }
    console.error('clearMyRival', error.message)
    return { ok: false, error: '라이벌 해제에 실패했습니다.' }
  }

  revalidateRivalPaths()
  return { ok: true }
}
