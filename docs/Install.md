# PulseWard Comprehensive Install and Setup Guide (PowerShell + Bash)

## Who this guide is for

Use this guide if you want a complete, repeatable setup with no source-code edits.

This guide covers:

1. Windows PowerShell and Bash commands.
2. Correct database values (Postgres + Mongo) with no ambiguity.
3. Required vs optional auth and connector settings.
4. JWT secret generation tool.
5. Tenant concept and strict tenant automation.
6. One-command installer options, including `iex` path.
7. Local server and cloud deployment profiles (AWS + Cloudflare).

## Package manager decision

Use pnpm for this repository.

Why pnpm-only here:

1. One lockfile (`pnpm-lock.yaml`) for reproducible workspace installs.
2. Faster monorepo installs with lower disk usage.
3. Better CI consistency.
4. Avoid npm/pnpm lockfile drift.

## Prerequisites

1. Node.js 22+.
2. Git.
3. Docker Desktop (Windows/macOS) or Docker Engine + Compose (Linux).
4. Network access to providers you enable (Google, Meta, SMTP, ABHA, etc.).

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

### Option B (alternate npm path): npm global install

PowerShell:

```powershell
npm install -g pnpm@9.15.0
pnpm -v
```

If pnpm shows an upgrade banner (for example `9.x -> 10.x`), this repository should still use the version pinned by `packageManager` unless the repo is intentionally upgraded.

Practical rule:

1. You can keep your global pnpm newer.
2. For this repo workflow, run `corepack prepare pnpm@9.15.0 --activate` when needed.

Bash:

```bash
npm install -g pnpm@9.15.0
pnpm -v
```

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

## Step 5: Database setup (discrepancy fixed)

### 5.1 Which value is correct?

Correct values are the values in `.env.example`.

Use:

1. `DB_HOST=localhost`
2. `DB_PORT=5432`
3. `DB_NAME=pulseward`
4. `DB_USER=pulseward_local`
5. `DB_PASSWORD=change_me_local_only`

Important clarification:

1. `pulseward-postgres` is the Docker container name.
2. `pulseward` is the actual Postgres database name.
3. `DB_NAME` must be `pulseward` for local default setup.

### 5.2 Postgres vs Mongo - which one do I need?

For local parity, run both containers:

1. Postgres: primary SQL configuration baseline in `.env`.
2. MongoDB: used by services/adapters that rely on document-storage paths.

Recommended for first setup: run both.

### 5.3 Start local DB containers

Using compose (recommended):

```powershell
docker compose up -d pulseward-postgres pulseward-mongo
```

Or manual docker run (equivalent):

```bash
docker run -d --name pulseward-postgres -p 5432:5432 -e POSTGRES_DB=pulseward -e POSTGRES_USER=pulseward_local -e POSTGRES_PASSWORD=change_me_local_only postgres:16
docker run -d --name pulseward-mongo -p 27017:27017 mongo:7
```

Note:

1. The Postgres values above must match `.env` (`DB_NAME=pulseward`, `DB_USER=pulseward_local`, `DB_PASSWORD=change_me_local_only`).
2. Mongo is intentionally started without auth in local development for a simpler first-run experience.
3. For production, run Mongo with authentication and use a secret-managed connection string.

Verify:

```bash
docker ps --filter name=pulseward-postgres
docker ps --filter name=pulseward-mongo
```

## Step 6: JWT secret generator tool (small utility)

Generate a secure JWT secret:

```bash
pnpm run jwt:generate
```

Interactive behavior:

1. Prints generated secret.
2. Asks: replace `JWT_SECRET` in `.env` now? `yes/no`.

Direct replace without prompt:

```bash
pnpm run jwt:generate -- --apply
```

Optional custom format/length:

```bash
pnpm run jwt:generate -- --bytes 64 --format hex
```

What this does:

1. Uses cryptographically secure random bytes.
2. Outputs a long secret suitable for HS-based JWT signing.
3. Avoids weak human-made strings.

