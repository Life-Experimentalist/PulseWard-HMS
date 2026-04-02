# PulseWard Quality Gates

## Purpose

Quality gates define the minimum evidence required before merging and before release tagging.

## Merge Gate (Required for Feature PRs)

Run from repository root:

```powershell
npm run lint
npm run format:check
npm run test:routes
npm run test
npm run contracts:check -- --strict
```

Required outcomes:

- No lint or formatting violations.
- Route modules load without runtime import failures.
- Unit and regression tests pass.
- Contract parity reports no runtime/spec drift.

## Integration Gate (Required for Service-Integration Changes)

```powershell
npm run integrations:validate
npm run test:smoke
```

Required outcomes:

- Tenant integration configuration passes schema validation.
- Smoke tests pass for active platform routes.

## Release Gate (Required Before Release Note Promotion)

1. Merge gate passed on release branch head.
2. Integration gate passed on release branch head.
3. Runbooks updated for any operational behavior change.
4. API docs updated for any endpoint, payload, or error-shape change.
5. Rollback notes documented in release note file.

## Milestone-Specific Gate Additions

- M1 contract hardening work must include parity matrix updates in `docs/api/endpoint-contract-coverage-matrix.md`.
- M2+ auth/config work must include admin and ABHA readiness API docs updates.
- M5 adapter work must include provider readiness and test-run instructions in deployment/runbook docs.
- M6 experience surface work must include web/mobile operational startup documentation.

## Operational Safety Rules

- Never merge changes that expose credentials or patient identifiers in logs, fixtures, or docs.
- Keep provider-specific logic in adapter modules, not domain cores.
- Prefer additive API changes; if breaking behavior is unavoidable, include migration and rollback guidance.
