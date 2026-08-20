# Changelog

All notable changes to PulseWard HMS are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions follow [Semantic Versioning](https://semver.org/).

---

## [1.0.0] — 2026-08-21

Initial public release. A multi-tenant hospital management system built around a single
API gateway and four role-specific web portals.

### Platform

- **API gateway** — one Hono application on Node 24 with a built-in SQLite database
  (`node:sqlite`, WAL mode). 41 REST endpoints under `/api/v1`, plus a root `/health`
  probe.
- **Authentication** — JWT (HS256 via `jose`): 15-minute access tokens and single-use,
  rotating 30-day refresh tokens stored server-side. Passwords hashed with bcrypt
  (cost 10). Five roles: `admin`, `clinician`, `patient`, `frontdesk`, `ops`.
- **Multi-tenancy** — every row carries a `tenant_id`; the tenant is taken from the
  signed JWT `tid` claim, so requests can never cross tenant boundaries.
- **Audit trail** — an append-only `audit_events` table records authentication and
  write operations.

### Portals

- **Patient Portal** — dashboard, appointments (book / cancel), lab results,
  prescriptions, secure messaging, and in-app notifications.
- **Clinician Portal** — schedule, patient search and detail, SOAP notes with signing,
  lab ordering, and prescribing.
- **Admin Console** — user and clinician management, audit log, platform stats, and live
  system status.
- **Operations Dashboard** — component health and incident monitoring.

### Clinical domain

- Patient records with per-tenant MRN assignment (`PW-26-NNNNN`).
- Appointment scheduling with a full status lifecycle
  (`scheduled → checked-in → in-progress → completed`, plus `cancelled` / `no-show`).
- SOAP clinical notes with a draft → signed workflow.
- Lab orders following `ordered → in-lab → resulted → reviewed` (or `cancelled`).
- Prescriptions (`active → dispensed → completed`, or `discontinued`).
- Secure patient ↔ care-team messaging.
- In-app notifications (no external delivery channel).

### Tooling & delivery

- `pnpm run dev` — API gateway plus all four portals with hot reload.
- Quality gate — `pnpm run verify` runs ESLint, Prettier, the Jest suite, and strict
  OpenAPI ↔ runtime contract parity.
- `pnpm run release` — automated version bump, changelog, build, artifact zips, Docker
  image, checksums, and git tag.
- Docker stack — gateway plus nginx serving the four static portals.
- GitHub Actions — CI, GitHub Pages (landing page + docs), and tagged releases to GHCR.
- VitePress documentation site and a marketing landing page (installable PWA).

[1.0.0]: https://github.com/Life-Experimentalist/PulseWard-HMS/releases/tag/v1.0.0
