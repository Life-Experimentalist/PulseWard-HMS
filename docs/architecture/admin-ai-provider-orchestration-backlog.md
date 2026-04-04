# Admin AI Provider Orchestration Backlog (Planned)

Status: Planned request. Not implemented in current slice.

## Goal

Allow each tenant admin to configure AI provider strategy without code changes.

## Requested Capabilities

1. Provider adapter layer for `Gemini`, `OpenAI`, `Claude`, `DeepSeek`.
2. Admin-console controls for:
   - provider selection
   - primary model
   - backup model
   - fallback chain and retry policy
3. API key pool support per provider with routing modes:
   - round-robin
   - random
   - sticky-until-rate-limit-then-next
4. Failover behavior:
   - primary model failure -> backup model
   - provider failure -> next provider in chain
5. Tenant isolation guarantees:
   - per-tenant key pool
   - per-tenant model policy
   - no cross-tenant key reuse unless explicitly shared by policy
6. Observability:
   - provider/model/key usage counters
   - rate-limit and failover telemetry
   - per-tenant AI spend and error reporting

## Contract and Admin Surface (Planned)

1. `GET /api/v1/admin/ai/providers`
2. `GET /api/v1/admin/ai/settings?tenantKey=<tenant>`
3. `PUT /api/v1/admin/ai/settings`
4. `POST /api/v1/admin/ai/keys/rotate`
5. `GET /api/v1/admin/ai/telemetry?tenantKey=<tenant>`

## Security and Compliance Notes

1. Keys must be stored in secret manager, never plaintext in source control.
2. Admin UI should mask key values and reveal only suffix metadata.
3. Audit log every AI settings change with tenant, actor, and diff summary.

## Delivery Note

Implementation is intentionally deferred. Current scope remains local mobile push + Telegram + SMTP onboarding.
