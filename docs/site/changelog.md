# Changelog

This page mirrors the project [CHANGELOG.md](https://github.com/Life-Experimentalist/PulseWard-HMS/blob/main/CHANGELOG.md).

For the full release history see the [GitHub Releases page](https://github.com/Life-Experimentalist/PulseWard-HMS/releases).

## Unreleased

- **Availability & reassignment loop** — clinicians block time off; booking refuses
  blocked windows; displaced appointments queue for the front desk / admin to resolve
  as reassign, reschedule, or cancel, with the patient notified of the outcome.
- **Drug-safety gate** — prescribing checks documented allergies and drug interactions;
  the server returns the warnings and requires a written, audited override reason.
- **Incidents lifecycle** — open ↔ monitoring → resolved via the API and the rewritten
  Operations Incidents page; SEV1/SEV2 downtime feeds the uptime figure.
- **Vitals series & note addenda** — repeat vitals per patient and hash-chained addenda
  on signed notes, visible in both the clinician and patient portals.
- **Per-user tasks**, a dedicated clinician **Messages** page, an admin **Tenants**
  page, and change-password that revokes all refresh tokens.
- API surface grew from 41 to 56 documented routes, all covered by the strict
  contract-parity gate.

## [1.0.0] — 2026-08-21

Initial public release: a multi-tenant hospital management system built around a single
API gateway and four role-specific web portals.

### Platform

- Single Hono API gateway on Node 24 with a built-in SQLite database (WAL mode); 41 REST
  endpoints under `/api/v1` plus a root `/health` probe.
- JWT authentication (HS256): 15-minute access tokens, single-use rotating 30-day refresh
  tokens, bcrypt-hashed passwords, five roles (`admin`, `clinician`, `patient`,
  `frontdesk`, `ops`).
- Multi-tenancy enforced by a `tenant_id` on every row, taken from the signed JWT `tid`
  claim.
- Append-only `audit_events` audit trail.

### Portals & clinical domain

- Patient, Clinician, Admin, and Operations portals (React 18 + Vite).
- Patient records with per-tenant MRN, appointment scheduling, SOAP notes with signing,
  lab orders (`ordered → in-lab → resulted → reviewed`), prescriptions, secure
  messaging, and in-app notifications.

### Tooling & delivery

- `pnpm run dev` runs the gateway and all four portals concurrently.
- `pnpm run verify` — ESLint, Prettier, Jest, and strict OpenAPI ↔ runtime contract parity.
- `pnpm run release` — automated release pipeline.
- Docker stack (gateway + nginx), GitHub Actions (CI, Pages, GHCR releases), VitePress
  docs, and an installable PWA landing page.
