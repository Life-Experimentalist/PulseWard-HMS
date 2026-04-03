# Integration Providers API Contract

## Purpose

Provide tenant-aware provider discovery and dry-run validation for messaging and calendar adapters, plus ABHA transactional connector operations.

Supported providers:

- Messaging: Telegram Bot, SMTP Email, Generic Webhook, WhatsApp Cloud API, SMS Gateway.
- Calendars: Google Calendar, Apple Calendar, Outlook Calendar, ICS Calendar, Internal Calendar.
- ABHA: Consent-aware transactional read/write with fallback and evidence telemetry.

## Base Path

/api/v1/integrations

## Endpoints

1. GET /messaging/providers?tenantKey={tenantKey}
   Returns enabled and available messaging providers for the tenant.

2. POST /messaging/test
   Tests selected messaging provider with routing behavior (dry-run by default; live delivery when `dryRun=false` and credentials are available).

Example body:

```json
{
  "tenantKey": "citycare-hospital",
  "channel": "patient-notification",
  "providerKey": "telegram-bot",
  "recipient": "+919900000000",
  "message": "PulseWard integration test",
  "dryRun": true
}
```

3. GET /messaging/telegram/setup?tenantKey={tenantKey}
   Returns tenant-specific Telegram bot setup checklist.

4. GET /messaging/telegram/config-status?tenantKey={tenantKey}
   Returns Telegram secret and chat-id readiness status.

5. GET /messaging/whatsapp/setup?tenantKey={tenantKey}
   Returns WhatsApp onboarding and billing setup checklist.

6. GET /messaging/whatsapp/config-status?tenantKey={tenantKey}
   Returns WhatsApp access-token and phone-number-id readiness status.

7. GET /messaging/email/config-status?tenantKey={tenantKey}
   Returns SMTP credential readiness status.

8. GET /messaging/webhook/diagnostics?tenantKey={tenantKey}
   Returns website webhook routing, endpoint, signature, and readiness diagnostics.

9. POST /messaging/webhook/signature/verify
   Verifies webhook payload signatures against configured signing-secret references.

10. GET /messaging/retry-policy?tenantKey={tenantKey}&providerKey={providerKey}
   Returns retry controls and routing coverage diagnostics.

11. GET /messaging/fault-injection/simulate
   Generates connector fault simulation outcome payloads.

12. GET /messaging/fault-injection/events
   Lists recorded fault simulation events.

13. GET /messaging/fault-injection/export
   Exports fault simulation evidence (JSON/CSV).

14. GET /messaging/fault-injection/manifest
   Generates signed incident handoff evidence manifest.

15. POST /messaging/fault-injection/manifest/verify
   Verifies digest/signature and replay-defense metadata for handoff manifests.

16. GET /messaging/fault-injection/manifest/verify/attempts
   Lists replay-attempt verification audit records.

17. GET /messaging/fault-injection/manifest/verify/attempts/export
   Exports replay-attempt audit records (JSON/CSV).

18. GET /messaging/fault-injection/manifest/verify/attempts/retention
   Returns retention policy and replay-attempt telemetry status.

19. GET /messaging/fault-injection/manifest/verify/attempts/retention/saturation-trend
   Returns bounded saturation trend snapshots with anomaly telemetry.

20. GET /messaging/fault-injection/manifest/verify/attempts/retention/escalations/export
   Exports escalation + acknowledgement SLA telemetry (JSON/CSV).

21. POST /messaging/fault-injection/manifest/verify/attempts/retention/anomalies/{anomalyInstanceId}/triage
   Applies anomaly triage acknowledgement and note updates.

22. POST /messaging/fault-injection/manifest/verify/attempts/retention/apply
   Applies replay-attempt retention, escalation, and escalation-export policy controls.

23. GET /messaging/fault-injection/retention
   Returns fault simulation event retention controls and telemetry.

24. POST /messaging/fault-injection/retention/apply
   Applies fault simulation retention settings.

25. GET /calendars/providers?tenantKey={tenantKey}
   Returns enabled and available calendar providers for the tenant.

26. POST /calendars/test
   Tests selected calendar provider booking (dry-run by default; live booking when `dryRun=false` and credentials are available).

Example body:

```json
{
  "tenantKey": "citycare-hospital",
  "providerKey": "apple-calendar",
  "appointmentId": "apt-1001",
  "clinicianId": "cln-42",
  "patientId": "pat-88",
  "startTime": "2026-04-02T09:00:00Z",
  "endTime": "2026-04-02T09:30:00Z"
}
```

27. GET /calendars/interoperability/diagnostics?tenantKey={tenantKey}
   Returns calendar routing, fallback, and interoperability readiness diagnostics.

28. POST /platform/abha/transactions/read
   Executes consent-aware ABHA transactional read path (dry-run by default; live gateway request when `dryRun=false` and ABHA config is valid).

29. POST /platform/abha/transactions/write
   Executes consent-aware ABHA transactional write path (dry-run by default; live gateway request when `dryRun=false` and ABHA config is valid).

30. GET /platform/abha/transactions/evidence?tenantKey={tenantKey}&operation={operation}&status={status}&limit={limit}
   Returns ABHA transactional audit evidence feed with consent, fallback, and outcome summaries.

31. GET /platform/abha/fallback-decision/telemetry?tenantKey={tenantKey}&scenario={scenario}&limit={limit}
   Returns ABHA fallback decision telemetry used by transactional connectors and readiness drills.

## Config Schema

Tenant integration config remains contract-driven and is validated against:

- contracts/rest/integration-provider-config.schema.json

## Operational Rules

- Use admin-only access controls on all integration endpoints.
- Audit-log tenant configuration changes in the calling control plane.
- Retain last known good config for rollback.
- Secrets must be reference keys only; no plaintext credentials in tenant JSON.
- Paid provider onboarding and billing are completed by each hospital admin.
