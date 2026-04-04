# PulseWard Comprehensive Install and Setup Guide (PowerShell + Bash)

## Who this guide is for

Use this guide if you want a complete, repeatable setup with no source-code edits.
This guide includes:

1. Windows PowerShell commands.
2. Bash commands for Linux/macOS and container shells.
3. Toolchain setup including global pnpm install option.
4. Database setup.
5. Secrets onboarding (what each secret is, where to get it, where to enter it).
6. Connector and external auth setup.

## Package manager decision

Use pnpm for this repository.

Why pnpm-only here:

1. One lockfile (`pnpm-lock.yaml`) for reproducible workspace installs.
2. Faster monorepo installs with lower disk usage.
3. Better CI consistency.
4. Avoids npm/pnpm lockfile drift.

## Prerequisites

1. Node.js 22+.
2. Git.
3. Docker Desktop (Windows/macOS) or Docker Engine + Compose (Linux).
4. Network access to any external provider you plan to use (Google, Meta, SMTP, ABHA, etc.).

## Step 1: Clone repository

PowerShell:

```powershell
git clone https://github.com/Life-Experimentalist/PulseWard-HMS.git
Set-Location PulseWard-HMS
git checkout main
git pull origin main
```

Bash:

```bash
git clone https://github.com/Life-Experimentalist/PulseWard-HMS.git
cd PulseWard-HMS
git checkout main
git pull origin main
```

## Step 2: Install pnpm (two supported options)

### Option A (recommended): Corepack

PowerShell:

```powershell
corepack enable
corepack prepare pnpm@9.15.0 --activate
pnpm -v
```

Bash:

```bash
corepack enable
corepack prepare pnpm@9.15.0 --activate
pnpm -v
```

### Option B (alternate `npm` path): npm global install

PowerShell:

```powershell
npm install -g pnpm@9.15.0
pnpm -v
```

Bash:

```bash
npm install -g pnpm@9.15.0
pnpm -v
```

Use this option if Corepack is unavailable or blocked in your environment.

## Step 3: Clean old npm artifacts (one time)

Only needed if this machine used npm before in this repo.

PowerShell:

```powershell
Get-ChildItem -Path . -Recurse -Directory -Filter node_modules | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
Get-ChildItem -Path . -Recurse -File -Filter package-lock.json | Remove-Item -Force -ErrorAction SilentlyContinue
```

Bash:

```bash
find . -name node_modules -type d -prune -exec rm -rf {} +
find . -name package-lock.json -type f -delete
```

Install dependencies:

PowerShell and Bash:

```bash
pnpm install --frozen-lockfile
```

## Step 4: Create env file and validate

PowerShell:

```powershell
Copy-Item .env.example .env -ErrorAction SilentlyContinue
pnpm run env:check
```

Bash:

```bash
cp -n .env.example .env
pnpm run env:check
```

Where to enter secrets:

1. Enter all runtime values in the root `.env` file.
2. Do not put real secrets in `.env.example`.
3. In production, inject the same keys as environment variables via your secret manager.

## Step 5: Database setup

This project currently uses DB settings from `.env` and can be run with local containerized databases for development.

### 5.1 Configure database keys in `.env`

Set these keys (already present in .env.example):

1. `DB_HOST` -> `localhost` for local Docker setup
2. `DB_PORT` -> `5432` for local Docker setup
3. `DB_NAME` -> `pulseward` for local Docker setup
4. `DB_USER` -> `pulseward_local` for local Docker setup
5. `DB_PASSWORD` -> `change_me_local_only` for local Docker setup

### 5.2 Start local Postgres and MongoDB containers

PowerShell and Bash:

```bash
docker run -d --name pulseward-postgres -p 5432:5432 -e POSTGRES_DB=pulseward -e POSTGRES_USER=pulseward_local -e POSTGRES_PASSWORD=change_me_local_only postgres:16
docker run -d --name pulseward-mongo -p 27017:27017 mongo:7
```

Verify:

PowerShell and Bash:

```bash
docker ps --filter name=pulseward-postgres
docker ps --filter name=pulseward-mongo
```

### 5.3 If using managed DB instead of local Docker

Get credentials from your DBA/cloud dashboard and update `.env`:

