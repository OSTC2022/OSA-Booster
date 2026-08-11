# Garmin Worker — Production Operations (13-F)

Unofficial Garmin Connect integration. Auth/endpoints may change without notice.
If Garmin sync fails, members can still log mileage manually. Core app must stay up.

## Architecture

```
[Member browser] Next.js (Vercel)
        ↓
[Supabase] Auth + DB + RLS
        ↓ pairing (one-time) / status UI
[Connector PC] Browser Bootstrap once → encrypted tokens to DB
        ↓
[Garmin Worker] long-running Python (NOT on Vercel)
        ↓ token restore only
[Garmin Connect API]
        ↓
running_league_mileage_logs → Ranking / Mission / STREAK / …
```

Worker is **outside** the Next.js request lifecycle.

## Start command

```bash
python -m app.worker
```

Docker:

```bash
docker build -t onestep-garmin-worker .
docker run --env-file .env --restart unless-stopped onestep-garmin-worker
```

## Required secrets (names only)

| Variable | Purpose |
|----------|---------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Worker DB access (never to browser/connector) |
| `GARMIN_TOKEN_ENCRYPTION_KEY` | Decrypt `member_activity_connections.encrypted_token` |

Optional ops flags: `GARMIN_SYNC_ENABLED`, `GARMIN_SYNC_INTERVAL_MINUTES`, …

## Local token files

Production worker uses **DB encrypted tokens only**.
`data/tokens` / `garmin_tokens.json` are POC/dev. Ephemeral temp dirs during restore are deleted after each member sync.

## Emergency stop

Set `GARMIN_SYNC_ENABLED=false` and restart/reload env:

- Worker keeps heartbeat
- No Garmin API calls
- Existing mileage / XP / seasons unchanged
- Manual mileage still works

## Replica policy

**Beta default: 1 worker replica.**
Advisory locks exist, but do not run multiple replicas unless ops explicitly needs HA.

## Hosting requirements

| Item | Guidance |
|------|----------|
| Runtime | Python 3.12+ |
| Process | Long-running (`python -m app.worker`) |
| Docker | Supported (`Dockerfile`, no secrets in image) |
| CPU / RAM | Small VPS enough (idle sleep loop) |
| Network | Outbound HTTPS to Supabase + Garmin |
| Restart | `unless-stopped` / systemd `Restart=always` |
| Secrets | Env injection only |

Do **not** host this worker on Vercel serverless.

## Migration order

1. `supabase/add-garmin-activity-connections.sql`
2. `supabase/add-garmin-pairing-sessions.sql`
3. `supabase/add-garmin-auto-sync.sql`
4. `supabase/add-garmin-reconciliation.sql`

No DROP/TRUNCATE of production mileage tables.

**USER ACTION:** take a Supabase backup before applying migrations in production.

## Connector distribution

`python -m app.connect_member` / `connect-garmin.bat` = **DEVELOPMENT ONLY**.
Windows packaging (e.g. PyInstaller) → optional **13-G**.

## Alert conditions (delivery DEFERRED)

- Heartbeat older than 15 minutes
- Provider `RATE_LIMITED` longer than N hours
- `REAUTH_REQUIRED` count above threshold
- Elevated sync failure rate

## Sync interval note

Default **120 minutes** per member is a **conservative operational choice** for this unofficial library — not a Garmin-guaranteed rate limit.

## Beta rollout

1. Admin / self  
2. 2–5 members  
3. ~10 members  
4. Opt-in wider audience  

Do not enable for all members on day one.
