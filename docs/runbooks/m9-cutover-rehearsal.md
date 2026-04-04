# M9 Cutover Rehearsal Readiness Runbook

## Purpose

This runbook defines how to execute and evaluate M9 cutover rehearsal readiness before production go-live. It enforces a strict evidence-first workflow and ensures rehearsal outcomes can be audited.

## Inputs

- Rehearsal configuration: `config/operations/m9-cutover-rehearsal-pack.json`
- Summary template: `docs/runbooks/templates/m9-cutover-rehearsal-summary-template.md`
- Primary readiness command: `npm run pilot:m9:rehearsal:check`

## Pilot Gate Dependency

M9 rehearsal readiness depends on pilot readiness completion.

1. Verify pilot readiness baseline:
   - `npm run pilot:m9:check`
2. Confirm latest pilot evidence is present:
   - `npm run pilot:m9:evidence:check`

Do not execute rehearsal if pilot readiness is failing.

## Rehearsal Steps

Execute rehearsal using the required steps listed in `config/operations/m9-cutover-rehearsal-pack.json`.

1. Trigger pre-cutover sync and dependency checks.
2. Execute dry-run cutover sequence.
3. Validate rollback decision checkpoints.
4. Execute rollback drill and timing capture.
5. Confirm communications and incident workflow drill.

## Success Criteria

Use the criteria in `config/operations/m9-cutover-rehearsal-pack.json`.

Minimum expectations:

- Rehearsal complete within configured max duration.
- Rollback objective met within configured threshold.
- No critical incident cap violation.

## Automated Evidence Command

Generate rehearsal evidence document from the template:

- `npm run runbook:m9:rehearsal:evidence -- --date=2026-04-04 --environment=staging`

Supported arguments:

- `--date=YYYY-MM-DD` (optional; defaults to current date)
- `--environment=<name>` (optional; defaults to `staging`)

## Evidence Presence Gate

Before accepting rehearsal readiness, run the strict evidence gate:

- `npm run pilot:m9:rehearsal:evidence:check`

This validates that the latest rehearsal evidence file exists and includes all required anchors.

## Evidence Capture

Record the finalized summary at:

- `docs/runbooks/evidence/m9-cutover-rehearsal-<date>-<environment>.md`

Required anchors inside each evidence file:

- `# M9 Cutover Rehearsal Evidence`
- `- Status: pass`
- `## Rehearsal Metadata`
- `## Timeline`
- `## Rehearsal Step Coverage`
- `## Success Criteria Coverage`
- `## Action Items`
- `## Approvals`

## Verification Command

Run end-to-end verification:

1. `npm run pilot:m9:rehearsal:evidence:check`
2. `npm run pilot:m9:rehearsal:check`

Both commands must pass before marking M9.3 complete.
