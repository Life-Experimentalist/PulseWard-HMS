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

## M5.3 Webhook Signature Verification And ABHA Evidence Automation Coverage

- Notification runtime now exposes `POST /integrations/messaging/webhook/signature/verify` for tenant-scoped HMAC signature verification using configured webhook signing-secret references.
- Notification webhook diagnostics now include a signature verification hint section with endpoint path, header contract, and signature format guidance.
- Auth runtime now records ABHA health-check outcomes with stable `checkId` identifiers and exposes `GET /platform/abha/health-check/evidence` for incident drill evidence feeds.
- Regression tests cover webhook signature verification pass/fail branches and ABHA health-check evidence retrieval under unreachable gateway conditions.

## M5.4 Retry Policy Controls And ABHA Consent Simulation Coverage

- Notification runtime now exposes `GET /integrations/messaging/retry-policy` for provider-scoped retry mode, attempt limits, backoff bounds, jitter flags, and channel-coverage diagnostics.
- Auth runtime now exposes `GET /platform/abha/consent-flow/simulation` for scenario-based (`happy-path`, `consent-denied`, `gateway-timeout`) operational drill checkpoints.
- ABHA operational-readiness diagnostics now link the consent simulation endpoint for drill planning workflows.
- Regression tests cover retry-policy diagnostics response shape and ABHA consent simulation behavior under at-risk configuration conditions.

## M5.5 Fault Injection Controls And ABHA Fallback Telemetry Coverage

- Notification runtime now exposes `GET /integrations/messaging/fault-injection/simulate` for scenario-driven connector fault simulation (`happy-path`, `network-timeout`, `rate-limit`, `provider-5xx`, `invalid-signature`).
- Notification runtime now exposes `GET /integrations/messaging/fault-injection/events` for queryable simulation-event telemetry with tenant/provider/scenario filters and summary counters.
- Auth runtime now exposes `GET /platform/abha/fallback-decision/telemetry` for operational fallback decision evidence, including latest health-check snapshot linkage.
- ABHA operational-readiness diagnostics now link the fallback decision telemetry endpoint for runbook drill continuity.
- Regression tests cover fault-injection simulation/event retrieval behavior and ABHA fallback decision telemetry response semantics.

## M5.6 Connector Drill Export And Retention Controls Coverage

- Notification runtime now exposes `GET /integrations/messaging/fault-injection/export` with JSON/CSV evidence export support for incident handoff workflows.
- Notification runtime now exposes `GET /integrations/messaging/fault-injection/retention` for retention policy visibility and telemetry window diagnostics.
- Notification runtime now exposes `POST /integrations/messaging/fault-injection/retention/apply` for bounded retention updates and optional immediate prune operations.
- Fault-injection simulation and event endpoints now include diagnostics links to export and retention control routes.
- Regression tests cover export payload behavior, CSV export content type, retention policy apply/status semantics, and missing-payload guardrails.

## M5.7 Signed Evidence Manifest Coverage

- Notification runtime now exposes `GET /integrations/messaging/fault-injection/manifest` to produce a traceable evidence manifest with digest and optional HMAC signature.
- Manifest signing supports dedicated `INTEGRATION_FAULT_EVIDENCE_SIGNING_SECRET` with fallback to webhook signing secret when needed.
- Fault simulation/events/export/retention diagnostics now reference manifest generation endpoint for incident handoff continuity.
- Regression tests cover signed-manifest generation, digest/signature response shape, and signature reproducibility checks.

## M5.8 Manifest Verification Coverage

- Notification runtime now exposes `POST /integrations/messaging/fault-injection/manifest/verify` for zero-trust manifest validation before incident handoff acceptance.
- Verification responses now report version, digest, and signature checks with signing-source diagnostics for operator triage.
- Manifest digest computation now uses deterministic canonical evidence fields to avoid timestamp-induced verification drift.
- Regression tests cover verification success, tampered digest rejection, and required-digest guardrail behavior.

## M5.9 Manifest Replay-Defense Coverage

- Fault manifest generation now includes replay-defense metadata (`issuedAt`, optional `nonce`) and signs those fields into the canonical digest payload.
- Manifest verification now enforces `issuedAt` presence, bounded freshness windows, and optional nonce correlation (`nonce` vs `expectedNonce`) checks.
- Verification responses now include replay-defense diagnostics (`ageSeconds`, `maxAgeSeconds`, `freshnessMatch`, `nonceMatch`) for incident triage.
- Regression tests cover stale issued-at rejection, nonce mismatch rejection, and missing-issuedAt guardrail behavior.

