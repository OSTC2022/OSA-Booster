/**
 * OSA_Booster (새 Supabase) 전용 DB 초기화 SQL 생성기
 *
 * - 기존 osa osa 운영 프로젝트에는 절대 실행하지 마세요.
 * - DROP TABLE / DELETE FROM / TRUNCATE 문은 제거합니다.
 * - 개별 migration 파일을 의존 순서대로 합칩니다.
 *
 * Usage: node scripts/build-osa-booster-init.mjs
 * Output: supabase/osa-booster-init.sql
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SUPABASE_DIR = resolve(process.cwd(), 'supabase')
const OUTPUT = resolve(SUPABASE_DIR, 'osa-booster-init.sql')

/** 실행 순서 (의존성 기준). 제외 파일은 EXCLUDED 참고 */
const ORDERED_MIGRATIONS = [
  // 1. Core auth + legacy users
  'schema.sql',
  'members.sql',

  // 2. Profiles, roles, sessions MVP
  'add-auth-roles-mvp.sql',
  'add-profile-approval.sql',
  'fix-users-role-trigger.sql',
  'add-profile-avatar-contact.sql',

  // 3. Members extensions
  'add-member-login-fields.sql',
  'add-members-columns.sql',
  'add-age-column.sql',
  'add-member-gender-pb-distances.sql',
  'add-member-portal-coach.sql',
  'add-member-school.sql',
  'add-members-deleted-at.sql',
  'member-invite-flow.sql',
  'fix-member-self-read-rls.sql',
  'fix-members-rls.sql',

  // 4. Instructors + lessons core
  'fix-instructors-rls.sql',
  'fix-lessons.sql',
  'fix-lessons-rls.sql',
  'add-lesson-title.sql',
  'add-lesson-recurrence.sql',
  'add-calendar-recurrence-v2.sql',
  'add-lesson-calendar-display.sql',
  'fix-check-in-lesson.sql',
  'fix-session-packages.sql',
  'fix-session-packages-rls.sql',
  'add-session-packages-deleted-at.sql',
  'add-signatures.sql',
  'add-instructor-calendar-color.sql',
  'add-instructor-pay-overrides.sql',

  // 5. Center settings + board (before running leagues FK)
  'add-sns-accounts.sql',
  'add-center-contact-fields.sql',
  'add-adult-portal-blind-member-usage.sql',
  'add-adult-portal-brand-settings.sql',
  'add-adult-portal-ranking-period.sql',
  'add-adult-portal-chase-member.sql',
  'add-blog-url.sql',
  'add-center-board-posts.sql',
  'add-adult-member-role-and-board-audience.sql',

  // 6. Member body / wellness
  'add-member-body-records.sql',
  'add-member-body-records-self-rls.sql',
  'add-member-body-baseline-date.sql',
  'add-member-body-nutrition-fields.sql',
  'add-member-body-wellness-fields.sql',
  'add-member-pain-detail-fields.sql',
  'add-member-protein-tracking.sql',
  'add-member-protein-intake-by-slot.sql',
  'add-member-body-share-token.sql',
  'add-member-backup-settings.sql',
  'add-member-backup-auto-date.sql',

  // 7. Food catalog (optional UI)
  'add-food-items.sql',

  // 8. Google Calendar (optional)
  'add-google-calendar-sync.sql',
  'add-google-calendar-oauth-state.sql',
  'add-google-calendar-sync-v2.sql',
  'add-google-calendar-sync-lesson2.sql',
  'add-google-calendar-bidirectional-sync.sql',

  // 9. Running league — login/member/running/mileage 핵심
  'add-running-league-tables.sql',
  'expand-running-league-schema.sql',
  'add-running-league-goal-type.sql',
  'add-running-league-target-group.sql',
  'add-running-league-event-subtype.sql',
  'add-running-league-daily-recovery.sql',
  'add-running-league-pb-history.sql',
  'add-running-league-pb-snapshots.sql',
  'add-running-league-mileage-extraction.sql',
  'add-running-league-training-schedule.sql',
  'add-center-portal-ranking-league.sql',
  'add-center-portal-member-mileage-rls.sql',
  'add-center-portal-leaderboard-read-rls.sql',

  // 10. Center running training schedule
  'add-center-running-training-schedule.sql',
  'add-center-running-training-schedule-dates.sql',
  'add-center-running-training-schedule-library.sql',

  // 11. Indexes
  'performance-indexes.sql',

  // 12. Admin seed (새 프로젝트 전용)
  'osa-booster-seed-admin.sql',
]

const EXCLUDED = new Set([
  'bootstrap-minimal-admin.sql',
  'cleanup-orphan-auth-email.sql',
  'dedupe-google-calendar-lessons.sql',
  'import-weijiyong-body-weights.sql',
  'seed-food-catalog.sql',
  'fix-lessons-recurrence-delete.sql',
  'fix-adult-member-profile-role.sql',
  'osa-booster-init.sql',
])

const DANGEROUS_LINE =
  /^\s*(DROP\s+TABLE\b|DELETE\s+FROM\b|TRUNCATE\s+(TABLE\s+)?)/i

function sanitizeSql(content, fileName) {
  const lines = content.split('\n')
  const out = []
  let skipBlock = false

  for (const line of lines) {
    const trimmed = line.trim()

    if (DANGEROUS_LINE.test(trimmed)) {
      out.push(`-- [skipped dangerous in ${fileName}] ${trimmed}`)
      continue
    }

    // Skip standalone DELETE inside DO blocks is harder; line-level is enough for our migrations
    out.push(line)
  }

  return out.join('\n').trim()
}

const seen = new Set()
const parts = [
  `-- =============================================================================
-- OSA_Booster Supabase 초기화 SQL (안전 버전)
-- =============================================================================
-- 대상: OSA_Booster (새 프로젝트) ONLY
-- 금지: osa osa 운영 프로젝트에서 실행하지 마세요
-- 생성: node scripts/build-osa-booster-init.mjs
-- 포함: CREATE/ALTER/RLS/Storage bucket/함수 (DROP TABLE·DELETE·TRUNCATE 제외)
-- =============================================================================
`,
]

for (const file of ORDERED_MIGRATIONS) {
  if (seen.has(file)) continue
  seen.add(file)
  if (EXCLUDED.has(file)) continue

  const path = resolve(SUPABASE_DIR, file)
  let content
  try {
    content = readFileSync(path, 'utf8')
  } catch {
    if (file === 'osa-booster-seed-admin.sql') continue
    console.warn(`WARN: missing ${file}`)
    continue
  }

  parts.push(`\n-- >>> BEGIN ${file}\n`)
  parts.push(sanitizeSql(content, file))
  parts.push(`\n-- <<< END ${file}\n`)
}

parts.push('\nNOTIFY pgrst, \'reload schema\';\n')

writeFileSync(OUTPUT, parts.join('\n'), 'utf8')
console.log(`Wrote ${OUTPUT} (${parts.length} sections)`)
