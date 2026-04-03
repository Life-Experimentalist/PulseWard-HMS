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

## M6.3 Operations Dashboard Actionable Incident Handoff Coverage

- Operations dashboard command panel now executes bounded escalation export actions against notification-service retention escalation endpoints.
- Dashboard command panel now executes anomaly triage acknowledgement updates using active anomaly instance identifiers from saturation trend summaries.
- Dashboard command panel now executes bounded retention/apply tuning actions and refreshes live telemetry with post-action state snapshots.
- Dashboard drill checklist now runs endpoint reachability checks across notification reliability and ABHA transactional telemetry surfaces.
- Notification diagnostics regression coverage now validates command-path export filter semantics and triage/tuning payload invariants consumed by dashboard actions.

## M6.4 Retention Apply Safety Hardening Coverage

- Notification runtime retention apply now supports `dryRun=true` preview execution with zero state mutation and explicit execution metadata (`executionMode`, `persisted`).
- Retention apply updates are now atomically validated before commit so invalid escalation/export policy payloads do not partially mutate dedupe window or max-entry controls.
- Retention apply responses now include `retention.changeImpact` to summarize would-change fields and estimated prune impact before live execution.
- Regression tests now validate dry-run no-mutation behavior and invalid-policy atomic invariants for replay-attempt retention controls.

## M6.6 Operations Command-Surface Schema Gate Coverage

- Contract checker critical schema assertions now include notification operations command endpoints consumed by handoff workflows.
- Added schema-gate coverage for:
	- `GET /integrations/messaging/fault-injection/manifest/verify/attempts/retention`
	- `GET /integrations/messaging/fault-injection/manifest/verify/attempts/retention/saturation-trend`
	- `GET /integrations/messaging/fault-injection/manifest/verify/attempts/retention/escalations/export`
	- `POST /integrations/messaging/fault-injection/manifest/verify/attempts/retention/anomalies/{anomalyInstanceId}/triage`
	- `POST /integrations/messaging/fault-injection/manifest/verify/attempts/retention/apply`
- Parity regression tests now assert PASS output for each of these schema checks so command-surface contract drift fails fast in CI.

## M6.7 Operations Command Parameter-Contract Coverage

- Contract checker critical parameter assertions now validate query/path parameter constraints for notification command endpoints used by operations workflows.
- Parameter contract checks now enforce:
	- retention trend query bounds/defaults (`windowMinutes`, `limit`)
	- escalation export parameter constraints (`format` enum, `includeRecentlyClosed`, `acknowledgementSlaStatus`, `limit` bounds/default)
	- anomaly triage path parameter contract (`anomalyInstanceId` required with `uuid` format)
	- retention apply request schema anchor for `dryRun` guardrail support
- Parity regression tests now assert PASS output for parameter-contract checks, so CI fails fast when command endpoint parameter contracts drift.

## M6.9 Escalation Export Response Media-Type Contract Coverage

- Contract checker critical parameter assertions now include escalation export response media-type checks to preserve JSON and CSV handoff compatibility.
- Escalation export contract gates now enforce response `200` content coverage for both `application/json` and `text/csv`.
- Mutation-based parity regressions now prove strict checker failure when escalation export response content drifts from `text/csv`, preventing silent operator handoff breakage.

## M6.10 Anomaly Triage Request-Schema Drift Guardrail Coverage

- Contract checker critical parameter assertions now include anomaly triage request-schema anchors for schema-ref and boolean-default invariants.
- Triage request contract gates now enforce:
	- request body schema ref must remain `#/components/schemas/MessagingFaultManifestVerifyAttemptAnomalyTriageRequest`
	- `acknowledge` property remains `boolean` with `default: false`
	- `mitigationApplied` property remains `boolean` with `default: false`
- Mutation-based parity regressions now prove strict checker failure when triage request schema ref or default semantics drift, preventing silent dashboard command payload incompatibility.

## M6.11 Notification Operations Policy-Anchor And Filter-Contract Coverage

- Contract checker critical parameter assertions now include escalation export boolean filter contracts for triage/operator action workflows.
- Parameter contract checks now enforce:
	- `GET /integrations/messaging/fault-injection/manifest/verify/attempts/retention/escalations/export`:
		- `triageAcknowledged` boolean
		- `actionRequired` boolean
		- `breached` boolean
- Contract checker request-schema-property assertions now include retention-apply policy default anchors:
	- `MessagingFaultManifestVerifyAttemptRetentionApplyRequest.pruneNow` default `true`
	- `MessagingFaultManifestVerifyAttemptEscalationPolicy.autoDeescalateOnMitigation` default `true`
	- `MessagingFaultManifestVerifyAttemptEscalationExportPolicy.includeRecentlyClosedByDefault` default `false`
	- `MessagingFaultManifestVerifyAttemptEscalationExportPolicy.defaultFormat` default `json`
- Mutation-based parity regressions now prove strict checker failure on boolean filter type drift and policy default drift, preventing silent dashboard command incompatibility.

## M6.12 Notification Operations Response-Schema Ref Guardrail Coverage

- Contract checker critical parameter assertions now include response-schema-ref checks for notification operations command endpoints used by dashboard handoff workflows.
- Response schema ref contract checks now enforce:
	- `GET /integrations/messaging/fault-injection/manifest/verify/attempts/retention` -> `#/components/schemas/MessagingFaultManifestVerifyAttemptRetentionStatusResponse`
	- `GET /integrations/messaging/fault-injection/manifest/verify/attempts/retention/saturation-trend` -> `#/components/schemas/MessagingFaultManifestVerifyAttemptRetentionSaturationTrendResponse`
	- `GET /integrations/messaging/fault-injection/manifest/verify/attempts/retention/escalations/export` (`application/json`) -> `#/components/schemas/MessagingFaultManifestVerifyAttemptEscalationExportResponse`
	- `POST /integrations/messaging/fault-injection/manifest/verify/attempts/retention/anomalies/{anomalyInstanceId}/triage` -> `#/components/schemas/MessagingFaultManifestVerifyAttemptAnomalyTriageResponse`
	- `POST /integrations/messaging/fault-injection/manifest/verify/attempts/retention/apply` -> `#/components/schemas/MessagingFaultManifestVerifyAttemptRetentionApplyResponse`
