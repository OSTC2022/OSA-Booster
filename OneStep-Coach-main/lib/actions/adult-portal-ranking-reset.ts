'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { requireRole } from '@/lib/actions/auth'
import { getCenterSettingsCached } from '@/lib/data/center-settings-read'
import { ADMIN_OR_OPERATOR_ROLES } from '@/lib/operator-access'
import { ensureCenterPortalRankingLeague } from '@/lib/running-league/center-portal-ranking-league'
import { resolvePortalRankingPeriod } from '@/lib/running-league/ranking-period'
import { mileageScoreFromKm } from '@/lib/running-league/scoring'
import { createServiceRoleClient } from '@/lib/supabase/admin'

const CENTER_SETTINGS_ID = 'default'

function revalidateAdultPortalRankingPaths() {
  revalidateTag('center-settings', 'max')
  revalidatePath('/dashboard/settings/adult-running-portal')
  revalidatePath('/dashboard/my')
  revalidatePath('/dashboard/my/running-league')
}

export async function resetAdultPortalMileageAttendanceChase(): Promise<
  { ok: true; periodLabel: string; deletedLogCount: number } | { ok: false; error: string }
> {
  await requireRole(ADMIN_OR_OPERATOR_ROLES)

  let league
  try {
    league = await ensureCenterPortalRankingLeague()
  } catch (error) {
    console.error('resetAdultPortalMileageAttendanceChase.league', error)
    return { ok: false, error: '러닝 포털 리그를 찾지 못했습니다.' }
  }

  if (!league) {
    return { ok: false, error: '러닝 포털 리그가 준비되지 않았습니다.' }
  }

  const centerSettings = await getCenterSettingsCached()
  const rankingPeriod = resolvePortalRankingPeriod(centerSettings)
  const { start, end } = rankingPeriod

  const supabase = createServiceRoleClient()

  const { data: logsToDelete, error: selectError } = await supabase
    .from('running_league_mileage_logs')
    .select('id')
    .eq('league_id', league.id)
    .gte('logged_at', start)
    .lte('logged_at', end)

  if (selectError) {
    if (selectError.code === '42P01') {
      return { ok: false, error: '마일리지 테이블이 없습니다. DB 마이그레이션을 확인해주세요.' }
    }
    return { ok: false, error: selectError.message }
  }

  const { error: deleteError } = await supabase
    .from('running_league_mileage_logs')
    .delete()
    .eq('league_id', league.id)
    .gte('logged_at', start)
    .lte('logged_at', end)

  if (deleteError) {
    return { ok: false, error: deleteError.message }
  }

  const { error: participantError } = await supabase
    .from('running_league_participants')
    .update({
      mileage_km: 0,
      mileage_score: mileageScoreFromKm(0),
      updated_at: new Date().toISOString(),
    })
    .eq('league_id', league.id)

  if (participantError) {
    return { ok: false, error: participantError.message }
  }

  const { error: chaseError } = await supabase
    .from('center_settings')
    .update({
      adult_portal_chase_member_id: null,
      adult_portal_chase_label: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', CENTER_SETTINGS_ID)

  if (chaseError) {
    return { ok: false, error: `이겨라 설정 초기화 실패: ${chaseError.message}` }
  }

  revalidateAdultPortalRankingPaths()

  return {
    ok: true,
    periodLabel: rankingPeriod.label,
    deletedLogCount: logsToDelete?.length ?? 0,
  }
}
