# Changelog

This page mirrors the project [CHANGELOG.md](https://github.com/Life-Experimentalist/PulseWard-HMS/blob/main/CHANGELOG.md).

For the full release history see the [GitHub Releases page](https://github.com/Life-Experimentalist/PulseWard-HMS/releases).

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
