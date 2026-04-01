# Source of Truth and Data Protection Policy

## Purpose

Define what is authoritative in PulseWard and prevent configuration drift or silent data loss.

## Authoritative Sources

- GitHub repository: source of truth for code, contracts, workflows, and runbooks.
- Environment configuration: source of truth for deployment-specific secrets and endpoints.
- Production data stores: source of truth for runtime clinical and operational records.

## Non-Negotiable Controls

- Branch protection on main with PR reviews required.
- Required CI checks must pass before merge.
- Every production change links to a tracked issue.
- Backups and restore drills are tracked through automated GitHub issues.

## Data Safety Controls

- Daily backup verification per tenant.
- Weekly restore verification for at least one tenant.
- Versioned migration scripts for schema changes.
- Immutable audit logs for admin changes including branding updates.

## Tenant Isolation Requirement

- One logical tenant boundary per hospital.
- No cross-tenant read/write operations without explicit service-level authorization.
- Incident reporting must include affected tenant keys.

## Evidence and Auditability

- Every incident, backup drill, and rollback action must be documented as a GitHub issue, comment, or pull request link.
- Closure of operational issues requires evidence links.
