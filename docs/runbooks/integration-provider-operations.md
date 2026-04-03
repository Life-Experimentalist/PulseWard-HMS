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
	- `POST /api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/retention/apply` (set bounded `dedupeWindowSeconds` and/or `maxEntries`; keep `pruneNow=true` for immediate cleanup)
	- `GET /api/v1/integrations/messaging/fault-injection/retention`
	- `POST /api/v1/integrations/messaging/webhook/signature/verify` (sample payload + expected signature check)
- If replay-attempt retention `telemetry.saturation.alertLevel=warning`, plan a same-day retention apply update and re-check utilization before shift handoff.
- If replay-attempt retention `telemetry.saturation.alertLevel=critical`, execute immediate retention apply or prune action, then attach before/after telemetry to incident evidence.
- If retention trend reports `trendDirection=up` while latest alert level remains `warning` or `critical`, escalate to incident commander for sustained-capacity risk review.
- If anomaly key `sustained-warning` is present, schedule same-shift retention tuning and verify anomaly clearance in the next trend sample.
- If anomaly key `sustained-critical` is present, execute immediate retention correction, open incident bridge, and archive anomaly evidence payloads.
- If anomaly key `accelerating-utilization` is present, apply preemptive capacity tuning before crossing sustained-critical thresholds.

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
	- `GET /api/v1/platform/abha/operational-readiness`
	- `GET /api/v1/integrations/messaging/fault-injection/simulate?tenantKey={tenantKey}&providerKey={providerKey}&scenario=network-timeout`
	- `GET /api/v1/integrations/messaging/fault-injection/export?tenantKey={tenantKey}&providerKey={providerKey}&format=json&limit=50`
	- `GET /api/v1/integrations/messaging/fault-injection/manifest?tenantKey={tenantKey}&providerKey={providerKey}&scenario=network-timeout&nonce={incidentNonce}`
	- `POST /api/v1/integrations/messaging/fault-injection/manifest/verify` (attach digest/signature + issuedAt + nonce; set expectedNonce to incident nonce; repeated submissions should return `replayAttempt.duplicateSuppressed=true`)
	- `GET /api/v1/integrations/messaging/fault-injection/manifest/verify/attempts?tenantKey={tenantKey}&providerKey={providerKey}&duplicateSuppressed=true&limit=25`
	- `GET /api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/export?tenantKey={tenantKey}&providerKey={providerKey}&duplicateSuppressed=true&format=json&limit=100`
	- `GET /api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/retention`
	- `GET /api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/retention/saturation-trend?windowMinutes=240&limit=96`
	- `POST /api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/retention/apply` (validate incident-policy bounds for dedupe window and cache size)
	- Confirm retention saturation thresholds and response posture: warning requires scheduled tuning, critical requires immediate capacity correction.
	- Confirm anomaly key transitions (`sustained-warning`, `sustained-critical`, `accelerating-utilization`) and capture clearance evidence after mitigation.

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
	- `POST /api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/retention/apply`
	- `GET /api/v1/integrations/messaging/fault-injection/retention`
	- `POST /api/v1/integrations/messaging/fault-injection/retention/apply`
	- `POST /api/v1/integrations/messaging/webhook/signature/verify`
	- `POST /api/v1/integrations/messaging/test`
	- `GET /api/v1/platform/abha/health-check/evidence`
	- `GET /api/v1/platform/abha/consent-flow/simulation?scenario={scenario}`
	- `GET /api/v1/platform/abha/fallback-decision/telemetry?scenario={scenario}`
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