## M5.10 Manifest Verification Duplicate Suppression Coverage

- Manifest verification now computes a stable replay-attempt fingerprint from request verification fields and suppresses duplicate submissions within a bounded dedupe window.
- Verification responses now include replay-attempt metadata (`attemptId`, `fingerprint`, `duplicateSuppressed`, `suppressCount`, `dedupeWindowSeconds`) for operator traceability.
- Duplicate suppression cache is bounded by time window and max-entry controls to limit operational footprint.
- Regression tests cover first-attempt pass-through, duplicate suppression hits, suppression counter increments, and fingerprint consistency.

## M5.11 Replay-Attempt Audit Query Coverage

- Notification runtime now exposes `GET /integrations/messaging/fault-injection/manifest/verify/attempts` for replay-attempt forensic queries.
- Audit queries support tenant/provider/scenario/fingerprint filters, validity and duplicate-suppression flags, plus bounded limit controls.
- Verification diagnostics now link the replay-attempt audit endpoint for incident timeline follow-up.
- Regression tests cover replay-attempt audit retrieval by fingerprint with duplicate suppression evidence checks.

## M5.12 Replay-Attempt Export Coverage

- Notification runtime now exposes `GET /integrations/messaging/fault-injection/manifest/verify/attempts/export` for replay-attempt audit snapshot handoff.
- Export supports JSON and CSV formats with shared forensic filters (`tenantKey`, `providerKey`, `scenario`, `fingerprint`, `valid`, `duplicateSuppressed`) and bounded limit controls.
- Replay-attempt query and verify diagnostics now link the export endpoint to support postmortem pivot workflows.
- Regression tests cover export JSON summaries, CSV content shape, and duplicate-suppression evidence counters.

## M5.13 Replay-Attempt Retention Tuning Coverage

- Notification runtime now exposes `GET /integrations/messaging/fault-injection/manifest/verify/attempts/retention` for replay-attempt audit retention status and suppression telemetry.
- Notification runtime now exposes `POST /integrations/messaging/fault-injection/manifest/verify/attempts/retention/apply` for bounded dedupe-window and max-entry tuning with optional immediate prune.
- Verify, attempts query, and attempts export diagnostics now link replay-attempt retention status/apply endpoints for operational pivot continuity.
- Regression tests cover retention status payload semantics, retention apply success paths, and missing-payload rejection behavior.

## M5.14 Replay-Attempt Retention Saturation Coverage

- Replay-attempt retention telemetry now exposes saturation diagnostics (`currentEntries`, `maxEntries`, `utilizationPercent`, `remainingEntries`) with warning/critical threshold visibility.
- Retention telemetry now returns operator-ready `alertLevel` (`normal|warning|critical`) and `recommendedAction` guidance for proactive near-capacity response.
- Verify, attempts query, attempts export, and retention status/apply diagnostics now include saturation discoverability links (`retentionSaturationEndpoint`, `retentionSaturationPath`).
- Regression tests cover saturation payload shape, utilization bounds, alert-level enum behavior, and retention diagnostics link consistency.

## M5.15 Replay-Attempt Saturation Trend Snapshot Coverage

- Notification runtime now exposes `GET /integrations/messaging/fault-injection/manifest/verify/attempts/retention/saturation-trend` for time-windowed replay-attempt saturation trend review.
- Retention status/apply telemetry now includes `saturationTrend` summary and snapshot arrays with bounded window/limit controls.
- Verify, attempts query/export, and retention diagnostics now include trend discoverability links (`retentionSaturationTrendEndpoint`, `retentionSaturationTrendPath`).
- Regression tests cover trend payload shape, query window/limit behavior, and trend diagnostics link continuity.

## M5.16 Replay-Attempt Saturation Trend Anomaly Coverage

- Saturation trend summaries now expose anomaly objects with machine-readable keys (`sustained-warning`, `sustained-critical`, `accelerating-utilization`), severity levels, and recommended operator actions.
- Retention status/apply telemetry now surfaces anomaly aggregates (`anomalies`, `highestAnomalySeverity`) for sustained-risk triage without additional query hops.
- Trend anomaly evaluation uses bounded in-memory snapshots and lightweight rule checks to preserve low-cost runtime behavior.
- Regression tests cover anomaly payload shape, supported key/severity enums, sustained-risk anomaly detection, and highest-severity reporting.

## M5.17 Replay-Attempt Anomaly Acknowledgement And Triage-Note Coverage

