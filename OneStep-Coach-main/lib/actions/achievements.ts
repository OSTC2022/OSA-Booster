'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getMemberForCurrentUser } from '@/lib/actions/auth'
import { getCenterSettings } from '@/lib/actions/center-settings'
import { resolveMileageRecognitionFromCenterSettings } from '@/lib/running-league/mileage-recognition'
import {
  buildMemberAchievementsView,
  computeMemberAchievementStats,
  evaluateAchievementUnlocks,
  isAchievementCode,
  mergeAchievementCatalog,
  MAX_SHOWCASE_BADGES,
  type AchievementCode,
  type AchievementDefinition,
  type MemberAchievementsView,
} from '@/lib/running-league/achievements'
import { getMemberMvpHome } from '@/lib/actions/mvp'
import {
  isWeeklyMissionType,
  type WeeklyMissionDefinition,
  unitForMissionType,
} from '@/lib/running-league/weekly-missions'

function isMissingAchievementsTable(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false
  if (error.code === '42P01') return true
  const message = error.message?.toLowerCase() ?? ''
  return (
    message.includes('achievements') ||
    message.includes('member_achievements') ||
    message.includes('member_achievement_showcase')
  )
}

function revalidateAchievementPaths() {
  revalidatePath('/dashboard/my')
  revalidatePath('/dashboard/settings/adult-running-portal')
}

async function loadCatalog(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data, error } = await supabase
    .from('achievements')
    .select(
      'id, code, title, description, category, criteria_type, target_value, icon_key, tier, sort_order, is_active, is_hidden',
    )
    .eq('is_active', true)
    .eq('is_hidden', false)
    .order('sort_order', { ascending: true })

  if (error) {
    if (isMissingAchievementsTable(error)) {
      return { catalog: mergeAchievementCatalog([]), tableReady: false as const }
    }
    console.error('loadCatalog', error.message)
    return { catalog: mergeAchievementCatalog([]), tableReady: true as const }
  }

  let catalog = mergeAchievementCatalog(
    (data ?? []) as Array<Partial<AchievementDefinition> & { code: string; id?: string }>,
  )

  // DB에 seed가 없으면 코드 카탈로그를 upsert해 id를 확보
  const missingIds = catalog.filter((row) => !row.id)
  if (missingIds.length > 0) {
    const seedRows = missingIds.map((row) => ({
      code: row.code,
      title: row.title,
      description: row.description,
      category: row.category,
      criteria_type: row.criteria_type,
      target_value: row.target_value,
      icon_key: row.icon_key,
      tier: row.tier,
      sort_order: row.sort_order,
      is_active: true,
      is_hidden: false,
    }))
    await supabase.from('achievements').upsert(seedRows, { onConflict: 'code' })
    const { data: refreshed } = await supabase
      .from('achievements')
      .select(
        'id, code, title, description, category, criteria_type, target_value, icon_key, tier, sort_order, is_active, is_hidden',
      )
      .eq('is_active', true)
      .eq('is_hidden', false)
    catalog = mergeAchievementCatalog(
      (refreshed ?? []) as Array<Partial<AchievementDefinition> & { code: string; id?: string }>,
    )
  }

  return { catalog, tableReady: true as const }
}

