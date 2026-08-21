# API Reference

All application endpoints are served by the API gateway on port **8787** and live under
the base path `/api/v1`. In the Docker stack each portal proxies `/api/` to the gateway
through nginx. The single exception is `GET /health`, which sits at the root for
container health checks.

`Auth` column key: **—** public · **Bearer** any authenticated user · a role list means
`requireRole(...)` restricts the endpoint to those roles.

## Authentication

| Method | Path                    | Auth   | Description                                     |
| ------ | ----------------------- | ------ | ----------------------------------------------- |
| POST   | `/auth/signup`          | —      | Register a new patient account                  |
| POST   | `/auth/login`           | —      | Log in; returns access + refresh tokens         |
| POST   | `/auth/refresh`         | —      | Rotate the refresh token (single-use)           |
| POST   | `/auth/logout`          | Bearer | Revoke the refresh-token family                 |
| GET    | `/auth/me`              | Bearer | Current user profile                            |
| POST   | `/auth/change-password` | Bearer | Change password; revokes **all** refresh tokens |

## Patients

| Method | Path                   | Auth                             | Description                                            |
| ------ | ---------------------- | -------------------------------- | ------------------------------------------------------ |
| GET    | `/patients`            | admin, clinician, frontdesk, ops | List / search patients                                 |
| POST   | `/patients`            | admin, clinician, frontdesk      | Create a patient record                                |
| GET    | `/patients/:id`        | Bearer                           | Get patient details                                    |
| PATCH  | `/patients/:id`        | Bearer                           | Update patient profile                                 |
| POST   | `/patients/:id/vitals` | admin, clinician, frontdesk      | Append a vitals entry (BP, HR, temp, SpO₂, RR, weight) |

## Clinicians

| Method | Path              | Auth   | Description             |
| ------ | ----------------- | ------ | ----------------------- |
| GET    | `/clinicians`     | Bearer | List clinicians         |
| GET    | `/clinicians/:id` | Bearer | Get a clinician profile |

## Appointments

| Method | Path                | Auth   | Description                     |
| ------ | ------------------- | ------ | ------------------------------- |
| GET    | `/appointments`     | Bearer | List appointments (role-scoped) |
| POST   | `/appointments`     | Bearer | Create an appointment           |
| PATCH  | `/appointments/:id` | Bearer | Update status or reschedule     |

Booking refuses windows covered by an availability block (`409 clinician_unavailable`)
and overlapping bookings for the same patient (`422 patient_stacking`).

## Availability

| Method | Path                | Auth             | Description                                               |
| ------ | ------------------- | ---------------- | --------------------------------------------------------- |
| GET    | `/availability`     | Bearer           | List availability blocks (filter by clinician)            |
| POST   | `/availability`     | clinician, admin | Block time off (≤ 30 days); returns affected appointments |
| DELETE | `/availability/:id` | clinician, admin | Remove a block (owner-scoped)                             |

## Reassignments

Appointments displaced by an availability block are queued here for resolution.

| Method | Path                         | Auth                             | Description                                     |
| ------ | ---------------------------- | -------------------------------- | ----------------------------------------------- |
| GET    | `/reassignments`             | admin, frontdesk, clinician, ops | List queue items (default `status=open`)        |
| POST   | `/reassignments`             | clinician, admin, frontdesk      | Queue a displaced appointment                   |
| POST   | `/reassignments/:id/resolve` | admin, frontdesk                 | Resolve as `reassign` / `reschedule` / `cancel` |

## Clinical Notes

| Method | Path                  | Auth                      | Description                                  |
| ------ | --------------------- | ------------------------- | -------------------------------------------- |
| GET    | `/notes`              | admin, clinician, patient | List notes                                   |
| POST   | `/notes`              | clinician, admin          | Create a draft note                          |
| PATCH  | `/notes/:id`          | clinician, admin          | Update a draft note                          |
| POST   | `/notes/:id/sign`     | clinician, admin          | Sign (finalize) a note                       |
| POST   | `/notes/:id/addendum` | clinician, admin          | Add a hash-chained addendum to a signed note |