1. Postgres host, port, db, username, password.
2. Mongo host/URI if your deployment path needs it.

## Step 6: Secrets guide (what, where from, where to enter)

All keys below are entered in `.env` at repository root.

### 6.1 Core app secrets

1. `JWT_SECRET`
	- What: token signing key.
	- Where to get: generate your own random string.
	- How to enter: `JWT_SECRET=<long-random-value>`
2. `EMAIL_PASSWORD`
	- What: SMTP account password or app password.
	- Where to get: your mail provider/admin.
	- How to enter: `EMAIL_PASSWORD=<smtp-password>`

### 6.2 Google OAuth secrets

Keys:

1. `GOOGLE_OAUTH_CLIENT_ID`
2. `GOOGLE_OAUTH_CLIENT_SECRET`
3. `GOOGLE_OAUTH_REDIRECT_URI`

Where to get:

1. Google Cloud Console.
2. Create OAuth client credentials in your project.
3. Set redirect URI to your deployed callback.

Where to enter: root `.env`.

### 6.3 Clerk keys

Keys:

1. `CLERK_PUBLISHABLE_KEY`
2. `CLERK_SECRET_KEY`

Where to get: Clerk Dashboard for your application.

Where to enter: root `.env`.

### 6.4 ABHA keys

Keys:

1. `ABHA_ENABLED`
2. `ABHA_CLIENT_ID`
3. `ABHA_CLIENT_SECRET`
4. `ABHA_GATEWAY_BASE_URL`
5. `ABHA_TRANSACTION_READ_PATH` (optional override)
6. `ABHA_TRANSACTION_WRITE_PATH` (optional override)

Where to get:

1. Your ABHA onboarding process (sandbox or production credentials).
2. Gateway base URL from ABHA partner docs/ops team.

Where to enter: root `.env`.

### 6.5 Connector credentials (important)

How connector secrets are resolved in code:

1. Integration config uses `credentialsRef.secretKey` names.
2. Runtime reads `process.env[secretKey]`.
3. Value is parsed as JSON.

So for local development, set JSON directly in `.env` for each key.

Example entries for `.env`:

```dotenv
INTEGRATION_TELEGRAM_CREDENTIALS={"botToken":"<telegram_bot_token>","chatId":"<telegram_chat_id_or_channel>"}
INTEGRATION_WHATSAPP_CREDENTIALS={"accessToken":"<meta_access_token>","phoneNumberId":"<meta_phone_number_id>","senderNumber":"<whatsapp_sender_number>"}
INTEGRATION_EMAIL_SMTP_CREDENTIALS={"host":"smtp.example.com","port":587,"secure":false,"user":"smtp-user","pass":"smtp-pass","from":"noreply@example.com"}
INTEGRATION_WEBHOOK_SIGNING_SECRET={"signingSecret":"<webhook_hmac_secret>"}
INTEGRATION_GOOGLE_CALENDAR_CREDENTIALS={"accessToken":"<google_oauth_access_token>","calendarId":"<google_calendar_id>"}
INTEGRATION_APPLE_CALENDAR_CREDENTIALS={"bridgeEndpoint":"https://apple-bridge.example.com/events","apiKey":"<optional_bridge_api_key>"}
INTEGRATION_OUTLOOK_CALENDAR_CREDENTIALS={"accessToken":"<ms_graph_access_token>","userId":"<outlook_user_id_or_upn>"}
INTEGRATION_ICS_CREDENTIALS={"bridgeEndpoint":"https://ics-bridge.example.com/calendar","apiKey":"<optional_bridge_api_key>"}
```

Where to get each provider secret:

1. Telegram: create bot via BotFather, use bot token and target chat/channel id.
2. WhatsApp Cloud API: Meta developers app, phone number id, long-lived access token.
3. SMTP: your mail server/provider host, port, username, password, sender mailbox.
4. Webhook: your internal HMAC secret generated by your platform/security team.
5. Google Calendar: OAuth token with calendar write scope plus calendar id.
6. Outlook Calendar: Azure app token plus user id/UPN.
7. Apple/ICS bridge: your bridge endpoint and optional API key.

Note:

1. `.env.example` contains placeholder reference style values.
2. For local runtime tests, replace with real JSON payloads in `.env`.

## Step 7: Tenant integration config

