# PulseWard Production Roadmap and Milestones

This roadmap is the primary execution plan to take `PulseWard HMS` from current state to production readiness.

## Planning Baseline

- **Delivery window**: balanced track, `20-28 weeks`.
- **Deployment baseline**: Docker Compose on `VM` (cost-first), with Kubernetes hardening deferred as a post-go-live track.
- **Release controls**: standard enterprise gates (test, smoke, rollback, runbooks, evidence).
- **Mobile baseline**: `React Native` using `Expo` managed workflow.
- **Integration baseline**: `Telegram`, `WhatsApp`, `Calendar` providers (Google/Outlook/ICS), `ABHA` adapter, `Website` webhooks.
- **Additional core scope from stakeholder input**: `patient electronic health record` and `prescription management` must be `first-release` capable.
- **Configuration principle**: `hospital admins` can choose `auth` and `policy` options per `tenant` where feasible.
- **Default compliance profile for new tenants**: combined baseline privacy controls plus ABHA-ready controls.
- **Default auth set for new tenants**: `email/password`, `phone/email OTP`, `Google OAuth`, and `Clerk mode`, all implemented as modular interchangeable providers.
- **ABHA connector default**: enabled by default with tenant-level controls retained.
- **Pilot target**: `1` hospital with `100-300` active users.
- **Notification priority under channel constraints**: appointment reminders first.

## Production Readiness Definition

PulseWard is production ready when all conditions below are true:

1. Critical workflows are complete end-to-end: patient onboarding, appointment lifecycle, clinical record updates, prescription handling, lab order lifecycle, billing handoff, and notification delivery.
2. Contract compatibility is validated across gateway, services, portals, and integrations.
3. Operational readiness exists: runbooks, backup and restore drills, incident handling, observability dashboards, and on-call checks.
4. Performance and reliability targets are measured and stable under expected load.
5. Privacy and audit controls are active for protected data.
6. All user-facing and API documentation is updated for the released behavior.

## Milestone Timeline (20-28 Weeks)

| Milestone                                         | Weeks | Outcome                                                                  |
| ------------------------------------------------- | ----- | ------------------------------------------------------------------------ |
| M0 Program Alignment and Baseline                 | 1-2   | Scope lock, architecture checkpoints, quality gates active               |
| M1 Contracts and Gateway Reliability              | 3-5   | Stable API surface and service-to-service contract tests                 |
| M2 Identity, Access, and Tenant Policy Options    | 6-8   | Admin-configurable auth and policy model                                 |
| M3 Core Clinical Data Services                    | 9-12  | Patient, EHR, prescription, lab core workflows production-capable        |
| M4 Scheduling and Notification Reliability        | 13-16 | Appointment and notification flows hardened with retries and idempotency |
| M5 Connector and Adapter Completion               | 15-18 | Telegram, WhatsApp, Calendar, Webhook, ABHA adapters production-ready    |
| M6 Experience Surfaces and Mobile Notifications   | 17-20 | Portals hardened; Expo mobile app delivers appointment notifications     |
| M7 Security, Observability, and Operability       | 19-22 | Auditing, alerting, backup/restore, and operational controls complete    |
| M8 Performance, Resilience, and Release Candidate | 23-25 | Load validation, failure drills, and release candidate signoff           |
| M9 Pilot, Cutover, and Production Go-Live         | 26-28 | Controlled rollout, hypercare, and final production acceptance           |

## Detailed Milestones

### M0 Program Alignment and Baseline (Weeks 1-2)

Goals:

- Lock the production scope and non-goals.
- Normalize repo standards for service configuration, CI, and docs updates.

Scope:

- Finalize milestone owner matrix and service boundary map.
- Ensure every service has health endpoint, readiness checks, and consistent startup scripts.
- Activate baseline CI gates (lint, unit tests, contract checks where available).
- Define documentation update checklist per PR.

Exit criteria:

- Scope and sequencing approved.
- CI baseline green for all actively developed apps/services.
- No undocumented service entrypoint or missing local run instructions.

### M1 Contracts and Gateway Reliability (Weeks 3-5)

Goals:

- Eliminate contract ambiguity and reduce integration breakage risk.

Scope:

- Normalize API catalog and error model alignment for auth, patient, appointment, notification, billing, EHR, lab, and pharmacy services.
- Add consumer/provider contract tests for gateway-service interactions.
- Validate versioning and backward compatibility rules for /api/v1 surfaces.
- Add idempotency coverage for booking and high-risk mutation endpoints.

Exit criteria:

- Contract test suite covers critical endpoints and passes in CI.
- Breaking change workflow with migration and rollback notes is enforced.
- Gateway integration smoke tests pass for all core service routes.

### M2 Identity, Access, and Tenant Policy Options (Weeks 6-8)

Goals:

- Deliver configurable auth and access model so each hospital can choose suitable options.

Scope:

- Implement admin-configurable identity options per tenant:
  - Email/password.
  - Phone/email OTP.
  - Google OAuth.
  - Clerk integration mode.
