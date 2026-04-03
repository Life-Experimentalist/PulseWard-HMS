# PulseWard API Catalog

## Purpose

This document is a quick-reference map of currently implemented API surfaces.
For field-level schemas, always use each service OpenAPI file as the canonical contract.

## Canonical Contract Sources

- `services/api-gateway/openapi.yaml`
- `services/auth-service/openapi.yaml`
- `services/appointment-service/openapi.yaml`
- `services/notification-service/openapi.yaml`
- `services/patient-service/openapi.yaml`
- `services/ehr-service/openapi.yaml`
- `services/lab-service/openapi.yaml`
- `services/pharmacy-service/openapi.yaml`
- `services/billing-service/openapi.yaml`

## API Base Paths

| Service              | Primary base path             | Notes                                          |
| -------------------- | ----------------------------- | ---------------------------------------------- |
| API Gateway          | `/`                           | Routes traffic to service backends.            |
| Auth Service         | `/api/v1`                     | Also mounted at `/api` in local runtime.       |
| Appointment Service  | `/api/v1`                     | Also mounted at `/api` in local runtime.       |
| Notification Service | `/api/v1`                     | Also mounted at `/api` in local runtime.       |
| Patient Service      | `/api/patients`               | CRUD patient profile routes.                   |
| EHR Service          | `/ehr` and `/api/ehr`         | Runtime/spec aligned in M1.3.                  |
| Lab Service          | `/api/lab-tests`              | M3.5 order/result/report workflow surface.     |
| Pharmacy Service     | `/api/pharmacy`               | CRUD pharmacy routes.                          |
| Billing Service      | `/billing` and `/api/billing` | M3.6 clinical trigger hook processing surface. |

## Auth Service Highlights

Under `/api/v1`:

| Method | Endpoint                                     | Purpose                                                                                                                     |
| ------ | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/auth/roles`                                | List supported role keys.                                                                                                   |
| GET    | `/auth/session/events`                       | Query role-scoped auth session observability events with tenant/action/outcome filters.                                     |
| POST   | `/auth/workflow-entry/check`                 | Evaluate tenant policy, role compatibility, and MFA state before patient or clinical workflow entry.                        |
| POST   | `/auth/otp/request`                          | Create tenant-scoped OTP challenge for policy-driven MFA.                                                                   |
| POST   | `/auth/otp/verify`                           | Verify OTP challenge and return short-lived OTP verification token.                                                         |
| POST   | `/auth/register`                             | Register role-scoped user.                                                                                                  |
| POST   | `/auth/login`                                | Role login with tenant policy checks, optional MFA requirement, role-provider compatibility, and policy-driven session TTL. |
| GET    | `/auth/oauth/providers`                      | OAuth provider readiness list (environment + tenant policy).                                                                |
| GET    | `/auth/oauth/google/start`                   | Google OAuth bootstrap URL with tenant policy guard.                                                                        |
| POST   | `/auth/oauth/google/callback`                | Exchange callback payload for JWT with tenant policy guard and role-driven session TTL.                                     |
| GET    | `/auth/oauth/clerk/start`                    | Clerk bootstrap metadata with tenant policy guard.                                                                          |
| GET    | `/auth/oauth/google/config-status`           | Google OAuth env readiness probe.                                                                                           |
| GET    | `/platform/abha/config-status`               | ABHA config readiness probe.                                                                                                |
| GET    | `/platform/abha/health-check`                | ABHA gateway reachability check.                                                                                            |
| GET    | `/platform/abha/health-check/evidence`       | ABHA incident-drill evidence feed with recent gateway check outcomes and summary counters.                                  |
| GET    | `/platform/abha/consent-flow/simulation`     | ABHA consent workflow simulation checkpoints for operational drill scenarios.                                               |
| GET    | `/platform/abha/fallback-decision/telemetry` | ABHA fallback decision telemetry for config, gateway, and consent drill scenarios.                                          |
| GET    | `/platform/abha/operational-readiness`       | ABHA operational readiness summary with runbook-linked setup and rollback checklists.                                       |
| POST   | `/platform/abha/transactions/read`           | Consent-aware ABHA transactional read with dry-run default, fallback safety, and optional live gateway execution.          |
| POST   | `/platform/abha/transactions/write`          | Consent-aware ABHA transactional write with dry-run default, fallback safety, and optional live gateway execution.         |
| GET    | `/platform/abha/transactions/evidence`       | ABHA transactional evidence feed with operation/status filters and outcome summaries for audit and drill handoff.          |
| GET    | `/admin/settings/storage`                    | Admin settings store metadata.                                                                                              |
| GET    | `/admin/settings`                            | Read tenant admin settings.                                                                                                 |
| PUT    | `/admin/settings`                            | Persist tenant admin settings.                                                                                              |
| POST   | `/admin/settings/auth-policy/validate`       | Validate tenant auth policy payload.                                                                                        |
| GET    | `/platform/domain-config`                    | Resolve tenant domain config.                                                                                               |
| POST   | `/platform/domain-config/validate`           | Validate origin for tenant.                                                                                                 |
| GET    | `/platform/domain-config/all`                | Return full domain config model.                                                                                            |

## Notification Service Highlights

Under `/api/v1`:

| Method | Endpoint                                                                                                          | Purpose                                                                                                                                            |
| ------ | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/notifications`                                                                                                  | List notifications.                                                                                                                                |
| POST   | `/notifications`                                                                                                  | Create notification.                                                                                                                               |
| GET    | `/integrations/appointments/events`                                                                               | List appointment lifecycle event receipts.                                                                                                         |
| POST   | `/integrations/appointments/events`                                                                               | Ingest appointment lifecycle event with dedupe.                                                                                                    |
| GET    | `/integrations/appointments/events/{id}`                                                                          | Fetch appointment event receipt by id.                                                                                                             |
| GET    | `/notifications/{id}`                                                                                             | Fetch notification by id.                                                                                                                          |
| DELETE | `/notifications/{id}`                                                                                             | Delete notification by id.                                                                                                                         |
| GET    | `/integrations/messaging/providers`                                                                               | List tenant messaging providers.                                                                                                                   |
| POST   | `/integrations/messaging/test`                                                                                    | Trigger provider test delivery (dry run or live).                                                                                                  |
| GET    | `/integrations/messaging/telegram/setup`                                                                          | Telegram bootstrap checklist.                                                                                                                      |
| GET    | `/integrations/messaging/telegram/config-status`                                                                  | Telegram secret/config readiness.                                                                                                                  |
| GET    | `/integrations/messaging/whatsapp/setup`                                                                          | WhatsApp Cloud onboarding checklist.                                                                                                               |
| GET    | `/integrations/messaging/whatsapp/config-status`                                                                  | WhatsApp secret/config readiness.                                                                                                                  |
| GET    | `/integrations/messaging/email/config-status`                                                                     | SMTP secret/config readiness.                                                                                                                      |
| GET    | `/integrations/messaging/webhook/diagnostics`                                                                     | Website webhook routing, endpoint, and signing-secret diagnostics summary.                                                                         |
| GET    | `/integrations/messaging/retry-policy`                                                                            | Provider retry mode, backoff, jitter controls, and channel coverage diagnostics.                                                                   |
| GET    | `/integrations/messaging/fault-injection/simulate`                                                                | Simulate connector fault scenarios and expected retry/fallback actions.                                                                            |
| GET    | `/integrations/messaging/fault-injection/events`                                                                  | List recorded fault-injection events with tenant/provider/scenario filters.                                                                        |
| GET    | `/integrations/messaging/fault-injection/export`                                                                  | Export fault-injection evidence feed in JSON or CSV for incident handoff.                                                                          |
| GET    | `/integrations/messaging/fault-injection/manifest`                                                                | Generate signed evidence manifest for cross-team incident handoff traceability.                                                                    |
| POST   | `/integrations/messaging/fault-injection/manifest/verify`                                                         | Verify digest/signature plus replay-defense checks and suppress duplicate replay-attempt submissions within dedupe window.                         |
| GET    | `/integrations/messaging/fault-injection/manifest/verify/attempts`                                                | Query manifest verification replay-attempt audit history for incident forensics and suppression evidence.                                          |
| GET    | `/integrations/messaging/fault-injection/manifest/verify/attempts/export`                                         | Export replay-attempt audit snapshots in JSON or CSV for postmortem handoff workflows.                                                             |
| GET    | `/integrations/messaging/fault-injection/manifest/verify/attempts/retention`                                      | Show retention policy, anomaly lifecycle closure feed, escalation telemetry, and acknowledgement-SLA aggregates for replay-attempt operations.     |
| GET    | `/integrations/messaging/fault-injection/manifest/verify/attempts/retention/saturation-trend`                     | Query trend snapshots with anomaly instance ids, closure metadata, escalation summaries, and acknowledgement-SLA state using time-window controls. |
| GET    | `/integrations/messaging/fault-injection/manifest/verify/attempts/retention/escalations/export`                   | Export anomaly escalation and acknowledgement-SLA telemetry in JSON or CSV for incident handoff and shift-transfer evidence.                       |
| POST   | `/integrations/messaging/fault-injection/manifest/verify/attempts/retention/anomalies/{anomalyInstanceId}/triage` | Acknowledge one replay-attempt anomaly instance, append triage notes, and update mitigation/escalation state.                                      |
| POST   | `/integrations/messaging/fault-injection/manifest/verify/attempts/retention/apply`                                | Apply replay-attempt retention tuning plus escalation and escalation-export policy controls and return updated saturation/trend diagnostics.       |
| GET    | `/integrations/messaging/fault-injection/retention`                                                               | Show active retention controls and telemetry window diagnostics.                                                                                   |
| POST   | `/integrations/messaging/fault-injection/retention/apply`                                                         | Apply retention max and optional immediate prune for fault telemetry.                                                                              |
| POST   | `/integrations/messaging/webhook/signature/verify`                                                                | Verify webhook signature payloads against configured tenant signing secret.                                                                        |

