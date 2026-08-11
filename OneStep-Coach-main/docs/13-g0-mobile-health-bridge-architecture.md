# 13-G0 — ONE STEP Mobile Health Bridge Architecture

Status: **DECISION LOCKED** (no large implementation in G0)  
Date: 2026-08-11

## Recommended architecture

**Existing Next.js web app (unchanged) + `mobile/` Expo React Native Companion + shared Supabase project.**

Garmin Browser Bootstrap / Python Worker remain as **fallback / admin / special members**.  
Default member UX becomes Health Bridge (Apple Health / Health Connect).

---

## 1. Existing web architecture (audited)

| Item | Actual |
|------|--------|
| Next.js | `16.2.6` |
| React | `^19` |
| TypeScript | `5.7.3` |
| Supabase JS | `@supabase/supabase-js`, `@supabase/ssr` |
| Deploy signals | `@vercel/analytics`; Next App Router under `app/` |
| PWA | `app/manifest.ts` (web manifest generation) |
| Mobile UI | Responsive web (member portal); not a native app |
| Server patterns | Server Actions (`'use server'`) + `app/api/*` routes |
| Env | `.env.local` (web); `garmin-worker/.env` (worker). No `SERVICE_ROLE` in client |

**Do not rewrite the web app in React Native.**

## 2. Supabase Auth

- Primary login: `signInWithPassword` after `resolveLoginAuthEmail` (`lib/actions/auth.ts`).
- Session via Supabase cookies (`@supabase/ssr`).
- Profiles: `profiles.id = auth.users.id` with role / approval.

## 3. auth.uid → member mapping

```
auth.users.id
  → members.auth_user_id OR members.user_id
  → getMemberForCurrentUser()
```

Server never trusts client-supplied `member_id` for Garmin/mileage mutations.  
Health Bridge must use the same rule.

## 4. Mileage Source of Truth

Table: **`running_league_mileage_logs`** (live columns confirmed):

`id`, `participant_id`, `league_id`, `member_id`, `distance_km`, `logged_at`, `source`, `notes`, `created_at`, `updated_at`, `duration`, `pace`, `heart_rate`, `calories`, `activity_time`, `source_app`, `screenshot_url`, `image_hash`, `extraction_confidence`, `extraction_raw_json`, `verification_status`, `external_activity_id`

Ranking / Mission / STREAK / Rival / etc. already consume this table.  
**No second mileage system.**

## 5. Garmin integration (preserve)

Present and kept:

- `garmin-worker/` (Python long-running worker)
- `member_activity_connections` (provider CHECK currently **`GARMIN` only**)
- `garmin_sync_runs`, `activity_sync_requests`, `activity_provider_sync_state`
- `member_mileage_duplicate_candidates`, `activity_sync_resolutions`, `activity_reconciliation_events`
- Unique: `(member_id, source_app, external_activity_id)` WHERE `external_activity_id IS NOT NULL`

G0 does **not** delete or replace these.

## 6. Architecture candidates

| Option | Verdict |
|--------|---------|
| **A. Expo RN Companion** | **RECOMMENDED** — thin native shell, TS, shared mental model, config plugins for HealthKit/HC |
| B. RN Bare | More control, higher maintenance; not needed for v1 |
| **C. Capacitor `server.url` → Next.js** | **EXCLUDED for production** — Capacitor docs: `server.url` is for live-reload, **not intended for production**; App Store risk; Health permissions still need native modules anyway |
| D. Flutter | Second language/stack; no advantage for this team |

## 7. Final recommendation (why)

1. Web app is large (dashboard, league, OCR, rewards) — must stay Next.js.  
2. HealthKit / Health Connect require **real native APIs**, not a remote WebView alone.  
3. Companion role is tiny: login + read running workouts + upload + sync status.  
4. Expo keeps Windows Android work + shared TS; iOS still needs Mac/CI for store builds.  
5. Same Supabase project → one member account.

## 8. Repository layout

```
OneStep-Coach-main/
  app/ …                 # existing Next.js
  garmin-worker/         # keep
  mobile/                # NEW Expo app (G1+)
  docs/13-g0-…md         # this decision
```

Monorepo-lite: separate `mobile/package.json` (no forced Turborepo yet).  
Avoid coupling Expo root into the Next `package.json`.

## 9. iOS HealthKit (docs-based scope)

Use (read-only, minimal):

- `HKWorkout` / `HKObjectType.workoutType()`
- Activity: `HKWorkoutActivityType.running` (and device-QA for indoor via `HKMetadataKeyIndoorWorkout`)
- Distance: workout `totalDistance` and/or associated distance samples for that workout only — **not** daily steps aggregates
- Identity: `HKWorkout.uuid`
- Attribution: `sourceRevision` / `HKSource.name` (map after device observation; no hardcoded Garmin/Apple names in G0)
- Auth: request only workout + distance quantity types needed
- Sync: `HKObserverQuery` + `enableBackgroundDelivery` → then `HKAnchoredObjectQuery` for deltas  
  (Anchored queries alone cannot register for background delivery per Apple docs)

**Background is opportunistic** — UI says “자동 동기화”, never “실시간”.

## 10. Android Health Connect (docs-based scope)

Use:

- `ExerciseSessionRecord` with running exercise type(s)
- Distance via associated `DistanceRecord` overlapping the session (not daily steps)
- `metadata.id` as external id; `metadata.dataOrigin` for attribution
- Incremental: Changes token (`getChangesToken` / `getChanges`)
- Background: optional `READ_HEALTH_DATA_IN_BACKGROUND` + WorkManager when feature available

