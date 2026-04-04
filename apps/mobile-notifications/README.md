# PulseWard Mobile Notifications (Expo)

This app provides the M6 mobile-notification baseline for PulseWard using Expo managed workflow.

## Purpose

- Fetch tenant-scoped appointment event receipts from notification-service.
- Display event metadata for operator verification and mobile-path evidence.

## Configuration

Set API base URL without changing source code:

- Environment variable: EXPO_PUBLIC_PULSEWARD_API_BASE_URL
- Fallback default: http://127.0.0.1:5102

Example PowerShell:

```powershell
$env:EXPO_PUBLIC_PULSEWARD_API_BASE_URL = "http://127.0.0.1:5102"
```

## Run

```powershell
npm install
npm run start
```

Or from repository root:

```powershell
npm run install:mobile
npm run start:mobile
```

## API Path Used

- GET /api/v1/integrations/appointments/events?tenantKey=<tenant>

## Notes

- This app is intentionally minimal for milestone closeout evidence.
- It can be extended with auth session handling and push notification registration in M7+.
