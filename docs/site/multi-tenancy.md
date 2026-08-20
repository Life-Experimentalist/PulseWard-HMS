# Multi-Tenancy

PulseWard HMS runs multiple hospital tenants inside a single deployment and a single
SQLite database. Isolation is enforced by a `tenant_id` column on every row.

## How tenancy is resolved

Tenancy rides on the JWT. When a user logs in, the access token is issued with a `tid`
claim set from that user's `tenant_id`:

```
{ sub: <userId>, role: <role>, tid: <tenantId>, eid: <linkedEntityId> }
```

On every authenticated request, `requireAuth` verifies the token and exposes the claims
to the handler. Each handler reads the tenant from the token and scopes its queries:

```js
const tid = c.get("user").tid;
db.prepare("SELECT * FROM patients WHERE tenant_id = ? ...").all(tid, ...);
```

Because the tenant comes from the signed token — never from a request body or an
untrusted header — a user can only ever read or write rows belonging to their own
tenant. There is no `Origin`- or header-based tenant switching at runtime.

## The `tenants` table

| Column          | Type    | Notes                                   |
| --------------- | ------- | --------------------------------------- |
| `id`            | TEXT    | UUID primary key                        |
| `slug`          | TEXT    | Unique short key (e.g. `default`)       |
| `name`          | TEXT    | Display name                            |
| `hfr_id`        | TEXT    | Optional health-facility registry id    |
| `accent`        | TEXT    | Brand accent colour (default `#0f4c5c`) |
| `branding_json` | TEXT    | Per-tenant branding overrides (JSON)    |
| `created_at`    | INTEGER | Unix epoch seconds                      |

The first boot seeds a tenant with slug `default`; new patient self-signups are attached
to it.

## Adding a new tenant

1. Insert a row into the `tenants` table (the id is a UUID you generate):

   ```sql
   INSERT INTO tenants (id, slug, name)
   VALUES ('4b1c…-uuid', 'acme-hospital', 'ACME Hospital');
   ```

2. Create the tenant's first admin user with that tenant's `tenant_id` (via a seed
   script or by inserting into `users`). That admin can then create clinicians and staff
   from the Admin Console.

## Tenant isolation guarantees

- Every read and write is scoped by `tenant_id`, taken from the signed JWT.
- MRN sequences are per-tenant (`PW-26-NNNNN`, counted within each tenant).
- Refresh tokens and audit events also carry `tenant_id`, so sessions and the audit
  trail never cross tenant boundaries.
