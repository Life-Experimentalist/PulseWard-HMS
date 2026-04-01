# Provider Adapter Model for Messaging and Calendars

## Purpose

Enable plug-and-play integration providers so each hospital tenant can choose WhatsApp, Telegram, Email, Webhook, Google Calendar, Apple Calendar, Outlook, or ICS without changing core business logic.

## Architecture Pattern

- Core domain services call provider-agnostic interfaces.
- Provider adapters implement the interfaces.
- Tenant config selects default and fallback providers.
- Admin can update provider selection through configuration APIs.

## Messaging Channels Covered

- patient-notification
- staff-notification
- website-hook

## Diagram

```mermaid
flowchart LR
  A[Admin Console] --> B[Integration Config API]
  B --> C[Tenant Integration Config]
  C --> D[Routing Resolver]

  D --> E[Messaging Adapter Registry]
  D --> F[Calendar Adapter Registry]

  E --> E1[WhatsApp Adapter]
  E --> E2[Telegram Adapter]
  E --> E3[Email Adapter]
  E --> E4[Webhook Adapter]

  F --> F1[Google Calendar Adapter]
  F --> F2[Apple Calendar Adapter]
  F --> F3[Outlook Calendar Adapter]
  F --> F4[ICS Calendar Adapter]

  E1 --> G[Notification Delivery]
  E2 --> G
  E3 --> G
  E4 --> G

  F1 --> H[Appointment Booking]
  F2 --> H
  F3 --> H
  F4 --> H
```

## Extension Rules

1. Add provider key to shared types.
2. Add provider config shape in schema.
3. Implement adapter class in service adapter folder.
4. Register provider in adapter registry.
5. Add provider test endpoint behavior.
6. Update admin documentation.