- Mutation-based parity regressions now prove strict checker failure on response-schema ref drift, preventing silent command response payload incompatibility.

## M6.13 Notification Operations Error Response-Schema Ref Guardrail Coverage

- Contract checker critical parameter assertions now include error-response schema ref checks for notification operations command endpoints.
- Response schema ref contract checks now enforce `NotificationErrorResponse` on:
	- escalation export (`400`, `403`)
	- anomaly triage (`400`, `404`)
	- retention apply (`400`)
- Mutation-based parity regressions now prove strict checker failure on error response-schema ref drift, preventing silent dashboard command error-handling incompatibility.

## M6.14 Notification Error-Schema Structural Anchor Guardrail Coverage

- Contract checker critical parameter assertions now include shared `NotificationErrorResponse` component schema-property guardrails.
- Schema property contract checks now enforce:
	- `NotificationErrorResponse.message` type `string`
	- `NotificationErrorResponse.code` type `string`
	- `NotificationErrorResponse.details` type `object`
	- `NotificationErrorResponse.details` `additionalProperties: true`
- Mutation-based parity regressions now prove strict-check failure on shared error-schema structural drift, preventing silent dashboard command error-handling incompatibility.

## M6.15 Notification Escalation Export State/Severity Filter Guardrail Coverage

- Contract checker critical parameter assertions now include escalation export state/severity filter contracts used by operations handoff workflows.
- Parameter contract checks now enforce:
	- `GET /integrations/messaging/fault-injection/manifest/verify/attempts/retention/escalations/export`:
		- `state` type `string`
		- `escalationSeverity` type `string`
- Mutation-based parity regressions now prove strict-check failure when escalation export state/severity filter parameter types drift from OpenAPI baseline.

## M6.16 Retention-Apply Escalation Policy Property Anchor Guardrail Coverage

- Contract checker request-schema-property assertions now include escalation policy component anchors used by retention apply command workflows.
- Schema property contract checks now enforce:
	- `MessagingFaultManifestVerifyAttemptEscalationPolicy.enabled` type `boolean` with default `true`
	- `MessagingFaultManifestVerifyAttemptEscalationExportPolicy.enabled` type `boolean` with default `true`
	- `MessagingFaultManifestVerifyAttemptEscalationExportPolicy.maxExportRows` type `integer`
- Mutation-based parity regressions now prove strict-check failure when escalation policy property anchors drift from OpenAPI baseline.

## M6.17 Anomaly Triage Metadata Property Anchor Guardrail Coverage

- Contract checker request-schema-property assertions now include anomaly triage metadata property anchors for operator note workflows.
- Schema property contract checks now enforce:
	- `MessagingFaultManifestVerifyAttemptAnomalyTriageRequest.note` type `string`
	- `MessagingFaultManifestVerifyAttemptAnomalyTriageRequest.noteType` type `string`
	- `MessagingFaultManifestVerifyAttemptAnomalyTriageRequest.mitigationEvidenceRef` type `string`
- Mutation-based parity regressions now prove strict-check failure when anomaly triage metadata property types drift from OpenAPI baseline.

## M6.18 Retention-Apply Numeric Tuning Property Anchor Guardrail Coverage

- Contract checker request-schema-property assertions now include retention-apply numeric tuning property anchors for replay-attempt retention command payloads.
- Schema property contract checks now enforce:
	- `MessagingFaultManifestVerifyAttemptRetentionApplyRequest.dedupeWindowSeconds` type `integer`
	- `MessagingFaultManifestVerifyAttemptRetentionApplyRequest.maxEntries` type `integer`
- Mutation-based parity regressions now prove strict-check failure when retention-apply numeric tuning property types drift from OpenAPI baseline.

## M6.19 Escalation Policy Threshold Property Anchor Guardrail Coverage

- Contract checker schema-property assertions now include escalation policy threshold anchors used by replay-attempt anomaly escalation controls.
- Schema property contract checks now enforce:
	- `MessagingFaultManifestVerifyAttemptEscalationPolicy.warningUnacknowledgedEscalateAfterSeconds` type `integer`
	- `MessagingFaultManifestVerifyAttemptEscalationPolicy.criticalUnacknowledgedEscalateAfterSeconds` type `integer`
	- `MessagingFaultManifestVerifyAttemptEscalationPolicy.criticalUnmitigatedEscalateAfterSeconds` type `integer`
- Mutation-based parity regressions now prove strict-check failure when escalation policy threshold property types drift from OpenAPI baseline.

## M6.20 Anomaly Escalation Acknowledgement SLA Property Anchor Guardrail Coverage

- Contract checker schema-property assertions now include acknowledgement SLA anchors for anomaly escalation payload compatibility.
- Schema property contract checks now enforce:
	- `MessagingFaultManifestVerifyAttemptAnomalyEscalationAcknowledgementSla.status` type `string`
	- `MessagingFaultManifestVerifyAttemptAnomalyEscalationAcknowledgementSla.breached` type `boolean`
	- `MessagingFaultManifestVerifyAttemptAnomalyEscalationAcknowledgementSla.acknowledged` type `boolean`
- Mutation-based parity regressions now prove strict-check failure when acknowledgement SLA property types drift from OpenAPI baseline.

## M6.21 Retention-Status Query Parameter Anchor Guardrail Coverage

- Contract checker parameter assertions now include retention-status query parameter anchors for replay-attempt retention operations.
- Parameter contract checks now enforce:
	- `GET /integrations/messaging/fault-injection/manifest/verify/attempts/retention`:
		- `windowMinutes` type `integer`, bounds `5..1440`, default `60`
		- `limit` type `integer`, bounds `1..288`, default `24`
- Mutation-based parity regressions now prove strict-check failure when retention-status query parameter defaults drift from OpenAPI baseline.

## M6.22 Triage Mitigation Anchor And Verify-Export Media-Type Guardrail Coverage

