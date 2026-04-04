# PulseWard Patient Portal

Framework-based patient-facing experience built with React + Vite.

## Scope

- Appointment and reminder-centric patient dashboard
- Care snapshot and self-service quick actions
- Compile-first static deployment model

## Development

From repository root:

```powershell
pnpm run install:patient
pnpm run start:patient:dev
```

Default Vite dev host runs with automatic port selection near `4313`.

## Production-Fast Start

From repository root:

```powershell
pnpm run build:patient
pnpm run start:patient
```

`start:patient` serves prebuilt static output from `dist` and avoids runtime bundling.
Default static port is `4183` with automatic fallback to the next available port.

## Related Documentation

- API catalog: `../../docs/api/api-catalog.md`
- Governance charter: `../../governance/project-management-charter.md`
- Project docs: `../../docs/README.md`

