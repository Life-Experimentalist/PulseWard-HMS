# M9 Production Readiness Gate

## Objective

Provide a single milestone-closeout command to validate pilot readiness, cutover rehearsal readiness, go-live acceptance readiness, and strict evidence coverage before marking M9 complete.

## Source of Truth

- `scripts/check-m9-production-readiness.mjs`
- `docs/runbooks/m9-pilot-cutover-readiness.md`
- `docs/runbooks/m9-cutover-rehearsal.md`
- `docs/runbooks/m9-go-live-acceptance.md`

## Verification Command

Run from repository root:

```powershell
npm run pilot:m9:final:check
```

Expected output:

- `M9 production readiness check passed.`
- Validation summary confirming nested checks and evidence-pass markers.

## Nested Checks

The M9 final gate executes these commands:

- `npm run pilot:m9:evidence:check`
- `npm run pilot:m9:rehearsal:evidence:check`
- `npm run pilot:m9:golive:evidence:check`
- `npm run pilot:m9:check`
- `npm run pilot:m9:rehearsal:check`
- `npm run pilot:m9:golive:check`

## Evidence Requirements

The gate requires latest pass-status evidence artifacts under `docs/runbooks/evidence` for:

- `m9-pilot-cutover-YYYY-MM-DD-environment.md`
- `m9-cutover-rehearsal-YYYY-MM-DD-environment.md`
- `m9-go-live-acceptance-YYYY-MM-DD-environment.md`

Each latest artifact must include:

- Title anchor for its evidence type.
- `- Status: pass` marker.

## Usage in Delivery Flow

- Run this gate before marking M9 complete in roadmap accounting.
- Attach command output summary to milestone ledger evidence notes.
