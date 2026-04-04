# PulseWard Mobile Notifications (Expo)

This app provides the M6 mobile-notification baseline for PulseWard using Expo managed workflow.

## Purpose

- Fetch tenant-scoped appointment event receipts from notification-service.
- Display event metadata for operator verification and mobile-path evidence.
- Register an Expo push token on Android.
- Send a real test push notification to the phone.

## Configuration

Set API base URL without changing source code:

- Environment variable: EXPO_PUBLIC_PULSEWARD_API_BASE_URL
- Fallback default: http://127.0.0.1:5102
- Optional environment variable for EAS attribution: EXPO_PUBLIC_EXPO_PROJECT_ID

Example PowerShell:

```powershell
$env:EXPO_PUBLIC_PULSEWARD_API_BASE_URL = "http://127.0.0.1:5102"
$env:EXPO_PUBLIC_EXPO_PROJECT_ID = ""
```

Important for phone testing:

- If your phone uses the same Wi-Fi as your laptop, use your laptop LAN IP, not `127.0.0.1`.
- Example: `http://192.168.1.50:5102`

## Run

```powershell
pnpm install
pnpm run start
```

Or from repository root:

```powershell
pnpm run install:mobile
pnpm run start:mobile
```

## API Path Used

- GET /api/v1/integrations/appointments/events?tenantKey=<tenant>

## Notes

- Open the app on your Android phone (Expo Go or development build).
- Tap "Enable push and get token".
- Tap "Send test push".
- The app shows the latest notification payload once received.

Terminal-based push test (optional):

```powershell
pnpm run push:expo:test -- --token "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]" --title "PulseWard" --body "Push from laptop"
```

