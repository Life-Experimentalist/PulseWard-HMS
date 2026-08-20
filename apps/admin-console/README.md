# PulseWard Admin Console

The administrative portal for PulseWard HMS — a React 18 + Vite single-page app for
platform administrators. Dev server runs on **port 4180** and proxies `/api` to the
API gateway on `:8787`.

## What It Covers

- **User management** — create, list, and deactivate users across roles
- **Clinician directory** — manage provider profiles
- **Audit log** — review the tamper-evident `audit_events` trail
- **Dashboard** — tenant-wide activity and account statistics

## Development

From the repository root, start everything (API gateway + all four portals with HMR):

```powershell
pnpm run dev
```

Or run just this portal (the API gateway must already be running via `pnpm run start`):

```powershell
pnpm --dir apps/admin-console dev
```

The dev server listens on `http://localhost:4180` (override with `ADMIN_CONSOLE_PORT`).

## Production Build

```powershell
pnpm run build                      # builds all four portals to apps/*/dist
pnpm --dir apps/admin-console build # or just this one
pnpm --dir apps/admin-console preview
```

The build emits static assets to `apps/admin-console/dist`, served by any static host
or reverse proxy that forwards `/api/v1/*` to the gateway.

## Related Documentation

- API reference: [`docs/site/api.md`](../../docs/site/api.md)
- Architecture: [`docs/site/architecture/`](../../docs/site/architecture/)
- Auth flow: [`docs/site/architecture/auth-flow.md`](../../docs/site/architecture/auth-flow.md)