- Contract checker request-schema-property assertions now include anomaly triage payload anchor for mitigation classification compatibility.
- Request schema property contract checks now enforce:
	- `POST /integrations/messaging/fault-injection/manifest/verify/attempts/retention/anomalies/{anomalyInstanceId}/triage`:
		- `MessagingFaultManifestVerifyAttemptAnomalyTriageRequest.mitigationType` type `string`
- Contract checker response media-type assertions now include verify-attempt export handoff compatibility gates.
- Response media-type contract checks now enforce:
	- `GET /integrations/messaging/fault-injection/manifest/verify/attempts/export` response `200` includes `application/json` and `text/csv`
- Mutation-based parity regressions now prove strict-check failure when triage `mitigationType` type or verify-attempt export `text/csv` content-type drifts from OpenAPI baseline.

## M6.23 Escalation-Export Response Component Property Anchor Guardrail Coverage

- Contract checker schema-property assertions now include escalation-export response component anchors for dashboard handoff payload compatibility.
- Schema property contract checks now enforce:
	- `MessagingFaultManifestVerifyAttemptEscalationExportResponse.escalations` type `array`
- Mutation-based parity regressions now prove strict-check failure when escalation-export response `escalations` property type drifts from OpenAPI baseline.

## M6.24 Escalation-Export Response Count Anchor Guardrail Coverage

- Contract checker schema-property assertions now include escalation-export response count anchors for dashboard handoff summary compatibility.
- Schema property contract checks now enforce:
	- `MessagingFaultManifestVerifyAttemptEscalationExportResponse.totalMatched` type `integer`
- Mutation-based parity regressions now prove strict-check failure when escalation-export response `totalMatched` property type drifts from OpenAPI baseline.

## M6.25 Escalation-Export Item Action-Required Anchor Guardrail Coverage

- Contract checker schema-property assertions now include escalation-export item action-required anchors for operator follow-up compatibility.
- Schema property contract checks now enforce:
	- `MessagingFaultManifestVerifyAttemptEscalationExportItem.escalationActionRequired` type `boolean`
- Mutation-based parity regressions now prove strict-check failure when escalation-export item `escalationActionRequired` property type drifts from OpenAPI baseline.

## M6.26 Escalation-Export Filter Triage-Acknowledged Anchor Guardrail Coverage

- Contract checker schema-property assertions now include escalation-export filter component anchors for triage-query compatibility.
- Schema property contract checks now enforce:
	- `MessagingFaultManifestVerifyAttemptEscalationExportFilters.triageAcknowledged` type `boolean`
- Mutation-based parity regressions now prove strict-check failure when escalation-export filter `triageAcknowledged` property type drifts from OpenAPI baseline.

## M6.27 Escalation-Export Response Returned Anchor Guardrail Coverage

- Contract checker schema-property assertions now include escalation-export response count anchors for handoff payload compatibility.
- Schema property contract checks now enforce:
	- `MessagingFaultManifestVerifyAttemptEscalationExportResponse.returned` type `integer`
- Mutation-based parity regressions now prove strict-check failure when escalation-export response `returned` property type drifts from OpenAPI baseline.

## M6.28 Escalation-Export Item Acknowledgement-SLA Anchor Guardrail Coverage

- Contract checker schema-property assertions now include escalation-export item acknowledgement-SLA anchors for operator breach-state compatibility.
- Schema property contract checks now enforce:
	- `MessagingFaultManifestVerifyAttemptEscalationExportItem.acknowledgementSlaBreached` type `boolean`
- Mutation-based parity regressions now prove strict-check failure when escalation-export item `acknowledgementSlaBreached` property type drifts from OpenAPI baseline.

## M6.29 Escalation-Export Filter Limit Anchor Guardrail Coverage

- Contract checker schema-property assertions now include escalation-export filter limit anchors for bounded export query compatibility.
- Schema property contract checks now enforce:
	- `MessagingFaultManifestVerifyAttemptEscalationExportFilters.limit` type `integer`
- Mutation-based parity regressions now prove strict-check failure when escalation-export filter `limit` property type drifts from OpenAPI baseline.

## M6.30 Escalation-Export Response Total-Tracked Anchor Guardrail Coverage

- Contract checker schema-property assertions now include escalation-export response count anchors for handoff summary compatibility.
- Schema property contract checks now enforce:
	- `MessagingFaultManifestVerifyAttemptEscalationExportResponse.totalTracked` type `integer`
- Mutation-based parity regressions now prove strict-check failure when escalation-export response `totalTracked` property type drifts from OpenAPI baseline.

## M6.31 Escalation-Export Filter Action-Required Anchor Guardrail Coverage

- Contract checker schema-property assertions now include escalation-export filter action-required anchors for operator follow-up query compatibility.
- Schema property contract checks now enforce:
	- `MessagingFaultManifestVerifyAttemptEscalationExportFilters.actionRequired` type `boolean`
- Mutation-based parity regressions now prove strict-check failure when escalation-export filter `actionRequired` property type drifts from OpenAPI baseline.

## M6.32 Escalation-Export Item Acknowledgement-Breach-Seconds Anchor Guardrail Coverage

- Contract checker schema-property assertions now include escalation-export item acknowledgement breach-duration anchors for SLA telemetry compatibility.
- Schema property contract checks now enforce:
	- `MessagingFaultManifestVerifyAttemptEscalationExportItem.acknowledgementSlaBreachSeconds` type `integer`
- Mutation-based parity regressions now prove strict-check failure when escalation-export item `acknowledgementSlaBreachSeconds` property type drifts from OpenAPI baseline.

## M6.33 Escalation-Export Item Triage-Notes-Count Anchor Guardrail Coverage

- Contract checker schema-property assertions now include escalation-export item triage note-count anchors for operator context compatibility.
- Schema property contract checks now enforce:
	- `MessagingFaultManifestVerifyAttemptEscalationExportItem.triageNotesCount` type `integer`
- Mutation-based parity regressions now prove strict-check failure when escalation-export item `triageNotesCount` property type drifts from OpenAPI baseline.

## M6.34 Escalation-Export Item Acknowledgement-Target Anchor Guardrail Coverage

- Contract checker schema-property assertions now include escalation-export item acknowledgement target anchors for SLA timing compatibility.
- Schema property contract checks now enforce:
	- `MessagingFaultManifestVerifyAttemptEscalationExportItem.acknowledgementSlaTargetSeconds` type `integer`