## Step 7: Secrets and auth - required vs optional

### 7.1 Minimum required to boot local platform

Required:

1. `JWT_SECRET`
2. `EMAIL_PASSWORD` (if SMTP/email paths are enabled)
3. DB keys from Step 5

Optional for local boot:

1. Google OAuth keys
2. Clerk keys
3. ABHA keys

### 7.2 Is Google OAuth required?

No, optional.

Enable only if you want Google-based login/calendar flows.

Keys:

1. `GOOGLE_OAUTH_CLIENT_ID`
2. `GOOGLE_OAUTH_CLIENT_SECRET`
3. `GOOGLE_OAUTH_REDIRECT_URI`

### 7.3 Is Clerk required?

No, optional.

Enable only if you want Clerk as your identity provider.

Keys:

1. `CLERK_PUBLISHABLE_KEY`
2. `CLERK_SECRET_KEY`

### 7.4 Do I need at least one auth provider?

Yes.

Minimum practical auth posture:

1. Base app auth with strong `JWT_SECRET`.
2. Optionally add one external provider (Google or Clerk) for SSO.

## Step 8: Redirect URI setup (Google and OAuth callbacks)

Google requires exact redirect URI match with configured OAuth client.

Rules:

1. Must exactly match registered value (scheme, host, path, trailing slash).
2. Localhost HTTP is allowed for local testing.
3. Production should use HTTPS.

Examples:

1. Local: `http://localhost:8081/api/v1/auth/oauth/google/callback`
2. Staging: `https://staging-api.yourhospital.com/api/v1/auth/oauth/google/callback`
3. Production: `https://api.yourhospital.com/api/v1/auth/oauth/google/callback`

Common failure:

1. `redirect_uri_mismatch` means Cloud Console and `.env` URI are not exactly identical.

## Step 9: EMAIL_PASSWORD explained clearly

`EMAIL_PASSWORD` is the credential your SMTP provider expects for authenticated send.

Use one of these patterns:

1. Gmail/Google Workspace SMTP:
	`EMAIL_USER=yourmail@domain.com`
	`EMAIL_PASSWORD=<gmail-app-password>`

2. Microsoft 365 SMTP:
	`EMAIL_USER=yourmail@domain.com`
	`EMAIL_PASSWORD=<mailbox-password-or-app-password>`

3. SendGrid SMTP:
	`EMAIL_USER=apikey`
	`EMAIL_PASSWORD=<sendgrid-api-key>`

4. Mailgun SMTP:
	`EMAIL_USER=postmaster@mg.yourdomain.com`
	`EMAIL_PASSWORD=<mailgun-smtp-password>`

Security notes:

1. Never commit real email passwords.
2. Prefer app-password/token over personal account password.
3. Rotate immediately if leaked.

## Step 10: ABHA setup (where to get, free or not)

### 10.1 Where to start

1. Official ABDM portal: `https://abdm.gov.in/`
2. Sandbox portal: `https://sandbox.abdm.gov.in/`
3. Sandbox registration: `https://sandbox.abdm.gov.in/sandbox/v3/sandbox-registration`

### 10.2 Is ABHA free?

1. Sandbox access is generally available for integration testing/onboarding.
2. Production onboarding requires ABDM process compliance and approvals (HIP/HIU workflows, testing, audits, and go-live process).
3. Commercial effort/cost is typically operational and compliance-driven, not like public SaaS self-serve billing.

### 10.3 ABHA env keys

1. `ABHA_ENABLED=false` until onboarding is ready.
2. `ABHA_CLIENT_ID=<issued-by-abdm>`
3. `ABHA_CLIENT_SECRET=<issued-by-abdm>`
4. `ABHA_GATEWAY_BASE_URL=<issued-gateway-url>`
5. Keep transaction path defaults unless told otherwise.

## Step 11: Connectors explained one-by-one

All connector env values are JSON strings in `.env`.

### 11.1 Telegram Bot

1. Cost/ease: free and easiest to start.
2. Get token from `@BotFather`.
3. Env value:

