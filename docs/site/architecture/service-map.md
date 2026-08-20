# Service Map

How the frontend portals and the single API gateway interact. There is no service mesh —
one Hono app handles every route and talks to one SQLite database.

```mermaid
graph TB
  subgraph Portals["React Portals (Vite)"]
    PP["Patient Portal\n:4313"]
    CP["Clinician Portal\n:4311"]
    AC["Admin Console\n:4180"]
    OD["Ops Dashboard\n:4312"]
  end

  subgraph Gateway["API Gateway (Hono · Node 24 · :8787)"]
    AUTH["Auth Routes\n/api/v1/auth/*"]
    PATIENT["Patient Routes\n/api/v1/patients/*"]
    APPT["Appointment Routes\n/api/v1/appointments/*"]
    CLINIC["Clinician Routes\n/api/v1/clinicians/*"]
    NOTES["Notes/Labs/Rx\n/api/v1/notes · labs · prescriptions"]
    MSG["Messaging\n/api/v1/messages/*"]
    NOTIF["Notifications\n/api/v1/notifications/*"]
    ADMIN["Admin Routes\n/api/v1/admin/*"]
    PLAT["Platform Routes\n/api/v1/platform/*"]
  end

  subgraph Storage["Storage"]
    DB[("SQLite\nnode:sqlite · WAL")]
  end

  PP  -->|JWT| AUTH
  PP  -->|JWT| PATIENT
  PP  -->|JWT| APPT
  PP  -->|JWT| MSG
  PP  -->|JWT| NOTIF
  CP  -->|JWT| CLINIC
  CP  -->|JWT| NOTES
  CP  -->|JWT| APPT
  CP  -->|JWT| MSG
  AC  -->|JWT| ADMIN
  OD  -->|JWT admin/ops| PLAT

  AUTH    --> DB
  PATIENT --> DB
  APPT    --> DB
  CLINIC  --> DB
  NOTES   --> DB
  MSG     --> DB
  NOTIF   --> DB
  ADMIN   --> DB
  PLAT    --> DB
```

| Node                     | Description                                                                                                                              |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Patient Portal**       | React + Vite SPA; token in `pw_token` (localStorage); uses patients, appointments, labs, prescriptions, messages, notifications          |
| **Clinician Portal**     | React + Vite SPA; reads patient charts, writes notes/labs/prescriptions; token in `pw_clin_token`                                        |
| **Admin Console**        | React + Vite SPA; manages users and clinicians, reads audit log and stats, shows live health; token in `pw_admin_token`                  |
| **Ops Dashboard**        | React + Vite SPA; signs in with an `admin`/`ops` account and polls `/platform/health` and `/platform/incidents`; token in `pw_ops_token` |
| **API Gateway**          | Single Hono app (Node 24); all routes in one file; CORS enforced per `CORS_ALLOWED_ORIGINS`                                              |
| **Auth Routes**          | Login, signup, refresh, logout, `me`; issues JWTs signed with `JWT_SECRET`                                                               |
| **Patient Routes**       | Patient profile CRUD + transactional MRN assignment                                                                                      |
| **Appointment Routes**   | Scheduling CRUD with status transitions                                                                                                  |
| **Clinician Routes**     | Provider listing and profile lookup                                                                                                      |
| **Notes/Labs/Rx Routes** | Clinical documentation; PATCH routes emit audit events                                                                                   |
| **Messaging Routes**     | Thread-scoped message store; one thread per patient–clinician subject                                                                    |
| **Notifications**        | In-app inbox stored in the `notifications` table; read/marked-read by the portals                                                        |
| **Admin Routes**         | User/clinician management, audit log, stats, tenant list                                                                                 |
| **Platform Routes**      | Component health and incident feed for the Ops Dashboard                                                                                 |
| **SQLite**               | One file, WAL mode; **all tenants share one database**, isolated by the `tenant_id` column                                               |
