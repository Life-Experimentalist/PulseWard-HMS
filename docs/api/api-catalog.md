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

| Service              | Primary base path             | Notes                                    |
| -------------------- | ----------------------------- | ---------------------------------------- |
| API Gateway          | `/`                           | Routes traffic to service backends.      |
| Auth Service         | `/api/v1`                     | Also mounted at `/api` in local runtime. |
| Appointment Service  | `/api/v1`                     | Also mounted at `/api` in local runtime. |
| Notification Service | `/api/v1`                     | Also mounted at `/api` in local runtime. |
| Patient Service      | `/api/patients`               | CRUD patient profile routes.             |
| EHR Service          | `/ehr` and `/api/ehr`         | Runtime/spec aligned in M1.3.            |
| Lab Service          | `/api/lab-tests`              | Runtime/spec aligned in M1.3.            |
| Pharmacy Service     | `/api/pharmacy`               | CRUD pharmacy routes.                    |
| Billing Service      | `/billing` and `/api/billing` | Runtime/spec aligned in M1.3.            |

## Auth Service Highlights

Under `/api/v1`:

| Method | Endpoint                               | Purpose                                                      |
| ------ | -------------------------------------- | ------------------------------------------------------------ |
| GET    | `/auth/roles`                          | List supported role keys.                                    |
| POST   | `/auth/otp/request`                    | Create tenant-scoped OTP challenge for policy-driven MFA.    |
| POST   | `/auth/otp/verify`                     | Verify OTP challenge and return short-lived OTP verification token. |
| POST   | `/auth/register`                       | Register role-scoped user.                                   |
| POST   | `/auth/login`                          | Role login with tenant policy checks, optional MFA requirement, role-provider compatibility, and policy-driven session TTL. |
| GET    | `/auth/oauth/providers`                | OAuth provider readiness list (environment + tenant policy). |
| GET    | `/auth/oauth/google/start`             | Google OAuth bootstrap URL with tenant policy guard.         |
| POST   | `/auth/oauth/google/callback`          | Exchange callback payload for JWT with tenant policy guard and role-driven session TTL.  |
| GET    | `/auth/oauth/clerk/start`              | Clerk bootstrap metadata with tenant policy guard.           |
| GET    | `/auth/oauth/google/config-status`     | Google OAuth env readiness probe.                            |
| GET    | `/platform/abha/config-status`         | ABHA config readiness probe.                                 |
| GET    | `/platform/abha/health-check`          | ABHA gateway reachability check.                             |
| GET    | `/admin/settings/storage`              | Admin settings store metadata.                               |
| GET    | `/admin/settings`                      | Read tenant admin settings.                                  |
| PUT    | `/admin/settings`                      | Persist tenant admin settings.                               |
| POST   | `/admin/settings/auth-policy/validate` | Validate tenant auth policy payload.                         |
| GET    | `/platform/domain-config`              | Resolve tenant domain config.                                |
| POST   | `/platform/domain-config/validate`     | Validate origin for tenant.                                  |
| GET    | `/platform/domain-config/all`          | Return full domain config model.                             |

## Notification Service Highlights

Under `/api/v1`:

| Method | Endpoint                                         | Purpose                                           |
| ------ | ------------------------------------------------ | ------------------------------------------------- |
| GET    | `/notifications`                                 | List notifications.                               |
| POST   | `/notifications`                                 | Create notification.                              |
| GET    | `/notifications/{id}`                            | Fetch notification by id.                         |
| DELETE | `/notifications/{id}`                            | Delete notification by id.                        |
| GET    | `/integrations/messaging/providers`              | List tenant messaging providers.                  |
| POST   | `/integrations/messaging/test`                   | Trigger provider test delivery (dry run or live). |
| GET    | `/integrations/messaging/telegram/setup`         | Telegram bootstrap checklist.                     |
| GET    | `/integrations/messaging/telegram/config-status` | Telegram secret/config readiness.                 |
| GET    | `/integrations/messaging/email/config-status`    | SMTP secret/config readiness.                     |

## Appointment Service Highlights

Under `/api/v1`:

| Method | Endpoint                            | Purpose                     |
| ------ | ----------------------------------- | --------------------------- |
| GET    | `/appointments`                     | List appointments.          |
| GET    | `/appointments/{id}`                | Fetch appointment by id.    |
| POST   | `/appointments`                     | Create appointment.         |
| PUT    | `/appointments/{id}`                | Update appointment.         |
| DELETE | `/appointments/{id}`                | Cancel appointment.         |
| GET    | `/integrations/calendars/providers` | List calendar providers.    |
| POST   | `/integrations/calendars/test`      | Test calendar booking flow. |

## ABHA References

- ABHA integration SOP reference PDF: `docs/api/abha/ABDM_ABHA_V3_AP_Is_SOP_V1_1_4_faef8099bd.pdf`
- ABHA OpenAPI reference source: `docs/api/abha/ehrn-abdmc.v1.yaml`

## Contract and Drift Guardrails

- Coverage and parity matrix: `docs/api/endpoint-contract-coverage-matrix.md`
- Semantic parity check: `npm run contracts:check`
- Strict CI parity check: `npm run contracts:check -- --strict`
- Regression suite: `tests/contracts/parity-regression.test.js`