## Appointment Service Highlights

Under `/api/v1`:

OPD management alignment:
- OPD registration and frontdesk scheduling flows should be implemented on top of the appointment lifecycle endpoints below.
- OPD workflow milestones should treat create/update/cancel appointment operations as the canonical scheduling surface.

| Method | Endpoint                                               | Purpose                                                                                            |
| ------ | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| GET    | `/appointments`                                        | List appointments.                                                                                 |
| GET    | `/appointments/{id}`                                   | Fetch appointment by id.                                                                           |
| POST   | `/appointments`                                        | Create appointment with role checks, idempotent retry handling, and slot-conflict validation.      |
| PUT    | `/appointments/{id}`                                   | Update appointment with lifecycle transition checks, version checks, and slot-conflict validation. |
| DELETE | `/appointments/{id}`                                   | Cancel appointment as a guarded lifecycle transition (non-destructive cancel semantics).           |
| GET    | `/opd/entries`                                         | List OPD intake entries with tenant/status/triage filters.                                         |
| POST   | `/opd/entries`                                         | Create OPD intake entry and optional appointment draft handoff.                                    |
| GET    | `/integrations/calendars/providers`                    | List calendar providers.                                                                           |
| POST   | `/integrations/calendars/test`                         | Test calendar booking flow.                                                                        |
| GET    | `/integrations/calendars/interoperability/diagnostics` | Report calendar routing fallback and interoperability readiness diagnostics.                       |
| GET    | `/integrations/notifications/dispatch-events`          | List lifecycle notification dispatch attempts for delivery audit/debug.                            |
| GET    | `/integrations/notifications/dead-letter`              | List dead-letter records for missed or delayed reminder dispatch workflows.                        |
| GET    | `/integrations/notifications/dispatch-telemetry`       | Return dispatch reliability counters and missed/delayed reminder telemetry summaries.              |

Lifecycle reliability notes:
- Appointment lifecycle states are transition-guarded (`pending-triage -> scheduled -> checked-in -> in-consultation -> completed`) with controlled cancel/no-show paths.
- Scheduling writes reject clinician slot overlaps and stale version updates with conflict error semantics.
- Client request id keys can replay safe create retries without duplicate appointment creation.
- Lifecycle events are dispatched to notification-service with propagated correlation-id and retry-safe delivery semantics.
- Dispatch dead-letter records now capture endpoint-not-configured, retry-exhausted, and late-delivery reminder outcomes.
- Dispatch telemetry counters now report missed and delayed reminder trends for operational alerting workflows.
- Calendar interoperability diagnostics now expose default/fallback routing readiness and cross-provider handoff signals.
- Webhook diagnostics now expose website-hook routing coverage, endpoint URL validity, and signing-secret readiness.

## EHR Service Highlights

Under `/ehr` (also mounted at `/api/ehr`):

| Method | Endpoint                                               | Purpose                                                                         |
| ------ | ------------------------------------------------------ | ------------------------------------------------------------------------------- |
| GET    | `/records`                                             | List EHR records with patient/tenant filters and deleted-record controls.       |
| POST   | `/records`                                             | Create EHR record with actor-role validation and timeline seed event.           |
| GET    | `/records/{id}`                                        | Retrieve EHR record by record id (with optional deleted-record visibility).     |
| PUT    | `/records/{id}`                                        | Update EHR record with optimistic version checks for write-path integrity.      |
| DELETE | `/records/{id}`                                        | Soft-delete EHR record while preserving timeline continuity.                    |
| GET    | `/records/{id}/timeline`                               | Fetch immutable timeline/history events for clinical create/update/delete flow. |
| GET    | `/records/{id}/prescriptions`                          | List prescription entries linked to an EHR record.                              |
| POST   | `/records/{id}/prescriptions`                          | Create prescription within EHR clinical context.                                |
| POST   | `/records/{id}/prescriptions/{prescriptionId}/handoff` | Mark prescription as handed-off and emit pharmacy touchpoint metadata.          |
| PATCH  | `/records/{id}/prescriptions/{prescriptionId}/status`  | Sync prescription lifecycle status updates back into EHR timeline.              |

