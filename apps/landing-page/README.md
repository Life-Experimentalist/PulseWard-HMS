# PulseWard Landing Demo Console

This folder now provides a fully interactive demo console for first-run setup, admin configuration,
data interaction, backup/restore, and PWA notification testing.

## Run For Full Demo

1. Start backend services in separate terminals:
   - `npm run start:auth`
   - `npm run start:notification`
   - `npm run start:appointment`
2. Start landing UI:
   - `npm run start:landing`
3. Open:
   - `http://localhost:4173`

## First-Time Test Flow

1. Complete setup wizard with generic placeholders.
2. Select local mode for browser-only demo, or live mode for API-backed demo.
3. Use Admin Configuration Center to toggle providers and endpoints.
4. Create appointments and notifications from Data Lab.
5. Export backup JSON, then restore it.
6. Enable browser notifications and run Simulate Server Push.

## Notes

- Demo data is synthetic and local by default.
- Live mode requires service APIs and CORS origin config.
- Admin settings remain modular and tenant-driven.
