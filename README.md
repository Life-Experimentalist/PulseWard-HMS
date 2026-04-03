# PulseWard HMS

PulseWard HMS is a modular hospital management platform by Life Experimentalist for patient, clinician, operations, and admin workflows.

## Description

PulseWard focuses on safe healthcare workflow delivery using:

- Role-specific portals and dashboards.
- Service-oriented backend modules with contract-checked APIs.
- Tenant-aware integration adapters (messaging, calendar, ABHA readiness).
- Operational runbooks, governance, and release evidence.

## Product Surfaces

- `apps/admin-console`: admin configuration and governance workflows.
- `apps/clinician-portal`: clinician workflow interface.
- `apps/operations-dashboard`: operations and reliability visibility.
- `apps/patient-portal`: patient-facing experience.
- `apps/landing-page`: static website/marketing shell.

## Core Services

- `services/api-gateway`
- `services/auth-service`
- `services/appointment-service`
- `services/notification-service`
- `services/patient-service`
- `services/ehr-service`
- `services/lab-service`
- `services/pharmacy-service`
- `services/billing-service`

## Local Setup

Prerequisites:

- Node.js 22+
- npm 10+

Install root dependencies:

```powershell
npm ci
```

Install all app dependencies:

```powershell
npm run install:apps
```

## Development Commands

Run key apps:

```powershell
npm run start:landing
npm run start:admin:dev
npm run start:clinician:dev
npm run start:operations:dev
npm run start:patient:dev
```

Run quality gates:

```powershell
npm run contracts:check -- --strict
npm test
npm run build:apps
npm run lint
```

Typecheck runtime JS surface:

```powershell
npm run build:types
```

Inspect resolved TypeScript config:

```powershell
npm run build:types:show-config
```

Typecheck scope currently includes:

- `services/**/*.js`
- `tests/**/*.js`
- `packages/**/*.js`
- `apps/**/*.js`

Typecheck excludes generated/runtime output folders such as `node_modules`, `coverage`, `dist`, and `build`.

## CI and Reliability

- Workflows are configured for npm lockfile builds.
- GitHub Actions now opts JavaScript actions into Node24 runtime to avoid Node20 deprecation warnings.
- Visual diagram generation is manual-only (`Automated Visuals` via `workflow_dispatch`) so it does not block normal delivery.

## Documentation Map

- `docs/api/api-catalog.md`
- `docs/api/endpoint-contract-coverage-matrix.md`
- `docs/runbooks/integration-provider-operations.md`
- `docs/runbooks/abha-operational-readiness.md`
- `docs/releases/v1.2.1.md`
- `docs/deployment/deploy-and-domain-migration.md`

## Cloudflare Pages (Landing Page)

Landing page deployment guidance is documented in:

- `docs/deployment/cloudflare-pages-landing.md`

Recommended for static site deployment:

- Build command: `exit 0`
- Build output directory: `apps/landing-page`
- Production branch: `main`

## Suggested GitHub Metadata

Recommended repository description:

`PulseWard HMS is a modular hospital management platform with tenant-aware portals, contract-validated APIs, and operational runbooks for healthcare workflows.`

Recommended topics/tags:

- `hospital-management-system`
- `healthcare`
- `hms`
- `ehr`
- `patient-portal`
- `clinician-portal`
- `microservices`
- `nodejs`
- `express`
- `vite`

## License

This project is proprietary and confidential.
See `LICENSE.md` for license terms.
