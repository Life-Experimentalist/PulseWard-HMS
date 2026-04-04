# M8 Release Candidate Regression Gate

## Objective

Provide one deterministic command to validate release-candidate readiness across contracts, runtime route loading, adapter behavior, and portal builds.

## Source of Truth

- `scripts/check-m8-release-candidate-gate.mjs`
- `docs/runbooks/templates/m8-release-candidate-summary-template.md`

## Verification Command

Run from repository root:

```powershell
pnpm run perf:m8:rc:check
```

Expected output:

- `M8 release-candidate gate check passed.`
- Validation summary confirming nested checks and regression/build coverage.

## Automated Evidence Command

Run this command to execute the RC gate and write a dated evidence artifact:

```powershell
pnpm run runbook:m8:rc:evidence -- --environment staging --operator platform-operations
```

Artifact output path pattern:

- `docs/runbooks/evidence/m8-rc-gate-YYYY-MM-DD-environment.md`

During evidence generation, the RC gate bypasses only the evidence-presence nested check (`SKIP_M8_RC_EVIDENCE_CHECK=1`) so a fresh artifact can be created without circular failure.

## Evidence Presence Gate

- Validate the latest RC evidence artifact before release-candidate signoff:

```powershell
pnpm run perf:m8:rc:evidence:check
```

- The RC aggregate gate (`pnpm run perf:m8:rc:check`) includes this evidence-presence check by default.

## Contract Regression Gate

- Execute strict contract validation (`contracts:check -- --strict`).
- Fail the gate on any route/spec drift or parity assertion failure.

## Portal Build Gate

- Build admin, clinician, operations, and patient portals via `build:apps`.
- Fail the gate on any production build failure.

## Adapter Regression Gate

- Execute focused regression suites for calendar and messaging provider behavior.
- Include interoperability and diagnostics assertions used by operations handoff.

## Evidence Capture

For each RC gate run, create a summary artifact under `docs/runbooks/evidence` using `docs/runbooks/templates/m8-release-candidate-summary-template.md`.

The automated command can be used as the default evidence path for scheduled or milestone RC runs.

Required evidence fields:

- Commit SHA, environment, operator, and timestamp.
- Full command sequence and pass/fail result per nested check.
- Regression/build duration and notable warnings.
- Any unresolved defects and owner assignments.

## Rollback Verification

- If any mitigation is applied during RC hardening, record rollback steps and validation output.
- Confirm contracts and route loading remain stable after rollback.
