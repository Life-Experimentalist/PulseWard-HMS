# Endpoint Contract Coverage Matrix (M1)

This matrix tracks route-contract coverage and semantic parity for core PulseWard services in M1.

| service              | base path                       | runtime route source                    | openapi/spec source                        | coverage status | parity status | notes                                                                                  |
| -------------------- | ------------------------------- | --------------------------------------- | ------------------------------------------ | --------------- | ------------- | -------------------------------------------------------------------------------------- |
| api-gateway          | /auth, /patients, /appointments | services/api-gateway/src                | services/api-gateway/openapi.yaml          | covered         | parity pass   | Core gateway runtime handlers are now implemented and aligned with OpenAPI operations. |
| auth-service         | /api/v1 (also mounted at /api)  | services/auth-service/routes.js         | services/auth-service/openapi.yaml         | covered         | parity pass   | Runtime route module and OpenAPI spec are both present.                                |
| appointment-service  | /api/v1 (also mounted at /api)  | services/appointment-service/routes.js  | services/appointment-service/openapi.yaml  | covered         | parity pass   | Runtime route module and OpenAPI spec are both present.                                |
| notification-service | /api/v1 (also mounted at /api)  | services/notification-service/routes.js | services/notification-service/openapi.yaml | covered         | parity pass   | Runtime route module and OpenAPI spec are both present.                                |
| patient-service      | /api/patients                   | services/patient-service/src            | services/patient-service/openapi.yaml      | covered         | parity pass   | Runtime route declarations are inline in src; no dedicated routes.js file.             |
| ehr-service          | /ehr/records/{id}               | services/ehr-service/src                | services/ehr-service/openapi.yaml          | covered         | parity pass   | Runtime routes and OpenAPI are reconciled on /ehr/records/{id}.                        |
| lab-service          | /api/lab-tests                  | services/lab-service/src                | services/lab-service/openapi.yaml          | covered         | parity pass   | Runtime paths and OpenAPI model are reconciled under /api/lab-tests.                   |
| pharmacy-service     | /api/pharmacy                   | services/pharmacy-service/src           | services/pharmacy-service/openapi.yaml     | covered         | parity pass   | Runtime route declarations are inline in src; no dedicated routes.js file.             |
| billing-service      | /billing                        | services/billing-service/src            | services/billing-service/openapi.yaml      | covered         | parity pass   | Runtime CRUD endpoints and OpenAPI are reconciled for /billing and /billing/{id}.      |

## M1.2 Parity Rules

- Presence and semantic parity are both validated by `npm run contracts:check`.
- Default mode fails on any unexpected runtime/spec mismatch.
- Strict mode (`npm run contracts:check -- --strict`) also fails when allowlist entries become stale and should be removed.
- CI runs strict mode by default to prevent drift regressions.
- Regression tests are tracked in `tests/contracts/parity-regression.test.js` and run in the standard Jest pipeline.
- Known drifts can be explicitly allowlisted to prevent hidden breakage while documenting intentional exceptions.

## M1.6 Schema Coverage Rules

- Critical endpoint request/response schema coverage is now validated by `npm run contracts:check`.
- The checker asserts required request bodies and `application/json` schema definitions for critical operations in:
	- `auth-service`
	- `appointment-service`
	- `notification-service`
- Any missing critical schema block fails the contract check and CI.

## Current Allowlisted Drifts

- None. M1.3 reconciled previous allowlisted drift for `api-gateway`, `ehr-service`, `lab-service`, and `billing-service`.