- Mutation-based parity regressions now prove strict-check failure when escalation-export item `acknowledgementSlaTargetSeconds` property type drifts from OpenAPI baseline.

## M6.35 Escalation-Export Filter Breached Anchor Guardrail Coverage

- Contract checker schema-property assertions now include escalation-export filter breach-state anchors for operator query compatibility.
- Schema property contract checks now enforce:
	- `MessagingFaultManifestVerifyAttemptEscalationExportFilters.breached` type `boolean`
- Mutation-based parity regressions now prove strict-check failure when escalation-export filter `breached` property type drifts from OpenAPI baseline.

## M6.36 Escalation-Export Item Triage-Acknowledged Anchor Guardrail Coverage

- Contract checker schema-property assertions now include escalation-export item triage-acknowledged anchors for operator context compatibility.
- Schema property contract checks now enforce:
	- `MessagingFaultManifestVerifyAttemptEscalationExportItem.triageAcknowledged` type `boolean`
- Mutation-based parity regressions now prove strict-check failure when escalation-export item `triageAcknowledged` property type drifts from OpenAPI baseline.

## M6.37 Escalation-Export Item Acknowledgement-Elapsed-Seconds Anchor Guardrail Coverage

- Contract checker schema-property assertions now include escalation-export item acknowledgement elapsed-seconds anchors for SLA timing compatibility.
- Schema property contract checks now enforce:
	- `MessagingFaultManifestVerifyAttemptEscalationExportItem.acknowledgementSlaElapsedSeconds` type `integer`
- Mutation-based parity regressions now prove strict-check failure when escalation-export item `acknowledgementSlaElapsedSeconds` property type drifts from OpenAPI baseline.

## M6.38 Escalation-Export Item Acknowledgement-Remaining-Seconds Anchor Guardrail Coverage

- Contract checker schema-property assertions now include escalation-export item acknowledgement remaining-seconds anchors for SLA timing compatibility.
- Schema property contract checks now enforce:
	- `MessagingFaultManifestVerifyAttemptEscalationExportItem.acknowledgementSlaRemainingSeconds` type `integer`
- Mutation-based parity regressions now prove strict-check failure when escalation-export item `acknowledgementSlaRemainingSeconds` property type drifts from OpenAPI baseline.

## M6.39 Escalation-Export Item Triage-Acknowledged-At Anchor Guardrail Coverage

- Contract checker schema-property assertions now include escalation-export item triage acknowledgement timestamp anchors for operator timeline compatibility.
- Schema property contract checks now enforce:
	- `MessagingFaultManifestVerifyAttemptEscalationExportItem.triageAcknowledgedAt` type `string`
- Mutation-based parity regressions now prove strict-check failure when escalation-export item `triageAcknowledgedAt` property type drifts from OpenAPI baseline.

## M6.40 Escalation-Export Item Triage-Acknowledged-By Anchor Guardrail Coverage

- Contract checker schema-property assertions now include escalation-export item triage acknowledgement actor anchors for operator attribution compatibility.
- Schema property contract checks now enforce:
	- `MessagingFaultManifestVerifyAttemptEscalationExportItem.triageAcknowledgedBy` type `string`
- Mutation-based parity regressions now prove strict-check failure when escalation-export item `triageAcknowledgedBy` property type drifts from OpenAPI baseline.

## M6.41 Escalation-Export Item Acknowledgement-SLA-Status Anchor Guardrail Coverage

- Contract checker schema-property assertions now include escalation-export item acknowledgement SLA status anchors for handoff-state compatibility.
- Schema property contract checks now enforce:
	- `MessagingFaultManifestVerifyAttemptEscalationExportItem.acknowledgementSlaStatus` type `string`
- Mutation-based parity regressions now prove strict-check failure when escalation-export item `acknowledgementSlaStatus` property type drifts from OpenAPI baseline.

## M6.42 Escalation-Export Item Escalation-State Anchor Guardrail Coverage

- Contract checker schema-property assertions now include escalation-export item escalation-state anchors for handoff-state compatibility.
- Schema property contract checks now enforce:
	- `MessagingFaultManifestVerifyAttemptEscalationExportItem.escalationState` type `string`
- Mutation-based parity regressions now prove strict-check failure when escalation-export item `escalationState` property type drifts from OpenAPI baseline.

## M6.43 Escalation-Export Item Escalation-Severity Anchor Guardrail Coverage

- Contract checker schema-property assertions now include escalation-export item escalation-severity anchors for handoff-state compatibility.
- Schema property contract checks now enforce:
	- `MessagingFaultManifestVerifyAttemptEscalationExportItem.escalationSeverity` type `string`
- Mutation-based parity regressions now prove strict-check failure when escalation-export item `escalationSeverity` property type drifts from OpenAPI baseline.

## M6.44 Escalation-Export Item Escalation-Trigger Anchor Guardrail Coverage

- Contract checker schema-property assertions now include escalation-export item escalation-trigger anchors for handoff-state compatibility.
- Schema property contract checks now enforce:
	- `MessagingFaultManifestVerifyAttemptEscalationExportItem.escalationTrigger` type `string`
- Mutation-based parity regressions now prove strict-check failure when escalation-export item `escalationTrigger` property type drifts from OpenAPI baseline.

## M6.45 Escalation-Export Item Escalation-Pending-Since Anchor Guardrail Coverage

- Contract checker schema-property assertions now include escalation-export item escalation pending-since anchors for handoff timeline compatibility.
- Schema property contract checks now enforce:
	- `MessagingFaultManifestVerifyAttemptEscalationExportItem.escalationPendingSince` type `string`
- Mutation-based parity regressions now prove strict-check failure when escalation-export item `escalationPendingSince` property type drifts from OpenAPI baseline.

## M6.46 Escalation-Export Item Escalation-Escalated-At Anchor Guardrail Coverage

- Contract checker schema-property assertions now include escalation-export item escalation escalated-at anchors for handoff timeline compatibility.
- Schema property contract checks now enforce:
	- `MessagingFaultManifestVerifyAttemptEscalationExportItem.escalationEscalatedAt` type `string`
