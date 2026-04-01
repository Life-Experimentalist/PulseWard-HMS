# Hospital Branding Admin API (Draft)

## Purpose

API contract for tenant-level hospital branding management from the Admin Console.

## Endpoints

### Get tenant branding

- Method: GET
- Path: /api/admin/tenants/{tenantKey}/branding
- Response: branding payload conforming to hospital-branding.schema.json

### Update tenant branding

- Method: PUT
- Path: /api/admin/tenants/{tenantKey}/branding
- Request body: branding payload conforming to hospital-branding.schema.json
- Requirements: admin role with branding:write permission

### Upload branding asset

- Method: POST
- Path: /api/admin/tenants/{tenantKey}/branding/assets
- Request: multipart file upload (logo/favicon)
- Response: asset URL and validation summary

### Rollback branding version

- Method: POST
- Path: /api/admin/tenants/{tenantKey}/branding/rollback
- Request body: { "version": "<previous-version>" }
- Response: active branding version after rollback

## Operational Requirements

- Every update must create an audit record.
- Schema validation is mandatory before persistence.
- Failed validation must preserve previous active branding.
