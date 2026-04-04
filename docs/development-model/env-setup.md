# PulseWard Environment Setup Guide

This guide explains how to fill environment variables safely for local development and staging.

## Quick Start

1. Copy `.env.example` to `.env` if `.env` does not exist.
2. Keep `.env.example` committed with non-secret defaults and placeholders.
3. Keep real secrets only in `.env` or your deployment secret manager.
4. Run `pnpm run env:check` to verify `.env` and `.env.example` key consistency.
5. Run `pnpm run verify:m6` to validate contracts, parity regressions, and quick suite.

## Variable Types

- Required runtime secrets:
  - `JWT_SECRET`
  - `CLERK_SECRET_KEY`
  - `GOOGLE_OAUTH_CLIENT_SECRET`
  - `EMAIL_PASSWORD`
  - `ABHA_CLIENT_SECRET`
- Required runtime non-secrets:
  - Service ports and base URLs
  - Retry and retention tuning values
  - Feature flags and mode selectors
- Optional integration values:
  - `INTEGRATION_WEBHOOK_ENDPOINT`
  - `CONTRACT_CHECK_SPEC_OVERRIDES`

## Local Example Values

Use these as safe local-development examples.

- `DB_HOST=localhost`
- `DB_PORT=5432`
- `DB_NAME=pulseward`
- `DB_USER=pulseward_local`
- `DB_PASSWORD=change_me_local_only`
- `JWT_SECRET=change_me_jwt_local_only`
- `AUTH_SERVICE_BASE_URL=http://localhost:5101`
- `NOTIFICATION_SERVICE_BASE_URL=http://localhost:5102`
- `APPOINTMENT_SERVICE_BASE_URL=http://localhost:5103`
- `VITE_NOTIFICATION_PROXY_TARGET=http://127.0.0.1:8088`
- `VITE_AUTH_PROXY_TARGET=http://127.0.0.1:5101`

## How To Acquire Keys

### Google OAuth

1. Open Google Cloud Console.
2. Create or select your project.
3. Enable required OAuth APIs.
4. Create OAuth client credentials.
5. Set the callback to match `GOOGLE_OAUTH_REDIRECT_URI`.
6. Put values in `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET`.

### Clerk

1. Open Clerk Dashboard.
2. Create or select your application.
3. Copy publishable key to `CLERK_PUBLISHABLE_KEY`.
4. Copy secret key to `CLERK_SECRET_KEY`.

### Firebase (optional push)

1. Open Firebase Console.
2. Create or select your project.
3. Add a web app in project settings.
4. Copy project id, web api key, sender id, and app id.
5. Fill `FIREBASE_PROJECT_ID`, `FIREBASE_WEB_API_KEY`, `FIREBASE_MESSAGING_SENDER_ID`, `FIREBASE_APP_ID`.

### ABHA

1. Obtain sandbox or production credentials through your approved ABHA onboarding process.
2. Fill `ABHA_CLIENT_ID`, `ABHA_CLIENT_SECRET`, and `ABHA_GATEWAY_BASE_URL`.
3. Keep `ABHA_ENABLED=false` until credentials and runbooks are ready.
4. Use `ABHA_TRANSACTION_READ_PATH` and `ABHA_TRANSACTION_WRITE_PATH` defaults unless your gateway path differs.

### Messaging and Calendar Credential References

1. Store provider credentials in your configured secret store.
2. Put only the reference id or key path in env values:
   - `INTEGRATION_TELEGRAM_CREDENTIALS`
   - `INTEGRATION_WHATSAPP_CREDENTIALS`
   - `INTEGRATION_EMAIL_SMTP_CREDENTIALS`
   - `INTEGRATION_GOOGLE_CALENDAR_CREDENTIALS`
   - `INTEGRATION_APPLE_CALENDAR_CREDENTIALS`
   - `INTEGRATION_OUTLOOK_CALENDAR_CREDENTIALS`
   - `INTEGRATION_ICS_CREDENTIALS`

## Validation Checklist

1. Run `pnpm run env:check` and confirm success.
2. Run `pnpm run contracts:check -- --strict`.
3. Run `pnpm run test:quick -- tests/contracts/parity-regression.test.js`.
4. Run `pnpm run test:quick`.
5. If you need coverage report, run `pnpm run test`.

## Notes

- Do not commit real secrets.
- Keep values aligned with service fallback defaults to avoid inconsistent runtime behavior.
- If key names change, update `.env.example` and rerun `pnpm run env:check`.

