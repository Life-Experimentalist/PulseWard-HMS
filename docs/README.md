# PulseWard HMS Documentation

This directory is the primary source of truth for architecture, API behavior, delivery process, operations, and release evidence for PulseWard HMS.

## Current Delivery Status

- Roadmap phase: M6 contract-hardening stream completed through M6.228.
- Current milestone state: M7 operability milestone is complete (`8/8` grouped waves), M8 performance/resilience milestone is complete (`6/6` grouped waves), and M9 pilot/cutover/go-live milestone is complete (`5/5` grouped waves).
- Active execution modules:
	- Post-M9 production operations: hypercare execution tracking and release acceptance evidence maintenance.

## Documentation Map

- Project direction and roadmap:
	- `docs/ROADMAP-TODO.md`
	- `docs/PROJECT-FOUNDATION-HANDOFF.md` (historical foundation context)
- API and contracts:
	- `docs/api/api-catalog.md`
	- `docs/api/endpoint-contract-coverage-matrix.md`
	- `docs/api/error-model.md`
	- `docs/api/versioning-policy.md`
	- `docs/api/abha/`
- Architecture and platform:
	- `docs/architecture/system-context.md`
	- `docs/architecture/container-diagram.md`
	- `docs/architecture/tech-stack-inventory.md`
	- `docs/TECH-STACK-DECISIONS.md`
- Development process:
	- `docs/development-model/iterative-model.md`
	- `docs/development-model/quality-gates.md`
	- `docs/development-model/release-trains.md`
- Deployment and operations:
	- `docs/deployment/demo-quickstart.md`
	- `docs/deployment/integrations-admin-quickstart.md`
	- `docs/deployment/deploy-and-domain-migration.md`
	- `docs/runbooks/`
- Release notes:
	- `docs/releases/README.md`
	- `docs/releases/v1.3.0.md`

## Required Update Rule

For every functional change:

1. Update implementation and tests.
2. Update affected API, runbook, and process docs in the same change.
3. Record migration and rollback notes for behavior-impacting changes.

## Quick Verification Commands

Run from repository root:

```powershell
npm run contracts:check -- --strict
npm run test:routes
npm run test
npm run test:smoke
```

## Notes

- Keep examples free of patient-identifying data.
- Keep provider-specific behavior isolated to adapters and integration modules.
- Treat docs in this directory as release artifacts, not optional commentary.
