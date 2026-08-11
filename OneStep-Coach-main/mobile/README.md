# 13-G3 ONE STEP Mobile Companion (Health → Mileage)

Expo / React Native companion. Reads Running from Apple Health / Health Connect and uploads
to existing `running_league_mileage_logs` via authenticated web API.

**Requires:** Supabase SQL `supabase/add-health-bridge-sync.sql` applied.

## Setup

```bash
cd mobile
cp .env.example .env
# EXPO_PUBLIC_SUPABASE_* + EXPO_PUBLIC_WEB_PORTAL_URL (points at Next.js with health-bridge API)
```

Health native modules need a Development Build (not Expo Go):

```bash
npx expo run:android
# iOS: macOS + npx expo run:ios
```

## Sync flow

1. Login (Supabase JWT)
2. Connect Health → OS permission
3. Read recent running (7d)
4. `POST /api/health-bridge/import` with Bearer token
5. Server resolves member from `auth.uid()` (ignores client member_id)
6. Exact + cross-provider duplicate checks → insert SoT

## Security

- Anon key + user JWT only in the app
- No `SERVICE_ROLE` on device
- No raw Health JSON stored