## Labs

| Method | Path        | Auth                      | Description                     |
| ------ | ----------- | ------------------------- | ------------------------------- |
| GET    | `/labs`     | admin, clinician, patient | List labs for a patient         |
| GET    | `/labs/all` | admin, clinician          | Lab worklist across patients    |
| POST   | `/labs`     | clinician, admin          | Order a lab                     |
| PATCH  | `/labs/:id` | clinician, admin          | Advance status / attach results |

Lab status lifecycle: `ordered → in-lab → resulted → reviewed` (or `cancelled`).

## Prescriptions

| Method | Path                 | Auth                      | Description                |
| ------ | -------------------- | ------------------------- | -------------------------- |
| GET    | `/prescriptions`     | admin, clinician, patient | List prescriptions         |
| POST   | `/prescriptions`     | clinician, admin          | Create a prescription      |
| PATCH  | `/prescriptions/:id` | clinician, admin          | Update prescription status |

Creating a prescription runs the drug-safety gate: documented allergies (drug-class
aware) and known interactions answer `422` with code `drug_allergy` or
`drug_interaction` plus the warnings. Resubmitting with an `overrideReason` bypasses
the gate and is audited. Discontinuing requires a `reason`.

## Messaging

| Method | Path                 | Auth                      | Description                     |
| ------ | -------------------- | ------------------------- | ------------------------------- |
| GET    | `/messages`          | admin, clinician, patient | List threads                    |
| POST   | `/messages`          | admin, clinician, patient | Create a thread or send a reply |
| POST   | `/messages/:id/read` | admin, clinician, patient | Mark a thread as read           |

## Notifications

In-app only — there is no external delivery channel (no email, SMS, or push).

| Method | Path                      | Auth   | Description               |
| ------ | ------------------------- | ------ | ------------------------- |
| GET    | `/notifications`          | Bearer | List in-app notifications |
| POST   | `/notifications/:id/read` | Bearer | Mark one as read          |
| POST   | `/notifications/read-all` | Bearer | Mark all as read          |

## Tasks

Per-user Eisenhower task list — every route is scoped to the authenticated user.

| Method | Path         | Auth   | Description                       |
| ------ | ------------ | ------ | --------------------------------- |
| GET    | `/tasks`     | Bearer | List own tasks                    |
| POST   | `/tasks`     | Bearer | Create a task (title + quadrant)  |
| PATCH  | `/tasks/:id` | Bearer | Update title, quadrant, or status |
| DELETE | `/tasks/:id` | Bearer | Delete a task                     |

## Admin

| Method | Path                | Auth       | Description                     |
| ------ | ------------------- | ---------- | ------------------------------- |
| GET    | `/admin/stats`      | admin, ops | Aggregate platform stats        |
| GET    | `/admin/users`      | admin      | List users                      |
| POST   | `/admin/users`      | admin      | Create a user                   |
| DELETE | `/admin/users/:id`  | admin      | Delete a user                   |
| POST   | `/admin/clinicians` | admin      | Create a clinician (with login) |
| GET    | `/admin/audit`      | admin      | Audit log                       |
| GET    | `/admin/tenants`    | admin      | List tenants                    |

## Platform & Health

| Method | Path                      | Auth       | Description                                        |
| ------ | ------------------------- | ---------- | -------------------------------------------------- |
| GET    | `/platform/health`        | admin, ops | Component health + metrics                         |
| GET    | `/platform/incidents`     | admin, ops | Recent operational incidents                       |
| POST   | `/platform/incidents`     | admin, ops | Open an incident (severity, service, owner)        |
| PATCH  | `/platform/incidents/:id` | admin, ops | Transition status (`open ↔ monitoring → resolved`) |
| GET    | `/health`                 | —          | Liveness probe (root path, no `/api/v1`)           |

SEV1/SEV2 incident downtime feeds the uptime percentage reported by
`/platform/health` (severity-weighted, trailing 30 days).

Full OpenAPI specs live in `contracts/rest/`. The `pnpm run contracts:check --strict`
gate fails if the spec and the runtime routes ever drift apart.
