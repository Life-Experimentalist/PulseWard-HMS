# Hospital Branding Configuration Model

## Goal

Keep this repository generic while allowing each hospital deployment to apply its own branding through configuration only.

## Design Principles

- No hospital name or logo hardcoded in source.
- All branding values come from tenant-level configuration.
- Branding updates do not require source code changes.
- Accessibility and contrast checks are mandatory.

## Branding Configuration Surface

- `tenantKey`: unique hospital key
- `displayName`: UI-facing hospital name
- `legalName`: legal/compliance name
- `tagline`: optional short phrase
- `logo`: light/dark variants, favicon, and app icon
- `colors`: primary, secondary, accent, surface, text, success, warning, danger
- `typography`: heading/body font family and scale
- `contact`: support phone, support email, website
- `complianceCopy`: consent or policy notices for that hospital

See also: `contracts/rest/hospital-branding-api.md` and `contracts/rest/hospital-branding.schema.json`.

## Runtime Behavior

1. Admin configures branding through Admin Console.
2. Configuration is validated against schema.
3. Settings are persisted per tenant.
4. UI consumes tokenized branding at runtime.
5. Changes are versioned and audit logged.

## Fallback Strategy

- If a tenant branding key is missing, use neutral PulseWard defaults.
- If uploaded logo fails validation, keep previous valid version.

## Security and Governance

- Only authorized admin roles can update branding.
- Every branding change requires audit metadata (who, when, what).
- Rollback is one-click to previous branding version.
