# Auth Flow

JWT-based authentication with rotating refresh tokens and full audit trail.

```mermaid
sequenceDiagram
  autonumber
  participant B as Browser
  participant GW as API Gateway
  participant DB as SQLite

  B->>GW: POST /api/v1/auth/login {email, password}
  GW->>DB: SELECT user WHERE email = ? AND tenant_id = ?
  DB-->>GW: user row (hashed password, role, id)
  GW->>GW: bcrypt.compare(password, hash)
  alt invalid credentials
    GW-->>B: 401 Unauthorized
  else valid
    GW->>DB: UPDATE users SET last_login_at = now()
    GW->>DB: INSERT audit_events (action=auth.login)
    GW->>GW: SignJWT access (15 min) + refresh (30 days)
    GW-->>B: 200 { token, refresh, user }
  end

  Note over B,GW: Subsequent authenticated requests
  B->>GW: GET /api/v1/... Authorization: Bearer <access>
  GW->>GW: jwtVerify(token, JWT_SECRET)
  alt token expired
    B->>GW: POST /api/v1/auth/refresh {refresh}
    GW->>DB: SELECT refresh_token WHERE token = ? AND NOT revoked
    alt refresh valid
      GW->>DB: UPDATE — revoke old refresh token
      GW->>GW: Issue new access + new refresh (rotation)
      GW-->>B: 200 { token, refresh }
    else refresh expired/revoked
      GW-->>B: 401 — redirect to login
    end
  else token valid
    GW-->>B: 200 response data
  end
```

| Element                 | Description                                                                                   |
| ----------------------- | --------------------------------------------------------------------------------------------- |
| **Browser**             | Any of the 4 React portals storing `token` + `refresh` in localStorage                        |
| **API Gateway**         | Hono on Node 24; handles all auth endpoints at `/api/v1/auth/*`                               |
| **SQLite**              | Stores users with bcrypt hashes, refresh tokens (UNIQUE constraint), and audit log            |
| **bcrypt.compare**      | Cost-10 bcrypt via `bcryptjs`; no SHA-256                                                     |
| **SignJWT / jwtVerify** | `jose` library; HS256 algorithm; `JWT_SECRET` env var                                         |
| **Access token**        | 15-minute expiry; carries `sub` (user ID), `role`, `tid` (tenant ID), `eid` (entity ID)       |
| **Refresh token**       | 30-day expiry; single-use (rotated on each use); revoked on explicit logout                   |
| **Audit log**           | Every auth event (login, logout, refresh, failed attempt) written to the `audit_events` table |
| **Token rotation**      | Old refresh token is invalidated on each refresh — leaked tokens self-expire                  |
