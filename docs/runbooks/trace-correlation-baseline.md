# Trace Correlation and Structured Logging Baseline

## Objective

Ensure each core PulseWard runtime emits request-completion logs with stable correlation identifiers so incidents can be triaged across gateway and domain services.

## Baseline Policy

- Every inbound request gets a `correlationId` (reuse inbound `x-correlation-id` when provided).
- Every inbound request gets a generated `requestId` for local runtime tracing.
- Runtime responses must include `x-correlation-id` and `x-request-id` headers.
- Completion logs must emit a structured JSON record with these fields:
  - `timestamp`
  - `level`
  - `event`
  - `service`
  - `correlationId`
  - `requestId`
  - `method`
  - `path`
  - `statusCode`
  - `durationMs`

## Source of Truth

- Middleware utility: `packages/shared-utils/request-context.js`
- Runtime bindings:
  - `services/api-gateway/src`
  - `services/auth-service/src`
  - `services/appointment-service/src`
  - `services/notification-service/src`
  - `services/patient-service/src`
  - `services/ehr-service/src`
  - `services/lab-service/src`
  - `services/pharmacy-service/src`
  - `services/billing-service/src`

## Verification Command

Run from repository root:

```powershell
pnpm run ops:trace:check
```

Expected output:

- `Trace correlation baseline check passed.`
- Validation count for all scoped service runtimes.

## Incident Use

- During incident triage, start with a known `correlationId` from client or gateway logs.
- Search structured service logs for matching `correlationId` to reconstruct request path.
- Use `requestId` only for service-local thread reconstruction.
