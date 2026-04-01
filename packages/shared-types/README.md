# PulseWard - Shared Types Documentation

## Overview

The **PulseWard** hospital management system is designed to streamline healthcare operations, enhance patient care, and improve administrative efficiency. This documentation provides an overview of the shared types used across the various applications and services within the PulseWard ecosystem.

## Purpose

The shared types package contains TypeScript definitions that are utilized across different applications and services in the PulseWard project. By centralizing these types, we ensure consistency and reduce redundancy, making it easier to maintain and evolve the system.

## Installation

To install the shared types package, use the following command:

```bash
npm install @pulseward/shared-types
```

## Usage

Import the shared types in your TypeScript files as follows:

```typescript
import { Patient, Appointment } from "@pulseward/shared-types";
```

## Available Types

### Patient

```typescript
interface Patient {
  id: string;
  name: string;
  dateOfBirth: Date;
  gender: "male" | "female" | "other";
  contactInfo: {
    email: string;
    phone: string;
  };
  medicalHistory: MedicalHistory[];
}
```

### Appointment

```typescript
interface Appointment {
  id: string;
  patientId: string;
  clinicianId: string;
  date: Date;
  status: "scheduled" | "completed" | "canceled";
}
```

### MedicalHistory

```typescript
interface MedicalHistory {
  condition: string;
  diagnosisDate: Date;
  treatment: string;
}
```

## Contribution

Contributions to the shared types package are welcome! Please follow the contribution guidelines outlined in the main project repository.

## License

This project is proprietary and confidential. All rights reserved. See the LICENSE.md file for internal licensing terms.

---

For more information about the PulseWard hospital management system, please refer to the main project documentation.
