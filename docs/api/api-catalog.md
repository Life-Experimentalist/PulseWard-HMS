# API Catalog for PulseWard Hospital Management System

## Overview

The PulseWard Hospital Management System (HMS) provides a comprehensive suite of applications and services designed to streamline hospital operations, enhance patient care, and facilitate efficient management of healthcare resources. This document serves as a catalog for the APIs available within the PulseWard HMS, detailing the endpoints, request/response formats, and relevant information for developers.

## API Endpoints

### 1. Authentication Service

- **Base URL**: `/api/v1/auth`

| Method | Endpoint                 | Description                                 |
| ------ | ------------------------ | ------------------------------------------- |
| GET    | `/roles`                 | List supported role keys.                   |
| POST   | `/register`              | Register a new user in a tenant role.       |
| POST   | `/login`                 | Authenticate role user and return JWT.      |
| GET    | `/oauth/providers`       | List OAuth providers and enablement status. |
| GET    | `/oauth/google/start`    | Build Google OAuth URL for tenant and role. |
| POST   | `/oauth/google/callback` | Exchange callback payload for platform JWT. |
| GET    | `/oauth/clerk/start`     | Return Clerk setup metadata.                |

Additional platform endpoints under `/api/v1/platform`:

- `GET /domain-config`
- `POST /domain-config/validate`
- `GET /domain-config/all`

### 2. Patient Service

- **Base URL**: `/api/patients`

| Method | Endpoint | Description                     |
| ------ | -------- | ------------------------------- |
| GET    | `/`      | Retrieve a list of patients.    |
| GET    | `/{id}`  | Retrieve patient details by ID. |
| POST   | `/`      | Create a new patient record.    |
| PUT    | `/{id}`  | Update patient details by ID.   |
| DELETE | `/{id}`  | Delete patient record by ID.    |

### 3. Appointment Service

- **Base URL**: `/api/v1`

| Method | Endpoint                            | Description                            |
| ------ | ----------------------------------- | -------------------------------------- |
| GET    | `/appointments`                     | Retrieve a list of appointments.       |
| GET    | `/appointments/{id}`                | Retrieve appointment details by ID.    |
| POST   | `/appointments`                     | Schedule a new appointment.            |
| PUT    | `/appointments/{id}`                | Update appointment details by ID.      |
| DELETE | `/appointments/{id}`                | Cancel appointment by ID.              |
| GET    | `/integrations/calendars/providers` | List tenant calendar providers.        |
| POST   | `/integrations/calendars/test`      | Test tenant calendar provider booking. |

### 4. EHR Service

- **Base URL**: `/api/ehr`

| Method | Endpoint       | Description                                   |
| ------ | -------------- | --------------------------------------------- |
| GET    | `/`            | Retrieve a list of electronic health records. |
| GET    | `/{patientId}` | Retrieve EHR for a specific patient.          |
| POST   | `/`            | Create a new electronic health record.        |
| PUT    | `/{id}`        | Update existing EHR by ID.                    |
| DELETE | `/{id}`        | Delete EHR by ID.                             |

### 5. Billing Service

- **Base URL**: `/api/billing`

| Method | Endpoint | Description                     |
| ------ | -------- | ------------------------------- |
| GET    | `/`      | Retrieve billing records.       |
| GET    | `/{id}`  | Retrieve billing details by ID. |
| POST   | `/`      | Create a new billing record.    |
| PUT    | `/{id}`  | Update billing details by ID.   |
| DELETE | `/{id}`  | Delete billing record by ID.    |

### 6. Pharmacy Service

- **Base URL**: `/api/pharmacy`

| Method | Endpoint | Description                        |
| ------ | -------- | ---------------------------------- |
| GET    | `/`      | Retrieve a list of medications.    |
| GET    | `/{id}`  | Retrieve medication details by ID. |
| POST   | `/`      | Add a new medication.              |
| PUT    | `/{id}`  | Update medication details by ID.   |
| DELETE | `/{id}`  | Delete medication by ID.           |

### 7. Lab Service

- **Base URL**: `/api/lab`

| Method | Endpoint | Description                      |
| ------ | -------- | -------------------------------- |
| GET    | `/`      | Retrieve a list of lab tests.    |
| GET    | `/{id}`  | Retrieve lab test details by ID. |
| POST   | `/`      | Create a new lab test record.    |
| PUT    | `/{id}`  | Update lab test details by ID.   |
| DELETE | `/{id}`  | Delete lab test by ID.           |

### 8. Notification Service

- **Base URL**: `/api/v1`

| Method | Endpoint                                 | Description                              |
| ------ | ---------------------------------------- | ---------------------------------------- |
| GET    | `/notifications`                         | Retrieve a list of notifications.        |
| GET    | `/notifications/{id}`                    | Retrieve notification details by ID.     |
| POST   | `/notifications`                         | Create a new notification.               |
| DELETE | `/notifications/{id}`                    | Delete notification by ID.               |
| GET    | `/integrations/messaging/providers`      | List tenant messaging providers.         |
| POST   | `/integrations/messaging/test`           | Test tenant messaging provider delivery. |
| GET    | `/integrations/messaging/telegram/setup` | Get Telegram setup checklist.            |

## API Versioning Policy

All APIs are versioned to ensure backward compatibility. The version is included in the base URL as follows: `/api/v1/...`.

## Error Model

The API follows a standard error response format:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Error message describing the issue.",
    "details": "Additional details if necessary."
  }
}
```

## Conclusion

This API catalog provides a comprehensive overview of the available endpoints within the PulseWard Hospital Management System. For further details, please refer to the individual service documentation and OpenAPI specifications.

## M1 Contract Coverage

- Endpoint-level contract coverage matrix: `docs/api/endpoint-contract-coverage-matrix.md`
- CI-compatible contract source check command: `npm run contracts:check`
