# M9 Pilot and Cutover Evidence (2026-04-04)

## Metadata

- Environment: staging
- Tenant: citycare-hospital
- Operator: platform-operations
- Commit SHA: not-specified
- Executed at: 2026-04-03T23:40:31.416Z
- Command: pnpm run pilot:m9:check

## Pilot Status

- Status: pass

## Acceptance Criteria Coverage

- api-p95-latency
- api-error-rate
- notification-delivery-success

## Cutover Checklist Coverage

- communications-approved
- rollback-window-confirmed
- runbook-links-validated
- support-escalation-ready

## Output Tail

```text
> pulseward-hms@1.3.0 pilot:m9:check
> node ./scripts/check-m9-pilot-readiness.mjs
M9 pilot readiness check passed.
Validated pilot cohort, evidence presence, cutover checklist, hypercare controls, and runbook anchors.
```

## Notes

- Regenerate this artifact whenever pilot acceptance criteria or cutover checklist inventory changes.
- If status is fail, attach issue link and mitigation plan before marking pilot checkpoint complete.

