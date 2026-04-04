# PulseWard Operations Dashboard

Framework-based operations control surface built with React + Vite.

## Scope

- Service-health and throughput KPI presentation
- Incident queue and command panel experience
- Live connector reliability telemetry for replay-attempt saturation, anomaly escalation, and acknowledgement-SLA breach tracking
- ABHA transactional reliability telemetry for readiness, fallback decisions, and transaction evidence
- Compile-first static deployment for faster startup

## Development

From repository root:

```powershell
pnpm run install:operations
pnpm run start:operations:dev
```

Default Vite dev host runs with automatic port selection near `4312`.

### Local Telemetry Configuration

The dashboard reads notification reliability telemetry from existing notification-service APIs.
The dashboard also reads ABHA readiness and transaction telemetry from auth-service APIs.

By default in dev:

- Frontend requests use `/api/v1/*`
- Vite proxies `/api/v1` to `http://127.0.0.1:8088`
- Frontend requests use `/api/auth-v1/*` for ABHA telemetry
- Vite proxies `/api/auth-v1` to `http://127.0.0.1:5101` and rewrites to auth-service `/api/v1/*`

Optional overrides:

- `VITE_NOTIFICATION_API_BASE_URL` controls the browser base URL used by the app (default `/api/v1`)
- `VITE_NOTIFICATION_PROXY_TARGET` controls the Vite dev proxy target (default `http://127.0.0.1:8088`)
- `VITE_AUTH_API_BASE_URL` controls auth telemetry base URL used by the app (default `/api/auth-v1`)
- `VITE_AUTH_PROXY_TARGET` controls auth-service Vite proxy target (default `http://127.0.0.1:5101`)

Required backend endpoints for live telemetry:

- `GET /api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/retention`
- `GET /api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/retention/saturation-trend`
- `GET /api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/retention/escalations/export`
- `GET /api/v1/platform/abha/operational-readiness`
- `GET /api/v1/platform/abha/fallback-decision/telemetry`
- `GET /api/v1/platform/abha/transactions/evidence`
- `POST /api/v1/platform/abha/transactions/read`
- `POST /api/v1/platform/abha/transactions/write`

### Actionable Operator Commands

The command panel now triggers live incident handoff actions (safe defaults):

- `Export escalation SLA breaches`
	- Calls `GET /api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/retention/escalations/export`
	- Uses bounded filters for unacknowledged warning/critical escalation states and breached SLA rows
- `Open anomaly triage endpoint template`
	- Calls `POST /api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/retention/anomalies/{anomalyInstanceId}/triage`
	- Selects the first active anomaly from current trend telemetry and records acknowledgement + operator note
- `Apply retention and escalation policy tune`
	- Calls `POST /api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/retention/apply`
	- Applies bounded dedupe window/max entry values with conservative export policy defaults
- `Run ABHA and connector drill checklist`
	- Runs a lightweight endpoint reachability checklist across notification and ABHA telemetry routes

Safety notes:

- Retention tuning action uses bounded values and no immediate prune (`pruneNow=false`).
- ABHA actions in this dashboard remain dry-run for transaction probes.

## Production-Fast Start

From repository root:

```powershell
pnpm run build:operations
pnpm run start:operations
```

`start:operations` serves prebuilt static output from `dist` and avoids runtime bundling.
Default static port is `4182` with automatic fallback to the next available port.

## Related Documentation

- API catalog: `../../docs/api/api-catalog.md`
- Governance charter: `../../governance/project-management-charter.md`
- Operations runbooks: `../../docs/runbooks/`

