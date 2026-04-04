# Observability and Alerting Baseline

This runbook defines the M7 baseline for reliability dashboards and alert routing.

## Scope

The baseline covers the first-pass operational controls required for M7:

- API error-rate alerting.
- Queue backlog alerting.
- Adapter-failure-rate alerting.
- Latency anomaly alerting.
- Runbook-linked escalation behavior.

## Source of Truth

- Alert and dashboard definitions are stored in:
  - config/observability/default-alert-rules.json

## Verification Command

Run the baseline verification from repository root:

```powershell
npm run ops:observability:check
```

This command verifies:

- Required alert keys exist.
- Alert fields are valid (metric, threshold, window, severity, runbook).
- Required runbooks are present and linkable.

## Required Alert Set

1. api-error-rate-high
2. queue-backlog-high
3. adapter-failure-rate-high
4. p95-latency-high

## Escalation Policy

- warning: same-shift owner assignment and dashboard watch.
- critical: immediate incident flow via incident-response runbook.

## Related Runbooks

- docs/runbooks/incident-response.md
- docs/runbooks/backup-recovery.md
- docs/runbooks/on-call.md
- docs/runbooks/integration-provider-operations.md

## Evidence Recording

For each alerting-policy update, attach command output from ops:observability:check to roadmap or release evidence notes.