async function gatherMemberContext(memberId: string) {
  const supabase = await createClient()
  const centerSettings = await getCenterSettings()
  const recognition = resolveMileageRecognitionFromCenterSettings(centerSettings)

  const [
    logsResult,
    pbResult,
    rivalResult,
    battleResult,
    missionsResult,
    unlocksResult,
    showcaseResult,
  ] = await Promise.all([
    supabase
      .from('running_league_mileage_logs')
      .select('member_id, distance_km, logged_at')
      .eq('member_id', memberId)
      .order('logged_at', { ascending: true }),
    supabase
      .from('running_league_records')
      .select(
        'member_id, distance_event, measured_at, time_seconds, time_text, record_phase, created_at',
      )
      .eq('member_id', memberId)
      .in('record_phase', ['other', 'pb_history']),
    supabase.from('member_rivals').select('id').eq('member_id', memberId).maybeSingle(),
    supabase
      .from('team_battle_members')
      .select('id, battle:team_battles(status)')
      .eq('member_id', memberId),
    supabase
      .from('weekly_missions')
      .select(
        'id, title, description, mission_type, target_value, unit, start_at, end_at, is_active, is_auto, created_by, reward_points, sort_order',
      )
      .eq('is_active', true),
    supabase
      .from('member_achievements')
      .select('achievement_id, unlocked_at, metadata, achievement:achievements(code)')
      .eq('member_id', memberId),
    supabase
      .from('member_achievement_showcase')
      .select('position, achievement:achievements(code)')
      .eq('member_id', memberId)
      .order('position', { ascending: true }),
  ])

  let pbHistoryAvailable = true
  if (pbResult.error) {
    const message = pbResult.error.message?.toLowerCase() ?? ''
    if (pbResult.error.code === '23514' || message.includes('record_phase')) {
      pbHistoryAvailable = false
    }
  }

  const hasTeamBattle = (battleResult.data ?? []).some((row) => {
    const battleJoin = row.battle as { status?: string } | { status?: string }[] | null
    const battle = Array.isArray(battleJoin) ? battleJoin[0] : battleJoin
    return battle?.status === 'active' || battle?.status === 'ended'
  })

  const missionDefs: WeeklyMissionDefinition[] = (missionsResult.data ?? []).map((row) => {
    const typeRaw = String(row.mission_type ?? 'distance')
    const mission_type = isWeeklyMissionType(typeRaw) ? typeRaw : 'distance'
    return {
      id: String(row.id),
      title: String(row.title ?? '미션'),
      description: row.description == null ? null : String(row.description),
      mission_type,
      target_value: Number(row.target_value ?? 0),
      unit: String(row.unit ?? unitForMissionType(mission_type)),
      start_at: String(row.start_at).slice(0, 10),
      end_at: String(row.end_at).slice(0, 10),
      is_active: row.is_active !== false,
      is_auto: Boolean(row.is_auto),
      reward_points: Math.max(0, Math.floor(Number(row.reward_points ?? 0))),
      sort_order: Number(row.sort_order ?? 0),
      created_by: row.created_by == null ? null : String(row.created_by),
    }
  })

  let isCurrentMvp = false
  try {
    const mvpHome = await getMemberMvpHome(memberId)
    if (mvpHome && !('unlinked' in mvpHome)) {
      isCurrentMvp =
        mvpHome.weekly.myTitles.length > 0 || mvpHome.monthly.myTitles.length > 0
    }
  } catch (error) {
    console.error('gatherMemberContext.mvp', error)
  }

  const unlockedByCode = new Map<
    string,
    { unlockedAt: string; metadata: Record<string, unknown> | null; achievementId?: string }
  >()
  for (const row of unlocksResult.data ?? []) {
    const achJoin = row.achievement as { code?: string } | { code?: string }[] | null
    const ach = Array.isArray(achJoin) ? achJoin[0] : achJoin
    const code = ach?.code
    if (!code) continue
    unlockedByCode.set(code, {
      unlockedAt: String(row.unlocked_at),
      metadata: (row.metadata as Record<string, unknown> | null) ?? null,
      achievementId: row.achievement_id ? String(row.achievement_id) : undefined,
    })
  }

  const showcaseCodes: Array<{ code: string; position: number }> = []
  for (const row of showcaseResult.data ?? []) {
    const achJoin = row.achievement as { code?: string } | { code?: string }[] | null
    const ach = Array.isArray(achJoin) ? achJoin[0] : achJoin
    if (!ach?.code) continue
    showcaseCodes.push({ code: String(ach.code), position: Number(row.position) })
  }

  const logs = (logsResult.data ?? []).map((row) => ({
    member_id: String(row.member_id),
    distance_km: Number(row.distance_km ?? 0),
    logged_at: String(row.logged_at),
  }))

  const pbRecords = pbHistoryAvailable
    ? (pbResult.data ?? []).map((row) => ({
        member_id: String(row.member_id),
        distance_event: String(row.distance_event),
        measured_at: String(row.measured_at),
        time_seconds: row.time_seconds == null ? null : Number(row.time_seconds),
        time_text: row.time_text == null ? null : String(row.time_text),
        record_phase: row.record_phase == null ? null : String(row.record_phase),
        created_at: row.created_at == null ? null : String(row.created_at),
      }))
    : []

  return {
    supabase,
    recognition,
    logs,
    pbRecords,
    pbHistoryAvailable,
    hasRival: Boolean(rivalResult.data?.id),
    hasTeamBattle,
    missionDefs,
    isCurrentMvp,
    unlockedByCode,
    showcaseCodes,
    unlocksError: unlocksResult.error,
    showcaseError: showcaseResult.error,
  }
}

