# Incident Response Runbook for PulseWard Hospital Management System

## Purpose

This runbook defines the command flow, severity objectives, and evidence expectations for incidents affecting PulseWard HMS production operations.

## Scope

Use this runbook for service outages, clinical workflow degradation, security/privacy incidents, backup/restore failures, and integration-provider failures.

## Source of Truth

- Severity objectives and response timers:
   - `config/operations/incident-severity-matrix.json`
- Escalation levels and ownership map:
   - `config/operations/oncall-escalation-map.json`
- Related operational runbooks:
   - `docs/runbooks/on-call.md`
   - `docs/runbooks/backup-recovery.md`
   - `docs/runbooks/observability-alerting-baseline.md`
   - `docs/runbooks/trace-correlation-baseline.md`

## Incident Command Flow

1. Open incident record in the incident system and assign an incident manager.
2. Determine severity from `config/operations/incident-severity-matrix.json`.
3. Activate on-call escalation using `docs/runbooks/on-call.md`.
4. Start triage with a single incident timeline and update channel.
5. Execute containment and mitigation actions.
6. Confirm recovery and close with a post-incident review action list.

## Severity Objectives

Severity objectives are defined in `config/operations/incident-severity-matrix.json` and include:

- `targetAcknowledgeMinutes`
- `targetMitigateMinutes`
- `targetStatusUpdateMinutes`
- `requiresLeadershipBridge`

If target timers are missed, log the breach in the incident timeline and open follow-up remediation work.

## Correlation and Trace Capture

During active incident triage, capture and track:

- `correlationId` from request path traces.
- `requestId` for service-local debugging.
- affected service names and alert keys.

Use `docs/runbooks/trace-correlation-baseline.md` to reconstruct cross-service request flow.

## Containment and Recovery Checklists

Containment checklist:

- [ ] Confirm blast radius and impacted tenants.
- [ ] Apply short-term risk controls (traffic shaping, failover, feature flag, provider failover).
- [ ] Validate that patient-facing risk is reduced.

Recovery checklist:

- [ ] Verify primary workflow health (auth, appointment, notification, patient, billing).
- [ ] Verify integration-provider health where impacted.
- [ ] Confirm no tenant-isolation regressions for restore/data incidents.
- [ ] Publish incident recovery confirmation.

## Post-Incident Review

Within one business day:

1. Publish root-cause summary and timeline.
2. Record missed timers against severity objectives.
3. Open and link remediation tasks with owners and due dates.
4. Update runbooks/config if operational assumptions changed.

## Verification Command

Run baseline checks from repository root:

```powershell
pnpm run ops:incident:check
pnpm run ops:oncall:check
```

Expected outcome:

- Incident severity matrix exists and includes all required severities.
- Incident runbook contains required command-flow and trace-capture sections.
- Required incident-related runbooks are present.

