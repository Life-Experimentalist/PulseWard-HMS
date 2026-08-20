# PulseWard Clinician Portal

The clinician workspace for PulseWard HMS — a React 18 + Vite single-page app for
doctors and providers. Dev server runs on **port 4311** and proxies `/api` to the
API gateway on `:8787`.

## What It Covers

- **Schedule** — daily consultation queue and appointment view
- **Patients** — patient roster with search
- **Patient detail** — records, labs, prescriptions, and history for one patient
- **Note writer** — author clinical notes tied to a patient encounter

## Development

From the repository root, start everything (API gateway + all four portals with HMR):

```powershell
pnpm run dev
```

Or run just this portal (the API gateway must already be running via `pnpm run start`):

```powershell
pnpm --dir apps/clinician-portal dev
```

The dev server listens on `http://localhost:4311` (override with `CLINICIAN_PORTAL_PORT`).

## Production Build

```powershell
pnpm run build                         # builds all four portals to apps/*/dist
pnpm --dir apps/clinician-portal build # or just this one
pnpm --dir apps/clinician-portal preview
```

The build emits static assets to `apps/clinician-portal/dist`, served by any static
host or reverse proxy that forwards `/api/v1/*` to the gateway.

## Related Documentation

- API reference: [`docs/site/api.md`](../../docs/site/api.md)
- Architecture: [`docs/site/architecture/`](../../docs/site/architecture/)
- Data model: [`docs/site/architecture/data-model.md`](../../docs/site/architecture/data-model.md)
