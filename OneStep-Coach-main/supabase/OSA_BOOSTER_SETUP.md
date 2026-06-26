# OSA_Booster Supabase 설정 가이드

> **중요:** 이 문서의 SQL·환경 변수는 **OSA_Booster (새 프로젝트)** 전용입니다.  
> **osa osa (운영)** 프로젝트에는 절대 실행·적용하지 마세요.

---

## 1. `.env.local` 설정 (OSA_Booster)

Supabase Dashboard → **OSA_Booster** → Settings → API 에서 복사:

```env
# OSA_Booster 프로젝트 키만 사용 (osa osa 키 사용 금지)
NEXT_PUBLIC_SUPABASE_URL=https://<osa-booster-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<osa-booster-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<osa-booster-service-role-key>

NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

선택 (기능별):

| 변수 | 용도 |
|------|------|
| `OPENAI_API_KEY` | 러닝 스크린샷 AI 분석 (Vercel/서버) |
| `SMTP_*` | 비밀번호 재설정 메일 |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google Calendar |
| `SUPABASE_DB_PASSWORD` | `node scripts/run-bootstrap-sql.mjs` 자동 실행용 |

---

## 2. DB 초기화 (OSA_Booster SQL Editor)

### 2-A. 통합 SQL 생성

```powershell
cd OneStep-Coach-main
node scripts/build-osa-booster-init.mjs
```

생성 파일: `supabase/osa-booster-init.sql`

### 2-B. Supabase에서 실행

1. [OSA_Booster SQL Editor](https://supabase.com/dashboard) 열기  
2. `supabase/osa-booster-init.sql` 전체 붙여넣기  
3. **Run** (빈 DB 기준 1회)

포함 내용:

- `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE` (스키마)
- RLS 정책 (`CREATE POLICY`, `DROP POLICY IF EXISTS`만)
- Storage bucket: `avatars`, `running-mileage-screenshots`
- 러닝 리그·마일리지·센터 랭킹 시드 (`ONE STEP RUNNING RANKING`)

**제외 (안전):** `DROP TABLE`, `DELETE FROM`, `TRUNCATE`  
**제외 파일:** `cleanup-orphan-auth-email.sql`, `dedupe-google-calendar-lessons.sql`, 운영 데이터 import 등

---

## 3. 관리자 계정

```powershell
node scripts/ensure-protected-admin.mjs allakj@naver.com <비밀번호> 관리자
```

또는 SQL 실행 후 `osa-booster-seed-admin.sql`이 프로필을 맞춥니다.

---

## 4. 기능별 필수 체크리스트

### 로그인 / 회원

| 항목 | 테이블 | RLS |
|------|--------|-----|
| Auth 연동 | `profiles`, `users` | `profiles_select_own_or_admin` |
| 가입 승인 | `profiles.approval_status` | pending/rejected 리다이렉트 |
| 회원 | `members` | admin/coach/self read |
| 강사 | `instructors` | admin/coach |

### 러닝 기록 / 마일리지 챌린지

| 항목 | 테이블 | Storage |
|------|--------|---------|
| 리그 | `running_leagues` | — |
| 참가 | `running_league_participants` | — |
| 마일리지 로그 | `running_league_mileage_logs` | `running-mileage-screenshots` |
| PB/기록 | `running_league_records`, `running_league_pb_snapshots` | — |
| 센터 랭킹 | `ONE STEP RUNNING RANKING` 리그 + RLS | `add-center-portal-member-mileage-rls.sql` |
| 마일리지 챌린지 게시 | `center_board_posts` (event/mileage_challenge) | — |

### Storage bucket

| Bucket | 공개 | 용도 |
|--------|------|------|
| `avatars` | public | 프로필 사진 |
| `running-mileage-screenshots` | private | 러닝 스크린샷 (서버 업로드) |

---

## 5. 개발 서버 실행

```powershell
npm.cmd run dev
```

http://localhost:3000

---

## 6. 기존 migration 파일 위치

모든 SQL은 `supabase/` 폴더에 있습니다. 통합 파일 대신 개별 실행 시 `scripts/build-osa-booster-init.mjs`의 `ORDERED_MIGRATIONS` 순서를 따르세요.
