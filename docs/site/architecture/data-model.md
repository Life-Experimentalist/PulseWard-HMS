# Data Model

SQLite schema with row-level multi-tenant isolation.

```mermaid
erDiagram
  tenants {
    text id PK
    text slug UK
    text name
    text hfr_id
    text accent
    int created_at
  }

  users {
    text id PK
    text tenant_id FK
    text email
    text password_hash
    text role
    text name
    text linked_entity_id
    int last_login_at
    int created_at
  }

  patients {
    text id PK
    text tenant_id FK
    text mrn UK
    text name
    text dob
    text gender
    text blood_type
    text phone
    text conditions_json
    text allergies_json
    text vitals_json
    int created_at
  }

  clinicians {
    text id PK
    text tenant_id FK
    text name
    text specialty
    text department
    text npi
    text bio
    int created_at
  }

  appointments {
    text id PK
    text tenant_id FK
    text patient_id FK
    text clinician_id FK
    int starts_at
    int duration_min
    text kind
    text status
    text reason
    text notes
    int created_at
  }

  notes {
    text id PK
    text tenant_id FK
    text patient_id FK
    text clinician_id FK
    text appointment_id FK
    text type
    text title
    text body_json
    text diagnoses_json
    int signed_at
    int created_at
  }

  lab_orders {
    text id PK
    text tenant_id FK
    text patient_id FK
    text clinician_id FK
    text panel
    text status
    text results_json
    int ordered_at
    int reviewed_at
  }

  prescriptions {
    text id PK
    text tenant_id FK
    text patient_id FK
    text clinician_id FK
    text drug
    text dose
    text freq
    text duration
    text status
    text override_reason
    int prescribed_at
  }

  messages {
    text id PK
    text tenant_id FK
    text patient_id FK
    text clinician_id FK
    text subject
    text thread_json
    int last_at
  }

  refresh_tokens {
    text id PK
    text user_id FK
    text tenant_id FK
    text token UK
    int expires_at
    int revoked
  }

  audit_events {
    text id PK
    text tenant_id FK
    text actor
    text action
    text scope
    text ip
    int at
  }

  tenants    ||--o{ users         : "scopes"
  tenants    ||--o{ patients      : "scopes"
  tenants    ||--o{ clinicians    : "scopes"
  users      ||--o| patients      : "has profile"
  users      ||--o| clinicians    : "has profile"
  patients   ||--o{ appointments  : "books"
  clinicians ||--o{ appointments  : "holds"
  patients   ||--o{ notes         : "receives"
  clinicians ||--o{ notes         : "writes"
  patients   ||--o{ lab_orders    : "ordered for"
  patients   ||--o{ prescriptions : "prescribed to"
  patients   ||--o{ messages      : "in thread"
  clinicians ||--o{ messages      : "in thread"
  users      ||--o{ refresh_tokens : "holds"
  tenants    ||--o{ audit_events  : "records"
```

| Table              | Purpose                                                  | Key Constraints                                                                                                                     |
| ------------------ | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **tenants**        | Hospital registry; one row per hospital in the shared DB | `slug` UNIQUE — stable tenant key; requests are scoped at runtime by the JWT `tid` claim, not the slug                              |
| **users**          | Authentication subjects for all roles                    | `(tenant_id, email)` UNIQUE; `password_hash` is bcrypt cost-10; `linked_entity_id` → patient or clinician id                        |
| **patients**       | Clinical demographic record                              | `(tenant_id, mrn)` UNIQUE; MRN assigned atomically in `db.transaction()`; JSON columns for conditions, allergies, vitals            |
| **clinicians**     | Provider profile                                         | `npi` (provider identifier); not linked to a users row directly — join via `users.linked_entity_id`                                 |
| **appointments**   | Scheduled encounters                                     | `status` ∈ `{scheduled, checked-in, in-progress, completed, cancelled, no-show}`; indexed on `(tenant_id, clinician_id, starts_at)` |
| **notes**          | Clinical documentation (SOAP, progress, discharge, etc.) | `signed_at` non-null = locked; `body_json` stores subjective/objective/assessment/plan; `diagnoses_json` stores ICD-10 codes        |
| **lab_orders**     | Lab panel orders and results                             | `results_json` stores keyed result values; `status` ∈ `{ordered, in-lab, resulted, reviewed, cancelled}`                            |
| **prescriptions**  | Medication orders                                        | `status` ∈ `{active, dispensed, completed, discontinued}`; `override_reason` for allergy override                                   |
| **messages**       | Bidirectional secure messaging                           | One row per patient-clinician thread; `thread_json` stores the full message array                                                   |
| **refresh_tokens** | JWT refresh token store                                  | `token` UNIQUE; `revoked=1` immediately after use (single-use rotation)                                                             |
| **audit_events**   | Immutable event log                                      | Append-only; indexed on `(tenant_id, at DESC)`                                                                                      |
