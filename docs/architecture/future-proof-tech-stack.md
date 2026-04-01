# Future-Proof Tech Stack for PulseWard HMS

## Purpose

This document formalizes a practical, future-proof stack for PulseWard that starts simple and scales safely.

## Current Evidence-Based Baseline

- **Monorepo**: pnpm workspace across `apps/*`, `services/*`, and `packages/*`.
- **Backend Runtime**: Node.js with Express (from current package dependencies and service docs).
- **Frontend Direction**: React-based portals (documented in app READMEs).
- **Architecture**: API Gateway + domain microservices + shared packages.

## Recommended Standard (Phase 1: Now)

This phase avoids unnecessary complexity while keeping future options open.

### Application Layer

- **Backend framework**: Node.js + TypeScript + Express (short-term standardization target).
- **Frontend framework**: React + TypeScript for all portals and consoles.
- **API contracts**: OpenAPI for REST; versioned contract docs in `contracts/rest`.

### Data Layer

- **Primary relational DB**: PostgreSQL (managed or self-hosted).
- **Cache/queues**: Redis (managed or self-hosted).
- **File/object storage**: S3-compatible object storage.

### Edge and Delivery

- **Reverse proxy/CDN/WAF**: Cloudflare.
- **Edge logic**: Cloudflare Workers for lightweight edge tasks only (token validation helpers, request shaping, bot mitigation), not core clinical business logic.

### Deployment

- **Containers**: Docker for all services.
- **Environment progression**: local Docker Compose -> managed container platform -> advanced orchestration only if needed.

### CI/CD and Quality

- **Source control and automation**: GitHub + GitHub Actions.
- **Package manager**: pnpm (workspace-level dependency consistency and performance).
- **Validation gates**: lint, test, build, API contract checks, security checks.

## Why pnpm Instead of npm (for this repo)

- Better monorepo workspace handling for many apps/services/packages.
- Faster installs and lower disk usage through a content-addressable store.
- More deterministic dependency graph behavior across workspaces.
- Stronger guardrails against accidental phantom dependencies.

## Deployment Profiles (Choose by Comfort Level)

### Profile 1: Demo-First (Easiest)

- Local Docker Compose
- Single command startup via `pnpm demo:up`
- Best for portfolio demo, quick iteration, and low effort

### Profile 2: Managed Cloud (Simple Production)

- Keep Dockerized services
- Deploy to a managed container host
- Put Cloudflare in front for DNS/TLS/WAF
- Use managed PostgreSQL and Redis

### Profile 3: Advanced Platform (Later)

- Add Terraform for repeatable infrastructure
- Add Kubernetes only when scale and team maturity justify it
- Add event bus for high-volume asynchronous workflows

## Non-Goals for Now

- No mandatory Kubernetes adoption in Phase 1.
- No mandatory Terraform adoption in Phase 1.
- No migration to a second backend runtime until service boundaries are stable.

## Governance Notes

- Patient privacy and safety requirements remain non-negotiable.
- Provider-specific integrations must stay behind adapter interfaces.
- Every breaking change must include migration and rollback notes.
