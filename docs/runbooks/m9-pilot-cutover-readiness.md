# M9 Pilot and Cutover Readiness Baseline

## Objective

Define and validate the minimum pilot cohort, cutover checklist, and hypercare controls for M9 so go-live execution has deterministic acceptance and evidence logging.

## Source of Truth

- `config/operations/m9-pilot-cutover-checklist.json`
- `scripts/check-m9-pilot-readiness.mjs`
- `docs/runbooks/templates/m9-pilot-cutover-summary-template.md`

## Verification Command

Run from repository root:

```powershell
pnpm run pilot:m9:check
```

Expected output:

- `M9 pilot readiness check passed.`
- Validation summary confirming pilot cohort, checklist, and hypercare baseline coverage.

## Automated Evidence Command

Run this command to execute the M9 pilot readiness gate and write a dated evidence artifact:

```powershell
pnpm run runbook:m9:pilot:evidence -- --environment staging --tenant citycare-hospital --operator platform-operations
```

Artifact output path pattern:

- `docs/runbooks/evidence/m9-pilot-cutover-YYYY-MM-DD-environment.md`

During evidence generation, the pilot readiness gate bypasses only the evidence-presence nested check (`SKIP_M9_PILOT_EVIDENCE_CHECK=1`) so a fresh artifact can be created without circular failure.

## Evidence Presence Gate

- Validate the latest pilot/cutover evidence artifact before signoff:

```powershell
pnpm run pilot:m9:evidence:check
```

- The pilot readiness gate (`pnpm run pilot:m9:check`) includes this evidence-presence check by default.

## Pilot Cohort Scope

- Pilot tenant and active-user range are defined in `config/operations/m9-pilot-cutover-checklist.json`.
- Go/no-go owners must include product, engineering, and operations roles.
- Scope changes require same-slice update to roadmap and cutover checklist config.

## Acceptance Criteria

- Define thresholded criteria for latency, error rate, and notification delivery outcomes.
- Each criterion must include metric key and threshold value.
- Any failed criterion blocks go-live signoff until mitigation evidence is attached.

## Cutover Checklist

- Validate communications approval, rollback window ownership, runbook link integrity, and escalation readiness.
- Track each required checklist item with completion status in evidence artifacts.
- Record any deferred item and explicit risk owner before execution window starts.

## Hypercare Operating Model

- Hypercare duration, triage SLA, and hotfix policy are controlled by config.
- Daily standup output must include unresolved defects and owner assignments.
- Evidence logs are stored under `docs/runbooks/evidence`.

## Evidence Capture

For each pilot checkpoint or cutover rehearsal, capture an artifact using:

- `docs/runbooks/templates/m9-pilot-cutover-summary-template.md`

Required evidence fields:

- Date, environment, tenant, operator, and commit SHA.
- Acceptance criteria results and blocked/unblocked state.
- Checklist completion matrix with risk/owner notes.
- Hypercare incidents, hotfix decisions, and status outcomes.