/**
 * 회원 Achievement 평가 + idempotent unlock.
 * 여러 번 호출해도 unique constraint로 중복 지급되지 않는다.
 */
export async function evaluateAchievementsForMember(
  memberId: string,
): Promise<{ ok: true; newlyUnlocked: AchievementCode[] } | { ok: false; error: string }> {
  const id = memberId.trim()
  if (!id) return { ok: false, error: 'member_id 필요' }

  const ctx = await gatherMemberContext(id)
  const { catalog, tableReady } = await loadCatalog(ctx.supabase)
  if (!tableReady) {
    return { ok: false, error: 'achievements 테이블이 없습니다. add-achievements.sql 을 실행해주세요.' }
  }

  const stats = computeMemberAchievementStats({
    memberId: id,
    logs: ctx.logs,
    recognition: ctx.recognition,
    missionDefs: ctx.missionDefs,
    pbRecords: ctx.pbRecords,
    pbHistoryAvailable: ctx.pbHistoryAvailable,
    hasRival: ctx.hasRival,
    hasTeamBattle: ctx.hasTeamBattle,
    isCurrentMvp: ctx.isCurrentMvp,
  })

  const candidates = evaluateAchievementUnlocks(catalog, stats)
  const newlyUnlocked: AchievementCode[] = []

  for (const candidate of candidates) {
    if (ctx.unlockedByCode.has(candidate.code)) continue
    const def = catalog.find((row) => row.code === candidate.code)
    if (!def?.id) continue

    const payload = {
      member_id: id,
      achievement_id: def.id,
      unlocked_at: candidate.unlockedAt ?? new Date().toISOString(),
      metadata: candidate.metadata,
    }

    const { error } = await ctx.supabase.from('member_achievements').insert(payload)

    if (error) {
      if (error.code === '23505' || error.message.includes('duplicate')) continue
      console.error('evaluateAchievementsForMember.unlock', candidate.code, error.message)
      continue
    }
    newlyUnlocked.push(candidate.code)
  }

  if (newlyUnlocked.length > 0) {
    revalidateAchievementPaths()
  }

  return { ok: true, newlyUnlocked }
}

export type MemberAchievementsHome =
  | MemberAchievementsView
  | { unlinked: true }

export async function getMemberAchievementsHome(
  memberId?: string | null,
  options?: { evaluate?: boolean },
): Promise<MemberAchievementsHome> {
  let resolvedMemberId = memberId?.trim() || null
  if (!resolvedMemberId) {
    const member = await getMemberForCurrentUser()
    resolvedMemberId = member?.id ?? null
  }
  if (!resolvedMemberId) return { unlinked: true }

  let newlyUnlocked: AchievementCode[] = []
  if (options?.evaluate !== false) {
    const result = await evaluateAchievementsForMember(resolvedMemberId)
    if (result.ok) newlyUnlocked = result.newlyUnlocked
  }

  const ctx = await gatherMemberContext(resolvedMemberId)
  const { catalog, tableReady } = await loadCatalog(ctx.supabase)

  if (!tableReady || isMissingAchievementsTable(ctx.unlocksError)) {
    const stats = computeMemberAchievementStats({
      memberId: resolvedMemberId,
      logs: ctx.logs,
      recognition: ctx.recognition,
      missionDefs: ctx.missionDefs,
      pbRecords: ctx.pbRecords,
      pbHistoryAvailable: ctx.pbHistoryAvailable,
      hasRival: ctx.hasRival,
      hasTeamBattle: ctx.hasTeamBattle,
      isCurrentMvp: ctx.isCurrentMvp,
    })
    return buildMemberAchievementsView({
      catalog,
      stats,
      unlockedByCode: new Map(),
      showcaseCodes: [],
      tableReady: false,
      newlyUnlockedCodes: [],
    })
  }

  const stats = computeMemberAchievementStats({
    memberId: resolvedMemberId,
    logs: ctx.logs,
    recognition: ctx.recognition,
    missionDefs: ctx.missionDefs,
    pbRecords: ctx.pbRecords,
    pbHistoryAvailable: ctx.pbHistoryAvailable,
    hasRival: ctx.hasRival,
    hasTeamBattle: ctx.hasTeamBattle,
    isCurrentMvp: ctx.isCurrentMvp,
  })

  return buildMemberAchievementsView({
    catalog,
    stats,
    unlockedByCode: ctx.unlockedByCode,
    showcaseCodes: ctx.showcaseCodes,
    tableReady: true,
    newlyUnlockedCodes: newlyUnlocked,
  })
}

