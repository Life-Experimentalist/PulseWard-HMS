# PulseWard Copilot Instructions

Guidance for AI-assisted work in this repository. `CLAUDE.md` at the repo root is the
canonical, detailed reference; this file is the short version for GitHub Copilot.

## What this project is

PulseWard is a multi-tenant hospital management system:

- **One backend** — a single Hono API gateway (Node 24, `node:sqlite` in WAL mode) holding
  all REST routes, auth, multi-tenancy, auditing, and in-app notifications. There are no
  separate microservices; treat the gateway as the single runtime process.
- **Four frontends** — Vite + React 18 single-page apps (patient, clinician, operations,
  admin), each with its own `src/api.js` fetch wrapper.

## Critical rules

- Protect patient privacy: never log or hard-code PHI/PII, secrets, or tokens.
- Every database row is tenant-scoped by `tenant_id`; never write a query that can cross
  tenants.
- Keep routes aligned with `services/api-gateway/openapi.yaml` — the contract check
  (`pnpm run contracts:check -- --strict`) fails on any drift.
- Auth is JWT (HS256 via `jose`) with bcrypt-hashed passwords; do not weaken either.
- Prefer minimal, surgical changes that match existing style.

## Before you finish a change

- `pnpm run verify` passes (lint, format, tests, contract parity).
- Docs under `docs/site/` are updated when architecture, API, or behavior changes.
- Breaking changes describe their migration and rollback path.

## Review priorities

1. Patient safety and privacy
2. Scheduling and clinical-data correctness
3. API contract compatibility
4. Multi-tenant isolation
5. Operational simplicity