- Complete role and permission enforcement across portals and APIs.
- Add tenant policy toggles for session behavior, MFA requirements, and password rules.
- Define compliance profile toggles (baseline privacy controls, ABHA-focused controls, combined profile) as tenant policy presets.

Exit criteria:

- Auth provider selection is config-driven with no service code changes required per tenant.
- Role-based authorization checks exist for all critical routes.
- Audit trail captures auth lifecycle events and permission-sensitive operations.

### M3 Core Clinical Data Services (Weeks 9-12)

Goals:

- Make core patient and clinical data paths stable and complete.

Scope:

- Harden patient-service data model and profile lifecycle.
- Implement OPD intake-to-appointment entry semantics across patient and appointment services.
- Complete EHR service CRUD and timeline/history integrity.
- Implement prescription lifecycle across EHR and pharmacy-service integration points.
- Complete lab-service order and result workflows.
- Ensure billing-service hooks receive required clinical event triggers.

Exit criteria:

- End-to-end clinical record flow validated across patient, EHR, lab, and pharmacy interactions.
- OPD management path (registration, triage context, and appointment handoff) is validated for primary outpatient workflows.
- Data validation and error semantics are consistent with shared error model.
- Protected fields are masked in logs and non-production fixtures.

### M4 Scheduling and Notification Reliability (Weeks 13-16)

Goals:

- Ensure appointment and notification lifecycles are reliable and observable.

Scope:

- Finalize appointment lifecycle state machine and conflict handling.
- Add retries, dead-letter behavior, and deduplication for notification dispatch paths.
- Wire appointment-service events to notification-service with correlation IDs.
- Add failure telemetry and operational counters for missed/late notifications.
- Add milestone-level test hardening so each newly added function and critical branch has unit tests, and each cross-service workflow has integration coverage.

Exit criteria:

- Appointment create/reschedule/cancel flow passes end-to-end reliability tests.
- Notification fanout behavior is deterministic under retries and partial failures.
- Operational dashboard shows delivery success/failure and latency trends.
- New milestone code paths ship with unit and integration tests in the same slice PR (no deferred backlog for new functions).

### M5 Connector and Adapter Completion (Weeks 15-18)

Goals:

- Deliver production-ready provider adapters without coupling domain logic to provider specifics.

Scope:

- Telegram bot adapter: setup, token validation, message templates, and delivery acknowledgements.
- WhatsApp adapter: provider routing model and template-driven outbound flow.
- Calendar adapters: Google, Outlook, and ICS interoperability for busy slots and event sync.
- Website webhook adapter: signed payload delivery and retry policy.
- ABHA adapter: consent-aware read/write boundaries and audit coverage.

Exit criteria:

- Every adapter has config schema validation, connectivity tests, and fallback/error behavior.
- Provider swap can be performed via configuration only.
- Adapter runbooks document onboarding, testing, and rollback steps.

### M6 Experience Surfaces and Mobile Notifications (Weeks 17-20)

Goals:

- Ship stable user-facing surfaces for web and mobile notifications.

Scope:

- Harden admin-console, clinician-portal, patient-portal, and operations-dashboard for production UX and error handling.
- Implement consistent notification center behavior across web apps.
- Build Expo React Native app (first release): receive and view notifications for appointments and operational alerts.
- Add secure token/session handling for mobile notification consumption.

Exit criteria:

- Web portals pass smoke, access control, and responsive checks for priority workflows.
- Mobile app receives and renders targeted notifications with tenant-scoped access.
- No critical workflow requires direct database operations or manual patching.

### M7 Security, Observability, and Operability (Weeks 19-22)

Goals:

- Ensure production operations can detect, triage, and recover safely.

Scope:

- Implement structured logging and trace correlation across gateway and services.
- Add dashboards and alert rules for API errors, queue backlog, adapter failures, and latency anomalies.
- Complete backup and restore policy with drill evidence.
- Finalize incident runbooks, escalation paths, and service ownership map.

Exit criteria:

- Alert coverage exists for top reliability and safety risks.
- Backup/restore test is successful with evidence captured.
- Incident runbooks are complete and linked from operational docs.

### M8 Performance, Resilience, and Release Candidate (Weeks 23-25)

Goals:

- Validate scalability and failure behavior under realistic load.

Scope:

- Execute load tests for auth, appointment, notification, and patient read/write paths.
- Identify and fix top bottlenecks (query plans, queue contention, cache inefficiencies).
- Run resilience drills (service degradation, provider outages, retry storm prevention).
- Freeze release candidate and run full regression on contracts, portals, and adapters.

Exit criteria:

- Performance metrics meet agreed thresholds for pilot size.
- No unresolved critical defects in release candidate.
- Rollback playbooks verified and tested in staging.

### M9 Pilot, Cutover, and Production Go-Live (Weeks 26-28)

Goals:

- Deploy safely with controlled blast radius and measurable acceptance criteria.

Scope:

- Execute pilot rollout with selected tenant cohort.
- Monitor real-world latency, error rates, and notification delivery outcomes.
- Complete cutover checklist, stakeholder signoff, and go-live communications.
- Run hypercare window with daily triage, hotfix policy, and evidence logging.

Exit criteria:

- Pilot acceptance criteria are met.
- Go-live signoff received from product, engineering, and operations owners.
- Hypercare completes with no unresolved critical incidents.

## Cross-Cutting Workstreams (Run Every Milestone)

- Documentation parity: architecture, API, deployment, and runbook docs updated in same PR as implementation.
- Test expansion: unit, integration, contract, and smoke coverage increase each milestone.
- Data safety: PII masking, audit continuity, and secure defaults verification.
- Cost control: infra choices remain cost-first unless explicit performance risk requires upgrade.
- Governance: decisions and exceptions logged in project governance docs.

## Enterprise Release Gates (Required Before Go-Live)

1. Code quality gates pass for all changed services/apps.
2. Contract tests pass across gateway and domain services.
3. Integration connectivity tests pass for enabled provider adapters.
4. Security checklist and access-control validations pass.
5. Performance and resilience test evidence captured.
6. Runbooks and rollback plans are current and reviewed.
7. Release notes and operational communications are published.
8. For each active slice, newly introduced functions and decision branches have unit coverage, and affected service interactions have integration coverage.

## Locked Decisions

1. Compliance default for new tenants: combined baseline plus ABHA profile.
2. Auth defaults for new tenants: email/password, OTP, Google OAuth, and Clerk; architecture must remain modular and interoperable.
3. Pilot cohort target: 1 hospital and 100-300 active users.
4. Notification priority policy: appointment reminders first during channel constraints.
5. ABHA rollout policy: enabled by default, configurable by tenant admin.

## Immediate Next Execution Slice

1. M1.1 completed: endpoint-level contract coverage matrix is in place for gateway, auth, appointment, notification, patient, EHR, lab, pharmacy, and billing services.
2. M1.2 completed: `contracts:check` now validates both source/spec presence and semantic route-path parity with explicit allowlisted drift baselines.
3. M1.3 completed: allowlisted drift has been reconciled for `api-gateway`, `ehr-service`, `lab-service`, and `billing-service` runtime paths/specs.
4. M1.4 completed: strict parity mode is enforced in CI (`contracts:check -- --strict`).
5. M1.5 completed: route/spec drift regression tests added for newly aligned services to block regressions before merge.
6. M2 seed completed: auth service now exposes tenant admin-settings persistence plus ABHA configuration readiness and health-check endpoints.
7. M5 seed completed: notification service now exposes live provider readiness endpoints for Telegram and SMTP credentials.
8. M6 seed completed: admin console moved to production-style static runtime scaffold with service and integration diagnostics.
9. M1.6 completed: contract checker now enforces endpoint-level request/response schema assertions for critical auth, booking, and notification APIs.
10. M2.2 completed: tenant-level auth policy schema validation and persistence validation paths are implemented with regression tests.
11. M2.3 completed: auth policy consumption is enforced in login and OAuth flows with tenant-level policy guards and audit-ready denial semantics.
12. M2.4 completed: role/provider compatibility and tenant policy-driven session controls are enforced with regression coverage.
13. M2.5 completed: OTP provider execution path and MFA policy enforcement for selected roles are implemented with regression coverage.
14. M3.1 completed: auth policy outcomes now gate patient/clinical workflow entry and emit role-scoped session observability events with query filters.
15. M3.2 completed: OPD intake management and appointment-entry role semantics are implemented with contract and regression coverage.
16. M3.3 completed: EHR CRUD now enforces version-safe clinical write semantics with immutable timeline/history integrity.
17. Demo checkpoint: rudimentary OPD and appointments demo is available after M3.2 via `npm run demo:opd` once appointment-service is running.
18. M3.4 completed: prescription lifecycle handoff and status synchronization are implemented across EHR and pharmacy touchpoints.
19. M3.5 completed: lab-service now supports role-gated order lifecycle, result reporting, and downstream trigger alignment for EHR and billing touchpoints.
20. M3.6 completed: billing-service now receives and processes clinical trigger hooks from lab and prescription workflows with idempotent correlation handling.
21. M4.1 completed: appointment-service now enforces lifecycle state transitions, slot-conflict detection, idempotent create retries, and optimistic version checks.
22. M4.2 completed: appointment-service now emits lifecycle events to notification-service with correlation-id propagation, bounded retries, and dispatch audit visibility.
23. M4.3 completed (Test Coverage Completion Module): expanded route-edge, provider-adapter, shared-utils, and cross-service dispatch/ingestion test coverage so new functions and critical branches ship with unit and integration validation.
24. M4.3 evidence checkpoint: full suite now reports 21 passing suites, 70 passing tests, and approximately 63.10% statements / 59.68% branches / 65.01% functions / 63.77% lines coverage.
25. M4.4 completed: appointment-service now records dead-letter entries for skipped, failed, and delayed reminder dispatches with queryable dead-letter filters and bounded retention controls.
26. M4.4 evidence checkpoint: dispatch telemetry endpoint now exposes missed/delayed reminder counters, dead-letter totals, and event-type reliability summaries for operational monitoring.
27. M5.1 active next slice: complete connector adapter hardening for Telegram/WhatsApp onboarding and calendar interoperability diagnostics.
