# PulseWard Tech Stack Decisions

## Adopted Decision

PulseWard will follow a **Docker + AWS ECS Fargate + Cloudflare** primary deployment model, with pnpm monorepo dependency management.

## Framework Decision

- **Current practical framework**: Node.js + Express services with React frontends.
- **Immediate standardization**: TypeScript-first services and shared contracts.

## Data Decision

- **Primary database**: PostgreSQL.
- **Operational cache/queue**: Redis.
- **Object storage**: S3.

## Tooling Decision

- **Package manager**: pnpm.
- **CI/CD**: GitHub Actions.
- **Containerization**: Docker.

## Deferred Complexity

- Kubernetes: deferred until scale/operational needs justify it.
- Terraform: deferred until infra repeatability at scale is required.

## Decision Rationale

This path keeps operations manageable now, aligns with existing team familiarity (AWS, Cloudflare, Docker), and preserves a clear upgrade path without lock-in.
