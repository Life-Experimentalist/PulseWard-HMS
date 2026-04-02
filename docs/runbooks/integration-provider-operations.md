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
	- `POST /api/v1/integrations/messaging/webhook/signature/verify` (sample payload + expected signature check)

## Weekly checks

- Trigger messaging test for each enabled messaging provider.
- Trigger calendar booking test for each enabled calendar provider.
- Record results in operations issues.
- For ABHA-enabled tenants, run:
	- `GET /api/v1/platform/abha/config-status`
	- `GET /api/v1/platform/abha/health-check`
	- `GET /api/v1/platform/abha/health-check/evidence`
	- `GET /api/v1/platform/abha/consent-flow/simulation?scenario=gateway-timeout`
	- `GET /api/v1/platform/abha/operational-readiness`

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
	- `POST /api/v1/integrations/messaging/webhook/signature/verify`
	- `POST /api/v1/integrations/messaging/test`
	- `GET /api/v1/platform/abha/health-check/evidence`
	- `GET /api/v1/platform/abha/consent-flow/simulation?scenario={scenario}`
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

## Post-change validation

Run from repository root after integration-affecting change:

```powershell
npm run integrations:validate
npm run test:smoke
```
