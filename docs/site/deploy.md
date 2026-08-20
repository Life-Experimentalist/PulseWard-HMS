# Quick Deploy

## Local dev (fastest way to evaluate)

Runs the API gateway plus all four portals with hot reload — no Docker, no TLS, no DNS.

```bash
corepack enable && corepack prepare pnpm@9.15.0 --activate
pnpm install --frozen-lockfile
cp .env.example .env
pnpm run jwt:generate   # paste the output into .env as JWT_SECRET
pnpm run dev            # API :8787 + all 4 portals, concurrently
```

Open the portals at their dev ports:

| Portal    | URL                   | Demo login                               |
| --------- | --------------------- | ---------------------------------------- |
| Patient   | http://localhost:4313 | `patient@pulseward.com` / `Patient@123`  |
| Clinician | http://localhost:4311 | `dr.sharma@pulseward.com` / `Doctor@123` |
| Admin     | http://localhost:4180 | `admin@pulseward.com` / `Admin@123`      |
| Ops       | http://localhost:4312 | `admin@pulseward.com` / `Admin@123`      |

The demo accounts are seeded on first boot. The Operations Dashboard requires an
`admin` or `ops` account — it is not open access.

## Docker (production stack)

The Docker stack serves the four portals as static builds behind **nginx**, which
routes by hostname and terminates TLS. It does **not** expose the Vite dev ports.

1. Build the four frontends into their `dist/` folders (one-off, via the `build` profile):

   ```bash
   docker compose --profile build run --rm frontend-builder
   ```

2. Configure DNS (or `hosts`) so these four names resolve to the host, and drop TLS
   certificates into `nginx/ssl/`. Edit `server_name` in `nginx/nginx.conf` to match:

   | Portal    | Hostname (default)           |
   | --------- | ---------------------------- |
   | Patient   | `portal.yourhospital.com`    |
   | Clinician | `clinician.yourhospital.com` |
   | Admin     | `admin.yourhospital.com`     |
   | Ops       | `ops.yourhospital.com`       |

3. Set `JWT_SECRET` (and `CORS_ALLOWED_ORIGINS` for your domains) in `.env`, then start:

   ```bash
   cp .env.example .env
   pnpm run jwt:generate   # paste into .env as JWT_SECRET
   docker compose up -d
   ```

nginx listens on `${HTTP_PORT:-80}` (redirects to HTTPS) and `${HTTPS_PORT:-443}`. The
API gateway runs internally on `:8787`; each portal proxies `/api/` to it.

## Environment Variables

| Variable               | Required | Description                                                       |
| ---------------------- | -------- | ----------------------------------------------------------------- |
| `JWT_SECRET`           | Yes      | JWT signing secret, ≥ 32 characters                               |
| `CORS_ALLOWED_ORIGINS` | No       | Comma-separated production origins (localhost is always OK)       |
| `API_PORT`             | No       | Gateway port (default `8787`)                                     |
| `DB_PATH`              | No       | SQLite file path (default next to the gateway; `/data` in Docker) |
| `NODE_ENV`             | No       | `production` in prod                                              |

See [Environment Variables](/env-vars) for the full reference.
