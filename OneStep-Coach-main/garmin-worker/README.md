# Garmin Connect → ONE STEP (unofficial / BETA)

Independent Python worker. Library: [`python-garminconnect==0.3.9`](https://github.com/cyberjunky/python-garminconnect).

**Garmin auth/API can break without notice.** Manual mileage remains the fallback. Sync failure must not take down the core app.

See **[OPS.md](./OPS.md)** for production hosting, emergency stop, and migration order.

## Auth model

1. **Browser bootstrap (once, connector PC):** member logs in manually in Chromium  
2. **Encrypt to DB:** pairing connector → `member_activity_connections.encrypted_token`  
3. **Automatic worker:** `python -m app.worker` — DB token restore only, **no password**, **no Chromium**

## Production start

```bash
python -m app.worker
# or
docker build -t onestep-garmin-worker .
docker run --env-file .env --restart unless-stopped onestep-garmin-worker
```

Required env (values never committed): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GARMIN_TOKEN_ENCRYPTION_KEY`.

Emergency stop: `GARMIN_SYNC_ENABLED=false`.

## Install (dev)

```powershell
cd garmin-worker
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
# Connector only:
python -m playwright install chromium
```

## DB migrations (order)

1. `supabase/add-garmin-activity-connections.sql`
2. `supabase/add-garmin-pairing-sessions.sql`
3. `supabase/add-garmin-auto-sync.sql`
4. `supabase/add-garmin-reconciliation.sql`

## Tests

```powershell
python -m unittest discover -s tests -v
```

## Member pairing (DEVELOPMENT connector)

```powershell
.\connect-garmin.bat
# or: python -m app.connect_member
```

Connector talks to Next.js `/api/garmin/connector/*` only.  
**Never embeds service role or encryption key.**

Windows exe packaging → optional stage **13-G**.

## Security

- No Garmin password storage
- No GPS / HR / health payloads persisted
- No raw Garmin JSON in DB
- `encrypted_token` never returned to browsers