1. Start from `config/integrations/default-integration-config.json`.
2. Create tenant override file such as `config/integrations/citycare-hospital.integration.json`.
3. Keep `credentialsRef.secretKey` aligned to actual `.env` keys.

Validate:

PowerShell and Bash:

```bash
pnpm run integrations:validate
```

## Step 8: Start infrastructure and app runtime

### 8.1 Demo infra

PowerShell and Bash:

```bash
pnpm run setup:demo
pnpm run demo:up
```

### 8.2 Backend services (run in separate terminals)

PowerShell and Bash:

```bash
pnpm run start:auth
pnpm run start:notification
pnpm run start:appointment
pnpm run start:patient
```

### 8.3 Frontend surfaces

PowerShell and Bash:

```bash
pnpm run start:admin:dev
pnpm run start:clinician:dev
pnpm run start:operations:dev
pnpm run start:patient:dev
pnpm run start:mobile
```

## Step 9: Readiness probes and test calls

### 9.1 PowerShell probe commands

```powershell
$tenant = "citycare-hospital"
$notif = "http://localhost:5102/api/v1"
$appt  = "http://localhost:5103/api/v1"
$auth  = "http://localhost:5101/api/v1"

Invoke-RestMethod "$notif/integrations/messaging/telegram/setup?tenantKey=$tenant"
Invoke-RestMethod "$notif/integrations/messaging/telegram/config-status?tenantKey=$tenant"
Invoke-RestMethod "$notif/integrations/messaging/whatsapp/config-status?tenantKey=$tenant"
Invoke-RestMethod "$notif/integrations/messaging/email/config-status?tenantKey=$tenant"
Invoke-RestMethod "$notif/integrations/messaging/webhook/diagnostics?tenantKey=$tenant"
Invoke-RestMethod "$appt/integrations/calendars/interoperability/diagnostics?tenantKey=$tenant"
Invoke-RestMethod "$auth/platform/abha/config-status"
Invoke-RestMethod "$auth/platform/abha/health-check"
```

### 9.2 Bash probe commands

```bash
TENANT="citycare-hospital"
NOTIF="http://localhost:5102/api/v1"
APPT="http://localhost:5103/api/v1"
AUTH="http://localhost:5101/api/v1"

curl -fsS "$NOTIF/integrations/messaging/telegram/setup?tenantKey=$TENANT"
curl -fsS "$NOTIF/integrations/messaging/telegram/config-status?tenantKey=$TENANT"
curl -fsS "$NOTIF/integrations/messaging/whatsapp/config-status?tenantKey=$TENANT"
curl -fsS "$NOTIF/integrations/messaging/email/config-status?tenantKey=$TENANT"
curl -fsS "$NOTIF/integrations/messaging/webhook/diagnostics?tenantKey=$TENANT"
curl -fsS "$APPT/integrations/calendars/interoperability/diagnostics?tenantKey=$TENANT"
curl -fsS "$AUTH/platform/abha/config-status"
curl -fsS "$AUTH/platform/abha/health-check"
```

## Step 10: Full verification and security

PowerShell and Bash:

```bash
pnpm run verify:full
pnpm run audit
pnpm run audit:apps
pnpm run build:apps
```

## Step 11: Shutdown

PowerShell and Bash:

```bash
pnpm run demo:down
docker stop pulseward-postgres pulseward-mongo
```

## Common troubleshooting

1. pnpm command not found
	- Use either Corepack path or `npm install -g pnpm@9.15.0`.
2. Connector config looks set but provider still not configured
	- Check that env key value is valid JSON, not plain text placeholder.
3. ABHA health-check fails
	- Verify `ABHA_ENABLED=true`, valid `ABHA_CLIENT_ID`, `ABHA_CLIENT_SECRET`, and reachable `ABHA_GATEWAY_BASE_URL`.
4. Docker issues
	- Ensure Docker daemon is running and compose is available.
5. Port conflicts
	- Change ports in `.env` and restart services.

## Future-proof policy

1. Use pnpm only for installs and scripts in this repo.
2. Keep `pnpm-lock.yaml` committed.
3. Do not use or commit `package-lock.json`.
4. Keep real secrets in `.env` (local) or secret manager (production), never in source-controlled docs.