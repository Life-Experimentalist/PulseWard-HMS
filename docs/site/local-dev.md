# Local Development

## Prerequisites

- Node 24+
- pnpm 9.15.0 (managed via corepack)
- Git

## Setup

```bash
corepack enable && corepack prepare pnpm@9.15.0 --activate
pnpm install --frozen-lockfile
cp .env.example .env
# Edit .env and set JWT_SECRET
node scripts/generate-jwt-secret.mjs
```

## Start everything

```bash
pnpm run dev
```

This uses `concurrently` to start 5 processes with colour-coded output:

| Label       | Process                     | Port |
| ----------- | --------------------------- | ---- |
| `api`       | API Gateway (Hono)          | 8787 |
| `patient`   | Patient Portal (Vite HMR)   | 4313 |
| `clinician` | Clinician Portal (Vite HMR) | 4311 |
| `admin`     | Admin Console (Vite HMR)    | 4180 |
| `ops`       | Ops Dashboard (Vite HMR)    | 4312 |

## Tests

```bash
pnpm test                    # all tests with coverage
pnpm run test:quick          # skip coverage
pnpm run test:contracts      # OpenAPI ↔ runtime parity
```

## Lint & Format

```bash
pnpm run lint
pnpm run format:check
pnpm run lint:fix            # auto-fix
pnpm run format              # auto-format
```
