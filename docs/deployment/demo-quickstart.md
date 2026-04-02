# Demo Quickstart (No DevOps Expertise Required)

This guide gets a working PulseWard demo up with the fewest steps.

## Prerequisites

- Docker Desktop installed and running
- Node.js 20+
- npm 10+ (pnpm is optional)

## One-Time Setup

```powershell
npm install
```

Copy environment template and set required values:

```powershell
Copy-Item .env.example .env
```

## Start Demo Stack

```powershell
npm run demo:up
```

## Check Services

```powershell
docker compose ps
```

## Start API Services (local demo)

Run each command in a separate terminal:

```powershell
npm run start:auth
```

```powershell
npm run start:notification
```

```powershell
npm run start:appointment
```

## Start Landing Page

```powershell
npm run start:landing
```

## Start Admin Console

Build once, then serve static runtime:

```powershell
npm run install:admin
npm run build:admin
npm run start:admin
```

## Validate Runtime Contracts

```powershell
npm run contracts:check -- --strict
npm run integrations:validate
npm run test:routes
npm run test
npm run test:smoke
```

## Stop Demo Stack

```powershell
npm run demo:down
```

## If Something Fails

1. Restart Docker Desktop.
2. Re-run `npm run demo:up`.
3. Check logs with:

```powershell
docker compose logs --tail=100
```

## Optional pnpm Equivalents

If you prefer pnpm in this repository, all commands above can be run with `pnpm` equivalents.

## Cloud Demo Path (Easy Upgrade)

When you want online demo access with minimal setup:

1. Keep Docker for local development.
2. Deploy app containers to a managed platform (start with a single managed container host).
3. Add Cloudflare in front for DNS, TLS, and WAF.
4. Move to AWS services later only when needed.
5. Keep landing and APIs on `/api/v1` and update tenant domain config before cutover.

## Full Deployment Guide

For GitHub subdomain, custom domain migration, and tenant origin controls:

- docs/deployment/deploy-and-domain-migration.md
