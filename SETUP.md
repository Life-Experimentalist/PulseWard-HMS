# PulseWard HMS — Setup & Deployment Guide

PulseWard is a multi-tenant Hospital Management System built on:

- **Backend:** Hono (Node.js), SQLite (`node:sqlite` built-in), JWT auth
- **Frontend:** React 18 + Vite — four independent apps
- **Monorepo:** pnpm workspaces

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Quick Start — Local Development](#2-quick-start--local-development)
3. [Demo Accounts](#3-demo-accounts)
4. [Project Structure](#4-project-structure)
5. [Environment Variables](#5-environment-variables)
6. [Production — Option A: Docker Compose](#6-production--option-a-docker-compose)
7. [Production — Option B: PM2 + Nginx (bare metal / VM)](#7-production--option-b-pm2--nginx-bare-metal--vm)
8. [Multi-Hospital / Multi-Tenancy](#8-multi-hospital--multi-tenancy)
9. [Roles & Permissions](#9-roles--permissions)
10. [API Reference](#10-api-reference)
11. [Adding a New Hospital Tenant](#11-adding-a-new-hospital-tenant)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. Prerequisites

| Tool             | Minimum version | Notes                                                        |
| ---------------- | --------------- | ------------------------------------------------------------ |
| Node.js          | **24.0+**       | Required for `node:sqlite` built-in                          |
| pnpm             | **9.15.0**      | `corepack enable && corepack prepare pnpm@9.15.0 --activate` |
| Git              | any             | —                                                            |
| Docker + Compose | 24+             | Production only                                              |
| nginx            | 1.24+           | Production (bare metal) only                                 |

> **Windows users:** All commands work in PowerShell or Git Bash. The `!` prefix in Claude Code runs shell commands directly in the session.

---

## 2. Quick Start — Local Development

```bash
# 1. Clone the repository
git clone https://github.com/your-org/pulseward-hms.git
cd pulseward-hms

# 2. Enable pnpm via corepack
corepack enable
corepack prepare pnpm@9.15.0 --activate

# 3. Install all dependencies (root + all workspaces)
pnpm install --frozen-lockfile

# 4. Copy environment template
cp .env.example .env
# Edit .env — at minimum, change JWT_SECRET

# 5. Start the API gateway (Terminal 1)
pnpm run start          # → http://localhost:8787

# 6. Start the frontend apps (each in its own terminal)
pnpm run start:patient:dev      # → http://localhost:4313  Patient Portal
pnpm run start:clinician:dev    # → http://localhost:4311  Clinician Portal
pnpm run start:admin:dev        # → http://localhost:4180  Admin Console
pnpm run start:operations:dev   # → http://localhost:4312  Operations Dashboard
```

The API gateway seeds demo data automatically on first run. No database setup required.

---

## 3. Demo Accounts

| Role      | Email                     | Password      | Portal                |
| --------- | ------------------------- | ------------- | --------------------- |
| Patient   | `patient@pulseward.com`   | `Patient@123` | http://localhost:4313 |
| Clinician | `dr.sharma@pulseward.com` | `Doctor@123`  | http://localhost:4311 |
| Clinician | `dr.mehta@pulseward.com`  | `Doctor@123`  | http://localhost:4311 |
| Admin     | `admin@pulseward.com`     | `Admin@123`   | http://localhost:4180 |

The Operations Dashboard (`:4312`) requires no login — it monitors service health and incidents.

---

## 4. Project Structure

```
pulseward-hms/
├── apps/
│   ├── patient-portal/        React SPA — patient self-service (:4313)
│   ├── clinician-portal/      React SPA — clinical workflow (:4311)
│   ├── admin-console/         React SPA — user/tenant management (:4180)
│   └── operations-dashboard/  React SPA — health & incidents (:4312)
│
├── services/
│   └── api-gateway/           Hono + SQLite API — all routes (:8787)
│       ├── src                Entry point (ESM, extensionless)
│       ├── db.js              Schema, seed data, getDb()
│       └── Dockerfile         Container image
│
├── packages/
│   ├── shared-utils/          Request context, tenant config helpers
│   └── ui-kit/                Shared React component stubs
│
├── contracts/                 OpenAPI specs (REST + events)
├── config/                    Tenant domain + integration routing configs
├── scripts/                   Build, check, evidence scripts
├── nginx/nginx.conf            Production reverse proxy config
├── docker-compose.yml         Production container stack
├── ecosystem.config.cjs       PM2 process manager config
└── .env.example               Environment variable template
```

### Key architectural decisions

- **Single API gateway:** All backend logic lives in `services/api-gateway/src`. No inter-service HTTP calls. This is the production-compatible prototype layer — the design target is Cloudflare Workers + Hono (see `design/Architecture.html`).
- **SQLite via `node:sqlite`:** Built-in since Node 22.5+. No native compilation. The DB file is created at `$DB_PATH` (default: alongside the `src` file). For production, set `DB_PATH` to a persistent volume path.
- **Multi-tenancy:** Every DB row has `tenant_id`. JWT carries `tid` (tenant ID) — all queries are scoped by it automatically. Multiple hospitals = multiple tenant rows.
- **Vite proxy in dev:** All four apps proxy `/api/*` to `http://localhost:8787` via `vite.config.js`. In production, nginx handles the proxy — the Vite dev server is not used.

---

## 5. Environment Variables

Copy `.env.example` to `.env` and edit as needed. Variables with no default are optional.

| Variable               | Default                               | Description                                                                                              |
| ---------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `API_PORT`             | `8787`                                | Port the API gateway listens on                                                                          |
| `JWT_SECRET`           | _(hardcoded fallback — change this!)_ | JWT signing secret. Generate: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `CORS_ALLOWED_ORIGINS` | _(empty)_                             | Comma-separated production origins, e.g. `https://portal.hospital.com`                                   |
| `DB_PATH`              | `./services/api-gateway/pulseward.db` | Absolute path for SQLite file                                                                            |
| `NODE_ENV`             | `development`                         | Set to `production` in prod                                                                              |
| `TELEGRAM_BOT_TOKEN`   | _(empty)_                             | Enable Telegram notifications                                                                            |

> **Security:** Never commit `.env`. The `.gitignore` already excludes it.

---

## 6. Production — Option A: Docker Compose

This is the recommended approach. It runs the API gateway in a container and serves all four frontend apps as static files through nginx.

### Step 1 — Build the frontend apps

```bash
# On your build machine or CI
pnpm install --frozen-lockfile
pnpm run build:apps
# This creates dist/ inside each apps/* directory
```

### Step 2 — Configure environment

```bash
cp .env.example .env
# Required edits:
#   JWT_SECRET=<64-char random hex>
#   CORS_ALLOWED_ORIGINS=https://portal.yourhospital.com,https://admin.yourhospital.com
```

### Step 3 — Configure nginx (domain names)

Edit `nginx/nginx.conf` and replace all occurrences of `yourhospital.com` with your actual domain.

Place your SSL certificate and key at:

```
nginx/ssl/yourhospital.crt
nginx/ssl/yourhospital.key
```

For Let's Encrypt (Certbot):

```bash
certbot certonly --standalone -d portal.yourhospital.com -d admin.yourhospital.com
# Then symlink or copy to nginx/ssl/
```

### Step 4 — Start

```bash
docker compose up -d

# Verify everything is healthy
docker compose ps
docker compose logs api-gateway --tail 30
```

### Step 5 — Verify

```bash
curl https://portal.yourhospital.com/api/v1/health
# → {"ok":true,"service":"api-gateway","version":"1.0.0"}
```

### Updating

```bash
# Pull new code, rebuild
git pull
pnpm run build:apps
docker compose up -d --build api-gateway
```

---

## 7. Production — Option B: PM2 + Nginx (bare metal / VM)

Use this when you prefer not to use Docker.

### Step 1 — Install dependencies

```bash
# Node 24+ required
node --version   # must be >= 24.0.0

# Install pnpm globally
npm install -g pnpm@9.15.0

# Install PM2 globally
npm install -g pm2

# Clone and install
git clone https://github.com/your-org/pulseward-hms.git /opt/pulseward
cd /opt/pulseward
pnpm install --frozen-lockfile
```

### Step 2 — Configure environment

```bash
cp .env.example .env
# Edit JWT_SECRET, CORS_ALLOWED_ORIGINS, DB_PATH
```

### Step 3 — Build frontends

```bash
pnpm run build:apps
# Output: apps/*/dist/
```

### Step 4 — Start the API gateway with PM2

```bash
# Create logs directory
mkdir -p logs

# Start using the ecosystem file
pm2 start ecosystem.config.cjs

# Verify
pm2 status
pm2 logs pulseward-api --lines 20

# Persist across reboots
pm2 save
pm2 startup   # follow the printed command to register the init script
```

### Step 5 — Configure nginx

```bash
# Install nginx
sudo apt install nginx        # Ubuntu/Debian
# or
sudo yum install nginx        # RHEL/CentOS

# Copy the config
sudo cp nginx/nginx.conf /etc/nginx/nginx.conf

# Edit server_name, SSL cert paths, and static root paths in the config
# Static roots should point to the built dist/ directories:
#   /opt/pulseward/apps/patient-portal/dist
#   /opt/pulseward/apps/clinician-portal/dist
#   /opt/pulseward/apps/admin-console/dist
#   /opt/pulseward/apps/operations-dashboard/dist

# Test and reload
sudo nginx -t
sudo systemctl reload nginx
```

### Step 6 — Firewall

```bash
# Allow only 80 and 443 from outside; block 8787 from public
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw deny 8787/tcp   # API gateway should only be accessible via nginx
```

---

## 8. Multi-Hospital / Multi-Tenancy

Each hospital is a separate **tenant** — a row in the `tenants` table with a unique `id` and `slug`. All data (patients, appointments, users, etc.) is scoped by `tenant_id` in every query.

### Adding a new hospital

Use the admin API:

```bash
# 1. Create the tenant (currently done via direct SQL or a migration)
# In production, this would be an admin super-user endpoint.

# For now, insert directly:
sqlite3 /path/to/pulseward.db \
  "INSERT INTO tenants(id,slug,name,accent) VALUES(lower(hex(randomblob(16))),'city-hospital','City General Hospital','#1a56db');"

# 2. Create the first admin user for this tenant
curl -X POST http://localhost:8787/api/v1/admin/users \
  -H "Authorization: Bearer <super-admin-token>" \
  -H "Content-Type: application/json" \
  -d '{"name":"Hospital Admin","email":"admin@cityhospital.com","password":"SecurePass@1","role":"admin"}'
```

> See [Section 11](#11-adding-a-new-hospital-tenant) for the full provisioning runbook.

### How tenancy works in code

1. Every JWT contains `tid` (tenant ID) — minted at login from `users.tenant_id`.
2. Every API route reads `c.get('user').tid` and scopes all DB queries with `WHERE tenant_id = ?`.
3. CORS `CORS_ALLOWED_ORIGINS` lists the domains for all tenants — comma-separated.
4. For domain-based routing (e.g., `cityhospital.pulseward.com`), update `nginx/nginx.conf` to add a new server block pointing to the same static files but a different API path, or use subdomains per tenant.

---

## 9. Roles & Permissions

| Role        | Access                                                                                  |
| ----------- | --------------------------------------------------------------------------------------- |
| `patient`   | Own appointments, labs, prescriptions, records, messages, notifications                 |
| `clinician` | All patients (same tenant), schedule, notes, labs, prescriptions for their own patients |
| `frontdesk` | Patient list, appointment read/write                                                    |
| `ops`       | Admin stats, platform health (read-only)                                                |
| `admin`     | Full access — user management, audit log, tenant settings                               |

**Key enforcement rules (in api-gateway/src):**

- Patients cannot read or modify other patients' data (IDOR protection).
- Clinicians can only edit notes/labs/prescriptions they authored (`clinician_id = u.eid`).
- Admin is the only role that can create/delete users or bypass authorship checks.

---

## 10. API Reference

Base URL: `http://localhost:8787/api/v1` (dev) or `https://your-domain.com/api/v1` (prod)

All protected routes require: `Authorization: Bearer <jwt>`

### Auth

| Method | Path            | Auth | Description                     |
| ------ | --------------- | ---- | ------------------------------- |
| POST   | `/auth/login`   | —    | Email + password login          |
| POST   | `/auth/signup`  | —    | Self-register (creates patient) |
| POST   | `/auth/refresh` | —    | Refresh access token            |
| GET    | `/auth/me`      | ✓    | Current user info               |

### Patients

| Method | Path            | Roles                                         | Description                          |
| ------ | --------------- | --------------------------------------------- | ------------------------------------ |
| GET    | `/patients`     | admin, clinician, frontdesk                   | List patients (supports `?q=search`) |
| GET    | `/patients/:id` | any (own only for patient role)               | Get patient record                   |
| POST   | `/patients`     | admin, clinician, frontdesk                   | Create patient                       |
| PATCH  | `/patients/:id` | admin, clinician (patient: demographics only) | Update patient                       |

### Appointments

| Method | Path                | Notes                                                          |
| ------ | ------------------- | -------------------------------------------------------------- |
| GET    | `/appointments`     | Supports `?date=YYYY-MM-DD`, `?clinicianId=`, `?upcoming=true` |
| POST   | `/appointments`     | Patients can only book for themselves                          |
| PATCH  | `/appointments/:id` | Patients can only cancel; clinicians own appointments only     |

### Clinical

| Resource      | GET                         | POST                            | PATCH                                  |
| ------------- | --------------------------- | ------------------------------- | -------------------------------------- |
| Notes         | `/notes?patientId=`         | `/notes` (clinician)            | `/notes/:id` (author only)             |
| Sign note     | —                           | `/notes/:id/sign` (author only) | —                                      |
| Labs          | `/labs?patientId=`          | `/labs` (clinician)             | `/labs/:id` (orderer only)             |
| Prescriptions | `/prescriptions?patientId=` | `/prescriptions` (clinician)    | `/prescriptions/:id` (prescriber only) |

### Messages & Notifications

| Method | Path                      | Description                                      |
| ------ | ------------------------- | ------------------------------------------------ |
| GET    | `/messages?patientId=`    | Get message threads                              |
| POST   | `/messages`               | Send message or reply (pass `threadId` to reply) |
| GET    | `/notifications`          | Own notifications                                |
| POST   | `/notifications/:id/read` | Mark one read                                    |
| POST   | `/notifications/read-all` | Mark all read                                    |

### Admin

| Method | Path                | Description                     |
| ------ | ------------------- | ------------------------------- |
| GET    | `/admin/stats`      | Platform stats                  |
| GET    | `/admin/users`      | List all users                  |
| POST   | `/admin/users`      | Create user                     |
| DELETE | `/admin/users/:id`  | Delete user                     |
| GET    | `/admin/audit`      | Audit log                       |
| POST   | `/admin/clinicians` | Create clinician + user account |

---

## 11. Adding a New Hospital Tenant

Full provisioning runbook for onboarding a new hospital.

### Prerequisites

- Running PulseWard instance with admin access
- Hospital's domain names (e.g., `portal.cityhospital.com`)

### Step 1 — Insert tenant record

```sql
-- Connect to the SQLite database
sqlite3 /data/pulseward.db

INSERT INTO tenants(id, slug, name, hfr_id, accent, created_at)
VALUES(
  lower(hex(randomblob(16))),  -- random UUID
  'city-hospital',              -- short slug (URL-safe)
  'City General Hospital',      -- display name
  'HFR-CITY-001',              -- optional HFR (Health Facility Registry) ID
  '#1a56db',                   -- brand accent colour (hex)
  unixepoch()
);

-- Note the generated ID
SELECT id FROM tenants WHERE slug = 'city-hospital';
```

### Step 2 — Create the hospital admin user

Using the super-admin JWT (from the default tenant's admin account):

```bash
curl -X POST https://your-domain.com/api/v1/admin/clinicians \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Hospital Admin",
    "email": "admin@cityhospital.com",
    "password": "SecureRandom@1",
    "role": "admin"
  }'
```

> **Note:** Currently, admin creation for a different tenant requires a super-admin endpoint (not yet implemented). For now, use direct SQL as shown below.

```sql
-- In SQLite
INSERT INTO users(id, tenant_id, email, password_hash, role, name, created_at)
VALUES(
  lower(hex(randomblob(16))),
  '<tenant-id-from-step-1>',
  'admin@cityhospital.com',
  -- hash generated with: node -e "const b=require('bcryptjs'); b.hash('SecurePass@1',10).then(console.log)"
  '<bcrypt-hash>',
  'admin',
  'Hospital Admin',
  unixepoch()
);
```

### Step 3 — Configure nginx for the new domain

Add a new server block to `nginx/nginx.conf` for each new domain:

```nginx
server {
    listen 443 ssl;
    server_name portal.cityhospital.com;

    ssl_certificate     /etc/nginx/ssl/cityhospital.crt;
    ssl_certificate_key /etc/nginx/ssl/cityhospital.key;

    root /srv/patient;   # same static files, different domain
    index index.html;

    location /api/ {
        proxy_pass http://api_gateway;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / { try_files $uri $uri/ /index.html; }
}
```

### Step 4 — Add domain to CORS allowed origins

In `.env`:

```
CORS_ALLOWED_ORIGINS=https://portal.yourhospital.com,https://portal.cityhospital.com,https://admin.cityhospital.com
```

Restart the api-gateway: `pm2 reload pulseward-api` or `docker compose up -d api-gateway`

### Step 5 — Verify

```bash
# Login as the new tenant's admin
curl -X POST https://portal.cityhospital.com/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@cityhospital.com","password":"SecurePass@1"}'

# Should return a JWT where tid = <new tenant ID>
```

---

## 12. Troubleshooting

### `ExperimentalWarning: SQLite is an experimental feature`

This is cosmetic and harmless. Suppressed by the `--no-warnings` flag already in the start scripts. To confirm:

```bash
node --version   # must be >= 24.0.0
```

### Port already in use

```bash
# Find what's using port 8787
# Windows:
netstat -ano | findstr :8787
# Linux:
lsof -i :8787
```

### Blank white page on frontend

1. Open browser DevTools → Console — look for import errors.
2. Ensure the API gateway is running: `curl http://localhost:8787/health`
3. Check that the Vite dev server is running on the correct port.

### JWT expired / 401 errors

The access token expires after 15 minutes. The frontend api.js files auto-refresh using the refresh token. If you see persistent 401s:

1. Clear `localStorage` in the browser.
2. Log in again.

### `EADDRINUSE: address already in use :::8787`

```bash
# Windows PowerShell
$conn = Get-NetTCPConnection -LocalPort 8787 -ErrorAction SilentlyContinue
if ($conn) { Stop-Process -Id $conn.OwningProcess -Force }

# Linux
kill $(lsof -t -i:8787)
```

### SQLite database corruption

If the database file becomes corrupted (e.g., after a hard shutdown):

```bash
# Delete and let it reseed
rm services/api-gateway/pulseward.db
# Restart the gateway — it will create a fresh database with demo data
pnpm run start
```

> **Note:** This destroys all data. In production, ensure the data volume is on reliable storage and enable periodic backups (e.g., `sqlite3 /data/pulseward.db ".backup /backups/pulseward-$(date +%Y%m%d).db"` in a cron job).

### Docker container exits immediately

```bash
docker compose logs api-gateway
# Common cause: DB_PATH directory doesn't exist
# The Dockerfile creates /data — if you override DB_PATH, ensure the directory exists
```

---

## Appendix — Running the Test Suite

```bash
# Full test suite with coverage
pnpm test

# Quick (no coverage)
pnpm run test:quick

# Contract parity check (verifies every OpenAPI route has a handler)
pnpm run contracts:check -- --strict

# Smoke test (hits live endpoints — requires gateway running on :8787)
pnpm run test:smoke

# Single test file
node --experimental-vm-modules node_modules/.bin/jest tests/auth/auth-route-surface.test.js
```

## Appendix — Scripts Reference

| Script                                 | Description                                          |
| -------------------------------------- | ---------------------------------------------------- |
| `pnpm run start`                       | Start API gateway (production mode)                  |
| `pnpm run start:patient:dev`           | Start Patient Portal with HMR                        |
| `pnpm run start:clinician:dev`         | Start Clinician Portal with HMR                      |
| `pnpm run start:admin:dev`             | Start Admin Console with HMR                         |
| `pnpm run start:operations:dev`        | Start Ops Dashboard with HMR                         |
| `pnpm run build:apps`                  | Build all 4 frontend apps for production             |
| `pnpm test`                            | Run full test suite with coverage                    |
| `pnpm run contracts:check -- --strict` | API contract parity check                            |
| `pnpm run test:smoke`                  | Live smoke test (gateway must be running)            |
| `pnpm run verify:full`                 | Full pipeline gate (contracts + tests + build + ops) |
| `pnpm run ops:m7:check`                | M7 operability readiness gate                        |
