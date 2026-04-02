# PulseWard - Hospital Management System

Welcome to **PulseWard**, a comprehensive hospital management system designed to streamline healthcare operations and enhance patient care. This project aims to provide a robust platform for managing various aspects of hospital administration, patient care, and clinical operations.

## Project Overview

**PulseWard** is structured into multiple applications and services, each catering to specific user roles and functionalities within the hospital ecosystem. The system is built using modern technologies and follows best practices in software development to ensure scalability, maintainability, and security.

### Key Features

- **Patient Portal**: Allows patients to access their health information, manage appointments, and communicate with healthcare providers.
- **Clinician Portal**: Enables clinicians to manage patient records, treatment plans, and clinical workflows efficiently.
- **Admin Console**: Provides administrative tools for user management, reporting, and system configuration.
- **Operations Dashboard**: Offers insights into hospital operations, including resource allocation, patient flow, and performance metrics.
- **Modular Integrations**: Tenant-configurable adapters for WhatsApp, Telegram, Website Webhooks, and calendar providers with fallback routing.

### Architecture

The architecture of PulseWard is designed to support a microservices approach, ensuring that each service can be developed, deployed, and scaled independently. The system is composed of the following components:

- **Applications**: Frontend applications for different user roles (patients, clinicians, administrators).
- **Microservices**: Backend services handling specific functionalities such as authentication, patient management, appointment scheduling, billing, and more.
- **API Gateway**: A centralized entry point for all client requests, routing them to the appropriate microservices.
- **Shared Libraries**: Common utilities and types used across the applications and services.

### Development Model

PulseWard follows an **iterative development model**, allowing for continuous improvement and adaptation based on user feedback and changing requirements. The development process is organized into iterations, each focusing on delivering specific features and enhancements.

### Documentation

Comprehensive documentation is provided throughout the project, including:

- **Architecture Documentation**: Detailed descriptions of system components, data flow, and integration points.
- **API Documentation**: Specifications for all intra-project APIs, including request/response formats and error handling.
- **Runbooks**: Guides for operational procedures, including incident response and backup recovery.
- **Branding Configuration Guide**: Admin-configurable, tenant-based branding model for hospitals.
- **Source of Truth Policy**: GitHub-centered control model for change and operations evidence.
- **Deployment and Domain Migration Guide**: Practical rollout and domain cutover steps with `/api/v1` stability.
- **Release Documentation**: Versioned release notes under `docs/releases/`.
- **Landing Page Demo**: UI showcase in `apps/landing-page/`.

### AI Project Manager Agent

An AI project manager agent is integrated into the system to assist with project management tasks, ensuring efficient coordination among team members and facilitating decision-making processes. The agent operates under a defined constitution that outlines its responsibilities and governance.

### Getting Started

To set up the PulseWard project locally, follow the instructions in the `scripts/setup.ps1` file. Ensure that all dependencies are installed and configured correctly.

### Frontend App Commands

PulseWard apps now follow a shared React + Vite workflow with root-linked scripts.

Install all frontend app dependencies:

```powershell
npm run install:apps
```

Run individual app development servers:

```powershell
npm run start:landing
npm run start:admin:dev
npm run start:clinician:dev
npm run start:operations:dev
npm run start:patient:dev
```

Build all framework apps for deployment:

```powershell
npm run build:apps
```

Production static starts (compile-first):

```powershell
npm run start:admin
npm run start:clinician
npm run start:operations
npm run start:patient
```

### Contributing

Contributions to PulseWard are welcome! Please refer to the project's governance documents for guidelines on contributing, decision-making, and risk management.

### License

This project is proprietary and confidential. All rights reserved. See the LICENSE.md file for internal licensing terms.

---

For more information, please explore the documentation in the `docs` directory and the README files within each application and service. Thank you for your interest in PulseWard!
