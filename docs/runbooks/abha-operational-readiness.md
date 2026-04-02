# ABHA Operational Readiness Runbook

## Purpose

This runbook defines the minimum operational checks to keep ABHA adapter workflows safe, diagnosable, and reversible across tenant environments.

## Prerequisites

- ABHA feature is explicitly enabled for target tenant (`ABHA_ENABLED=true`).
- Secret store contains valid ABHA credentials:
  - `ABHA_CLIENT_ID`
  - `ABHA_CLIENT_SECRET`
- Gateway host is configured:
  - `ABHA_GATEWAY_BASE_URL`
- Environment mode is set:
  - `ABHA_ENVIRONMENT` (`sandbox` or `production`)

## Readiness Endpoints

- Config readiness:
  - `GET /api/v1/platform/abha/config-status`
- Gateway reachability:
  - `GET /api/v1/platform/abha/health-check`
- Incident-drill evidence feed:
  - `GET /api/v1/platform/abha/health-check/evidence`
- Operational readiness summary:
  - `GET /api/v1/platform/abha/operational-readiness`

## Daily Checks

1. Confirm `configured=true` in ABHA config-status.
2. Confirm readiness status is not `at-risk` in operational-readiness.
3. Confirm health-check returns reachable gateway for active tenant environment.

## Weekly Validation

1. Run operational-readiness endpoint and archive output in ops notes.
2. Run health-check with bounded timeout:
   - `GET /api/v1/platform/abha/health-check?timeoutMs=4000`
3. Capture `checkId` from each health-check and verify evidence feed includes the same check outcomes.
4. Confirm no secret-key drift between tenant config and deployment secret store.

## Incident Triage

1. Validate ABHA config-status and operational-readiness first.
2. If `configured=false`, treat as config incident and rotate/reapply secrets.
3. If config is healthy but reachability fails, treat as gateway/network incident.
4. Route to platform owner when repeated `502` checks occur over triage window.

## Rollback Guidance

1. Disable ABHA integration for impacted tenant by feature policy.
2. Shift affected workflows to baseline non-ABHA path while remediation proceeds.
3. Re-run operational-readiness and health-check before re-enabling ABHA traffic.

## Evidence To Capture

- Timestamped output from all readiness endpoints.
- Health-check `checkId` values plus corresponding `/health-check/evidence` records.
- Environment mode (`sandbox` or `production`) at incident time.
- Applied remediation and post-fix health-check evidence.