- Mutation-based parity regressions now prove strict-check failure when escalation-export item `escalationEscalatedAt` property type drifts from OpenAPI baseline.

## M6.47 Escalation-Export Item Escalation-Resolved-At Anchor Guardrail Coverage

- Contract checker schema-property assertions now include escalation-export item escalation resolved-at anchors for handoff timeline compatibility.
- Schema property contract checks now enforce:
	- `MessagingFaultManifestVerifyAttemptEscalationExportItem.escalationResolvedAt` type `string`
- Mutation-based parity regressions now prove strict-check failure when escalation-export item `escalationResolvedAt` property type drifts from OpenAPI baseline.

## M6.48 Escalation-Export Item Escalation-Due-At Anchor Guardrail Coverage

- Contract checker schema-property assertions now include escalation-export item escalation due-at anchors for handoff timeline compatibility.
- Schema property contract checks now enforce:
	- `MessagingFaultManifestVerifyAttemptEscalationExportItem.escalationDueAt` type `string`
- Mutation-based parity regressions now prove strict-check failure when escalation-export item `escalationDueAt` property type drifts from OpenAPI baseline.

## M6.49 Escalation-Export Item First-Detected-At Anchor Guardrail Coverage

- Contract checker schema-property assertions now include escalation-export item first-detected-at anchors for anomaly timeline compatibility.
- Schema property contract checks now enforce:
	- `MessagingFaultManifestVerifyAttemptEscalationExportItem.firstDetectedAt` type `string`
- Mutation-based parity regressions now prove strict-check failure when escalation-export item `firstDetectedAt` property type drifts from OpenAPI baseline.

## M6.50 Escalation-Export Item Last-Detected-At Anchor Guardrail Coverage

- Contract checker schema-property assertions now include escalation-export item last-detected-at anchors for anomaly timeline compatibility.
- Schema property contract checks now enforce:
	- `MessagingFaultManifestVerifyAttemptEscalationExportItem.lastDetectedAt` type `string`
- Mutation-based parity regressions now prove strict-check failure when escalation-export item `lastDetectedAt` property type drifts from OpenAPI baseline.

## M6.51 Escalation-Export Item Recommended-Action Anchor Guardrail Coverage

- Contract checker schema-property assertions now include escalation-export item recommended-action anchors for operator mitigation guidance compatibility.
- Schema property contract checks now enforce:
	- `MessagingFaultManifestVerifyAttemptEscalationExportItem.recommendedAction` type `string`
- Mutation-based parity regressions now prove strict-check failure when escalation-export item `recommendedAction` property type drifts from OpenAPI baseline.

## M6.52 Escalation-Export Item Closed-At Anchor Guardrail Coverage

- Contract checker schema-property assertions now include escalation-export item closed-at anchors for anomaly lifecycle timeline compatibility.
- Schema property contract checks now enforce:
	- `MessagingFaultManifestVerifyAttemptEscalationExportItem.closedAt` type `string`
- Mutation-based parity regressions now prove strict-check failure when escalation-export item `closedAt` property type drifts from OpenAPI baseline.

## M6.53 Escalation-Export Item Closed-Reason Anchor Guardrail Coverage

- Contract checker schema-property assertions now include escalation-export item closed-reason anchors for anomaly lifecycle attribution compatibility.
- Schema property contract checks now enforce:
	- `MessagingFaultManifestVerifyAttemptEscalationExportItem.closedReason` type `string`
- Mutation-based parity regressions now prove strict-check failure when escalation-export item `closedReason` property type drifts from OpenAPI baseline.

## M6.54 Escalation-Export Item Anomaly-Key Anchor Guardrail Coverage

- Contract checker schema-property assertions now include escalation-export item anomaly-key anchors for anomaly classification compatibility.
- Schema property contract checks now enforce:
	- `MessagingFaultManifestVerifyAttemptEscalationExportItem.anomalyKey` type `string`
- Mutation-based parity regressions now prove strict-check failure when escalation-export item `anomalyKey` property type drifts from OpenAPI baseline.

## M6.55 Escalation-Export Item Anomaly-Severity Anchor Guardrail Coverage

- Contract checker schema-property assertions now include escalation-export item anomaly-severity anchors for anomaly classification compatibility.
- Schema property contract checks now enforce:
	- `MessagingFaultManifestVerifyAttemptEscalationExportItem.anomalySeverity` type `string`
- Mutation-based parity regressions now prove strict-check failure when escalation-export item `anomalySeverity` property type drifts from OpenAPI baseline.

## M6.56 Escalation-Export Item Anomaly-Status Anchor Guardrail Coverage

- Contract checker schema-property assertions now include escalation-export item anomaly-status anchors for anomaly lifecycle-state compatibility.
- Schema property contract checks now enforce:
	- `MessagingFaultManifestVerifyAttemptEscalationExportItem.anomalyStatus` type `string`
- Mutation-based parity regressions now prove strict-check failure when escalation-export item `anomalyStatus` property type drifts from OpenAPI baseline.

## M6.57 Escalation-Export Filters Include-Recently-Closed Anchor Guardrail Coverage

- Contract checker schema-property assertions now include escalation-export filters include-recently-closed anchors for export policy filter compatibility.
- Schema property contract checks now enforce:
	- `MessagingFaultManifestVerifyAttemptEscalationExportFilters.includeRecentlyClosed` type `boolean`
- Mutation-based parity regressions now prove strict-check failure when escalation-export filters `includeRecentlyClosed` property type drifts from OpenAPI baseline.

## M6.58 Escalation-Export Filters State Anchor Guardrail Coverage

- Contract checker schema-property assertions now include escalation-export filters state anchors for export filter compatibility.
- Schema property contract checks now enforce:
	- `MessagingFaultManifestVerifyAttemptEscalationExportFilters.state` type `array`
- Mutation-based parity regressions now prove strict-check failure when escalation-export filters `state` property type drifts from OpenAPI baseline.

## M6.59 Escalation-Export Filters Acknowledgement-SLA-Status Anchor Guardrail Coverage

