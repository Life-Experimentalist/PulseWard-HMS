# Deployment and Domain Migration Guide

This guide keeps deployment practical: start cheap, keep API stable at `/api/v1`, and migrate domains without tenant leakage.

## Objectives

- Demo quickly on GitHub subdomain and local services.
- Support custom domain migration later without changing API path.
- Keep strict tenant origin segregation through domain config.

## Prerequisites

- Node.js 20+
- pnpm 9.15.0+ (via Corepack or npm global install)
- Docker Desktop
- Cloudflare account (recommended for DNS/TLS/WAF)

## 1) Local Bring-Up

Install dependencies:

```powershell
pnpm install --frozen-lockfile
```

Prepare environment:

```powershell
Copy-Item .env.example .env
```

Start supporting stack:

```powershell
pnpm run demo:up
```

Start services in separate terminals:

```powershell
pnpm run start:auth
```

```powershell
pnpm run start:notification
```

```powershell
pnpm run start:appointment
```

Start landing page:

```powershell
pnpm run start:landing
```

Validate:

```powershell
pnpm run integrations:validate
pnpm run test:routes
pnpm run test:smoke
```

## 2) Configure Tenant Domains

Domain model file:

- config/domains/default-domain-config.json

Contract schema:

- contracts/rest/domain-config.schema.json

For each tenant:

1. Set `landingDomain`.
2. Set `apiDomain`.
3. Add every allowed browser origin to `allowedOrigins`.

Validation endpoint:

- `POST /api/v1/platform/domain-config/validate`

## 3) GitHub Subdomain First

Recommended first production-like setup:

1. Publish landing assets from `apps/landing-page` using GitHub Pages.
2. Use GitHub subdomain for early demos.
3. Keep API services on a single low-cost host.
4. Put Cloudflare in front of APIs.
5. Keep all frontend API calls on `/api/v1`.

## 4) Migrate to Custom Domain

When moving from GitHub subdomain to custom domain:

1. Provision custom domain DNS in Cloudflare.
2. Configure TLS and redirect policy.
3. Update `platform.primaryCustomDomain`.
4. Update tenant `landingDomain` and `allowedOrigins`.
5. Keep `platform.apiBasePath` as `/api/v1`.
6. Run smoke tests and origin validation before cutover.
7. Keep previous domains in `allowedOrigins` during transition window.
8. Remove old origins after traffic stabilizes.

## 5) OAuth and Tenant Login Safety

Required env keys for OAuth path:

- GOOGLE_OAUTH_CLIENT_ID
- GOOGLE_OAUTH_CLIENT_SECRET
- GOOGLE_OAUTH_REDIRECT_URI
- CLERK_PUBLISHABLE_KEY
- CLERK_SECRET_KEY

Validation endpoints:

- `GET /api/v1/auth/oauth/providers`
- `GET /api/v1/auth/oauth/google/start?tenantKey={tenantKey}&role={role}`
- `GET /api/v1/auth/oauth/clerk/start?tenantKey={tenantKey}`

## 6) Provider Billing and Free-First Defaults

Default posture:

- Free-first: Telegram, SMTP Email, Webhook, Apple/ICS options.
- Paid-optional: WhatsApp and some enterprise calendar paths.

Rule:

- Each hospital admin owns paid provider billing and onboarding.

## 7) Rollback Plan

If migration fails:

1. Revert domain config JSON to last known good commit.
2. Re-enable old origins.
3. Keep traffic on previous domain.
4. Re-run:

```powershell
pnpm run integrations:validate
pnpm run test:smoke
```

5. Record incident and rollback evidence in GitHub issues.

