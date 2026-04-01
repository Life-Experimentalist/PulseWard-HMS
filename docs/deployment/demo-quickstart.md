# Demo Quickstart (No DevOps Expertise Required)

This guide gets a working PulseWard demo up with the fewest steps.

## Prerequisites

- Docker Desktop installed and running
- Node.js 20+
- pnpm 9+

## One-Time Setup

```powershell
pnpm install
```

Copy environment template and set required values:

```powershell
Copy-Item .env.example .env
```

## Start Demo Stack

```powershell
pnpm demo:up
```

## Check Services

```powershell
docker compose ps
```

## Start API Services (local demo)

Run each command in a separate terminal:

```powershell
pnpm start:auth
```

```powershell
pnpm start:notification
```

```powershell
pnpm start:appointment
```

## Start Landing Page

```powershell
pnpm start:landing
```

## Validate Runtime Contracts

```powershell
pnpm integrations:validate
pnpm test:routes
pnpm test:smoke
```

## Stop Demo Stack

```powershell
pnpm demo:down
```

## If Something Fails

1. Restart Docker Desktop.
2. Re-run `pnpm demo:up`.
3. Check logs with:

```powershell
docker compose logs --tail=100
```

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