## Lab Service Highlights

Under `/api` with OpenAPI paths rooted at `/lab-tests`:

| Method | Endpoint                          | Purpose                                                                 |
| ------ | --------------------------------- | ----------------------------------------------------------------------- |
| GET    | `/lab-tests`                      | List cataloged lab tests.                                               |
| POST   | `/lab-tests`                      | Create lab test catalog entry.                                          |
| PUT    | `/lab-tests/{id}`                 | Update lab test catalog entry.                                          |
| DELETE | `/lab-tests/{id}`                 | Delete lab test catalog entry.                                          |
| GET    | `/lab-tests/orders`               | List lab orders with tenant/patient/status filters.                     |
| POST   | `/lab-tests/orders`               | Create lab order and emit clinical trigger alignment metadata.          |
| GET    | `/lab-tests/orders/{id}`          | Fetch lab order details by id.                                          |
| PUT    | `/lab-tests/orders/{id}/status`   | Progress lab order lifecycle state.                                     |
| POST   | `/lab-tests/orders/{id}/result`   | Record result payload and mark order as result-ready.                   |
| POST   | `/lab-tests/orders/{id}/report`   | Mark result as reported and emit EHR/billing downstream trigger events. |
| GET    | `/lab-tests/orders/{id}/triggers` | Retrieve emitted clinical trigger history for a lab order.              |

## Pharmacy Service Highlights

Under `/api/pharmacy`:

| Method | Endpoint                     | Purpose                                                            |
| ------ | ---------------------------- | ------------------------------------------------------------------ |
| GET    | `/medications`               | List medication inventory.                                         |
| POST   | `/medications`               | Create medication inventory entry.                                 |
| GET    | `/medications/{id}`          | Fetch medication inventory entry by id.                            |
| PUT    | `/medications/{id}`          | Update medication inventory entry.                                 |
| DELETE | `/medications/{id}`          | Delete medication inventory entry.                                 |
| GET    | `/prescriptions`             | List pharmacy prescription orders by tenant/status filters.        |
| GET    | `/prescriptions/{id}`        | Fetch pharmacy prescription order by order or prescription id.     |
| POST   | `/prescriptions/handoff`     | Receive EHR prescription handoff into pharmacy queue.              |
| PUT    | `/prescriptions/{id}/status` | Update pharmacy prescription lifecycle status with history events. |

## Billing Service Highlights

Under `/billing` (also supported through gateway mounts):

| Method | Endpoint                               | Purpose                                                                        |
| ------ | -------------------------------------- | ------------------------------------------------------------------------------ |
| GET    | `/billing`                             | List billing records with tenant/patient/status filters.                       |
| POST   | `/billing`                             | Create manual billing record for operational adjustments.                      |
| GET    | `/billing/{id}`                        | Fetch billing record by id.                                                    |
| PUT    | `/billing/{id}`                        | Update billing record amount/status.                                           |
| DELETE | `/billing/{id}`                        | Delete billing record by id.                                                   |
| POST   | `/billing/hooks/clinical-trigger`      | Consume lab/prescription clinical trigger and create processed billing record. |
| GET    | `/billing/hooks/clinical-trigger`      | List processed billing trigger receipts with tenant/patient/trigger filters.   |
| GET    | `/billing/hooks/clinical-trigger/{id}` | Retrieve a specific clinical trigger processing receipt.                       |

## ABHA References

- ABHA integration SOP reference PDF: `docs/api/abha/ABDM_ABHA_V3_AP_Is_SOP_V1_1_4_faef8099bd.pdf`
- ABHA OpenAPI reference source: `docs/api/abha/ehrn-abdmc.v1.yaml`

## Contract and Drift Guardrails

- Coverage and parity matrix: `docs/api/endpoint-contract-coverage-matrix.md`
- Semantic parity check: `npm run contracts:check`
- Strict CI parity check: `npm run contracts:check -- --strict`
- Regression suite: `tests/contracts/parity-regression.test.js`
- Coverage gate check: `npm run test` (Jest global thresholds enforced)
- M4.3 route-edge and integration reliability suites: `tests/appointment/*edge*`, `tests/notification/*`, `tests/ehr/*edge*`, `tests/lab/*edge*`, `tests/auth/*surface*`, `tests/integrations/*`, and `tests/shared-utils/*`
