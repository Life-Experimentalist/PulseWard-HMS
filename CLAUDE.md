# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

**Install everything:**

```powershell
corepack enable && corepack prepare pnpm@9.15.0 --activate
pnpm install --frozen-lockfile
```

**Start everything (local dev — recommended):**

```powershell
pnpm run dev        # API gateway :8787 + all 4 portals with HMR
```

**Start API only (production mode):**

```powershell
pnpm run start      # API gateway :8787, no frontend HMR
```

**Build for production:**

```powershell
pnpm run build      # builds all 4 React apps to apps/*/dist
pnpm run build:docs # builds VitePress docs to docs/site/.vitepress/dist
```

**Tests:**

```powershell
pnpm run test:quick                    # fast, no coverage
pnpm test                              # full suite with coverage
pnpm run test:contracts                # OpenAPI ↔ runtime route parity (strict)
# Single test file:
node --experimental-vm-modules node_modules/.bin/jest tests/auth/auth-route-surface.test.js
```

**Quality gates:**

```powershell
pnpm run lint                # ESLint
pnpm run format:check        # Prettier (read-only)
pnpm run contracts:check     # OpenAPI ↔ runtime parity
pnpm run verify              # lint + format:check + test:quick + contracts:check
```

**Release:**

```powershell
pnpm run release -- --version 1.4.0           # full pipeline
pnpm run release -- --version 1.4.0 --dry-run # preview without changes
```

**Utilities:**

```powershell
pnpm run jwt:generate          # generate JWT_SECRET value
pnpm run env:check             # verify .env completeness
pnpm run help                  # list all scripts with descriptions
```

## Architecture

### Monorepo Layout

```
pulseward-hms/
├── apps/               # Vite + React 18 SPAs (patient :4313, clinician :4311, admin :4180, ops :4312)
├── services/
│   └── api-gateway/    # Single Hono app — all routes, auth, DB, notifications
├── docs/site/          # VitePress documentation site
├── tests/              # Jest integration and contract tests
├── contracts/          # OpenAPI baseline specs
├── config/             # Per-tenant integration routing config
└── scripts/            # Release script, quality gate tools
```

### Backend — Single API Gateway (Hono + Node 24 + SQLite)

**Entry:** `services/api-gateway/src` (extensionless ESM file)
**Port:** `8787` (env: `API_PORT`)
**DB:** `services/api-gateway/db.js` — `DatabaseSync` from `node:sqlite` (Node 24 built-in, WAL mode)

All routes live in a single `src` file. No separate auth-service, notification-service, etc. — those were legacy prototype artefacts; the API gateway is the single runtime process.

Route namespaces:

- `POST /api/v1/auth/*` — signup, login, refresh, logout
- `GET|POST|PATCH /api/v1/patients/*` — patient records, MRN assignment
- `GET|POST|PATCH /api/v1/appointments/*` — scheduling
- `GET|POST|PATCH /api/v1/clinicians/*` — provider profiles
- `GET|POST|PATCH /api/v1/notes|labs|prescriptions` — clinical documentation
- `GET|POST /api/v1/messages/*` — secure messaging
- `GET|POST|DELETE /api/v1/admin/*` — user management, audit log, stats
- `GET /api/v1/platform/health` — ops health endpoint (auth required, admin/ops)
- `GET /health` — Docker healthcheck (public, no auth)

Shared patterns:

- `ok(c, data)` / `fail(c, code, msg, status)` — response helpers
- `audit(tenantId, actor, action, scope, ip)` — appends to `audit_events` table
- `requireAuth` / `requireRole(...roles)` — JWT middleware
- `getDb()` — singleton `DatabaseSync`, initialized once on first call

### Frontend Apps (Vite + React 18, ESM)

All apps under `apps/` with their own `package.json`. Dev ports: patient `:4313`, clinician `:4311`, ops `:4312`, admin `:4180`. `pnpm run dev` starts all four concurrently via `concurrently`.

Each app has `src/api.js` (fetch wrapper with JWT, silent refresh on 401) and `src/App.jsx`.

### Auth Flow

JWT via `jose` (HS256). `JWT_SECRET` env var.

- Access token: 15 min, carries `{ sub, role, tid, eid }`
- Refresh token: 30 days, single-use (rotated on each use), stored in `refresh_tokens` table
- `tryRefresh()` in each portal's `api.js` silently refreshes on 401 and retries

Passwords: bcrypt cost 10 via `bcryptjs`. **Not SHA-256.**

### Multi-Tenancy

Every DB row has `tenant_id`. Request context resolves `tenantId` from request `Origin` or `X-Tenant-Key` header at runtime. Tenants are rows in the `tenants` table — add a row to onboard a new hospital.

### Contract Checking

`scripts/check-contract-coverage.mjs` verifies every route in each service's `openapi.yaml` has a runtime handler. Run with `--strict` to fail on any gap. Baseline specs in `contracts/rest/`.

### Release Pipeline

`scripts/release.mjs` orchestrates: quality gate → version bump → changelog → build → zip artifacts → Docker → checksums → git commit + tag + push. GitHub Actions (`release.yml`) fires on `v*` tags and pushes to GHCR + creates GitHub Release.

### Design Documents

`design/` folder contains the full architecture spec (Architecture.html, LLD.html, Build Notes.html, Setup Guide.html, Operations Runbook.html). These describe the intended production deployment model.

## Key Environment Variables

```
JWT_SECRET              # required — 256-bit random key for JWT signing
API_PORT                # default 8787 — API gateway listen port
CORS_ALLOWED_ORIGINS    # comma-separated production domains
TELEGRAM_BOT_TOKEN      # optional — enables Telegram notification channel
DB_PATH                 # default: services/api-gateway/pulseward.db
```

Generate JWT_SECRET: `pnpm run jwt:generate`

## Test Layout

```
tests/
├── auth/           # auth policy, route surface, admin settings
├── contracts/      # OpenAPI parity regression across all openapi.yaml files
└── integrations/   # integration-level flows
```

Jest config: `jest.config.cjs`. Coverage threshold: 60% statements/functions/lines.

## Demo Accounts (seeded on first boot)

| Role      | Email                     | Password      |
| --------- | ------------------------- | ------------- |
| Admin     | `admin@pulseward.com`     | `Admin@123`   |
| Clinician | `dr.sharma@pulseward.com` | `Doctor@123`  |
| Clinician | `dr.mehta@pulseward.com`  | `Doctor@123`  |
| Patient   | `patient@pulseward.com`   | `Patient@123` |
