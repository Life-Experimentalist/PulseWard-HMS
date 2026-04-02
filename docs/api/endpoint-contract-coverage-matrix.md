# Endpoint Contract Coverage Matrix (M1)

This matrix tracks route-contract coverage and semantic parity for core PulseWard services in M1.

| service              | base path                       | runtime route source                    | openapi/spec source                        | coverage status | parity status | notes                                                                                                                           |
| -------------------- | ------------------------------- | --------------------------------------- | ------------------------------------------ | --------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| api-gateway          | /auth, /patients, /appointments | services/api-gateway/src                | services/api-gateway/openapi.yaml          | covered         | parity pass   | Core gateway runtime handlers are now implemented and aligned with OpenAPI operations.                                          |
| auth-service         | /api/v1 (also mounted at /api)  | services/auth-service/routes.js         | services/auth-service/openapi.yaml         | covered         | parity pass   | Runtime route module and OpenAPI spec are both present.                                                                         |
| appointment-service  | /api/v1 (also mounted at /api)  | services/appointment-service/routes.js  | services/appointment-service/openapi.yaml  | covered         | parity pass   | Runtime/OpenAPI aligned for OPD, lifecycle transitions, conflict/version guardrails, and notification dispatch audit endpoints. |
| notification-service | /api/v1 (also mounted at /api)  | services/notification-service/routes.js | services/notification-service/openapi.yaml | covered         | parity pass   | Runtime/OpenAPI aligned for messaging adapters and appointment-event ingestion/query contracts.                                 |
| patient-service      | /api/patients                   | services/patient-service/src            | services/patient-service/openapi.yaml      | covered         | parity pass   | Runtime route declarations are inline in src; no dedicated routes.js file.                                                      |
| ehr-service          | /ehr/records/{id}               | services/ehr-service/routes.js          | services/ehr-service/openapi.yaml          | covered         | parity pass   | Runtime routes and OpenAPI are reconciled for EHR CRUD and timeline history paths.                                              |
| lab-service          | /lab-tests (mounted at /api)    | services/lab-service/routes.js          | services/lab-service/openapi.yaml          | covered         | parity pass   | Runtime route module and OpenAPI are reconciled for catalog/order/result workflows.                                             |
| pharmacy-service     | /api/pharmacy                   | services/pharmacy-service/src           | services/pharmacy-service/openapi.yaml     | covered         | parity pass   | Runtime route declarations are inline in src; no dedicated routes.js file.                                                      |
| billing-service      | /billing                        | services/billing-service/src            | services/billing-service/openapi.yaml      | covered         | parity pass   | Runtime and OpenAPI are reconciled for billing CRUD and clinical trigger hook endpoints.                                        |

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

## M4.1 Appointment Lifecycle Conflict Reliability Coverage

- Critical schema assertions for `POST /appointments` and `PUT /appointments/{id}` include conflict response coverage (`409`) for slot and lifecycle reliability paths.
- Appointment runtime now enforces lifecycle transition matrix checks, clinician slot overlap detection, and optimistic `expectedVersion` conflict handling.
- Regression tests cover conflict rejection, transition validity, stale-version conflict handling, and idempotent create retry behavior.

## M4.2 Appointment Event To Notification Wiring Coverage

- Critical schema assertions include `POST /integrations/appointments/events` in `notification-service` for lifecycle event ingestion and replay-safe duplicate handling.
- Appointment runtime now emits lifecycle events (`created`, `status-updated`, `rescheduled`, `cancelled`) to notification-service with correlation-id propagation and bounded retry semantics.
- Appointment runtime exposes `GET /integrations/notifications/dispatch-events` for dispatch traceability by tenant, appointment, event, status, and correlation-id filters.
- Regression tests cover cross-service dispatch delivery, correlation propagation, and notification ingest duplicate replay behavior.

## M4.3 Test Coverage Completion Module

- Jest coverage execution is now standardized through `jest.config.cjs` and root `npm run test` scripts for consistent full-suite reporting.
- Route-edge validation suites now cover error and reliability branches for appointment, notification, EHR, lab, and auth service surfaces.
- Integration adapter suites now cover calendar/messaging provider selection, fallback behavior, and unsupported-provider failure paths.
- Shared utility suites now cover tenant config/domain resolution, origin policy checks, secret-ref parsing, and route-provider resolution behavior.
- Coverage quality gate is enforced with Jest global thresholds (statements >= 60, branches >= 55, functions >= 60, lines >= 60) to prevent slice regressions.

## M4.4 Notification Dead-Letter And Telemetry Coverage

- Appointment runtime now records dead-letter events for notification dispatch outcomes classified as missed (`failed`, `skipped`) and delayed (`delivered` beyond threshold) reminder paths.
- Appointment runtime now exposes `GET /integrations/notifications/dead-letter` for dead-letter query workflows by tenant, appointment, event type, status, correlation-id, and reason.
- Appointment runtime now exposes `GET /integrations/notifications/dispatch-telemetry` with counters for total, delivered, failed, skipped, dead-lettered, missed reminders, and delayed reminders plus event-type summaries.
- Regression tests cover skipped endpoint-not-configured behavior, failed retry-exhausted behavior, delayed-delivery telemetry counters, and late-delivery dead-letter records.

## M5.1 Connector Diagnostics Hardening Coverage

- Notification runtime now exposes `GET /integrations/messaging/whatsapp/setup` and `GET /integrations/messaging/whatsapp/config-status` to validate WhatsApp onboarding readiness and secret-backed config state.
- Notification runtime now centralizes provider secret-ref parsing for Telegram, WhatsApp, and SMTP status checks to reduce diagnostics drift across connectors.
- Appointment runtime now exposes `GET /integrations/calendars/interoperability/diagnostics` with routing-order, fallback, unresolved-provider, and interoperability-health diagnostics.
- Regression tests cover WhatsApp setup/config readiness paths and calendar interoperability diagnostics for default and citycare tenant configurations.

## M5.2 Webhook Diagnostics And ABHA Runbook Readiness Coverage

- Notification runtime now exposes `GET /integrations/messaging/webhook/diagnostics` for website-hook endpoint validity, routing coverage, and signing-secret readiness checks.
- Auth runtime now exposes `GET /platform/abha/operational-readiness` with config checks, diagnostics links, and runbook setup/rollback checklist references.
- Runbook coverage now includes `docs/runbooks/abha-operational-readiness.md` and updated integration operations references for webhook and ABHA readiness workflows.
- Regression tests cover webhook diagnostics healthy/degraded states and ABHA operational-readiness status behavior under incomplete config paths.

## Current Allowlisted Drifts

- None. M1.3 reconciled previous allowlisted drift for `api-gateway`, `ehr-service`, `lab-service`, and `billing-service`.