- Contract checker schema-property assertions now include escalation-export filters acknowledgement-SLA-status anchors for export filter compatibility.
- Schema property contract checks now enforce:
	- `MessagingFaultManifestVerifyAttemptEscalationExportFilters.acknowledgementSlaStatus` type `array`
- Mutation-based parity regressions now prove strict-check failure when escalation-export filters `acknowledgementSlaStatus` property type drifts from OpenAPI baseline.

## M6.60 Escalation-Export Item Anomaly-Instance-Id Anchor Guardrail Coverage

- Contract checker schema-property assertions now include escalation-export item anomaly-instance-id anchors for anomaly identity compatibility.
- Schema property contract checks now enforce:
	- `MessagingFaultManifestVerifyAttemptEscalationExportItem.anomalyInstanceId` type `string`
- Mutation-based parity regressions now prove strict-check failure when escalation-export item `anomalyInstanceId` property type drifts from OpenAPI baseline.

## M6.61 Escalation-Export Response Exported-At Anchor Guardrail Coverage

- Contract checker schema-property assertions now include escalation-export response exported-at anchors for export metadata compatibility.
- Schema property contract checks now enforce:
	- `MessagingFaultManifestVerifyAttemptEscalationExportResponse.exportedAt` type `string`
- Mutation-based parity regressions now prove strict-check failure when escalation-export response `exportedAt` property type drifts from OpenAPI baseline.

## M6.62 Escalation-Export Response Format Anchor Guardrail Coverage

- Contract checker schema-property assertions now include escalation-export response format anchors for export metadata compatibility.
- Schema property contract checks now enforce:
	- `MessagingFaultManifestVerifyAttemptEscalationExportResponse.format` type `string`
- Mutation-based parity regressions now prove strict-check failure when escalation-export response `format` property type drifts from OpenAPI baseline.

## M6.63 Escalation-Export Filters Escalation-Severity Anchor Guardrail Coverage

- Contract checker schema-property assertions now include escalation-export filters escalation-severity anchors for export filter compatibility.
- Schema property contract checks now enforce:
	- `MessagingFaultManifestVerifyAttemptEscalationExportFilters.escalationSeverity` type `array`
- Mutation-based parity regressions now prove strict-check failure when escalation-export filters `escalationSeverity` property type drifts from OpenAPI baseline.

## M6.64 Escalation-Export Diagnostics Retention-Endpoint Anchor Guardrail Coverage

- Contract checker schema-property assertions now include escalation-export diagnostics retention-endpoint anchors for operator handoff metadata compatibility.
- Schema property contract checks now enforce:
	- `MessagingFaultManifestVerifyAttemptEscalationExportDiagnostics.retentionEndpoint` type `string`
- Mutation-based parity regressions now prove strict-check failure when escalation-export diagnostics `retentionEndpoint` property type drifts from OpenAPI baseline.

## M6.65 Escalation-Export Diagnostics Retention-Trend-Endpoint Anchor Guardrail Coverage

- Contract checker schema-property assertions now include escalation-export diagnostics retention-trend-endpoint anchors for operator handoff metadata compatibility.
- Schema property contract checks now enforce:
	- `MessagingFaultManifestVerifyAttemptEscalationExportDiagnostics.retentionTrendEndpoint` type `string`
- Mutation-based parity regressions now prove strict-check failure when escalation-export diagnostics `retentionTrendEndpoint` property type drifts from OpenAPI baseline.

## M6.66 Escalation-Export Diagnostics Anomaly-Triage-Template Anchor Guardrail Coverage

- Contract checker schema-property assertions now include escalation-export diagnostics anomaly-triage-template anchors for operator handoff metadata compatibility.
- Schema property contract checks now enforce:
	- `MessagingFaultManifestVerifyAttemptEscalationExportDiagnostics.retentionAnomalyTriageEndpointTemplate` type `string`
- Mutation-based parity regressions now prove strict-check failure when escalation-export diagnostics `retentionAnomalyTriageEndpointTemplate` property type drifts from OpenAPI baseline.

## M6.67 Escalation-Export Diagnostics Escalation-Export-Template Anchor Guardrail Coverage

- Contract checker schema-property assertions now include escalation-export diagnostics escalation-export-template anchors for operator handoff metadata compatibility.
- Schema property contract checks now enforce:
	- `MessagingFaultManifestVerifyAttemptEscalationExportDiagnostics.retentionEscalationExportEndpointTemplate` type `string`
- Mutation-based parity regressions now prove strict-check failure when escalation-export diagnostics `retentionEscalationExportEndpointTemplate` property type drifts from OpenAPI baseline.

## M6.68 Escalation-Export Policy Enabled Anchor Guardrail Coverage

- Contract checker schema-property assertions now include escalation-export policy enabled anchors for export policy compatibility.
- Schema property contract checks now enforce:
	- `MessagingFaultManifestVerifyAttemptEscalationExportPolicy.enabled` type `boolean`
- Mutation-based parity regressions now prove strict-check failure when escalation-export policy `enabled` property type drifts from OpenAPI baseline.

## M6.69 Escalation-Export Policy Default-Format Anchor Guardrail Coverage

- Contract checker schema-property assertions now include escalation-export policy default-format anchors for export policy compatibility.
- Schema property contract checks now enforce:
	- `MessagingFaultManifestVerifyAttemptEscalationExportPolicy.defaultFormat` type `string`
- Mutation-based parity regressions now prove strict-check failure when escalation-export policy `defaultFormat` property type drifts from OpenAPI baseline.

## M6.70 Escalation-Export Policy Max-Export-Rows Anchor Guardrail Coverage

- Contract checker schema-property assertions now include escalation-export policy max-export-rows anchors for export policy compatibility.
- Schema property contract checks now enforce:
	- `MessagingFaultManifestVerifyAttemptEscalationExportPolicy.maxExportRows` type `integer`
- Mutation-based parity regressions now prove strict-check failure when escalation-export policy `maxExportRows` property type drifts from OpenAPI baseline.

## M6.71 Escalation-Export Policy Include-Recently-Closed-By-Default Anchor Guardrail Coverage

- Contract checker schema-property assertions now include escalation-export policy include-recently-closed-by-default anchors for export policy compatibility.
- Schema property contract checks now enforce:
	- `MessagingFaultManifestVerifyAttemptEscalationExportPolicy.includeRecentlyClosedByDefault` type `boolean`
