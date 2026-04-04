# M9 Go-Live Acceptance Runbook

## Purpose

This runbook defines the final M9 go-live acceptance gate before production launch. It requires passing pilot readiness and cutover rehearsal readiness, then validates go-live guardrails and evidence coverage.

## Inputs

- Go-live config: `config/operations/m9-go-live-acceptance-pack.json`
- Summary template: `docs/runbooks/templates/m9-go-live-acceptance-summary-template.md`
- Primary readiness command: `npm run pilot:m9:golive:check`

## Dependency Gates

Go-live acceptance is blocked until both dependency gates pass:

1. Pilot readiness gate:
   - `npm run pilot:m9:check`
2. Cutover rehearsal readiness gate:
   - `npm run pilot:m9:rehearsal:check`

## Go-Live Acceptance Checks

Use required checks from `config/operations/m9-go-live-acceptance-pack.json`.

Minimum required checks:

- pilot-stability-confirmed
- cutover-rehearsal-confirmed
- incident-command-ready
- rollback-approval-confirmed
- stakeholder-signoff-captured

## Operational Guardrails

Validate configured production guardrails during go-live window:

- api-error-rate
- notification-delivery-success
- critical-incidents

Any guardrail breach blocks final signoff until mitigation is recorded.

## Hypercare Controls

Go-live acceptance requires:

- Hypercare duration and triage SLA confirmation.
- Daily status update cadence active.
- Evidence logging under `docs/runbooks/evidence`.

## Automated Evidence Command

Generate go-live evidence document from the template:

- `npm run runbook:m9:golive:evidence -- --date=2026-04-04 --environment=staging`

Supported arguments:

- `--date=YYYY-MM-DD` (optional; defaults to current date)
- `--environment=<name>` (optional; defaults to `staging`)

## Evidence Presence Gate

Before marking M9.4 complete, run strict evidence validation:

- `npm run pilot:m9:golive:evidence:check`

## Evidence Capture

Record artifact at:

- `docs/runbooks/evidence/m9-go-live-acceptance-<date>-<environment>.md`

Required anchors inside each evidence file:

- `# M9 Go-Live Acceptance Evidence`
- `- Status: pass`
- `## Acceptance Check Coverage`
- `## Operational Guardrail Coverage`
- `## Hypercare Confirmation`
- `## Approvals`

## Verification Command

Run end-to-end verification:

1. `npm run pilot:m9:golive:evidence:check`
2. `npm run pilot:m9:golive:check`

Both commands must pass before marking M9.4 complete.
