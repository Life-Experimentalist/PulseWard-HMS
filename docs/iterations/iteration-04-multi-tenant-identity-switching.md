# Iteration 04: Multi-Tenant Identity and Profile Switching (Planned)

Status: Planned backlog item, intentionally lower priority than current setup stabilization.

## Objective

Allow a single user identity to access multiple tenant profiles safely, with explicit context switching and strict tenant isolation.

## Scope

1. Link one account to multiple tenant memberships.
2. Add active tenant context selection in web and mobile experiences.
3. Enforce active tenant context on every API request.
4. Add tenant-switch audit trail for compliance and investigations.
5. Add admin policy controls for multi-tenant membership assignment.

## Security and Isolation Requirements

1. Active tenant must be explicit in token/session claims.
2. Tenant switching must issue refreshed token/session context.
3. Data reads and writes must be blocked across tenant boundaries.
4. Cross-tenant operations require explicit privileged role and policy.

## API and Contract Work (Planned)

1. POST /api/v1/auth/memberships/link
2. GET /api/v1/auth/memberships
3. POST /api/v1/auth/switch-tenant
4. GET /api/v1/auth/active-tenant

## UX Work (Planned)

1. Header/profile tenant switcher in portals.
2. Mobile profile switch action with clear active-tenant indicator.
3. Session warning when switching tenant context.

## Exit Criteria (Future)

1. User can switch between assigned tenants without full re-login.
2. Unauthorized tenant access attempts return clear 403 with audit event.
3. Contract tests cover tenant-switch and access-guard scenarios.
4. Runbooks document incident handling for tenant-context issues.