```dotenv
INTEGRATION_TELEGRAM_CREDENTIALS={"botToken":"<bot_token>","chatId":"<chat_or_channel_id>"}
```

### 11.2 SMTP Email

1. Cost/ease: cheapest if you already have org mail.
2. Env value:

```dotenv
INTEGRATION_EMAIL_SMTP_CREDENTIALS={"host":"smtp.example.com","port":587,"secure":false,"user":"smtp-user","pass":"smtp-pass","from":"noreply@example.com"}
```

### 11.3 Generic Webhook

1. Cost/ease: free if you own the endpoint.
2. Optional unless webhook provider/routes are enabled.
3. Purpose: validates HMAC signatures on incoming webhook payloads so random external calls cannot spoof trusted events.
4. Env value:

```dotenv
INTEGRATION_WEBHOOK_SIGNING_SECRET={"signingSecret":"<hmac_secret>"}
```

### 11.4 WhatsApp Cloud API

1. Cost/ease: medium setup, paid usage model.
2. Meta uses per-message pricing for template messages (country/category based).
3. Env value:

```dotenv
INTEGRATION_WHATSAPP_CREDENTIALS={"accessToken":"<meta_token>","phoneNumberId":"<phone_number_id>","senderNumber":"<whatsapp_sender>"}
```

### 11.5 Google Calendar

1. Cost/ease: free API usage for many small deployments, but setup complexity is medium.
2. Env value:

```dotenv
INTEGRATION_GOOGLE_CALENDAR_CREDENTIALS={"accessToken":"<oauth_access_token>","calendarId":"<calendar_id>"}
```

### 11.6 Outlook Calendar

1. Cost/ease: medium-to-high (Microsoft tenant/app setup).
2. Env value:

```dotenv
INTEGRATION_OUTLOOK_CALENDAR_CREDENTIALS={"accessToken":"<ms_graph_token>","userId":"<upn_or_user_id>"}
```

### 11.7 Apple Calendar bridge

1. Cost/ease: depends on your bridge service.
2. Env value:

```dotenv
INTEGRATION_APPLE_CALENDAR_CREDENTIALS={"bridgeEndpoint":"https://apple-bridge.example.com/events","apiKey":"<optional_key>"}
```

### 11.8 ICS bridge

1. Cost/ease: usually low.
2. Env value:

```dotenv
INTEGRATION_ICS_CREDENTIALS={"bridgeEndpoint":"https://ics-bridge.example.com/calendar","apiKey":"<optional_key>"}
```

Minimum connector recommendation:

1. Start with Telegram + SMTP + Webhook (fastest and cheapest).
2. Add WhatsApp/Google/Outlook only when needed.

## Step 12: Tenant meaning and strict tenant mode

### 12.1 What tenant means

A tenant is one hospital/org boundary in a multi-tenant system.

Examples:

1. `citycare-hospital`
2. `metro-clinic`

Tenant key is used to:

1. Pick integration config file.
2. Scope routing/settings.
3. Keep isolation boundaries explicit.

### 12.2 Strict tenant mode (recommended for stable single tenant)

Set in `.env`:

1. `PLATFORM_DEFAULT_TENANT_KEY=citycare-hospital`
2. `PULSEWARD_STRICT_TENANT_KEY=citycare-hospital`

When strict key is set, `pnpm run integrations:validate` enforces:

1. Only `default-integration-config.json` and `<tenant>.integration.json` are allowed.
2. Strict tenant file must exist.
3. Its `tenantKey` must exactly match strict key.

## Step 13: Automated bootstrap (interactive and strict)

Run:

```powershell
pnpm run setup:bootstrap
```

What it does:

