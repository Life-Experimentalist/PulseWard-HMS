# PulseWard Hospital Management System

Welcome to the **PulseWard** Hospital Management System (HMS) project! This documentation provides an overview of the project, its architecture, and guidelines for development and contribution.

## Project Overview

**PulseWard** is designed to streamline hospital operations, enhance patient care, and improve administrative efficiency. The system encompasses various applications tailored for different user roles, including patients, clinicians, and administrators.

### Key Features

- **Patient Portal**: Allows patients to access their health information, manage appointments, and communicate with healthcare providers.
- **Clinician Portal**: Enables clinicians to manage patient records, treatment plans, and clinical workflows.
- **Admin Console**: Facilitates administrative tasks such as user management, reporting, and system configuration.
- **Operations Dashboard**: Provides insights into hospital operations, resource allocation, and performance metrics.

## Architecture

The architecture of PulseWard is based on a microservices approach, ensuring scalability and maintainability. The system is divided into several key components:

- **Applications**: Frontend applications for different user roles.
- **Services**: Backend microservices handling specific functionalities (e.g., authentication, patient management, billing).
- **Packages**: Shared libraries and utilities used across applications and services.
- **Contracts**: API contracts and event schemas for communication between services.
- **Governance**: Documentation and policies governing project management and AI agent behavior.
- **Formalized Stack Blueprint**: See `docs/architecture/future-proof-tech-stack.md` and `docs/TECH-STACK-DECISIONS.md` for the current platform decisions.
- **Branding Configuration**: Multi-hospital branding is config-driven, see `docs/architecture/hospital-branding-config.md`.
- **Branding UX Guide**: Subtle and consistent hospital branding guidance is documented in `docs/branding/subtle-branding-guidelines.md`.
- **Provider Adapter Model**: Modular WhatsApp, Telegram, Webhook, and calendar integration architecture is documented in `docs/architecture/provider-adapter-model.md`.
- **Integration Admin Quickstart**: Step-by-step setup for provider routing is documented in `docs/deployment/integrations-admin-quickstart.md`.
- **Deployment and Domain Migration Guide**: End-to-end deployment and domain cutover steps are documented in `docs/deployment/deploy-and-domain-migration.md`.
- **Messaging Choice Guide**: Free and paid channel strategy is documented in `docs/deployment/messaging-provider-choice-guide.md`.
- **Operational Source of Truth Policy**: See `docs/runbooks/source-of-truth-policy.md`.
- **Release Notes**: Versioned release documentation is tracked in `docs/releases/`.
- **Landing Page Demo**: Showcase UI is available in `apps/landing-page/`.

## Development Model

PulseWard follows an **iterative development model**, allowing for continuous improvement and adaptation based on user feedback and changing requirements. Key aspects include:

- **Release Trains**: Regularly scheduled releases to deliver new features and improvements.
- **Quality Gates**: Defined checkpoints to ensure code quality and adherence to standards.

## API Documentation

The project includes comprehensive API documentation, detailing the available endpoints, request/response formats, and error handling. This documentation is crucial for developers working on integrations and service interactions.

## AI Project Manager Agent

An AI project manager agent is integrated into the PulseWard system to assist with project management tasks. This agent follows a constitution that outlines its responsibilities and behavior, ensuring effective collaboration and task management.

## Contribution Guidelines

We welcome contributions to the PulseWard project! Please follow these guidelines:

1. **Fork the Repository**: Create a personal copy of the repository.
2. **Create a Feature Branch**: Develop your feature or fix in a separate branch.
3. **Write Tests**: Ensure your changes are covered by tests.
4. **Submit a Pull Request**: Provide a clear description of your changes and the problem they solve.

## Getting Started

To get started with the PulseWard project, follow the setup instructions in the `scripts/setup.ps1` file. Ensure you have the necessary environment variables configured as per the `.env.example` file.

## License

This project is proprietary and confidential. All rights reserved. See the LICENSE.md file for internal licensing terms.

---

For more detailed documentation on specific components, please refer to the respective `README.md` files within each application and service directory.
