# Integration Provider Operations Runbook

## Daily checks

- Verify active provider list for each tenant.
- Verify no provider marked enabled without credentials reference.
- Verify fallback providers are configured.
- Verify Telegram and SMTP config status endpoints for enabled providers:
	- `GET /api/v1/integrations/messaging/telegram/config-status?tenantKey={tenantKey}`
	- `GET /api/v1/integrations/messaging/whatsapp/config-status?tenantKey={tenantKey}`
	- `GET /api/v1/integrations/messaging/email/config-status?tenantKey={tenantKey}`
	- `GET /api/v1/integrations/messaging/webhook/diagnostics?tenantKey={tenantKey}`
	- `GET /api/v1/integrations/messaging/retry-policy?tenantKey={tenantKey}&providerKey={providerKey}`
	- `GET /api/v1/integrations/messaging/fault-injection/events?tenantKey={tenantKey}&providerKey={providerKey}&limit=10`
	- `GET /api/v1/integrations/messaging/fault-injection/manifest?tenantKey={tenantKey}&providerKey={providerKey}&limit=25&nonce={incidentNonce}`
	- `POST /api/v1/integrations/messaging/fault-injection/manifest/verify` (submit digest/signature + issuedAt + nonce from latest manifest and confirm `replayAttempt.duplicateSuppressed=false`)
	- `GET /api/v1/integrations/messaging/fault-injection/manifest/verify/attempts?fingerprint={fingerprint}&duplicateSuppressed=true`
	- `GET /api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/export?fingerprint={fingerprint}&duplicateSuppressed=true&format=csv&limit=50`
	- `GET /api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/retention`
	- `GET /api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/retention/saturation-trend?windowMinutes=60&limit=24`
	- `GET /api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/retention/escalations/export?format=json&state=escalated-warning-unacknowledged,escalated-critical-unacknowledged&limit=100`
	- `POST /api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/retention/anomalies/{anomalyInstanceId}/triage` (set `acknowledge=true`, `acknowledgedBy`, and optional mitigation note)
	- `POST /api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/retention/apply` (set bounded `dedupeWindowSeconds`/`maxEntries` and optional `escalationPolicy`/`escalationExportPolicy`; keep `pruneNow=true` for immediate cleanup)
	- `GET /api/v1/integrations/messaging/fault-injection/retention`
	- `POST /api/v1/integrations/messaging/webhook/signature/verify` (sample payload + expected signature check)
- If replay-attempt retention `telemetry.saturation.alertLevel=warning`, plan a same-day retention apply update and re-check utilization before shift handoff.
- If replay-attempt retention `telemetry.saturation.alertLevel=critical`, execute immediate retention apply or prune action, then attach before/after telemetry to incident evidence.
- If retention trend reports `trendDirection=up` while latest alert level remains `warning` or `critical`, escalate to incident commander for sustained-capacity risk review.
- If anomaly key `sustained-warning` is present, schedule same-shift retention tuning and verify anomaly clearance in the next trend sample.
- If anomaly key `sustained-critical` is present, execute immediate retention correction, open incident bridge, and archive anomaly evidence payloads.
- If anomaly key `accelerating-utilization` is present, apply preemptive capacity tuning before crossing sustained-critical thresholds.
- If any active anomaly remains unacknowledged, apply triage acknowledgement using `anomalyInstanceId` and attach mitigation owner in the note before shift handoff.
- If escalation state enters `escalated-warning-unacknowledged`, treat as same-shift SLA breach and assign owner immediately.
- If escalation state enters `escalated-critical-unacknowledged` or `escalated-critical-unmitigated`, open incident bridge and attach mitigation evidence reference in triage notes.
- Use escalation export with `acknowledgementSlaStatus=breached` during shift handoff to capture unresolved SLA breaches in one artifact.
- Verify `telemetry.recentlyClosedAnomalies` after mitigation to confirm closure record (`closedAt`, `closedReason`) was captured.
- Keep triage notes operational only; do not include patient identifiers or protected health details.

