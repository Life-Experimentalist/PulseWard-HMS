# PulseWard Admin Console

The Admin Console is a framework-based React + Vite application built for modular, professional operations workflows.
Production usage is precompiled static assets (`dist`) served by a lightweight Node static server.

## What It Covers

- Service reachability checks for Auth, Notification, and Appointment services
- Google OAuth readiness and quick start-link launch
- ABHA environment readiness visibility and ABHA gateway health-check tab
- Telegram Bot test delivery (live send via Bot API)
- SMTP test delivery (live send via configured credentials)
- Activity log with latest test output

## Build and Start (Production-Fast)

From repository root:

```powershell
pnpm run install:admin
pnpm run build:admin
pnpm run start:admin
```

For CI/CD production pipelines:

```powershell
pnpm run build:admin:ci
pnpm run start:admin
```

`start:admin` serves prebuilt files only and does not run runtime bundling.
By default, it starts on `http://127.0.0.1:4180` and auto-falls forward to the next free port.

## Optional Dev Mode

For iterative UI development:

```powershell
pnpm run start:admin:dev
```

## Required Service Endpoints

Set these in dashboard routing controls or `.env`:

- Auth Service: `http://localhost:5101`
- Notification Service: `http://localhost:5102`
- Appointment Service: `http://localhost:5103`

## Integration Credentials

For production-like usage, configure credentials through environment variables and secret references.
For quick validation, the dashboard can submit one-time credentials directly in test requests.

## Data Storage

- Tenant dashboard settings are persisted server-side in auth-service JSON store:
  `services/auth-service/data/admin-console-settings.json`
- Browser `localStorage` is used only as a fallback cache if server persistence is unavailable.
- Integration credentials remain environment-driven or one-time test payloads and are not persisted by the dashboard.

## Notes

- Keep CORS allowed origins permissive for local/LAN demos, then restrict for production.
- Avoid using real patient identifiers in integration test payloads.

