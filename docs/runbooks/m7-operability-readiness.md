# M7 Operability Readiness Gate

## Objective

Provide a single gate command that verifies M7 operability controls are complete before moving to M8.

## Scope

The M7 readiness gate verifies:

- Observability baseline definitions and runbook links.
- On-call escalation ownership coverage.
- Request trace-correlation baseline across service runtimes.
- Incident command readiness baseline and severity objectives.
- Backup and restore evidence artifacts with pass status.

## Source of Truth

- `config/observability/default-alert-rules.json`
- `config/operations/oncall-escalation-map.json`
- `config/operations/incident-severity-matrix.json`
- `packages/shared-utils/request-context.js`

## Verification Command

Run from repository root:

```powershell
pnpm run ops:m7:check
```

Expected output:

- `M7 operability readiness check passed.`
- Validation summary confirming nested checks and evidence coverage.

## Nested Checks

The M7 command executes these baseline checks:

- `pnpm run ops:observability:check`
- `pnpm run ops:oncall:check`
- `pnpm run ops:trace:check`
- `pnpm run ops:incident:check`

## Evidence Requirements

The gate requires at least one artifact of each type under `docs/runbooks/evidence`:

- `backup-drill-YYYY-MM-DD-tenant.md`
- `restore-isolation-YYYY-MM-DD-tenant.md` with `Verification status: pass`

## Usage in Delivery Flow

- Run this gate before marking M7 complete in roadmap accounting.
- Attach command output summary to milestone ledger evidence notes.
