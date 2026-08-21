# Changelog

All notable changes to PulseWard HMS are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions follow [Semantic Versioning](https://semver.org/).

---

## [Unreleased]

### Added

- **Availability & reassignment loop** — clinicians block time off (30-day cap,
  typed reasons); booking refuses blocked windows (`409 clinician_unavailable`)
  and same-patient stacking (`422 patient_stacking`); displaced appointments
  queue for reassignment; admins resolve each as reassign / reschedule / cancel
  and the patient is notified. New clinician **Availability** page and admin
  **Reassignments** page drive the whole loop in the UI.
- **Drug-safety gate** — prescribing checks documented allergies (drug-class
  aware) and known drug interactions; the server answers `422` with the exact
  warnings, and the portal requires a written override reason before allowing a
  clearly-marked "Override & prescribe". Overrides are audited and shown as
  annotations on the prescription.
- **Incidents** — full open ↔ monitoring → resolved lifecycle in the API and a
  rewritten Operations **Incidents** page (create with severity/service/owner,
  transition buttons that mirror the server's state machine). SEV1/SEV2 downtime
  now feeds the uptime figure on the Health page.
- **Vitals series** — record vitals (BP, HR, temp, SpO₂, RR, weight) from the
  clinician patient view; latest-value chips plus history table render in both
  the clinician and patient portals.
- **Note addenda** — signed SOAP notes accept hash-chained addenda, visible to
  both clinician and patient.
- **Per-user tasks** — Eisenhower-style task list for clinicians with strict
  owner isolation.
- **Clinician messaging** — dedicated Messages page for the care-team side of
  patient conversations.
- **Admin Tenants page** — read-only view of onboarded hospitals.
- Change-password now revokes all of the user's refresh tokens.

### Changed

- Portal `api.js` clients now surface the server's error `code` and `data`
  payload on thrown errors, enabling flows like the drug-safety override.
- Operations dashboard auto-refresh re-fetches data in place instead of
  remounting the page — open modals and half-typed forms survive the 30-second
  tick.

### Fixed

- `requireAuth` no longer swallows downstream handler errors as 401s.
- Deleting an availability block detaches its reassignment-queue rows instead
  of tripping a foreign-key constraint.
- Incident banner grammar ("1 active incident requires attention").

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
