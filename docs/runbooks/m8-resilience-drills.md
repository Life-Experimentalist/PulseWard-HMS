# M8 Resilience Drill Baseline

## Objective

Define repeatable resilience drills for M8 so service degradation and dependency outage behavior is evidence-backed before release-candidate freeze.

## Scope

The baseline covers three required resilience drills:

- Appointment service degradation.
- Notification provider outage.
- Retry storm prevention.

## Source of Truth

- `config/performance/m8-resilience-drills.json`
- `docs/runbooks/templates/m8-resilience-summary-template.md`

## Verification Command

Run from repository root:

```powershell
pnpm run perf:m8:resilience:check
```

Expected output:

- `M8 resilience baseline check passed.`
- Validation summary confirming required drill and runbook coverage.

## Appointment Service Degradation Drill

- Drill key: `appointment-service-degradation`
- Inject latency and partial 5xx responses on appointment APIs.
- Verify deterministic retry guidance and bounded retry behavior.
- Confirm correlation IDs remain traceable in incident investigation.

## Notification Provider Outage Drill

- Drill key: `notification-provider-outage`
- Simulate primary provider failure.
- Verify queue/backlog alerting and fallback behavior.
- Confirm escalation export includes outage context and timestamps.

## Retry Storm Prevention Drill

- Drill key: `retry-storm-prevention`
- Simulate elevated transient 429/503 response ratios.
- Verify backoff and circuit-breaker actions limit amplification.
- Confirm worker saturation stays within configured warning range.

## Evidence Capture

For each drill run, store an artifact under `docs/runbooks/evidence` using `docs/runbooks/templates/m8-resilience-summary-template.md`.

Required evidence:

- Scenario trigger and exact command sequence.
- Guardrail thresholds and observed outcomes.
- Alert, escalation, and diagnostic links.
- Mitigation steps and owner assignment.

## Rollback Verification

- Validate rollback command sequence for each mitigation change in staging.
- Record service health status before and after rollback.
- Include unresolved residual risks if any post-drill anomalies remain.
