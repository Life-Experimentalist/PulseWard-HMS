# Integration Providers API Contract

## Purpose

Provide tenant-aware provider discovery and dry-run validation for messaging and calendar adapters.

Supported providers:

- Messaging: Telegram Bot, SMTP Email, Generic Webhook, WhatsApp Cloud API, SMS Gateway.
- Calendars: Google Calendar, Apple Calendar, Outlook Calendar, ICS Calendar, Internal Calendar.

## Base Path

/api/v1/integrations

## Endpoints

1. GET /messaging/providers?tenantKey={tenantKey}
   Returns enabled and available messaging providers for the tenant.

2. POST /messaging/test
   Tests selected messaging provider with routing behavior.

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

4. GET /calendars/providers?tenantKey={tenantKey}
   Returns enabled and available calendar providers for the tenant.

5. POST /calendars/test
   Tests selected calendar provider by attempting a booking operation.

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

## Config Schema

Tenant integration config remains contract-driven and is validated against:

- contracts/rest/integration-provider-config.schema.json

## Operational Rules

- Use admin-only access controls on all integration endpoints.
- Audit-log tenant configuration changes in the calling control plane.
- Retain last known good config for rollback.
- Secrets must be reference keys only; no plaintext credentials in tenant JSON.
- Paid provider onboarding and billing are completed by each hospital admin.