1. Creates `.env` if missing.
2. Generates and writes `JWT_SECRET`.
3. Writes DB local defaults.
4. Sets strict tenant keys.
5. Prompts Telegram bot token separately and tries to auto-detect `chatId` via `getUpdates`.
6. Shows required vs optional connector prompts with expected JSON examples.
7. Lets you keep existing values by pressing Enter.
8. Creates tenant integration file automatically.
9. Runs validation.
10. Runs setup compose workflow in `local-core` mode (Postgres + Mongo), avoiding full Docker image build failures when service Dockerfiles are absent.

## Step 14: One-command installer (`iex` style)

Once pushed to GitHub, run from PowerShell:

```powershell
irm https://raw.githubusercontent.com/Life-Experimentalist/PulseWard-HMS/main/scripts/install-pulseward.ps1 | iex
```

This script:

1. Clones/updates repo.
2. Prompts for tenant.
3. Runs strict bootstrap setup end-to-end.

## Step 15: Start infrastructure and runtime

### 15.1 Demo infra

```bash
pnpm run setup:demo
pnpm run demo:up
```

### 15.2 Backend services (separate terminals)

```bash
pnpm run start:auth
pnpm run start:notification
pnpm run start:appointment
pnpm run start:patient
```

### 15.3 Frontend surfaces

```bash
pnpm run start:admin:dev
pnpm run start:clinician:dev
pnpm run start:operations:dev
pnpm run start:patient:dev
pnpm run start:mobile
```

## Step 16: Probes and checks

PowerShell:

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

Bash:

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

Full verify:

```bash
pnpm run verify:full
pnpm run audit
pnpm run audit:apps
pnpm run build:apps
```

## Step 17: Pricing and easiest setup guidance (quick decision table)

Current guidance (verify before go-live because vendor pricing changes):

1. Cheapest and easiest to start:
	Telegram bot + SMTP + webhook + local Docker.
2. Lowest-friction cloud edge:
	Cloudflare Free plan for DNS/TLS/WAF baseline.
3. Lowest-friction cloud compute:
	AWS Lightsail (predictable bundled pricing, starts from low monthly tiers).
4. More flexible but more ops overhead:
	AWS EC2 on-demand (+ separate networking/storage cost components).
5. Potentially paid messaging channel:
	WhatsApp template messaging (country/category dependent pricing).
6. Auth provider cost posture:
	Clerk has free hobby tier and paid plans as usage/features grow.

## Step 18: Local server and cloud deployment profiles

### Profile A: Physical local server (on-prem)

1. Install Docker + Node.
2. Clone repo and run bootstrap.
3. Run compose stack and services behind reverse proxy.
4. Keep secrets in OS-level secret manager or injected env.

### Profile B: AWS + Cloudflare (recommended first production path)

1. Compute: start with a single Lightsail VM.
2. DNS/TLS/WAF: Cloudflare in front.
3. Deploy compose stack on VM.
4. Keep `/api/v1` path stable during domain migration.

### Profile C: Future container platform

1. Move to ECS/Fargate or Kubernetes when scale/ops justify it.
2. Keep tenant config and secret model unchanged.

For deeper rollout details, also see:

1. `docs/deployment/demo-quickstart.md`
2. `docs/deployment/deploy-and-domain-migration.md`
3. `docs/deployment/local-telegram-android-push-gmail-quickstart.md`

## Shutdown

```bash
pnpm run demo:down
docker stop pulseward-postgres pulseward-mongo
```

## Common troubleshooting

1. `pnpm` not found:
	Use Corepack path or `npm install -g pnpm@9.15.0`.
2. Connector configured but still failing:
	Ensure env value is valid JSON, not placeholder text.
3. Google OAuth fails:
	Verify redirect URI exact match in Google Cloud Console.
4. ABHA health-check fails:
	Verify onboarding credentials, gateway URL reachability, and `ABHA_ENABLED=true`.
5. Docker issues:
	Ensure daemon is running and `docker compose version` works.

## Future-proof policy

1. Use pnpm only for installs and scripts in this repo.
2. Keep `pnpm-lock.yaml` committed.
3. Do not use or commit `package-lock.json`.
4. Keep real secrets in `.env` (local) or secret manager (production), never in source-controlled docs.