- Mutation-based parity regressions now prove strict-check failure when escalation-export policy `includeRecentlyClosedByDefault` property type drifts from OpenAPI baseline.

## M6.72 Escalation-Export Response Policy Property Anchor Guardrail Coverage

- Contract checker schema-property assertions now include escalation-export response policy-property anchors for response payload compatibility.
- Schema property contract checks now enforce:
	- `MessagingFaultManifestVerifyAttemptEscalationExportResponse.policy` property presence
- Mutation-based parity regressions now prove strict-check failure when escalation-export response `policy` property is removed from OpenAPI baseline.

## M6.73 Escalation-Export Response Filters Property Anchor Guardrail Coverage

- Contract checker schema-property assertions now include escalation-export response filters-property anchors for response payload compatibility.
- Schema property contract checks now enforce:
	- `MessagingFaultManifestVerifyAttemptEscalationExportResponse.filters` property presence
- Mutation-based parity regressions now prove strict-check failure when escalation-export response `filters` property is removed from OpenAPI baseline.

## M6.74 Escalation-Export Response Diagnostics Property Anchor Guardrail Coverage

- Contract checker schema-property assertions now include escalation-export response diagnostics-property anchors for response payload compatibility.
- Schema property contract checks now enforce:
	- `MessagingFaultManifestVerifyAttemptEscalationExportResponse.diagnostics` property presence
- Mutation-based parity regressions now prove strict-check failure when escalation-export response `diagnostics` property is removed from OpenAPI baseline.

## M6.75 Escalation-Export Item Diagnostics Property Anchor Guardrail Coverage

- Contract checker schema-property assertions now include escalation-export item diagnostics-property anchors for response payload compatibility.
- Schema property contract checks now enforce:
	- `MessagingFaultManifestVerifyAttemptEscalationExportItem.diagnostics` property presence
- Mutation-based parity regressions now prove strict-check failure when escalation-export item `diagnostics` property is removed from OpenAPI baseline.

## M6.76 Retention-Apply Request Escalation-Policy Property Anchor Guardrail Coverage

- Contract checker schema-property assertions now include retention-apply request escalation-policy-property anchors for request payload compatibility.
- Schema property contract checks now enforce:
	- `MessagingFaultManifestVerifyAttemptRetentionApplyRequest.escalationPolicy` property presence
- Mutation-based parity regressions now prove strict-check failure when retention-apply request `escalationPolicy` property is removed from OpenAPI baseline.

## M6.77 Retention-Apply Request Escalation-Export-Policy Property Anchor Guardrail Coverage

- Contract checker schema-property assertions now include retention-apply request escalation-export-policy-property anchors for request payload compatibility.
- Schema property contract checks now enforce:
	- `MessagingFaultManifestVerifyAttemptRetentionApplyRequest.escalationExportPolicy` property presence
- Mutation-based parity regressions now prove strict-check failure when retention-apply request `escalationExportPolicy` property is removed from OpenAPI baseline.

## M6.78 Retention-Apply Response Applied-At Anchor Guardrail Coverage

- Contract checker schema-property assertions now include retention-apply response applied-at anchors for response payload compatibility.
- Schema property contract checks now enforce:
	- `MessagingFaultManifestVerifyAttemptRetentionApplyResponse.appliedAt` type `string`
- Mutation-based parity regressions now prove strict-check failure when retention-apply response `appliedAt` property type drifts from OpenAPI baseline.

## M6.79 Retention-Apply Response Telemetry Property Anchor Guardrail Coverage

- Contract checker schema-property assertions now include retention-apply response telemetry-property anchors for response payload compatibility.
- Schema property contract checks now enforce:
	- `MessagingFaultManifestVerifyAttemptRetentionApplyResponse.telemetry` property presence
- Mutation-based parity regressions now prove strict-check failure when retention-apply response `telemetry` property is removed from OpenAPI baseline.

## M6.80 Retention-Apply Response Diagnostics Anchor Guardrail Coverage

- Contract checker schema-property assertions now include retention-apply response diagnostics anchors for response payload compatibility.
- Schema property contract checks now enforce:
	- `MessagingFaultManifestVerifyAttemptRetentionApplyResponse.diagnostics` type `object`
- Mutation-based parity regressions now prove strict-check failure when retention-apply response `diagnostics` property type drifts from OpenAPI baseline.

## M6.81 Retention-Status Response Retention Property Anchor Guardrail Coverage

- Contract checker schema-property assertions now include retention-status response retention-property anchors for response payload compatibility.
- Schema property contract checks now enforce:
	- `MessagingFaultManifestVerifyAttemptRetentionStatusResponse.retention` property presence
- Mutation-based parity regressions now prove strict-check failure when retention-status response `retention` property is removed from OpenAPI baseline.

## M6.82 Retention-Status Response Telemetry Property Anchor Guardrail Coverage

- Contract checker schema-property assertions now include retention-status response telemetry-property anchors for response payload compatibility.
- Schema property contract checks now enforce:
	- `MessagingFaultManifestVerifyAttemptRetentionStatusResponse.telemetry` property presence
- Mutation-based parity regressions now prove strict-check failure when retention-status response `telemetry` property is removed from OpenAPI baseline.

## M6.83 Retention-Status Response Diagnostics Property Anchor Guardrail Coverage

- Contract checker schema-property assertions now include retention-status response diagnostics-property anchors for response payload compatibility.
- Schema property contract checks now enforce:
	- `MessagingFaultManifestVerifyAttemptRetentionStatusResponse.diagnostics` property presence
- Mutation-based parity regressions now prove strict-check failure when retention-status response `diagnostics` property is removed from OpenAPI baseline.

## M6.84 Retention-Saturation-Trend Response Queried-At Anchor Guardrail Coverage

- Contract checker schema-property assertions now include retention-saturation-trend response queried-at anchors for response payload compatibility.
- Schema property contract checks now enforce:
	- `MessagingFaultManifestVerifyAttemptRetentionSaturationTrendResponse.queriedAt` type `string`
