# PulseWard Runtime Stack Inventory

Last updated: 2026-04-04

This document maps the current implementation stack for each PulseWard app and service.

## Runtime Baseline

- Node.js runtime baseline in CI/CD workflows: `22`.
- Backend HTTP framework: Express (`^4.17.1` in root dependency set).
- Frontend build tool for React apps: Vite (`^7.3.1`) with `@vitejs/plugin-react` (`^5.2.0`).
- Frontend UI library for framework apps: React (`^18.3.1`) and `react-dom` (`^18.3.1`).
- API contracts: OpenAPI per service with repository-level parity checks.

## Frontend App Matrix

| App                         | UI Framework        | Build/Dev Tooling                              | Entry/Config Notes                                                                      |
| --------------------------- | ------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------- |
| `apps/admin-console`        | React 18.3.1        | Vite 7.3.1 + plugin-react 5.2.0               | `src/main.jsx`, `vite.config.js`, env-driven port (`ADMIN_CONSOLE_PORT`, default 4180). |
| `apps/clinician-portal`     | React 18.3.1        | Vite 7.3.1 + plugin-react 5.2.0               | `src/main.jsx`, `vite.config.js`, default dev port 4311.                                |
| `apps/operations-dashboard` | React 18.3.1        | Vite 7.3.1 + plugin-react 5.2.0               | `src/main.jsx`, `vite.config.js`, default dev port 4312.                                |
| `apps/patient-portal`       | React 18.3.1        | Vite 7.3.1 + plugin-react 5.2.0               | `src/main.jsx`, `vite.config.js`, default dev port 4313.                                |
| `apps/landing-page`         | Vanilla HTML/CSS/JS | No Vite/React build pipeline (served directly) | `index.html`, `app.js`, `styles.css`, static multi-page demo under `pages/`.            |

## Backend Service Matrix

| Service                         | Runtime | HTTP Layer                                                 | Contract Source                              |
| ------------------------------- | ------- | ---------------------------------------------------------- | -------------------------------------------- |
| `services/api-gateway`          | Node.js | Express app (`services/api-gateway/src`)                   | `services/api-gateway/openapi.yaml`          |
| `services/auth-service`         | Node.js | Express router (`services/auth-service/routes.js`)         | `services/auth-service/openapi.yaml`         |
| `services/appointment-service`  | Node.js | Express router (`services/appointment-service/routes.js`)  | `services/appointment-service/openapi.yaml`  |
| `services/notification-service` | Node.js | Express router (`services/notification-service/routes.js`) | `services/notification-service/openapi.yaml` |
| `services/patient-service`      | Node.js | Express app/router (`services/patient-service/src`)        | `services/patient-service/openapi.yaml`      |
| `services/ehr-service`          | Node.js | Express router (`services/ehr-service/routes.js`)          | `services/ehr-service/openapi.yaml`          |
| `services/lab-service`          | Node.js | Express router (`services/lab-service/routes.js`)          | `services/lab-service/openapi.yaml`          |
| `services/pharmacy-service`     | Node.js | Express router (`services/pharmacy-service/src`)           | `services/pharmacy-service/openapi.yaml`     |
| `services/billing-service`      | Node.js | Express router (`services/billing-service/src`)            | `services/billing-service/openapi.yaml`      |

## Shared Engineering Tooling

| Category                 | Current Tooling                                                          |
| ------------------------ | ------------------------------------------------------------------------ |
| Test framework           | Jest 30.3.0 (`pnpm run test`)                                            |
| Linting                  | ESLint 8.57.1 (`pnpm run lint`)                                          |
| Formatting               | Prettier 2.8.8 (`pnpm run format`)                                       |
| Type checking            | TypeScript 4.9.5 (`pnpm run build:types`)                                |
| Package manager strategy | pnpm workspace with lockfile-driven local and CI installs                |

## Context7 Reference Notes

- Express response/export behavior aligned with documented `res.json`, `res.set`, `res.type`, and `res.attachment` patterns.
- Vite app configuration follows `defineConfig` + React plugin model for dev/build flows.
- React application entry remains aligned with `createRoot` guidance for modern client bootstrapping.

