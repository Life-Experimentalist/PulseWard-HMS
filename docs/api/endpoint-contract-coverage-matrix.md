# Endpoint Contract Coverage Matrix (M1)

This matrix tracks route-contract coverage and semantic parity for core PulseWard services in M1.

| service              | base path                                               | runtime route source                    | openapi/spec source                        | coverage status | parity status              | notes                                                                                                                              |
| -------------------- | ------------------------------------------------------- | --------------------------------------- | ------------------------------------------ | --------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| api-gateway          | /api                                                    | services/api-gateway/src                | services/api-gateway/openapi.yaml          | partial         | allowlisted known drift    | Runtime entry file exists but is currently blank; gateway route implementation is not yet materialized in this source file.        |
| auth-service         | /api/v1 (also mounted at /api)                          | services/auth-service/routes.js         | services/auth-service/openapi.yaml         | covered         | parity pass                | Runtime route module and OpenAPI spec are both present.                                                                            |
| appointment-service  | /api/v1 (also mounted at /api)                          | services/appointment-service/routes.js  | services/appointment-service/openapi.yaml  | covered         | parity pass                | Runtime route module and OpenAPI spec are both present.                                                                            |
| notification-service | /api/v1 (also mounted at /api)                          | services/notification-service/routes.js | services/notification-service/openapi.yaml | covered         | parity pass                | Runtime route module and OpenAPI spec are both present.                                                                            |
| patient-service      | /api/patients                                           | services/patient-service/src            | services/patient-service/openapi.yaml      | covered         | parity pass                | Runtime route declarations are inline in src; no dedicated routes.js file.                                                         |
| ehr-service          | /ehr (runtime), /api/v1/patients (spec)                 | services/ehr-service/src                | services/ehr-service/openapi.yaml          | partial         | allowlisted known drift    | Runtime mount path and OpenAPI server/path structure appear drifted and should be reconciled.                                      |
| lab-service          | /api/lab-tests (runtime), /api/lab/tests (spec)         | services/lab-service/src                | services/lab-service/openapi.yaml          | partial         | allowlisted known drift    | Runtime path naming differs from OpenAPI path model and should be reconciled.                                                      |
| pharmacy-service     | /api/pharmacy                                           | services/pharmacy-service/src           | services/pharmacy-service/openapi.yaml     | covered         | parity pass                | Runtime route declarations are inline in src; no dedicated routes.js file.                                                         |
| billing-service      | /billing (runtime route prefix), /api/v1/billing (spec) | services/billing-service/src            | services/billing-service/openapi.yaml      | partial         | allowlisted known drift    | Runtime router exists in src, but explicit service mount wiring is not shown in this file and appears drifted from spec base path. |

## M1.2 Parity Rules

- Presence and semantic parity are both validated by `npm run contracts:check`.
- Default mode fails on any unexpected runtime/spec mismatch.
- Strict mode (`npm run contracts:check -- --strict`) also fails when allowlist entries become stale and should be removed.
- Known drifts are explicitly allowlisted to prevent hidden breakage while documenting intentional exceptions.

## Current Allowlisted Drifts

- `api-gateway`
	- Reason: runtime gateway routes are not yet materialized in `services/api-gateway/src`.
	- Spec-only operations: `POST /auth`, `GET /patients`, `POST /patients`, `GET /appointments`, `POST /appointments`.
- `ehr-service`
	- Reason: runtime mounts under `/ehr/records` while spec models `/patients` resources.
	- Runtime-only operations: `GET /ehr/records/{param}`, `PUT /ehr/records/{param}`, `DELETE /ehr/records/{param}`.
	- Spec-only operations: `GET /patients`, `POST /patients`, `GET /patients/{param}`, `PUT /patients/{param}`, `DELETE /patients/{param}`.
- `lab-service`
	- Reason: runtime uses `/api/lab-tests` while spec uses `/tests` under `/api/lab` server base.
	- Runtime-only operations: `GET /api/lab-tests`, `POST /api/lab-tests`, `PUT /api/lab-tests/{param}`, `DELETE /api/lab-tests/{param}`.
	- Spec-only operations: `GET /tests`, `POST /tests`, `GET /tests/{param}`, `PUT /tests/{param}`, `DELETE /tests/{param}`.
- `billing-service`
	- Reason: runtime CRUD endpoints differ from spec billing/payment model.
	- Runtime-only operations: `POST /billing`, `GET /billing/{param}`, `PUT /billing/{param}`, `DELETE /billing/{param}`.
	- Spec-only operations: `POST /billing/payment`.
