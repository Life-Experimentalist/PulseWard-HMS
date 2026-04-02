# Integrations Admin Quickstart

## Goal

Enable hospital-specific provider routing in minutes.

## API Base Assumptions

- Auth service: `http://localhost:5101/api/v1`
- Notification service: `http://localhost:5102/api/v1`
- Appointment service: `http://localhost:5103/api/v1`

## Step 1: Prepare credentials

Store provider credentials in your secret manager and keep only references in configuration.

Required references:

- INTEGRATION_WHATSAPP_CREDENTIALS
- INTEGRATION_TELEGRAM_CREDENTIALS
- INTEGRATION_EMAIL_SMTP_CREDENTIALS
- INTEGRATION_GOOGLE_CALENDAR_CREDENTIALS
- INTEGRATION_APPLE_CALENDAR_CREDENTIALS
- INTEGRATION_OUTLOOK_CALENDAR_CREDENTIALS
- INTEGRATION_ICS_CREDENTIALS

## Step 2: Create tenant integration config

Start from:

- config/integrations/default-integration-config.json

Create a tenant file, for example:

- config/integrations/citycare-hospital.integration.json

## Step 3: Select provider defaults and fallbacks

For each channel, set:

- defaultProvider
- fallbackProviders

For calendar, set:

- calendarRouting.defaultProvider
- calendarRouting.fallbackProviders

## Step 4: Validate config

Ensure the config follows:

- contracts/rest/integration-provider-config.schema.json

## Step 5: Test messaging providers

Call notification service endpoint:

- POST /api/v1/integrations/messaging/test

Dry-run payload example:

```json
{
  "tenantKey": "citycare-hospital",
  "providerKey": "telegram-bot",
  "channel": "patient-notification",
  "recipient": "@citycare_channel",
  "message": "PulseWard routing test",
  "dryRun": true
}
```

Live-test payload example (real send):

```json
{
  "tenantKey": "citycare-hospital",
  "providerKey": "telegram-bot",
  "channel": "patient-notification",
  "recipient": "@citycare_channel",
  "message": "PulseWard live delivery test",
  "dryRun": false
}
```

Optional Telegram bootstrap checklist:

- GET /api/v1/integrations/messaging/telegram/setup?tenantKey={tenantKey}

Readiness probes:

- GET /api/v1/integrations/messaging/telegram/config-status?tenantKey={tenantKey}
- GET /api/v1/integrations/messaging/email/config-status?tenantKey={tenantKey}

## Step 6: Test calendar provider

Call appointment service endpoint:

- POST /api/v1/integrations/calendars/test

## Step 6.5: Validate tenant domain segregation

Call auth service endpoints:

- GET /api/v1/platform/domain-config?tenantKey={tenantKey}
- POST /api/v1/platform/domain-config/validate

Validation body example:

```json
{
  "tenantKey": "citycare-hospital",
  "origin": "https://citycare.pulseward.example.com"
}
```

## Step 7: Go live

Use tenant config as active runtime config in your deployment environment.

## Step 8: Validate role and OAuth entry paths

Auth API checks:

- GET /api/v1/auth/roles
- GET /api/v1/auth/oauth/providers
- GET /api/v1/auth/oauth/google/start?tenantKey={tenantKey}&role=admin

Google OAuth readiness probe:

- GET /api/v1/auth/oauth/google/config-status

ABHA readiness probes:

- GET /api/v1/platform/abha/config-status
- GET /api/v1/platform/abha/health-check

## Demo dashboards and landing

- Landing page and dashboard preview: apps/landing-page/index.html

## Recommended starter setup

- Patient notifications: Telegram default, Email fallback, Webhook fallback, WhatsApp optional
- Staff notifications: Email default, Telegram fallback
- Website events: Webhook default
- Calendar: Google default, Apple fallback, ICS fallback, Outlook optional

## Operational Checklist Before Tenant Launch

1. `contracts/rest/integration-provider-config.schema.json` validation passes.
2. `/integrations/messaging/providers` returns expected enabled providers.
3. Telegram/SMTP config-status endpoints show configured state for active providers.
4. Domain validation and OAuth provider checks pass for tenant origin.
5. ABHA readiness and health-check pass if ABHA is enabled for tenant.

## Free vs paid guidance

- Free-first channels: Telegram Bot, SMTP Email, Webhook, Apple Calendar bridge, ICS.
- Paid optional channels: WhatsApp Cloud API and some Outlook enterprise setups.
- Paid provider billing is always completed by each hospital admin, not by platform maintainers.
