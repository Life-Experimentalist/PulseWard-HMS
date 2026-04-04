# M8 Load Validation Baseline

## Objective

Define the minimum load validation baseline for M8 so performance and resilience evidence is repeatable before release-candidate freeze.

## Scope

The M8 load validation baseline covers these API paths:

- Auth login path.
- Appointment booking write path.
- Notification dispatch path.
- Patient read path.
- Patient write path.

## Source of Truth

- `config/performance/m8-load-profiles.json`
- `docs/runbooks/templates/m8-load-summary-template.md`

## Verification Command

Run from repository root:

```powershell
npm run perf:m8:check
```

Expected output:

- `M8 load baseline check passed.`
- Validation summary confirming required profile and runbook coverage.

## Load Profile Execution

Use any approved load tool (`k6`, `autocannon`, or equivalent) and map command arguments to profile values in `config/performance/m8-load-profiles.json`.

### Auth Login Path

- Profile key: `auth-login`
- Endpoint: `POST /auth/login`
- Primary watch metrics: `p95 latency`, `error rate`, and auth policy rejection ratio.

### Appointment Booking Path

- Profile key: `appointment-booking`
- Endpoint: `POST /appointments`
- Primary watch metrics: `p95 latency`, conflict ratio, and idempotency retry behavior.

### Notification Dispatch Path

- Profile key: `notification-dispatch`
- Endpoint: `POST /notifications/send`
- Primary watch metrics: queue depth, adapter failure rate, and dispatch latency.

### Patient Read Path

- Profile key: `patient-read`
- Endpoint: `GET /patients/{id}`
- Primary watch metrics: `p95 latency`, cache hit behavior, and read error rate.

### Patient Write Path

- Profile key: `patient-write`
- Endpoint: `PUT /patients/{id}`
- Primary watch metrics: `p95 latency`, write conflict ratio, and validation failure rate.

## Evidence Capture

For each test run, create an evidence artifact under `docs/runbooks/evidence` using `docs/runbooks/templates/m8-load-summary-template.md`.

Required evidence fields:

- Environment, commit, operator, and timestamp.
- Tooling and exact command arguments.
- Requested concurrency profile and duration.
- Latency/error outcomes versus configured thresholds.
- Bottleneck notes and remediation actions.

## Bottleneck Review Checklist

- Query plan hotspots identified and linked to owning service.
- Queue contention observations recorded with mitigation options.
- Cache inefficiencies or miss patterns captured.
- Retry storm risk assessed with backoff or circuit-breaker actions.
- Rollback impact documented if mitigation changes are applied.