Do **not** request HR / sleep / weight / nutrition permissions.

## 11. Background reality

| Platform | Expectation |
|----------|-------------|
| iOS | OS may wake briefly for HealthKit observers; not guaranteed immediate |
| Android | Foreground reads always; background only with extra permission + WorkManager |

App-open / manual “지금 동기화” remains a first-class path.

## 12. Permissions (minimum)

**iOS:** HealthKit share none (read-only); workouts + distance.  
**Android:** Health Connect read for ExerciseSession + Distance (+ background read only if enabled later).

## 13. Source attribution

Store opaque observed strings first:

- `source_origin` (e.g. HealthKit source name / HC dataOrigin package)

Later classify into soft buckets (`GARMIN`, `APPLE_WATCH`, `OTHER`) **only after device QA samples** — never invent mappings in G0.

## 14. External activity ID

| Provider `source_app` | `external_activity_id` |
|-----------------------|------------------------|
| `GARMIN` (existing) | Garmin activityId |
| `APPLE_HEALTH` | HealthKit workout UUID |
| `HEALTH_CONNECT` | Health Connect record id |

Reuse unique index `(member_id, source_app, external_activity_id)`.

## 15. Cross-provider duplicate risk

Same physical run can appear as:

- Garmin Worker row (`source_app=GARMIN`)
- HealthKit/HC row (`APPLE_HEALTH` / `HEALTH_CONNECT`) with **different** external ids → unique index alone **will not** dedupe → **double mileage risk**.

## 16. Primary provider policy (recommended)

Extend connection model (G4/G6 schema):

`preferred_activity_sync_provider` ∈ `DIRECT_GARMIN` | `APPLE_HEALTH` | `HEALTH_CONNECT`

When member enables Health Bridge on iOS → set primary `APPLE_HEALTH`, **pause** DIRECT_GARMIN auto sync for that member.  
Android → `HEALTH_CONNECT`, pause DIRECT_GARMIN.  
Disconnect Health Bridge → optionally restore DIRECT_GARMIN.

Plus probabilistic `SAME_ACTIVITY_CANDIDATE` (reuse 13-E review patterns) for residual collisions — **no silent auto-merge**.

## 17. Mobile → backend security

- App uses **anon key + user JWT only** — **no service role**.
- Upload via authenticated **Next.js API** or **SECURITY DEFINER RPC** (mirror `import_garmin_mileage_log`):
  - resolve member from `auth.uid()`
  - validate running type, distance > 0, timestamps, external id
  - idempotent insert
- Never trust client `member_id`.

## 18. iOS build requirements

- Xcode / macOS (or cloud Mac CI) for device + App Store builds  
- **Windows cannot run iOS Simulator / claim iOS HealthKit PASS**  
- Real iPhone QA required before release

## 19. Android build requirements

- Android Studio / SDK on Windows OK  
- Emulator limited for Health Connect; **real device QA required**  
- Play Console for distribution

## 20. G1 expected files (plan only)

```
mobile/
  package.json
  app.json / app.config.ts
  app/(auth)/login.tsx
  app/(sync)/index.tsx          # skeleton status UI
  src/lib/supabase.ts           # anon + session
  src/lib/session.ts
  README.md
```

Web (later G4): `app/api/health-bridge/import/route.ts` or RPC SQL — **not in G1**.

## 21. Risks

1. Cross-provider double count if Garmin + Health both active  
2. Background sync delays / OS kills  
3. Indoor/treadmill typing needs device QA  
4. `member_activity_connections.provider` CHECK must be widened before storing Health providers  
5. App Store Health privacy nutrition labels / permissions scrutiny  
6. Expo HealthKit/HC modules must be chosen in G2/G3 from **current** maintained packages (not installed in G0)

## 22. USER ACTION REQUIRED

- [ ] Confirm Apple Developer + Google Play accounts  
- [ ] Confirm macOS (or CI) available for iOS builds  
- [ ] Confirm Beta test phones (iPhone + Android with Health Connect)  
- [ ] Decide Beta cohort (start with 1–2 admins)  
- [ ] Approve primary-provider pause of DIRECT_GARMIN when Health Bridge connected  

---

## Stage roadmap

| Stage | Scope |
|-------|--------|
| **13-G1** | Expo project, Supabase auth, member link proof, sync UI skeleton |
| **13-G2** | iOS HealthKit running read + upload |
| **13-G3** | Android Health Connect running read + upload |
| **13-G4** | Unified import RPC + SoT wiring |
| **13-G5** | Background sync (observer / WorkManager) |
| **13-G6** | Cross-provider dedupe + Garmin pause/fallback |
| **13-G7** | Real device QA / store builds |
| **13-G8** | Beta release |

## PASS checklist

| Gate | Result |
|------|--------|
| Existing Architecture Audit | **PASS** |
| Mobile Architecture Decision | **PASS** (Expo Companion) |
| Supabase Auth Reuse | **POSSIBLE** |
| HealthKit Strategy | **READY** (docs; device QA later) |
| Health Connect Strategy | **READY** (docs; device QA later) |
| Mileage Integration Strategy | **READY** (reuse logs table) |
| External ID Strategy | **READY** |
| Cross-provider Dedupe Strategy | **READY** (primary pause + candidate review) |
| Garmin Fallback Strategy | **READY** (keep worker; pause per member) |
| Mobile Security Strategy | **READY** (JWT + server RPC; no service role) |
| Background Strategy | **READY** (opportunistic; not realtime) |