## Local tooling readiness

- Run `npm run build:types` before milestone handoff; this now uses root `tsconfig.json` for deterministic local/CI behavior.
- Run `npm run build:types:show-config` when local and CI typecheck scope appears inconsistent.
- For demo stack commands (`pnpm demo:up`, `pnpm demo:down`), ensure Docker Desktop is running and Linux engine is available before execution.
- Demo scripts now fail fast with explicit Docker engine guidance; resolve Docker connectivity first, then rerun.

## Operations dashboard reliability view

- Start dashboard in dev: `npm run start:operations:dev`.
- The dashboard consumes:
	- retention status telemetry
	- saturation trend summaries
	- escalation export breach feed
	- ABHA operational readiness, fallback telemetry, and transaction evidence summaries
	- ABHA read/write dry-run trigger actions for operator shift validation
- Default dev proxy routes:
	- `/api/v1` telemetry calls to notification-service on `http://127.0.0.1:8088`
	- `/api/auth-v1` telemetry calls to auth-service on `http://127.0.0.1:5101` (rewritten to `/api/v1`)

## Weekly checks

- Trigger messaging test for each enabled messaging provider.
- Trigger calendar booking test for each enabled calendar provider.
- Record results in operations issues.
- For ABHA-enabled tenants, run:
	- `GET /api/v1/platform/abha/config-status`
	- `GET /api/v1/platform/abha/health-check`
	- `GET /api/v1/platform/abha/health-check/evidence`
	- `GET /api/v1/platform/abha/consent-flow/simulation?scenario=gateway-timeout`
	- `GET /api/v1/platform/abha/fallback-decision/telemetry?scenario=health-check-derived&limit=10`
	- `POST /api/v1/platform/abha/transactions/read` (`dryRun=true`, consent granted, `fallbackScenario=happy-path`)
	- `POST /api/v1/platform/abha/transactions/write` (`dryRun=true`, consent granted, `fallbackScenario=happy-path`)
	- `GET /api/v1/platform/abha/transactions/evidence?tenantKey={tenantKey}&limit=25`
	- `GET /api/v1/platform/abha/operational-readiness`
	- `GET /api/v1/integrations/messaging/fault-injection/simulate?tenantKey={tenantKey}&providerKey={providerKey}&scenario=network-timeout`
	- `GET /api/v1/integrations/messaging/fault-injection/export?tenantKey={tenantKey}&providerKey={providerKey}&format=json&limit=50`
	- `GET /api/v1/integrations/messaging/fault-injection/manifest?tenantKey={tenantKey}&providerKey={providerKey}&scenario=network-timeout&nonce={incidentNonce}`
	- `POST /api/v1/integrations/messaging/fault-injection/manifest/verify` (attach digest/signature + issuedAt + nonce; set expectedNonce to incident nonce; repeated submissions should return `replayAttempt.duplicateSuppressed=true`)
	- `GET /api/v1/integrations/messaging/fault-injection/manifest/verify/attempts?tenantKey={tenantKey}&providerKey={providerKey}&duplicateSuppressed=true&limit=25`
	- `GET /api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/export?tenantKey={tenantKey}&providerKey={providerKey}&duplicateSuppressed=true&format=json&limit=100`
	- `GET /api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/retention`
	- `GET /api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/retention/saturation-trend?windowMinutes=240&limit=96`
	- `GET /api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/retention/escalations/export?format=csv&acknowledgementSlaStatus=breached,acknowledged-breached&limit=200`
	- `POST /api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/retention/anomalies/{anomalyInstanceId}/triage` (record acknowledgement and weekly drill note with owner)
	- `POST /api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/retention/apply` (validate incident-policy bounds for dedupe window/cache size, escalation thresholds, and escalation export limits)
	- Confirm retention saturation thresholds and response posture: warning requires scheduled tuning, critical requires immediate capacity correction.
	- Confirm anomaly key transitions (`sustained-warning`, `sustained-critical`, `accelerating-utilization`) and capture clearance evidence after mitigation.
	- Confirm escalation policy ordering (`critical` timeout <= `warning` timeout) and verify deescalation on mitigation note types.
	- Confirm triage note hygiene (`acknowledgedBy`, mitigation summary, timestamp) and no PHI content.

