# Endpoint Contract Coverage Matrix (M1)

This matrix tracks route-contract coverage and semantic parity for core PulseWard services in M1.

| service              | base path                       | runtime route source                    | openapi/spec source                        | coverage status | parity status | notes                                                                                  |
| -------------------- | ------------------------------- | --------------------------------------- | ------------------------------------------ | --------------- | ------------- | -------------------------------------------------------------------------------------- |
| api-gateway          | /auth, /patients, /appointments | services/api-gateway/src                | services/api-gateway/openapi.yaml          | covered         | parity pass   | Core gateway runtime handlers are now implemented and aligned with OpenAPI operations. |
| auth-service         | /api/v1 (also mounted at /api)  | services/auth-service/routes.js         | services/auth-service/openapi.yaml         | covered         | parity pass   | Runtime route module and OpenAPI spec are both present.                                |
| appointment-service  | /api/v1 (also mounted at /api)  | services/appointment-service/routes.js  | services/appointment-service/openapi.yaml  | covered         | parity pass   | Runtime route module and OpenAPI spec are both present.                                |
| notification-service | /api/v1 (also mounted at /api)  | services/notification-service/routes.js | services/notification-service/openapi.yaml | covered         | parity pass   | Runtime route module and OpenAPI spec are both present.                                |
| patient-service      | /api/patients                   | services/patient-service/src            | services/patient-service/openapi.yaml      | covered         | parity pass   | Runtime route declarations are inline in src; no dedicated routes.js file.             |
| ehr-service          | /ehr/records/{id}               | services/ehr-service/routes.js          | services/ehr-service/openapi.yaml          | covered         | parity pass   | Runtime routes and OpenAPI are reconciled for EHR CRUD and timeline history paths.     |
| lab-service          | /lab-tests (mounted at /api)    | services/lab-service/routes.js          | services/lab-service/openapi.yaml          | covered         | parity pass   | Runtime route module and OpenAPI are reconciled for catalog/order/result workflows.    |
| pharmacy-service     | /api/pharmacy                   | services/pharmacy-service/src           | services/pharmacy-service/openapi.yaml     | covered         | parity pass   | Runtime route declarations are inline in src; no dedicated routes.js file.             |
| billing-service      | /billing                        | services/billing-service/src            | services/billing-service/openapi.yaml      | covered         | parity pass   | Runtime and OpenAPI are reconciled for billing CRUD and clinical trigger hook endpoints. |

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

## M2.3 Auth Policy Guardrail Coverage

- Critical schema assertions now include auth policy-enforced login and OAuth flow endpoints in `auth-service`.
- Policy enforcement denial responses are documented and verified with schema checks for `403` paths.

## M2.4 Role And Session Guardrail Coverage

- Tenant role-provider compatibility behavior is enforced in auth runtime and covered by auth regression tests.
- Tenant role-specific session TTL behavior is enforced in login/OAuth token issuance and covered by auth regression tests.

## M2.5 OTP And MFA Guardrail Coverage

- Critical schema assertions include OTP challenge and verification endpoints in `auth-service`.
- Login schema assertions now include MFA-required response coverage for policy-driven auth flows.

## M3.1 Workflow Entry And Session Observability Coverage

- Critical schema assertions include `POST /auth/workflow-entry/check` and `GET /auth/session/events` in `auth-service`.
- Workflow-entry policy outcomes (allow, role-denied, MFA-required, provider-policy-denied) are covered by auth regression tests.
- Session event filtering by tenant, role, action, and outcome is covered by auth regression tests.

## M3.2 OPD Management And Appointment Entry Coverage

- Critical schema assertions include `POST /opd/entries` for OPD intake and draft appointment handoff in `appointment-service`.
- Critical schema assertions for `POST /appointments` and `PUT /appointments/{id}` now enforce error-schema coverage for invalid payload and role-blocked entry semantics.
- Regression tests cover OPD intake creation, OPD-to-appointment draft handoff, and appointment update role-access denial paths.

## M3.3 EHR Clinical Write Integrity Coverage

- Critical schema assertions include `POST /ehr/records`, `PUT /ehr/records/{id}`, and `GET /ehr/records/{id}/timeline` in `ehr-service`.
- EHR runtime now enforces actor-role requirements and optimistic version checks for clinical write paths.
- Regression tests cover create/update/delete timeline sequence integrity and version-conflict behavior.

## M3.4 Prescription Handoff Lifecycle Coverage

- Critical schema assertions include `POST /ehr/records/{id}/prescriptions` and `POST /ehr/records/{id}/prescriptions/{prescriptionId}/handoff` in `ehr-service`.
- Critical schema assertions include `POST /prescriptions/handoff` and `PUT /prescriptions/{id}/status` in `pharmacy-service`.
- Regression tests cover EHR prescription creation, EHR-to-pharmacy handoff, pharmacy fulfillment status updates, and EHR status synchronization.

## M3.5 Lab Order Result Trigger Alignment Coverage

- Critical schema assertions include `POST /lab-tests/orders`, `PUT /lab-tests/orders/{id}/status`, `POST /lab-tests/orders/{id}/result`, and `POST /lab-tests/orders/{id}/report` in `lab-service`.
- Lab runtime now enforces actor-role presence, lifecycle status constraints, and report-before-result protection semantics.
- Regression tests cover order creation, status progression, result recording, reported-state trigger fanout to EHR/billing, and error-path guardrails.

## M3.6 Billing Clinical Trigger Hook Coverage

- Critical schema assertions include `POST /billing/hooks/clinical-trigger` in `billing-service`.
- Billing runtime now validates actor role, trigger semantics, and idempotent `correlationId` handling for lab and prescription workflow events.
- Regression tests cover successful lab/prescription trigger processing, trigger receipt queries, and duplicate correlation rejection behavior.

## Current Allowlisted Drifts

- None. M1.3 reconciled previous allowlisted drift for `api-gateway`, `ehr-service`, `lab-service`, and `billing-service`.