export async function setMyAchievementShowcase(
  achievementCodes: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const member = await getMemberForCurrentUser()
  if (!member?.id) return { ok: false, error: '러닝 회원 연결이 필요합니다.' }

  const unique = [...new Set(achievementCodes.map((c) => c.trim()).filter(Boolean))]
  if (unique.length > MAX_SHOWCASE_BADGES) {
    return { ok: false, error: `대표 배지는 최대 ${MAX_SHOWCASE_BADGES}개입니다.` }
  }
  for (const code of unique) {
    if (!isAchievementCode(code)) {
      return { ok: false, error: '알 수 없는 배지입니다.' }
    }
  }

  const supabase = await createClient()
  const { catalog, tableReady } = await loadCatalog(supabase)
  if (!tableReady) {
    return { ok: false, error: 'achievements 테이블이 없습니다. add-achievements.sql 을 실행해주세요.' }
  }

  const { data: unlockedRows, error: unlockedError } = await supabase
    .from('member_achievements')
    .select('achievement_id, achievement:achievements(code)')
    .eq('member_id', member.id)

  if (unlockedError) {
    if (isMissingAchievementsTable(unlockedError)) {
      return { ok: false, error: 'achievements 테이블이 없습니다. add-achievements.sql 을 실행해주세요.' }
    }
    return { ok: false, error: unlockedError.message }
  }

  const unlockedCodes = new Set<string>()
  const idByCode = new Map<string, string>()
  for (const row of unlockedRows ?? []) {
    const achJoin = row.achievement as { code?: string } | { code?: string }[] | null
    const ach = Array.isArray(achJoin) ? achJoin[0] : achJoin
    if (!ach?.code) continue
    unlockedCodes.add(ach.code)
    idByCode.set(ach.code, String(row.achievement_id))
  }

  for (const code of unique) {
    if (!unlockedCodes.has(code)) {
      return { ok: false, error: '획득한 배지만 대표로 설정할 수 있습니다.' }
    }
  }

  await supabase.from('member_achievement_showcase').delete().eq('member_id', member.id)

  if (unique.length > 0) {
    const rows = unique.map((code, index) => ({
      member_id: member.id,
      achievement_id: idByCode.get(code) ?? catalog.find((c) => c.code === code)?.id,
      position: index + 1,
    }))
    if (rows.some((row) => !row.achievement_id)) {
      return { ok: false, error: '배지 ID를 찾을 수 없습니다.' }
    }
    const { error } = await supabase.from('member_achievement_showcase').insert(rows)
    if (error) return { ok: false, error: error.message }
  }

  revalidateAchievementPaths()
  return { ok: true }
}

/** 마일리지/PB 등 저장 후 fire-and-forget 용 */
export async function evaluateAchievementsForMemberQuiet(memberId: string | null | undefined) {
  const id = memberId?.trim()
  if (!id) return
  try {
    await evaluateAchievementsForMember(id)
    const { evaluateRewardsForMemberQuiet } = await import('@/lib/actions/rewards')
    await evaluateRewardsForMemberQuiet(id)
  } catch (error) {
    console.error('evaluateAchievementsForMemberQuiet', error)
  }
}