## Incident handling

1. Identify failing provider.
2. Switch default to configured fallback provider.
3. Re-run provider test endpoint.
4. Open incident issue if fallback also fails.
5. Keep audit trail of provider routing changes.
6. For auth or ABHA outages, validate auth-service health plus ABHA readiness probes before rollback decision.

## Fast diagnostics endpoints

- Auth/OAuth readiness:
	- `GET /api/v1/auth/oauth/providers`
	- `GET /api/v1/auth/oauth/google/config-status`
- Notification routing:
	- `GET /api/v1/integrations/messaging/providers?tenantKey={tenantKey}`
	- `GET /api/v1/integrations/messaging/webhook/diagnostics?tenantKey={tenantKey}`
	- `GET /api/v1/integrations/messaging/retry-policy?tenantKey={tenantKey}&providerKey={providerKey}`
	- `GET /api/v1/integrations/messaging/fault-injection/simulate?tenantKey={tenantKey}&providerKey={providerKey}&scenario={scenario}`
	- `GET /api/v1/integrations/messaging/fault-injection/events?tenantKey={tenantKey}&providerKey={providerKey}&scenario={scenario}`
	- `GET /api/v1/integrations/messaging/fault-injection/export?tenantKey={tenantKey}&providerKey={providerKey}&format={json|csv}`
	- `GET /api/v1/integrations/messaging/fault-injection/manifest?tenantKey={tenantKey}&providerKey={providerKey}&scenario={scenario}&nonce={incidentNonce}`
	- `POST /api/v1/integrations/messaging/fault-injection/manifest/verify`
	- `GET /api/v1/integrations/messaging/fault-injection/manifest/verify/attempts`
	- `GET /api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/export?format={json|csv}`
	- `GET /api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/retention`
	- `GET /api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/retention/saturation-trend`
	- `GET /api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/retention/escalations/export?format={json|csv}`
	- `POST /api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/retention/anomalies/{anomalyInstanceId}/triage`
	- `POST /api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/retention/apply`
	- `GET /api/v1/integrations/messaging/fault-injection/retention`
	- `POST /api/v1/integrations/messaging/fault-injection/retention/apply`
	- `POST /api/v1/integrations/messaging/webhook/signature/verify`
	- `POST /api/v1/integrations/messaging/test`
	- `GET /api/v1/platform/abha/health-check/evidence`
	- `GET /api/v1/platform/abha/consent-flow/simulation?scenario={scenario}`
	- `GET /api/v1/platform/abha/fallback-decision/telemetry?scenario={scenario}`
	- `POST /api/v1/platform/abha/transactions/read`
	- `POST /api/v1/platform/abha/transactions/write`
	- `GET /api/v1/platform/abha/transactions/evidence`
- Calendar routing:
	- `GET /api/v1/integrations/calendars/providers?tenantKey={tenantKey}`
	- `GET /api/v1/integrations/calendars/interoperability/diagnostics?tenantKey={tenantKey}`
	- `POST /api/v1/integrations/calendars/test`

## ABHA-specific runbook

- Detailed ABHA readiness procedures:
	- `docs/runbooks/abha-operational-readiness.md`

## Change management

- Never delete previous config versions.
- Use pull requests for config updates.
- Require rollback notes in PR template.
- Keep `INTEGRATION_FAULT_EVIDENCE_SIGNING_SECRET` in secret store for signed manifest handoff workflows.

## Post-change validation

Run from repository root after integration-affecting change:

```powershell
npm run integrations:validate
npm run test:smoke
```
