# PulseWard HMS

PulseWard HMS is a modular hospital management platform by Life Experimentalist for patient, clinician, operations, and admin workflows.

## At a Glance

PulseWard is designed for safe healthcare workflow delivery with:

- Role-specific portals and operational dashboards.
- Service-oriented backend modules with contract-checked APIs.
- Tenant-aware integrations (messaging, calendar, ABHA readiness, ABHA transactional reliability).
- Runbook-first operations, governance controls, and release evidence.

## What Tenant Means

In PulseWard, a tenant is a hospital or organization unit running on shared platform code with isolated configuration and policy.

Tenant isolation includes:

- Domain and branding configuration.
- Auth policy and allowed identity providers.
- Integration provider routing and secrets references.
- Operational telemetry filtering and audit scope.

Example:

- citycare-hospital and default can use the same APIs, but each can have different auth provider policy, connector defaults, and ABHA readiness state.

## Product Surfaces

- apps/admin-console: admin configuration and governance workflows.
- apps/clinician-portal: clinician workflow interface.
- apps/operations-dashboard: operations and reliability visibility.
- apps/patient-portal: patient-facing experience.
- apps/mobile-notifications: Expo mobile track for tenant-scoped appointment notification events.
- apps/landing-page: static website and marketing shell.

## Core Services

- services/api-gateway
- services/auth-service
- services/appointment-service
- services/notification-service
- services/patient-service
- services/ehr-service
- services/lab-service
- services/pharmacy-service
- services/billing-service

## Quickstart

Prerequisites:

- Node.js 22+
- Corepack enabled with pnpm 9.15.0

Install dependencies:

```powershell
corepack enable
corepack prepare pnpm@9.15.0 --activate
pnpm install --frozen-lockfile
```

Run key apps:

```powershell
pnpm run start:landing
pnpm run start:admin:dev
pnpm run start:clinician:dev
pnpm run start:operations:dev
pnpm run start:patient:dev
pnpm run start:mobile
```

## Quality Gates

Core validation pipeline:

```powershell
pnpm run contracts:check -- --strict
pnpm test
pnpm run build:apps
pnpm run lint
pnpm run build:types
```

TypeScript config visibility:

```powershell
pnpm run build:types:show-config
```

Typecheck scope includes:

- services/**/*.js
- tests/**/*.js
- packages/**/*.js
- apps/**/*.js

Typecheck excludes generated output:

- node_modules
- coverage
- dist
- build
- apps/**/dist

## CI and Reliability

- Workflows use pnpm lockfile builds.
- GitHub Actions JavaScript actions are pinned to Node24 runtime.
- Visual generation is manual-only (Automated Visuals via workflow_dispatch) to avoid blocking delivery.

## Documentation Map

- docs/api/api-catalog.md
- docs/api/endpoint-contract-coverage-matrix.md
- docs/runbooks/integration-provider-operations.md
- docs/runbooks/on-call.md
- docs/runbooks/observability-alerting-baseline.md
- docs/runbooks/abha-operational-readiness.md
- docs/releases/v1.3.0.md
- docs/deployment/deploy-and-domain-migration.md

## Cloudflare Pages (Landing Page)

Deployment guide:

- docs/deployment/cloudflare-pages-landing.md

Recommended static settings:

- Build command: exit 0
- Build output directory: apps/landing-page
- Production branch: main

## Suggested GitHub Metadata

Repository description:

PulseWard HMS is a modular hospital management platform with tenant-aware portals, contract-validated APIs, and operational runbooks for healthcare workflows.

Suggested topics:

- hospital-management-system
- healthcare
- hms
- ehr
- patient-portal
- clinician-portal
- microservices
- nodejs
- express
- vite

## License

This project is proprietary and confidential.
See LICENSE.md for license terms.