- Notification runtime now exposes `POST /integrations/messaging/fault-injection/manifest/verify/attempts/retention/anomalies/{anomalyInstanceId}/triage` for anomaly acknowledgement and triage-note append workflows.
- Retention and saturation-trend anomaly payloads now include machine-readable `anomalyInstanceId`, anomaly `status`, and `triage` state snapshots for operator handoff continuity.
- Verify, attempts query/export, retention status/apply, and trend diagnostics now include anomaly triage endpoint template discoverability.
- Regression tests cover acknowledgement-plus-note updates, note-only append behavior, persistence across retention/trend reads, and 400/404 triage guardrails.

## M5.18 Replay-Attempt Anomaly Lifecycle Closure And Escalation Coverage

- Retention and trend anomaly outputs now include closure metadata (`closedAt`, `closedReason`, `clearanceEvidence`, `closureHistory`) and machine-readable escalation state snapshots.
- Retention telemetry now exposes escalation aggregates and recently-closed anomaly feeds for operator shift-handoff continuity.
- Retention apply controls now accept escalation policy updates (`escalationPolicy`) and report policy change metadata in response payloads.
- Regression tests cover escalation transitions, mitigation-driven deescalation, closure feed semantics, and escalation policy validation guardrails.

## M5.19 Escalation Acknowledgement SLA And Export Coverage

- Retention and trend anomaly escalation payloads now include acknowledgement SLA state (`status`, elapsed/remaining seconds, breach telemetry, acknowledged timestamps).
- Retention telemetry escalation summary now includes acknowledgement SLA aggregates for open-breach and acknowledgement performance tracking.
- Notification runtime now exposes `GET /integrations/messaging/fault-injection/manifest/verify/attempts/retention/escalations/export` for JSON/CSV escalation handoff artifacts with bounded filters.
- Retention apply controls now accept escalation export policy updates (`escalationExportPolicy`) and report policy-change metadata in response payloads.
- Regression tests cover SLA field presence, escalation export JSON/CSV behavior, and invalid export-filter guardrails.

## M5.20 ABHA Transactional Connector Completion Coverage

- Auth runtime now exposes `POST /platform/abha/transactions/read` and `POST /platform/abha/transactions/write` with consent-required guardrails and deterministic fallback behavior.
- Transaction handlers now support safe dry-run defaults, optional live gateway execution (`dryRun=false`), and health-check-derived fallback routing for at-risk ABHA states.
- Auth runtime now exposes `GET /platform/abha/transactions/evidence` for consent, fallback, and transactional-outcome audit telemetry.
- Regression tests cover consent-required blocking, fallback-path behavior, simulated read/write paths, and transactional evidence query semantics.

## M6.1 Operations Dashboard Connector Reliability Surface Coverage

- Operations dashboard now consumes existing notification telemetry endpoints for retention saturation, anomaly trend state, and escalation SLA breach exports.
- Frontend telemetry dependencies are protected by backend invariants in `tests/notification/webhook-delivery-diagnostics.test.js` to reduce UI contract drift risk.
- Local developer flow now includes Vite proxy guidance and environment override documentation for live telemetry bootstrap.

## M6.2 Operations Dashboard ABHA Transactional Reliability Surface Coverage

- Operations dashboard now consumes ABHA readiness, fallback telemetry, and transaction-evidence endpoints from auth-service.
- Dashboard operator actions now execute ABHA transaction dry-run probes (`read` and `write`) for shift-level reliability validation without live data mutation.
- Local developer flow now supports dual telemetry proxies for notification-service and auth-service (`/api/v1` and `/api/auth-v1`).
- Contract checker critical schema coverage now includes `GET /platform/abha/transactions/evidence` alongside ABHA transaction read/write paths.
- Regression tests continue to enforce ABHA transaction response semantics consumed by dashboard telemetry and operator action UI states.

## M5 Reporting Consolidation Guidance

- M5 delivery was broad and valid but became too granular in reporting.
- Recommended grouped reporting labels:
	- `M5-A` adapters and readiness (`M5.1-M5.4`)
	- `M5-B` fault evidence trust chain (`M5.5-M5.9`)
	- `M5-C` replay forensics and retention telemetry (`M5.10-M5.15`)
	- `M5-D` anomaly lifecycle, escalation, SLA, and handoff export (`M5.16-M5.19`)

## Current Allowlisted Drifts

- None. M1.3 reconciled previous allowlisted drift for `api-gateway`, `ehr-service`, `lab-service`, and `billing-service`.
