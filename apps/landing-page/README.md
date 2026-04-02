# PulseWard Landing Demo Console

This folder contains the comprehensive landing demo with:

- Interactive setup and tenant controls on the main console
- Multi-page demo navigation for role and operations walkthroughs
- Shared demo state hydration across pages using browser storage

## Run For Full Demo

1. Start backend services in separate terminals:
   - `npm run start:auth`
   - `npm run start:notification`
   - `npm run start:appointment`
2. Start landing UI:
   - `npm run start:landing`
3. Open the landing page:
   - `http://localhost:4173`

## Multi-Page Demo Routes

- `index.html` (main console)
- `pages/overview.html`
- `pages/patient-journey.html`
- `pages/clinician-journey.html`
- `pages/operations-command.html`

## First-Time Test Flow

1. Complete setup wizard with synthetic values.
2. Select local mode for browser-only demo, or live mode for API-backed demo.
3. Use Admin Configuration Center to toggle providers and endpoints.
4. Open Demo Pages and validate role-based walkthroughs.
5. Export backup JSON, then restore it.
6. Enable browser notifications and run Simulate Server Push.

## Notes

- Demo data is synthetic and local by default.
- Live mode requires service APIs and CORS origin config.
- Admin settings remain modular and tenant-driven.
