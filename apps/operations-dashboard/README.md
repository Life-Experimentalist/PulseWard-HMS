# PulseWard Operations Dashboard

The operations control surface for PulseWard HMS — a React 18 + Vite single-page app
for platform and on-call operators. Dev server runs on **port 4312** and proxies
`/api` to the API gateway on `:8787`.

## What It Covers

- **Health** — live platform health from `GET /api/v1/platform/health` (auth: admin/ops)
- **Incidents** — operational incident queue and status view

## Development

From the repository root, start everything (API gateway + all four portals with HMR):

```powershell
pnpm run dev
```

Or run just this portal (the API gateway must already be running via `pnpm run start`):

```powershell
pnpm --dir apps/operations-dashboard dev
```

The dev server listens on `http://localhost:4312` (override with `OPS_DASHBOARD_PORT`).

## Production Build

```powershell
pnpm run build                             # builds all four portals to apps/*/dist
pnpm --dir apps/operations-dashboard build # or just this one
pnpm --dir apps/operations-dashboard preview
```

The build emits static assets to `apps/operations-dashboard/dist`, served by any
static host or reverse proxy that forwards `/api/v1/*` to the gateway.

## Related Documentation

- API reference: [`docs/site/api.md`](../../docs/site/api.md)
- Deployment: [`docs/site/architecture/deployment.md`](../../docs/site/architecture/deployment.md)
- Service map: [`docs/site/architecture/service-map.md`](../../docs/site/architecture/service-map.md)
