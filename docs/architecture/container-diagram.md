# PulseWard Hospital Management System - Container Diagram

## Overview

The PulseWard Hospital Management System (HMS) is designed to streamline healthcare management by integrating various applications and services into a cohesive system. This document outlines the container architecture of the PulseWard HMS, detailing the interactions between different components and their responsibilities.

## Container Diagram

```mermaid
graph TD;
    subgraph Apps
        A1[Patient Portal]
        A2[Clinician Portal]
        A3[Admin Console]
        A4[Operations Dashboard]
    end

    subgraph Services
        S1[API Gateway]
        S2[Auth Service]
        S3[Patient Service]
        S4[Appointment Service]
        S5[EHR Service]
        S6[Billing Service]
        S7[Pharmacy Service]
        S8[Lab Service]
        S9[Notification Service]
        S10[AI Project Manager Agent]
    end

    subgraph Packages
        P1[Shared Types]
        P2[Shared Utils]
        P3[UI Kit]
    end

    A1 -->|Uses| S1
    A2 -->|Uses| S1
    A3 -->|Uses| S1
    A4 -->|Uses| S1

    S1 -->|Routes to| S2
    S1 -->|Routes to| S3
    S1 -->|Routes to| S4
    S1 -->|Routes to| S5
    S1 -->|Routes to| S6
    S1 -->|Routes to| S7
    S1 -->|Routes to| S8
    S1 -->|Routes to| S9
    S1 -->|Routes to| S10

    S2 -->|Authenticates| S3
    S2 -->|Authenticates| S4
    S2 -->|Authenticates| S5
    S2 -->|Authenticates| S6
    S2 -->|Authenticates| S7
    S2 -->|Authenticates| S8
    S2 -->|Authenticates| S9

    S3 -->|Manages| P1
    S4 -->|Manages| P1
    S5 -->|Manages| P1
    S6 -->|Manages| P1
    S7 -->|Manages| P1
    S8 -->|Manages| P1
    S9 -->|Manages| P1

    S1 -->|Utilizes| P2
    S1 -->|Utilizes| P3
    S2 -->|Utilizes| P2
    S3 -->|Utilizes| P2
    S4 -->|Utilizes| P2
    S5 -->|Utilizes| P2
    S6 -->|Utilizes| P2
    S7 -->|Utilizes| P2
    S8 -->|Utilizes| P2
    S9 -->|Utilizes| P2
    S10 -->|Utilizes| P2
```

## Component Descriptions

### Applications

- **Patient Portal**: Allows patients to access their health information, manage appointments, and communicate with healthcare providers.
- **Clinician Portal**: Enables clinicians to manage patient care, view records, and collaborate with other healthcare professionals.
- **Admin Console**: Used for administrative tasks, user management, and system configuration.
- **Operations Dashboard**: Provides insights into hospital operations, performance metrics, and resource management.

### Services

- **API Gateway**: Acts as a single entry point for all client requests, routing them to the appropriate services.
- **Auth Service**: Manages user authentication and authorization across the system.
- **Patient Service**: Handles patient records, including personal information and medical history.
- **Appointment Service**: Manages patient appointments, scheduling, and notifications.
- **EHR Service**: Manages electronic health records, ensuring secure access and updates.
- **Billing Service**: Handles patient billing, payments, and insurance claims.
- **Pharmacy Service**: Manages medication prescriptions, inventory, and patient medication history.
- **Lab Service**: Manages lab tests, results, and reporting.
- **Notification Service**: Sends notifications to patients and staff regarding appointments, test results, and other important updates.
- **AI Project Manager Agent**: Assists in project management tasks, ensuring efficient workflow and task allocation.

### Packages

- **Shared Types**: Contains shared TypeScript types used across the applications and services.
- **Shared Utils**: Provides utility functions that can be reused across different components.
- **UI Kit**: Contains reusable UI components for consistent design across applications.

## Conclusion

The container architecture of the PulseWard HMS is designed to ensure modularity, scalability, and maintainability. Each component is responsible for specific functionalities, allowing for efficient development and deployment. The integration of an AI project manager agent enhances project management capabilities, ensuring smooth collaboration and task execution throughout the development lifecycle.