- Mutation-based parity regressions now prove strict-check failure when retention-saturation-trend response `queriedAt` property type drifts from OpenAPI baseline.

## M6.85 Retention-Saturation-Trend Response Snapshots Anchor Guardrail Coverage

- Contract checker schema-property assertions now include retention-saturation-trend response snapshots anchors for response payload compatibility.
- Schema property contract checks now enforce:
	- `MessagingFaultManifestVerifyAttemptRetentionSaturationTrendResponse.snapshots` type `array`
- Mutation-based parity regressions now prove strict-check failure when retention-saturation-trend response `snapshots` property type drifts from OpenAPI baseline.

## M6.86 Retention-Saturation-Trend Response Diagnostics Anchor Guardrail Coverage

- Contract checker schema-property assertions now include retention-saturation-trend response diagnostics anchors for response payload compatibility.
- Schema property contract checks now enforce:
	- `MessagingFaultManifestVerifyAttemptRetentionSaturationTrendResponse.diagnostics` type `object`
- Mutation-based parity regressions now prove strict-check failure when retention-saturation-trend response `diagnostics` property type drifts from OpenAPI baseline.

## M6.87 Retention-Saturation-Trend Response Query Anchor Guardrail Coverage

- Contract checker schema-property assertions now include retention-saturation-trend response query anchors for response payload compatibility.
- Schema property contract checks now enforce:
	- `MessagingFaultManifestVerifyAttemptRetentionSaturationTrendResponse.query` type `object`
- Mutation-based parity regressions now prove strict-check failure when retention-saturation-trend response `query` property type drifts from OpenAPI baseline.

## M6.88 Retention-Saturation-Trend Response Summary Property Anchor Guardrail Coverage

- Contract checker schema-property assertions now include retention-saturation-trend response summary-property anchors for response payload compatibility.
- Schema property contract checks now enforce:
	- `MessagingFaultManifestVerifyAttemptRetentionSaturationTrendResponse.summary` property presence
- Mutation-based parity regressions now prove strict-check failure when retention-saturation-trend response `summary` property is removed from OpenAPI baseline.

## M6.89 Retention-Saturation-Trend Response Latest-Saturation Property Anchor Guardrail Coverage

- Contract checker schema-property assertions now include retention-saturation-trend response latest-saturation-property anchors for response payload compatibility.
- Schema property contract checks now enforce:
	- `MessagingFaultManifestVerifyAttemptRetentionSaturationTrendResponse.latestSaturation` property presence
- Mutation-based parity regressions now prove strict-check failure when retention-saturation-trend response `latestSaturation` property is removed from OpenAPI baseline.

## M6.90 Retention-Apply Response Retention Anchor Guardrail Coverage

- Contract checker schema-property assertions now include retention-apply response retention anchors for response payload compatibility.
- Schema property contract checks now enforce:
	- `MessagingFaultManifestVerifyAttemptRetentionApplyResponse.retention` type `object`
- Mutation-based parity regressions now prove strict-check failure when retention-apply response `retention` property type drifts from OpenAPI baseline.

## M6.91 Retention-Policy Dedupe-Window-Seconds Anchor Guardrail Coverage

- Contract checker schema-property assertions now include retention-policy dedupe-window-seconds anchors for policy payload compatibility.
- Schema property contract checks now enforce:
	- `MessagingFaultManifestVerifyAttemptRetentionPolicy.dedupeWindowSeconds` type `integer`
- Mutation-based parity regressions now prove strict-check failure when retention-policy `dedupeWindowSeconds` property type drifts from OpenAPI baseline.

## M6.92 Retention-Policy Max-Entries Anchor Guardrail Coverage

- Contract checker schema-property assertions now include retention-policy max-entries anchors for policy payload compatibility.
- Schema property contract checks now enforce:
	- `MessagingFaultManifestVerifyAttemptRetentionPolicy.maxEntries` type `integer`
- Mutation-based parity regressions now prove strict-check failure when retention-policy `maxEntries` property type drifts from OpenAPI baseline.

## M6.93 Retention-Policy Min-Dedupe-Window-Seconds Anchor Guardrail Coverage

- Contract checker schema-property assertions now include retention-policy min-dedupe-window-seconds anchors for policy payload compatibility.
- Schema property contract checks now enforce:
	- `MessagingFaultManifestVerifyAttemptRetentionPolicy.minDedupeWindowSeconds` type `integer`
- Mutation-based parity regressions now prove strict-check failure when retention-policy `minDedupeWindowSeconds` property type drifts from OpenAPI baseline.

## M6.94 Retention-Policy Max-Dedupe-Window-Seconds Anchor Guardrail Coverage

- Contract checker schema-property assertions now include retention-policy max-dedupe-window-seconds anchors for policy payload compatibility.
- Schema property contract checks now enforce:
	- `MessagingFaultManifestVerifyAttemptRetentionPolicy.maxDedupeWindowSeconds` type `integer`
- Mutation-based parity regressions now prove strict-check failure when retention-policy `maxDedupeWindowSeconds` property type drifts from OpenAPI baseline.

## M6.95 Retention-Policy Min-Max-Entries Anchor Guardrail Coverage

- Contract checker schema-property assertions now include retention-policy min-max-entries anchors for policy payload compatibility.
- Schema property contract checks now enforce:
	- `MessagingFaultManifestVerifyAttemptRetentionPolicy.minMaxEntries` type `integer`
- Mutation-based parity regressions now prove strict-check failure when retention-policy `minMaxEntries` property type drifts from OpenAPI baseline.

## M5 Reporting Consolidation Guidance

- M5 delivery was broad and valid but became too granular in reporting.
- Recommended grouped reporting labels:
	- `M5-A` adapters and readiness (`M5.1-M5.4`)
	- `M5-B` fault evidence trust chain (`M5.5-M5.9`)
	- `M5-C` replay forensics and retention telemetry (`M5.10-M5.15`)
	- `M5-D` anomaly lifecycle, escalation, SLA, and handoff export (`M5.16-M5.19`)

## Current Allowlisted Drifts

- None. M1.3 reconciled previous allowlisted drift for `api-gateway`, `ehr-service`, `lab-service`, and `billing-service`.
