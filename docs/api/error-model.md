# PulseWard API Error Model

## Scope

This document describes:

1. Current runtime error behavior used by services today.
2. The normalized contract expected for new or refactored endpoints.

## Current Runtime Behavior

Current services primarily return simple JSON payloads with HTTP status codes.
Typical responses are shaped as one of these:

```json
{ "message": "email, password, and role are required" }
```

```json
{ "accepted": false, "detail": "Provider credentials are missing" }
```

```json
{ "reachable": false, "detail": "ABHA gateway check failed", "statusCode": 0 }
```

This behavior is valid for the current release track and is reflected in service OpenAPI specs.

## Target Normalized Error Envelope

For new API surfaces, prefer this envelope while preserving backward compatibility:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "email, password, and role are required",
    "details": {
      "field": "role"
    }
  },
  "requestId": "01HV8Q5C3MMN3X7KQ4PQ1Q9VJY",
  "timestamp": "2026-04-02T08:15:30.000Z"
}
```

## Required Semantics

- Keep HTTP status codes authoritative.
- Keep `message` human readable and safe for logs/UI.
- Do not include PII or secrets in error payloads.
- Include stable machine-friendly `code` values for client automation.
- Include `requestId` where tracing is available.

## Suggested Error Code Families

| HTTP | Code                   | Meaning                                         |
| ---- | ---------------------- | ----------------------------------------------- |
| 400  | `VALIDATION_ERROR`     | Input shape or value is invalid.                |
| 401  | `AUTH_REQUIRED`        | Missing or invalid auth token.                  |
| 403  | `AUTH_FORBIDDEN`       | Authenticated but not authorized.               |
| 404  | `RESOURCE_NOT_FOUND`   | Resource does not exist.                        |
| 409  | `CONFLICT`             | State conflict (booking, version, idempotency). |
| 422  | `UNPROCESSABLE_ENTITY` | Semantically invalid request body.              |
| 429  | `RATE_LIMITED`         | Request throttled.                              |
| 502  | `UPSTREAM_FAILURE`     | Provider or upstream call failed.               |
| 503  | `SERVICE_UNAVAILABLE`  | Service temporarily unavailable.                |

## Migration Guidance

1. Do not break existing response shapes in-place on stable endpoints.
2. For contract changes, add migration notes in release docs.
3. Keep OpenAPI responses updated for both success and failure paths.
4. Add tests that assert status code plus response body keys for expected failures.
