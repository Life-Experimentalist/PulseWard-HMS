# Demo Quickstart (Docker Desktop First)

This guide is designed for first-time setup with the least manual work.

## Setup Flow

```mermaid
flowchart TD
	A[Install Docker Desktop + Node.js] --> B[Run pnpm install --frozen-lockfile]
	B --> C[Run pnpm run setup:demo]
	C --> D[Check docker compose ps]
	D --> E[Start API services in separate terminals]
	E --> F[Run smoke and demo checks]
	F --> G[Demo ready]
```

## Prerequisites

- Docker Desktop running with Linux containers
- Node.js 22+
- pnpm 9.15.0+ (via Corepack or npm global install)

## Step 1: Install Dependencies

From repository root:

```powershell
pnpm install --frozen-lockfile
```

## Step 2: One-Command Local Setup

Run:

```powershell
pnpm run setup:demo
```

What this does:

- Validates Docker engine and Docker Compose availability
- Installs app dependencies
- Creates .env from .env.example if needed
- Runs docker compose up with build
- Prints service status

## Step 3: Verify Compose Services

```powershell
docker compose ps
```

Expected status: all configured services show State as running/healthy.

## Step 4: Start Local API Services

Use separate terminals:

```powershell
pnpm run start:auth
```

```powershell
pnpm run start:notification
```

```powershell
pnpm run start:appointment
```

## Step 5: Start Web Surfaces (Optional For Full Demo)

```powershell
pnpm run start:landing
```

```powershell
pnpm run start:operations:dev
```

```powershell
pnpm run start:admin:dev
```

## Step 6: Run Demo And Health Checks

```powershell
pnpm run demo:opd
```

```powershell
pnpm run test:smoke
```

```powershell
pnpm run contracts:check -- --strict
```

## Service Port Map

| Service                  | URL                   |
| ------------------------ | --------------------- |
| API Gateway              | http://localhost:8080 |
| Auth Service             | http://localhost:8081 |
| Patient Service          | http://localhost:8082 |
| Appointment Service      | http://localhost:8083 |
| EHR Service              | http://localhost:8084 |
| Billing Service          | http://localhost:8085 |
| Pharmacy Service         | http://localhost:8086 |
| Lab Service              | http://localhost:8087 |
| Notification Service     | http://localhost:8088 |
| AI Project Manager Agent | http://localhost:8089 |

## Stop Everything

```powershell
pnpm run demo:down
```

## If Something Fails

1. Restart Docker Desktop and wait until engine is fully ready.
2. Re-run setup:

```powershell
pnpm run setup:demo
```

3. Inspect logs:

```powershell
docker compose logs --tail=120
```

## Next Guide

For domain migration and production-like rollout:

- docs/deployment/deploy-and-domain-migration.md

