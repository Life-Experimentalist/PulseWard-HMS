# M8 Performance and Resilience Readiness Gate

## Objective

Provide a single milestone-closeout command to validate M8 load, resilience, and release-candidate evidence controls before transitioning execution focus to M9.

## Source of Truth

- `scripts/check-m8-performance-readiness.mjs`
- `docs/runbooks/m8-load-validation.md`
- `docs/runbooks/m8-resilience-drills.md`
- `docs/runbooks/m8-release-candidate-gate.md`

## Verification Command

Run from repository root:

```powershell
npm run perf:m8:final:check
```

Expected output:

- `M8 performance readiness check passed.`
- Validation summary confirming nested checks plus RC evidence artifact coverage.

## Nested Checks

The M8 final gate executes these commands:

- `npm run perf:m8:check`
- `npm run perf:m8:resilience:check`
- `npm run perf:m8:rc:evidence:check`
- `npm run perf:m8:rc:check`

## Evidence Requirements

The gate requires at least one RC evidence artifact under `docs/runbooks/evidence` matching:

- `m8-rc-gate-YYYY-MM-DD-environment.md`

The latest artifact must include:

- `- Status: pass`
- `- rc-evidence-presence (skipped during evidence generation)`

## Usage in Delivery Flow

- Run this gate before marking M8 complete in roadmap accounting.
- Attach command output summary to milestone ledger evidence notes.