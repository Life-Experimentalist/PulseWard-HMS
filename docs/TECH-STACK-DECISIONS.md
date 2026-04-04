# PulseWard Tech Stack Decisions

## Adopted Decision

PulseWard follows a **Docker Compose on VM (cost-first) + Cloudflare edge controls** baseline for pilot and early production.

Planned upgrade path:

- Move to AWS ECS/Fargate or Kubernetes only when measurable scale/operations thresholds require it.

## Framework Decision

- **Current runtime framework**: Node.js + Express services with React/Vite frontends.
- **Contract model**: OpenAPI-first per service with repository-level contract parity checks.
- **Type strategy**: shared contracts/types via workspace packages, with incremental TypeScript hardening where practical.

Detailed implementation mapping (service-by-service and app-by-app) is maintained in:

- `docs/architecture/tech-stack-inventory.md`

## Data Decision

- **Current state**: service-local/in-memory or file-backed stores for rapid iteration where applicable.
- **Production target**: PostgreSQL as primary system of record.
- **Queue/cache target**: Redis for async dispatch and cache layers.
- **Object storage target**: S3-compatible object storage for artifacts and backups.

## Tooling Decision

- **Primary scripts**: pnpm scripts at repository root.
- **Package manager**: pnpm workspace with frozen-lockfile installs in local and CI workflows.
- **CI/CD**: GitHub Actions.
- **Containerization**: Docker.

## Deferred Complexity

- Kubernetes: deferred until scale/operational needs justify it.
- Terraform: deferred until infra repeatability at scale is required.
- Multi-region and active-active failover: deferred until post-pilot reliability targets demand it.

## Decision Rationale

This path keeps costs and operations manageable for the first pilot, aligns with existing implementation, and preserves a clean migration path to heavier infrastructure once performance and reliability data justify the move.
