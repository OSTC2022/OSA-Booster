'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/actions/auth'
import { canAccessSettingsArea } from '@/lib/operator-access'
import {
  defaultTeamColor,
  type PortalMileageTeam,
  type PortalMileageTeamMember,
} from '@/lib/running-league/mileage-team-leaderboard'

async function requireMileageTeamStaff() {
  const user = await requireAuth()
  if (!canAccessSettingsArea(user.role)) {
    throw new Error('관리자 또는 운영진만 이용할 수 있습니다.')
  }
  return user
}

function isMissingTableError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  if (error.code === '42P01') return true
  const message = error.message?.toLowerCase() ?? ''
  return message.includes('portal_mileage_teams') || message.includes('portal_mileage_team_members')
}

function mapTeam(row: Record<string, unknown>): PortalMileageTeam {
  return {
    id: String(row.id),
    name: String(row.name ?? '').trim() || '팀',
    color: row.color == null ? null : String(row.color),
    sort_order: Number(row.sort_order ?? 0),
    is_active: row.is_active !== false,
  }
}

export async function listPortalMileageTeams(): Promise<{
  teams: PortalMileageTeam[]
  memberships: PortalMileageTeamMember[]
  error?: string
}> {
  const supabase = await createClient()
  const [teamsResult, membersResult] = await Promise.all([
    supabase
      .from('portal_mileage_teams')
      .select('id, name, color, sort_order, is_active')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true }),
    supabase
      .from('portal_mileage_team_members')
      .select('team_id, member_id, member:members(id, name)'),
  ])

  if (teamsResult.error) {
    if (isMissingTableError(teamsResult.error)) {
      return { teams: [], memberships: [] }
    }
    return { teams: [], memberships: [], error: teamsResult.error.message }
  }

  if (membersResult.error && !isMissingTableError(membersResult.error)) {
    return {
      teams: (teamsResult.data ?? []).map((row) => mapTeam(row as Record<string, unknown>)),
      memberships: [],
      error: membersResult.error.message,
    }
  }

  const memberships: PortalMileageTeamMember[] = (membersResult.data ?? []).map((row) => {
    const member = row.member as { id?: string; name?: string } | null
    return {
      team_id: String(row.team_id),
      member_id: String(row.member_id),
      member_name: member?.name?.trim() || '회원',
    }
  })

  return {
    teams: (teamsResult.data ?? []).map((row) => mapTeam(row as Record<string, unknown>)),
    memberships,
  }
}

export async function getPortalMileageTeamsAdmin(): Promise<
  | { teams: PortalMileageTeam[]; memberships: PortalMileageTeamMember[] }
  | { error: string }
> {
  try {
    await requireMileageTeamStaff()
  } catch (error) {
    return { error: error instanceof Error ? error.message : '권한 없음' }
  }
  const result = await listPortalMileageTeams()
  if (result.error) return { error: result.error }
  return { teams: result.teams, memberships: result.memberships }
}

export async function upsertPortalMileageTeam(input: {
  id?: string
  name: string
  color?: string | null
  sort_order?: number
  is_active?: boolean
}): Promise<{ error?: string; team?: PortalMileageTeam }> {
  try {
    await requireMileageTeamStaff()
  } catch (error) {
    return { error: error instanceof Error ? error.message : '권한 없음' }
  }

  const name = input.name.trim()
  if (!name) return { error: '팀 이름을 입력해주세요.' }
  if (name.length > 30) return { error: '팀 이름은 30자 이내로 입력해주세요.' }

  const supabase = await createClient()
  const payload = {
    name,
    color: input.color?.trim() || null,
    sort_order: input.sort_order ?? 0,
    is_active: input.is_active ?? true,
    updated_at: new Date().toISOString(),
  }

  if (input.id) {
    const { data, error } = await supabase
      .from('portal_mileage_teams')
      .update(payload)
      .eq('id', input.id)
      .select('id, name, color, sort_order, is_active')
      .maybeSingle()
    if (error) {
      if (isMissingTableError(error)) {
        return { error: '팀전 테이블이 없습니다. supabase/add-portal-mileage-teams.sql 을 실행해주세요.' }
      }
      return { error: error.message }
    }
    revalidatePortalMileageTeamPaths()
    return { team: data ? mapTeam(data as Record<string, unknown>) : undefined }
  }

  const existing = await listPortalMileageTeams()
  const color = payload.color || defaultTeamColor(existing.teams.length)

  const { data, error } = await supabase
    .from('portal_mileage_teams')
    .insert({ ...payload, color })
    .select('id, name, color, sort_order, is_active')
    .maybeSingle()
  if (error) {
    if (isMissingTableError(error)) {
      return { error: '팀전 테이블이 없습니다. supabase/add-portal-mileage-teams.sql 을 실행해주세요.' }
    }
    return { error: error.message }
  }
  revalidatePortalMileageTeamPaths()
  return { team: data ? mapTeam(data as Record<string, unknown>) : undefined }
}

export async function deletePortalMileageTeam(id: string): Promise<{ error?: string }> {
  try {
    await requireMileageTeamStaff()
  } catch (error) {
    return { error: error instanceof Error ? error.message : '권한 없음' }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('portal_mileage_teams').delete().eq('id', id)
  if (error) {
    if (isMissingTableError(error)) {
      return { error: '팀전 테이블이 없습니다. supabase/add-portal-mileage-teams.sql 을 실행해주세요.' }
    }
    return { error: error.message }
  }
  revalidatePortalMileageTeamPaths()
  return {}
}

export async function setPortalMileageTeamMembers(input: {
  teamId: string
  memberIds: string[]
}): Promise<{ error?: string }> {
  try {
    await requireMileageTeamStaff()
  } catch (error) {
    return { error: error instanceof Error ? error.message : '권한 없음' }
  }

  const teamId = input.teamId.trim()
  if (!teamId) return { error: '팀을 선택해주세요.' }

  const uniqueMemberIds = [...new Set(input.memberIds.map((id) => id.trim()).filter(Boolean))]
  const supabase = await createClient()

  if (uniqueMemberIds.length > 0) {
    const { data: otherMemberships, error: otherError } = await supabase
      .from('portal_mileage_team_members')
      .select('member_id, team_id')
      .neq('team_id', teamId)
      .in('member_id', uniqueMemberIds)

    if (otherError && !isMissingTableError(otherError)) {
      return { error: otherError.message }
    }

    if ((otherMemberships ?? []).length > 0) {
      const conflictIds = (otherMemberships ?? []).map((row) => String(row.member_id))
      return {
        error: `다른 팀에 이미 소속된 회원이 있습니다. (${conflictIds.length}명) 한 회원은 한 팀만 가능합니다.`,
      }
    }
  }

  const { error: deleteError } = await supabase
    .from('portal_mileage_team_members')
    .delete()
    .eq('team_id', teamId)
  if (deleteError) {
    if (isMissingTableError(deleteError)) {
      return { error: '팀전 테이블이 없습니다. supabase/add-portal-mileage-teams.sql 을 실행해주세요.' }
    }
    return { error: deleteError.message }
  }

  if (uniqueMemberIds.length > 0) {
    const { error: insertError } = await supabase.from('portal_mileage_team_members').insert(
      uniqueMemberIds.map((member_id) => ({ team_id: teamId, member_id })),
    )
    if (insertError) return { error: insertError.message }
  }

  revalidatePortalMileageTeamPaths()
  return {}
}

function revalidatePortalMileageTeamPaths() {
  revalidatePath('/dashboard/my')
  revalidatePath('/dashboard/settings/adult-running-portal')
  revalidatePath('/dashboard/settings/mileage-teams')
}
