# Environment Variables

Copy `.env.example` to `.env` and fill in the values below. The API gateway reads
exactly five variables at runtime; everything else in `.env.example` configures the
Vite dev servers.

Verify your `.env` is complete with:

```bash
pnpm run env:check
```

## Required

| Variable     | Description                                                                                                                                                              |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `JWT_SECRET` | Secret used to sign and verify JWTs (HS256). Must be at least 32 characters. In production the gateway refuses to start if it is missing, too short, or the placeholder. |

Generate a strong value with:

```bash
pnpm run jwt:generate
```

## Optional — API Gateway

| Variable               | Default                              | Description                                                                                             |
| ---------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `API_PORT`             | `8787`                               | Port the Hono API gateway listens on.                                                                   |
| `DB_PATH`              | `pulseward.db` (next to the gateway) | Path to the SQLite database file.                                                                       |
| `NODE_ENV`             | `development`                        | Set to `production` in production. Enables the strict `JWT_SECRET` check and production CORS behaviour. |
| `CORS_ALLOWED_ORIGINS` | _(empty)_                            | Comma-separated list of additional allowed origins. Localhost dev origins are always allowed.           |

## Optional — Frontend dev ports

These are read only by the Vite dev/preview servers, never by the gateway.

| Variable                | Default | Portal               |
| ----------------------- | ------- | -------------------- |
| `PATIENT_PORTAL_PORT`   | `4313`  | Patient Portal       |
| `CLINICIAN_PORTAL_PORT` | `4311`  | Clinician Portal     |
| `ADMIN_CONSOLE_PORT`    | `4180`  | Admin Console        |
| `OPS_DASHBOARD_PORT`    | `4312`  | Operations Dashboard |
