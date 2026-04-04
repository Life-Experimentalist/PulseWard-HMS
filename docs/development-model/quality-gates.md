# PulseWard Quality Gates

## Purpose

Quality gates define the minimum evidence required before merging and before release tagging.

## Merge Gate (Required for Feature PRs)

Run from repository root:

```powershell
pnpm run lint
pnpm run format:check
pnpm run test:routes
pnpm run test
pnpm run contracts:check -- --strict
```

Required outcomes:

- No lint or formatting violations.
- Route modules load without runtime import failures.
- Unit and regression tests pass.
- Contract parity reports no runtime/spec drift.

## Gate Configuration Map

| Gate Command                          | Primary Config Source                                            |
| ------------------------------------- | ---------------------------------------------------------------- |
| `pnpm run lint`                        | `.eslintrc*` in repo root (and service overrides where present)  |
| `pnpm run format:check`                | `.prettierrc*` in repo root                                      |
| `pnpm run test:routes`                 | Route module entrypoints loaded via `package.json` script        |
| `pnpm run test`                        | `jest.config.cjs`                                                |
| `pnpm run contracts:check -- --strict` | `scripts/check-contract-coverage.mjs` plus service OpenAPI specs |
| `pnpm run build:types`                 | `tsconfig.json`                                                  |

TypeScript config troubleshooting:

```powershell
pnpm run build:types:show-config
```

Use resolved config output to verify include/exclude behavior when local and CI typecheck results differ.

## Integration Gate (Required for Service-Integration Changes)

```powershell
pnpm run integrations:validate
pnpm run test:smoke
```

Required outcomes:

- Tenant integration configuration passes schema validation.
- Smoke tests pass for active platform routes.

## Release Gate (Required Before Release Note Promotion)

1. Merge gate passed on release branch head.
2. Integration gate passed on release branch head.
3. Runbooks updated for any operational behavior change.
4. API docs updated for any endpoint, payload, or error-shape change.
5. Rollback notes documented in release note file.

## Milestone-Specific Gate Additions

- M1 contract hardening work must include parity matrix updates in `docs/api/endpoint-contract-coverage-matrix.md`.
- M2+ auth/config work must include admin and ABHA readiness API docs updates.
- M5 adapter work must include provider readiness and test-run instructions in deployment/runbook docs.
- M6 experience surface work must include web/mobile operational startup documentation.
- M6.5 adapter branch-hardening work must include explicit negative-path adapter tests (non-OK provider responses, credential guardrails, and fallback id/response branches) for any provider module below coverage target.
- M6.8 contract hardening work must include mutation-based negative tests proving strict checker failure on critical command parameter drift and request-schema anchor drift.

## Assets Packaging Verification (M6.5)

Run before packaging portal/app releases:

```powershell
Get-ChildItem assets | Select-Object Name,Length,LastWriteTime | Format-Table -AutoSize
Get-FileHash assets\logo.png,assets\banner.png,assets\icon_dark.png,assets\icon_light.png -Algorithm SHA256 | Format-Table -AutoSize
```

Required outcomes:

- Expected branding assets are present with non-zero size.
- File hashes are captured in release notes or artifact metadata for traceability.

## Operational Safety Rules

- Never merge changes that expose credentials or patient identifiers in logs, fixtures, or docs.
- Keep provider-specific logic in adapter modules, not domain cores.
- Prefer additive API changes; if breaking behavior is unavoidable, include migration and rollback guidance.

