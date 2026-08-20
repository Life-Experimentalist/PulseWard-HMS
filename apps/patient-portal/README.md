# PulseWard Patient Portal

The patient-facing portal for PulseWard HMS — a React 18 + Vite single-page app.
Dev server runs on **port 4313** and proxies `/api` to the API gateway on `:8787`.

## What It Covers

- **Dashboard** — care snapshot and quick actions
- **Appointments** — book and review appointments
- **Labs** — lab orders and results
- **Prescriptions** — active and past prescriptions
- **Records** — personal clinical records
- **Messages** — secure messaging with the care team
- **Notifications** — delivery history and reminders

## Development

From the repository root, start everything (API gateway + all four portals with HMR):

```powershell
pnpm run dev
```

Or run just this portal (the API gateway must already be running via `pnpm run start`):

```powershell
pnpm --dir apps/patient-portal dev
```

The dev server listens on `http://localhost:4313` (override with `PATIENT_PORTAL_PORT`).

## Production Build

```powershell
pnpm run build                       # builds all four portals to apps/*/dist
pnpm --dir apps/patient-portal build # or just this one
pnpm --dir apps/patient-portal preview
```

The build emits static assets to `apps/patient-portal/dist`, served by any static
host or reverse proxy that forwards `/api/v1/*` to the gateway.

## Related Documentation

- API reference: [`docs/site/api.md`](../../docs/site/api.md)
- Architecture: [`docs/site/architecture/`](../../docs/site/architecture/)
- Multi-tenancy: [`docs/site/multi-tenancy.md`](../../docs/site/multi-tenancy.md)
