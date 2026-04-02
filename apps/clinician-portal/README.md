# PulseWard Clinician Portal

Framework-based clinician workspace built with React + Vite.

## Scope

- Day view with consultation queue and clinical action checklist
- Role-focused layout aligned with PulseWard operational workflows
- Fast local development and compile-first production serving

## Development

From repository root:

```powershell
npm run install:clinician
npm run start:clinician:dev
```

Default Vite dev host runs with automatic port selection near `4311`.

## Production-Fast Start

From repository root:

```powershell
npm run build:clinician
npm run start:clinician
```

`start:clinician` serves prebuilt static output from `dist` and does not bundle at runtime.
Default static port is `4181` with automatic fallback to the next available port.

## Related Documentation

- API catalog: `../../docs/api/api-catalog.md`
- Governance charter: `../../governance/project-management-charter.md`
- Architecture references: `../../docs/architecture/`
