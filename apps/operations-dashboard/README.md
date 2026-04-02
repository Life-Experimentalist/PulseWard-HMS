# PulseWard Operations Dashboard

Framework-based operations control surface built with React + Vite.

## Scope

- Service-health and throughput KPI presentation
- Incident queue and command panel experience
- Compile-first static deployment for faster startup

## Development

From repository root:

```powershell
npm run install:operations
npm run start:operations:dev
```

Default Vite dev host runs with automatic port selection near `4312`.

## Production-Fast Start

From repository root:

```powershell
npm run build:operations
npm run start:operations
```

`start:operations` serves prebuilt static output from `dist` and avoids runtime bundling.
Default static port is `4182` with automatic fallback to the next available port.

## Related Documentation

- API catalog: `../../docs/api/api-catalog.md`
- Governance charter: `../../governance/project-management-charter.md`
- Operations runbooks: `../../docs/runbooks/`
