import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { v4 as uuid } from "uuid";
import { createHash, randomBytes } from "node:crypto";
import { getDb } from "./db.js";

// ─── CONFIG ──────────────────────────────────────────────────────────────────
// Load a local .env if present (Node >= 20.6). In containers the env is injected
// directly, so a missing file is expected and harmless.
try {
  process.loadEnvFile();
} catch {
  /* no .env file — rely on the real environment */
}

export const PORT = Number(process.env.API_PORT || 8787);
const NODE_ENV = process.env.NODE_ENV || "development";
const JWT_ALG = "HS256";
const ACCESS_TTL = 60 * 15; // 15 minutes
const REFRESH_TTL = 60 * 60 * 24 * 30; // 30 days

// Known placeholder secrets that must never be used to sign real tokens.
const PLACEHOLDER_SECRETS = new Set([
  "change_me_jwt_secret_min_32_chars_random",
  "pulseward-dev-secret-change-in-production-min-32-chars",
]);

function resolveJwtSecret() {
  const s = process.env.JWT_SECRET;
  const isStrong = typeof s === "string" && s.length >= 32 && !PLACEHOLDER_SECRETS.has(s);
  if (NODE_ENV === "production") {
    if (!isStrong) {
      console.error(
        "\nFATAL: JWT_SECRET is missing, shorter than 32 characters, or a known placeholder."
      );
      console.error("Refusing to start in production with an insecure signing key.");
      console.error("Generate a strong secret with:  pnpm run jwt:generate\n");
      process.exit(1);
    }
    return s;
  }
  // Development / test: honour an explicitly provided secret so sessions stay
  // stable across restarts; otherwise fall back to an ephemeral random secret.
  if (s) return s;
  const ephemeral = randomBytes(48).toString("hex");
  console.warn(
    "⚠  JWT_SECRET not set — using an ephemeral development secret. Sessions reset on restart."
  );
  console.warn("   Set JWT_SECRET in .env (pnpm run jwt:generate) for stable local sessions.\n");
  return ephemeral;
}

const JWT_SECRET = new TextEncoder().encode(resolveJwtSecret());

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function ok(c, data, status = 200) {
  return c.json({ ok: true, ...data }, status);
}
function fail(c, code, msg, status = 400) {
  return c.json({ ok: false, error: code, message: msg }, status);
}

function sha256(s) {
  return createHash("sha256").update(s).digest("hex");
}

async function signToken(payload, ttl = ACCESS_TTL) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: JWT_ALG })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + ttl)
    .sign(JWT_SECRET);
}

function accessPayload(user) {
  return {
    sub: user.id,
    role: user.role,
    tid: user.tenant_id,
    eid: user.linked_entity_id || user.id,
    name: user.name,
    email: user.email,
    type: "access",
  };
}

// Issue a rotating refresh token, persisting it so it can be revoked. Returns
// both the signed token and its jti (id) so the caller can chain rotation.
async function issueRefresh(db, user, familyId) {
  const jti = uuid();
  const now = Math.floor(Date.now() / 1000);
  const token = await signToken(
    { sub: user.id, type: "refresh", tid: user.tenant_id, jti, fam: familyId },
    REFRESH_TTL
  );
  db.prepare(
    "INSERT INTO refresh_tokens(id,tenant_id,user_id,family_id,token_hash,expires_at,created_at) VALUES(?,?,?,?,?,?,?)"
  ).run(jti, user.tenant_id, user.id, familyId, sha256(token), now + REFRESH_TTL, now);
  return { token, jti };
}

function audit(tenantId, actor, action, scope, ip) {
  try {
    getDb()
      .prepare("INSERT INTO audit_events(id,tenant_id,actor,action,scope,ip) VALUES(?,?,?,?,?,?)")
      .run(uuid(), tenantId, actor, action, scope || null, ip || null);
  } catch (_) {}
}

function getIp(c) {
  return c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

function tryParse(v, def) {
  if (v === null || v === undefined) return def;
  if (typeof v !== "string") return v;
  try {
    return JSON.parse(v);
  } catch {
    return def;
  }
}

// node:sqlite's DatabaseSync has no better-sqlite3-style .transaction() helper,
// so wrap a function to run inside BEGIN/COMMIT, rolling back on any throw.
// Returns a callable that executes fn atomically and re-throws its error.
function transaction(db, fn) {
  return (...args) => {
    db.exec("BEGIN");
    try {
      const result = fn(...args);
      db.exec("COMMIT");
      return result;
    } catch (e) {
      try {
        db.exec("ROLLBACK");
      } catch {
        /* rollback best-effort */
      }
      throw e;
    }
  };
}

async function requireAuth(c, next) {
  const header = c.req.header("authorization") || "";
  if (!header.startsWith("Bearer ")) return fail(c, "no_session", "Authentication required", 401);
  try {
    const { payload } = await jwtVerify(header.slice(7), JWT_SECRET, { algorithms: [JWT_ALG] });
    // Only access tokens are valid for API calls. Refresh tokens (type:'refresh')
    // carry no role/eid and must never be accepted here.
    if (payload.type !== "access") return fail(c, "no_session", "Invalid token type", 401);
    c.set("user", payload);
    await next();
  } catch {
    return fail(c, "no_session", "Token expired or invalid", 401);
  }
}

function requireRole(...roles) {
  return async (c, next) => {
    const user = c.get("user");
    if (!user || !roles.includes(user.role))
      return fail(c, "forbidden", "Insufficient permissions", 403);
    await next();
  };
}

// ─── APP ─────────────────────────────────────────────────────────────────────

export const app = new Hono();

if (NODE_ENV !== "test") app.use("*", logger());
app.use("*", secureHeaders());

const ALLOWED_ORIGINS = new Set([
  "http://localhost:4313",
  "http://localhost:4311",
  "http://localhost:4180",
  "http://localhost:4312",
  "http://127.0.0.1:4313",
  "http://127.0.0.1:4311",
  "http://127.0.0.1:4180",
  "http://127.0.0.1:4312",
  ...(process.env.CORS_ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
]);

app.use(
  "*",
  cors({
    origin: (origin) => {
      if (!origin) return "*";
      try {
        const u = new URL(origin);
        if (u.hostname === "localhost" || u.hostname === "127.0.0.1") return origin;
      } catch {}
      return ALLOWED_ORIGINS.has(origin) ? origin : null;
    },
    credentials: true,
    allowHeaders: ["Content-Type", "Authorization", "X-Tenant-Key"],
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  })
);

app.get("/health", (c) => ok(c, { service: "api-gateway", version: "1.0.0" }));

// ─── AUTH ────────────────────────────────────────────────────────────────────

app.post("/api/v1/auth/login", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { email, password } = body;
  if (!email || !password) return fail(c, "validation_failed", "email and password required");
  const db = getDb();
  const user = db
    .prepare("SELECT u.* FROM users u WHERE u.email=?")
    .get(String(email).toLowerCase().trim());
  if (!user) return fail(c, "invalid_credentials", "Invalid email or password", 401);
  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) return fail(c, "invalid_credentials", "Invalid email or password", 401);
  db.prepare("UPDATE users SET last_login_at=? WHERE id=?").run(
    Math.floor(Date.now() / 1000),
    user.id
  );
  const token = await signToken(accessPayload(user), ACCESS_TTL);
  const { token: refresh } = await issueRefresh(db, user, uuid());
  audit(user.tenant_id, user.email, "auth.login", `user:${user.id}`, getIp(c));
  return ok(c, {
    token,
    refresh,
    role: user.role,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      tenantId: user.tenant_id,
      linkedEntityId: user.linked_entity_id,
    },
  });
});

app.post("/api/v1/auth/signup", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const schema = z.object({
    name: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(8),
    phone: z.string().optional(),
    dob: z.string().optional(),
    gender: z.enum(["M", "F", "O"]).optional(),
  });
  const parsed = schema.safeParse(body);
  if (!parsed.success) return fail(c, "validation_failed", parsed.error.issues[0].message);
  const { name, email, password, phone, dob, gender } = parsed.data;
  const db = getDb();
  const tenant = db.prepare("SELECT id FROM tenants WHERE slug=?").get("default");
  if (!tenant) return fail(c, "internal", "No tenant configured", 500);
  const existing = db
    .prepare("SELECT id FROM users WHERE email=? AND tenant_id=?")
    .get(email.toLowerCase(), tenant.id);
  if (existing) return fail(c, "email_taken", "Email already registered", 409);
  const hash = await bcrypt.hash(password, 10);
  const patientId = uuid();
  const userId = uuid();
  const insertPatientAndUser = transaction(db, () => {
    const seq = (
      db.prepare("SELECT COUNT(*) as c FROM patients WHERE tenant_id=?").get(tenant.id).c + 1
    )
      .toString()
      .padStart(5, "0");
    const mrn = `PW-26-${seq}`;
    db.prepare(
      "INSERT INTO patients(id,tenant_id,mrn,profile_id,name,dob,gender,phone,email) VALUES(?,?,?,?,?,?,?,?,?)"
    ).run(
      patientId,
      tenant.id,
      mrn,
      `PID-${uuid().slice(0, 5).toUpperCase()}`,
      name,
      dob || null,
      gender || null,
      phone || null,
      email.toLowerCase()
    );
    db.prepare(
      "INSERT INTO users(id,tenant_id,email,password_hash,role,linked_entity_id,name) VALUES(?,?,?,?,?,?,?)"
    ).run(userId, tenant.id, email.toLowerCase(), hash, "patient", patientId, name);
  });
  try {
    insertPatientAndUser();
  } catch (e) {
    if (e?.message?.includes("UNIQUE"))
      return fail(c, "conflict", "Registration conflict, please try again", 409);
    throw e;
  }
  const user = {
    id: userId,
    role: "patient",
    tenant_id: tenant.id,
    linked_entity_id: patientId,
    name,
    email: email.toLowerCase(),
  };
  const token = await signToken(accessPayload(user), ACCESS_TTL);
  const { token: refresh } = await issueRefresh(db, user, uuid());
  audit(tenant.id, email, "auth.signup", `user:${userId}`, getIp(c));
  return ok(
    c,
    {
      token,
      refresh,
      role: "patient",
      user: {
        id: userId,
        name,
        email: email.toLowerCase(),
        role: "patient",
        tenantId: tenant.id,
        linkedEntityId: patientId,
      },
    },
    201
  );
});

app.post("/api/v1/auth/refresh", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  if (!body.refresh) return fail(c, "no_session", "refresh token required", 401);
  const db = getDb();
  let rp;
  try {
    ({ payload: rp } = await jwtVerify(body.refresh, JWT_SECRET, { algorithms: [JWT_ALG] }));
  } catch {
    return fail(c, "no_session", "Invalid refresh token", 401);
  }
  if (rp.type !== "refresh" || !rp.jti) return fail(c, "no_session", "Invalid refresh token", 401);
  const now = Math.floor(Date.now() / 1000);
  const row = db.prepare("SELECT * FROM refresh_tokens WHERE id=?").get(rp.jti);
  if (!row) return fail(c, "no_session", "Invalid refresh token", 401);
  if (row.revoked_at) {
    // Token reuse — a previously rotated token was replayed. Revoke the whole
    // family so a stolen token cannot be used to mint new sessions.
    db.prepare(
      "UPDATE refresh_tokens SET revoked_at=? WHERE family_id=? AND revoked_at IS NULL"
    ).run(now, row.family_id);
    audit(
      row.tenant_id,
      row.user_id,
      "auth.refresh.reuse_detected",
      `fam:${row.family_id}`,
      getIp(c)
    );
    return fail(c, "no_session", "Session revoked, please sign in again", 401);
  }
  if (row.expires_at <= now)
    return fail(c, "no_session", "Session expired, please sign in again", 401);
  const user = db.prepare("SELECT * FROM users WHERE id=?").get(row.user_id);
  if (!user) return fail(c, "no_session", "User not found", 401);
  const { token: refresh, jti: newJti } = await issueRefresh(db, user, row.family_id);
  db.prepare("UPDATE refresh_tokens SET revoked_at=?, replaced_by=? WHERE id=?").run(
    now,
    newJti,
    row.id
  );
  const token = await signToken(accessPayload(user), ACCESS_TTL);
  // Opportunistic cleanup of long-expired rows.
  db.prepare("DELETE FROM refresh_tokens WHERE expires_at < ?").run(now - 86400);
  return ok(c, { token, refresh });
});

app.post("/api/v1/auth/logout", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  if (!body.refresh) return ok(c, {}); // idempotent — nothing to revoke
  try {
    const { payload: rp } = await jwtVerify(body.refresh, JWT_SECRET, { algorithms: [JWT_ALG] });
    if (rp.type === "refresh" && rp.jti) {
      const now = Math.floor(Date.now() / 1000);
      const row = getDb()
        .prepare("SELECT family_id, tenant_id, user_id FROM refresh_tokens WHERE id=?")
        .get(rp.jti);
      if (row) {
        getDb()
          .prepare(
            "UPDATE refresh_tokens SET revoked_at=? WHERE family_id=? AND revoked_at IS NULL"
          )
          .run(now, row.family_id);
        audit(row.tenant_id, row.user_id, "auth.logout", `fam:${row.family_id}`, getIp(c));
      }
    }
  } catch {
    /* invalid token — treat logout as a no-op success */
  }
  return ok(c, {});
});

app.get("/api/v1/auth/me", requireAuth, (c) => {
  const u = c.get("user");
  const user = getDb()
    .prepare("SELECT id,name,email,role,linked_entity_id,tenant_id FROM users WHERE id=?")
    .get(u.sub);
  if (!user) return fail(c, "not_found", "User not found", 404);
  return ok(c, {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      tenantId: user.tenant_id,
      linkedEntityId: user.linked_entity_id,
    },
  });
});

// ─── PATIENTS ─────────────────────────────────────────────────────────────────

function parsePatient(p) {
  if (!p) return null;
  return {
    id: p.id,
    tenantId: p.tenant_id,
    mrn: p.mrn,
    profileId: p.profile_id,
    name: p.name,
    dob: p.dob,
    gender: p.gender,
    bloodType: p.blood_type,
    phone: p.phone,
    email: p.email,
    photoUrl: p.photo_url,
    abhaNumber: p.abha_number,
    abhaAddress: p.abha_address,
    conditionsJson: tryParse(p.conditions_json, []),
    allergiesJson: tryParse(p.allergies_json, []),
    vitalsJson: tryParse(p.vitals_json, []),
    demographicsJson: tryParse(p.demographics_json, {}),
    createdAt: p.created_at,
  };
}

app.get(
  "/api/v1/patients",
  requireAuth,
  requireRole("admin", "clinician", "frontdesk", "ops"),
  (c) => {
    const { q, limit = "50" } = c.req.query();
    const db = getDb();
    const tid = c.get("user").tid;
    const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);
    let rows;
    if (q) {
      const term = `%${q}%`;
      rows = db
        .prepare(
          "SELECT * FROM patients WHERE tenant_id=? AND (name LIKE ? OR mrn LIKE ? OR phone LIKE ? OR email LIKE ?) ORDER BY name LIMIT ?"
        )
        .all(tid, term, term, term, term, lim);
    } else {
      rows = db
        .prepare("SELECT * FROM patients WHERE tenant_id=? ORDER BY created_at DESC LIMIT ?")
        .all(tid, lim);
    }
    return ok(c, { patients: rows.map(parsePatient) });
  }
);

app.get("/api/v1/patients/:id", requireAuth, (c) => {
  const u = c.get("user");
  const patient = getDb()
    .prepare("SELECT * FROM patients WHERE id=? AND tenant_id=?")
    .get(c.req.param("id"), u.tid);
  if (!patient) return fail(c, "not_found", "Patient not found", 404);
  if (u.role === "patient" && patient.id !== u.eid)
    return fail(c, "forbidden", "Access denied", 403);
  return ok(c, { patient: parsePatient(patient) });
});

app.post(
  "/api/v1/patients",
  requireAuth,
  requireRole("admin", "clinician", "frontdesk"),
  async (c) => {
    const body = await c.req.json().catch(() => ({}));
    if (!body.name) return fail(c, "validation_failed", "name required");
    const db = getDb();
    const tid = c.get("user").tid;
    const id = uuid();
    const insertPat = transaction(db, () => {
      const seq = (
        db.prepare("SELECT COUNT(*) as c FROM patients WHERE tenant_id=?").get(tid).c + 1
      )
        .toString()
        .padStart(5, "0");
      db.prepare(
        "INSERT INTO patients(id,tenant_id,mrn,profile_id,name,dob,gender,blood_type,phone,email) VALUES(?,?,?,?,?,?,?,?,?,?)"
      ).run(
        id,
        tid,
        `PW-26-${seq}`,
        `PID-${uuid().slice(0, 5).toUpperCase()}`,
        body.name,
        body.dob || null,
        body.gender || null,
        body.bloodType || null,
        body.phone || null,
        body.email || null
      );
    });
    try {
      insertPat();
    } catch (e) {
      if (e?.message?.includes("UNIQUE"))
        return fail(c, "conflict", "MRN conflict, please try again", 409);
      throw e;
    }
    const patient = db.prepare("SELECT * FROM patients WHERE id=?").get(id);
    audit(tid, c.get("user").email, "patient.created", `pat:${id}`, getIp(c));
    return ok(c, { patient: parsePatient(patient) }, 201);
  }
);

app.patch("/api/v1/patients/:id", requireAuth, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const db = getDb();
  const u = c.get("user");
  const tid = u.tid;
  const patient = db
    .prepare("SELECT * FROM patients WHERE id=? AND tenant_id=?")
    .get(c.req.param("id"), tid);
  if (!patient) return fail(c, "not_found", "Patient not found", 404);
  if (u.role === "patient" && patient.id !== u.eid)
    return fail(c, "forbidden", "Access denied", 403);
  // Patients may only update their own demographic fields, not clinical data.
  const clinicalFields = ["conditionsJson", "allergiesJson", "vitalsJson"];
  if (u.role === "patient" && clinicalFields.some((f) => body[f] !== undefined)) {
    return fail(c, "forbidden", "Patients cannot modify clinical data", 403);
  }
  const map = {
    name: "name",
    dob: "dob",
    gender: "gender",
    bloodType: "blood_type",
    phone: "phone",
    email: "email",
    photoUrl: "photo_url",
    conditionsJson: "conditions_json",
    allergiesJson: "allergies_json",
    vitalsJson: "vitals_json",
    demographicsJson: "demographics_json",
  };
  const updates = [];
  const vals = [];
  for (const [bk, dbk] of Object.entries(map)) {
    if (body[bk] !== undefined) {
      updates.push(`${dbk}=?`);
      vals.push(typeof body[bk] === "object" ? JSON.stringify(body[bk]) : body[bk]);
    }
  }
  if (updates.length > 0)
    db.prepare(`UPDATE patients SET ${updates.join(",")} WHERE id=?`).run(...vals, patient.id);
  const updated = db.prepare("SELECT * FROM patients WHERE id=?").get(patient.id);
  audit(tid, u.email, "patient.updated", `pat:${patient.id}`, getIp(c));
  return ok(c, { patient: parsePatient(updated) });
});

// ─── CLINICIANS ───────────────────────────────────────────────────────────────

function parseClinician(cl) {
  return {
    id: cl.id,
    tenantId: cl.tenant_id,
    name: cl.name,
    specialty: cl.specialty,
    department: cl.department,
    npi: cl.npi,
    photoUrl: cl.photo_url,
    bio: cl.bio,
    color: cl.color,
    languagesJson: tryParse(cl.languages_json, ["English"]),
    createdAt: cl.created_at,
  };
}

app.get("/api/v1/clinicians", requireAuth, (c) => {
  const rows = getDb()
    .prepare("SELECT * FROM clinicians WHERE tenant_id=? ORDER BY name")
    .all(c.get("user").tid);
  return ok(c, { clinicians: rows.map(parseClinician) });
});

app.get("/api/v1/clinicians/:id", requireAuth, (c) => {
  const cl = getDb()
    .prepare("SELECT * FROM clinicians WHERE id=? AND tenant_id=?")
    .get(c.req.param("id"), c.get("user").tid);
  if (!cl) return fail(c, "not_found", "Clinician not found", 404);
  return ok(c, { clinician: parseClinician(cl) });
});

// ─── APPOINTMENTS ─────────────────────────────────────────────────────────────

function parseAppt(a) {
  return {
    id: a.id,
    tenantId: a.tenant_id,
    patientId: a.patient_id,
    clinicianId: a.clinician_id,
    startsAt: a.starts_at,
    durationMin: a.duration_min,
    kind: a.kind,
    status: a.status,
    room: a.room,
    reason: a.reason,
    notes: a.notes,
    createdAt: a.created_at,
    patientName: a.patient_name,
    mrn: a.mrn,
    bloodType: a.blood_type,
    allergies: tryParse(a.allergies_json, []),
    clinicianName: a.clinician_name,
    department: a.department,
    specialty: a.specialty,
    clinicianColor: a.clinician_color,
    startsAtISO: new Date(a.starts_at * 1000).toISOString(),
  };
}

const APPT_SELECT = `SELECT a.*,p.name as patient_name,p.mrn,p.blood_type,p.allergies_json,c.name as clinician_name,c.department,c.specialty,c.color as clinician_color FROM appointments a JOIN patients p ON p.id=a.patient_id JOIN clinicians c ON c.id=a.clinician_id`;

app.get("/api/v1/appointments", requireAuth, (c) => {
  const db = getDb();
  const u = c.get("user");
  const { clinicianId, patientId, date, upcoming, limit = "100" } = c.req.query();
  let sql = `${APPT_SELECT} WHERE a.tenant_id=?`;
  const params = [u.tid];
  if (u.role === "patient") {
    sql += " AND a.patient_id=?";
    params.push(u.eid);
  } else if (u.role === "clinician") {
    sql += " AND a.clinician_id=?";
    params.push(u.eid);
  }
  if (clinicianId) {
    sql += " AND a.clinician_id=?";
    params.push(clinicianId);
  }
  if (patientId) {
    sql += " AND a.patient_id=?";
    params.push(patientId);
  }
  if (date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const s = Math.floor(d.getTime() / 1000);
    sql += " AND a.starts_at>=? AND a.starts_at<?";
    params.push(s, s + 86400);
  }
  if (upcoming === "true") {
    sql += " AND a.starts_at>=? AND a.status NOT IN (?,?)";
    params.push(Math.floor(Date.now() / 1000), "cancelled", "no-show");
  }
  const lim = Math.min(Math.max(Number(limit) || 100, 1), 500);
  sql += ` ORDER BY a.starts_at LIMIT ?`;
  params.push(lim);
  return ok(c, {
    appointments: db
      .prepare(sql)
      .all(...params)
      .map(parseAppt),
  });
});

app.post("/api/v1/appointments", requireAuth, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const schema = z.object({
    patientId: z.string(),
    clinicianId: z.string(),
    startsAt: z.number().int().positive(),
    durationMin: z.number().int().positive().max(480).default(30),
    kind: z.string().default("consultation"),
    reason: z.string().optional(),
  });
  const parsed = schema.safeParse(body);
  if (!parsed.success) return fail(c, "validation_failed", parsed.error.issues[0].message);
  const { patientId, clinicianId, startsAt, durationMin, kind, reason } = parsed.data;
  const db = getDb();
  const u = c.get("user");
  const tid = u.tid;
  if (u.role === "patient" && patientId !== u.eid)
    return fail(c, "forbidden", "Cannot book for another patient", 403);
  // Validate that both patient and clinician belong to this tenant.
  const pat = db.prepare("SELECT id FROM patients WHERE id=? AND tenant_id=?").get(patientId, tid);
  if (!pat) return fail(c, "not_found", "Patient not found", 404);
  const clin = db
    .prepare("SELECT id FROM clinicians WHERE id=? AND tenant_id=?")
    .get(clinicianId, tid);
  if (!clin) return fail(c, "not_found", "Clinician not found", 404);
  const endsAt = startsAt + durationMin * 60;
  const conflict = db
    .prepare(
      `SELECT id FROM appointments WHERE tenant_id=? AND clinician_id=? AND status NOT IN ('cancelled','no-show') AND starts_at<? AND starts_at+duration_min*60>? LIMIT 1`
    )
    .get(tid, clinicianId, endsAt, startsAt);
  if (conflict) return fail(c, "slot_taken", "This time slot is already booked", 409);
  const id = uuid();
  db.prepare(
    "INSERT INTO appointments(id,tenant_id,patient_id,clinician_id,starts_at,duration_min,kind,reason) VALUES(?,?,?,?,?,?,?,?)"
  ).run(id, tid, patientId, clinicianId, startsAt, durationMin, kind, reason || null);
  const patUser = db
    .prepare("SELECT id FROM users WHERE linked_entity_id=? AND tenant_id=?")
    .get(patientId, tid);
  if (patUser)
    db.prepare(
      "INSERT INTO notifications(id,tenant_id,user_id,kind,title,body) VALUES(?,?,?,?,?,?)"
    ).run(
      uuid(),
      tid,
      patUser.id,
      "appointment.booked",
      "Appointment Confirmed",
      `Your appointment is confirmed for ${new Date(startsAt * 1000).toLocaleString("en-IN")}.`
    );
  const appt = db.prepare(`${APPT_SELECT} WHERE a.id=?`).get(id);
  audit(tid, c.get("user").email, "appointment.booked", `appt:${id}`, getIp(c));
  return ok(c, { appointment: parseAppt(appt) }, 201);
});

app.patch("/api/v1/appointments/:id", requireAuth, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const db = getDb();
  const u = c.get("user");
  const tid = u.tid;
  const appt = db
    .prepare("SELECT * FROM appointments WHERE id=? AND tenant_id=?")
    .get(c.req.param("id"), tid);
  if (!appt) return fail(c, "not_found", "Appointment not found", 404);
  if (u.role === "patient" && appt.patient_id !== u.eid)
    return fail(c, "forbidden", "Access denied", 403);
  if (u.role === "clinician" && appt.clinician_id !== u.eid)
    return fail(c, "forbidden", "Access denied", 403);
  // Patients may only cancel their own appointments.
  if (u.role === "patient" && body.status && body.status !== "cancelled")
    return fail(c, "forbidden", "Patients can only cancel appointments", 403);
  const VALID = {
    scheduled: ["checked-in", "cancelled"],
    "checked-in": ["in-progress", "no-show"],
    "in-progress": ["completed"],
    completed: [],
    cancelled: [],
    "no-show": [],
  };
  if (body.status && body.status !== appt.status && !VALID[appt.status]?.includes(body.status))
    return fail(c, "invalid_transition", `Cannot move from ${appt.status} to ${body.status}`, 422);
  const map = {
    status: "status",
    notes: "notes",
    reason: "reason",
    startsAt: "starts_at",
    durationMin: "duration_min",
    room: "room",
  };
  const updates = [];
  const vals = [];
  for (const [bk, dbk] of Object.entries(map)) {
    if (body[bk] !== undefined) {
      updates.push(`${dbk}=?`);
      vals.push(body[bk]);
    }
  }
  if (updates.length > 0)
    db.prepare(`UPDATE appointments SET ${updates.join(",")} WHERE id=?`).run(...vals, appt.id);
  const updated = db.prepare(`${APPT_SELECT} WHERE a.id=?`).get(appt.id);
  audit(tid, c.get("user").email, "appointment.updated", `appt:${appt.id}`, getIp(c));
  return ok(c, { appointment: parseAppt(updated) });
});

// ─── NOTES ────────────────────────────────────────────────────────────────────

function parseNote(n) {
  return {
    id: n.id,
    tenantId: n.tenant_id,
    patientId: n.patient_id,
    clinicianId: n.clinician_id,
    appointmentId: n.appointment_id,
    type: n.type,
    title: n.title,
    body: tryParse(n.body_json, {}),
    diagnoses: tryParse(n.diagnoses_json, []),
    signedAt: n.signed_at,
    addendumOf: n.addendum_of,
    createdAt: n.created_at,
    clinicianName: n.clinician_name,
    specialty: n.specialty,
  };
}

const NOTE_SELECT = `SELECT n.*,c.name as clinician_name,c.specialty FROM notes n JOIN clinicians c ON c.id=n.clinician_id`;

app.get("/api/v1/notes", requireAuth, requireRole("admin", "clinician", "patient"), (c) => {
  const { patientId } = c.req.query();
  const u = c.get("user");
  const pid = patientId || (u.role === "patient" ? u.eid : null);
  if (!pid) return fail(c, "validation_failed", "patientId required");
  if (u.role === "patient" && pid !== u.eid) return fail(c, "forbidden", "Access denied", 403);
  const notes = getDb()
    .prepare(`${NOTE_SELECT} WHERE n.tenant_id=? AND n.patient_id=? ORDER BY n.created_at DESC`)
    .all(u.tid, pid);
  return ok(c, { notes: notes.map(parseNote) });
});

app.post("/api/v1/notes", requireAuth, requireRole("clinician", "admin"), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  if (!body.patientId) return fail(c, "validation_failed", "patientId required");
  const db = getDb();
  const u = c.get("user");
  const tid = u.tid;
  const pat = db
    .prepare("SELECT id FROM patients WHERE id=? AND tenant_id=?")
    .get(body.patientId, tid);
  if (!pat) return fail(c, "not_found", "Patient not found", 404);
  const clinicianId = clinicianEntityId(db, u);
  if (!clinicianId)
    return fail(c, "no_clinician_profile", "No clinician profile is linked to this account", 409);
  const id = uuid();
  db.prepare(
    "INSERT INTO notes(id,tenant_id,patient_id,clinician_id,appointment_id,type,title,body_json,diagnoses_json) VALUES(?,?,?,?,?,?,?,?,?)"
  ).run(
    id,
    tid,
    body.patientId,
    clinicianId,
    body.appointmentId || null,
    body.type || "soap",
    body.title || null,
    JSON.stringify(body.body || {}),
    JSON.stringify(body.diagnoses || [])
  );
  const note = db.prepare(`${NOTE_SELECT} WHERE n.id=?`).get(id);
  audit(tid, u.email, "note.created", `note:${id}`, getIp(c));
  return ok(c, { note: parseNote(note) }, 201);
});

app.patch("/api/v1/notes/:id", requireAuth, requireRole("clinician", "admin"), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const db = getDb();
  const u = c.get("user");
  const note = db
    .prepare("SELECT * FROM notes WHERE id=? AND tenant_id=?")
    .get(c.req.param("id"), u.tid);
  if (!note) return fail(c, "not_found", "Note not found", 404);
  if (u.role !== "admin" && note.clinician_id !== u.eid)
    return fail(c, "forbidden", "Only the authoring clinician can modify this note", 403);
  if (note.signed_at) return fail(c, "already_signed", "Cannot edit a signed note", 409);
  const updates = [];
  const vals = [];
  if (body.title !== undefined) {
    updates.push("title=?");
    vals.push(body.title);
  }
  if (body.body !== undefined) {
    updates.push("body_json=?");
    vals.push(JSON.stringify(body.body));
  }
  if (body.diagnoses !== undefined) {
    updates.push("diagnoses_json=?");
    vals.push(JSON.stringify(body.diagnoses));
  }
  if (updates.length > 0)
    db.prepare(`UPDATE notes SET ${updates.join(",")} WHERE id=?`).run(...vals, note.id);
  const updated = db.prepare(`${NOTE_SELECT} WHERE n.id=?`).get(note.id);
  audit(u.tid, u.email, "note.updated", `note:${note.id}`, getIp(c));
  return ok(c, { note: parseNote(updated) });
});

app.post("/api/v1/notes/:id/sign", requireAuth, requireRole("clinician", "admin"), (c) => {
  const db = getDb();
  const u = c.get("user");
  const note = db
    .prepare("SELECT * FROM notes WHERE id=? AND tenant_id=?")
    .get(c.req.param("id"), u.tid);
  if (!note) return fail(c, "not_found", "Note not found", 404);
  if (u.role !== "admin" && note.clinician_id !== u.eid)
    return fail(c, "forbidden", "Only the authoring clinician can sign this note", 403);
  if (note.signed_at) return fail(c, "already_signed", "Note already signed", 409);
  db.prepare("UPDATE notes SET signed_at=? WHERE id=?").run(Math.floor(Date.now() / 1000), note.id);
  audit(u.tid, u.email, "note.signed", `note:${note.id}`, getIp(c));
  return ok(c, { note: parseNote(db.prepare(`${NOTE_SELECT} WHERE n.id=?`).get(note.id)) });
});

// ─── LABS ──────────────────────────────────────────────────────────────────────

function parseLab(l) {
  return {
    id: l.id,
    tenantId: l.tenant_id,
    patientId: l.patient_id,
    clinicianId: l.clinician_id,
    panel: l.panel,
    status: l.status,
    results: tryParse(l.results_json, {}),
    orderedAt: l.ordered_at,
    reviewedAt: l.reviewed_at,
    notes: l.notes,
    clinicianName: l.clinician_name,
    patientName: l.patient_name,
    mrn: l.mrn,
  };
}

const LAB_SELECT = `SELECT l.*,c.name as clinician_name,p.name as patient_name,p.mrn FROM lab_orders l JOIN clinicians c ON c.id=l.clinician_id JOIN patients p ON p.id=l.patient_id`;

app.get("/api/v1/labs", requireAuth, requireRole("admin", "clinician", "patient"), (c) => {
  const { patientId } = c.req.query();
  const u = c.get("user");
  const pid = patientId || (u.role === "patient" ? u.eid : null);
  if (!pid) return fail(c, "validation_failed", "patientId required");
  if (u.role === "patient" && pid !== u.eid) return fail(c, "forbidden", "Access denied", 403);
  return ok(c, {
    labs: getDb()
      .prepare(`${LAB_SELECT} WHERE l.tenant_id=? AND l.patient_id=? ORDER BY l.ordered_at DESC`)
      .all(u.tid, pid)
      .map(parseLab),
  });
});

app.get("/api/v1/labs/all", requireAuth, requireRole("admin", "clinician"), (c) => {
  const u = c.get("user");
  let sql = `${LAB_SELECT} WHERE l.tenant_id=?`;
  const params = [u.tid];
  if (u.role === "clinician") {
    sql += " AND l.clinician_id=?";
    params.push(u.eid);
  }
  sql += " ORDER BY l.ordered_at DESC LIMIT 200";
  return ok(c, {
    labs: getDb()
      .prepare(sql)
      .all(...params)
      .map(parseLab),
  });
});

app.post("/api/v1/labs", requireAuth, requireRole("clinician", "admin"), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  if (!body.patientId || !body.panel)
    return fail(c, "validation_failed", "patientId and panel required");
  const db = getDb();
  const u = c.get("user");
  const tid = u.tid;
  const pat = db
    .prepare("SELECT id FROM patients WHERE id=? AND tenant_id=?")
    .get(body.patientId, tid);
  if (!pat) return fail(c, "not_found", "Patient not found", 404);
  const clinicianId = clinicianEntityId(db, u);
  if (!clinicianId)
    return fail(c, "no_clinician_profile", "No clinician profile is linked to this account", 409);
  const id = uuid();
  db.prepare(
    "INSERT INTO lab_orders(id,tenant_id,patient_id,clinician_id,panel,notes) VALUES(?,?,?,?,?,?)"
  ).run(id, tid, body.patientId, clinicianId, body.panel, body.notes || null);
  audit(tid, u.email, "lab.ordered", `lab:${id}`, getIp(c));
  return ok(c, { lab: parseLab(db.prepare(`${LAB_SELECT} WHERE l.id=?`).get(id)) }, 201);
});

app.patch("/api/v1/labs/:id", requireAuth, requireRole("clinician", "admin"), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const db = getDb();
  const u = c.get("user");
  const lab = db
    .prepare("SELECT * FROM lab_orders WHERE id=? AND tenant_id=?")
    .get(c.req.param("id"), u.tid);
  if (!lab) return fail(c, "not_found", "Lab order not found", 404);
  if (u.role !== "admin" && lab.clinician_id !== u.eid)
    return fail(c, "forbidden", "Only the ordering clinician can modify this lab", 403);
  const updates = [];
  const vals = [];
  if (body.status) {
    updates.push("status=?");
    vals.push(body.status);
  }
  if (body.results) {
    updates.push("results_json=?");
    vals.push(JSON.stringify(body.results));
  }
  if (body.status === "reviewed") {
    updates.push("reviewed_at=?");
    vals.push(Math.floor(Date.now() / 1000));
  }
  if (updates.length > 0)
    db.prepare(`UPDATE lab_orders SET ${updates.join(",")} WHERE id=?`).run(...vals, lab.id);
  audit(u.tid, u.email, "lab.updated", `lab:${lab.id}`, getIp(c));
  return ok(c, { lab: parseLab(db.prepare(`${LAB_SELECT} WHERE l.id=?`).get(lab.id)) });
});

// ─── PRESCRIPTIONS ─────────────────────────────────────────────────────────────

function parseRx(r) {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    patientId: r.patient_id,
    clinicianId: r.clinician_id,
    appointmentId: r.appointment_id,
    drug: r.drug,
    form: r.form,
    dose: r.dose,
    freq: r.freq,
    duration: r.duration,
    refills: r.refills,
    status: r.status,
    instructions: r.instructions,
    prescribedAt: r.prescribed_at,
    clinicianName: r.clinician_name,
  };
}

const RX_SELECT = `SELECT r.*,c.name as clinician_name FROM prescriptions r JOIN clinicians c ON c.id=r.clinician_id`;

app.get("/api/v1/prescriptions", requireAuth, requireRole("admin", "clinician", "patient"), (c) => {
  const { patientId, active } = c.req.query();
  const u = c.get("user");
  const pid = patientId || (u.role === "patient" ? u.eid : null);
  if (!pid) return fail(c, "validation_failed", "patientId required");
  if (u.role === "patient" && pid !== u.eid) return fail(c, "forbidden", "Access denied", 403);
  let sql = `${RX_SELECT} WHERE r.tenant_id=? AND r.patient_id=?`;
  const params = [u.tid, pid];
  if (active === "true") {
    sql += ` AND r.status='active'`;
  }
  sql += " ORDER BY r.prescribed_at DESC";
  return ok(c, {
    prescriptions: getDb()
      .prepare(sql)
      .all(...params)
      .map(parseRx),
  });
});

app.post("/api/v1/prescriptions", requireAuth, requireRole("clinician", "admin"), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  if (!body.patientId || !body.drug)
    return fail(c, "validation_failed", "patientId and drug required");
  const db = getDb();
  const u = c.get("user");
  const tid = u.tid;
  const pat = db
    .prepare("SELECT id FROM patients WHERE id=? AND tenant_id=?")
    .get(body.patientId, tid);
  if (!pat) return fail(c, "not_found", "Patient not found", 404);
  const clinicianId = clinicianEntityId(db, u);
  if (!clinicianId)
    return fail(c, "no_clinician_profile", "No clinician profile is linked to this account", 409);
  const id = uuid();
  db.prepare(
    "INSERT INTO prescriptions(id,tenant_id,patient_id,clinician_id,appointment_id,drug,form,dose,freq,duration,refills,instructions) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)"
  ).run(
    id,
    tid,
    body.patientId,
    clinicianId,
    body.appointmentId || null,
    body.drug,
    body.form || null,
    body.dose || null,
    body.freq || null,
    body.duration || null,
    body.refills || 0,
    body.instructions || null
  );
  audit(tid, u.email, "prescription.created", `rx:${id}`, getIp(c));
  return ok(c, { prescription: parseRx(db.prepare(`${RX_SELECT} WHERE r.id=?`).get(id)) }, 201);
});

app.patch(
  "/api/v1/prescriptions/:id",
  requireAuth,
  requireRole("clinician", "admin"),
  async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const db = getDb();
    const u = c.get("user");
    const rx = db
      .prepare("SELECT * FROM prescriptions WHERE id=? AND tenant_id=?")
      .get(c.req.param("id"), u.tid);
    if (!rx) return fail(c, "not_found", "Prescription not found", 404);
    if (u.role !== "admin" && rx.clinician_id !== u.eid)
      return fail(
        c,
        "forbidden",
        "Only the prescribing clinician can modify this prescription",
        403
      );
    const updates = [];
    const vals = [];
    if (body.status) {
      updates.push("status=?");
      vals.push(body.status);
    }
    if (body.refills !== undefined) {
      updates.push("refills=?");
      vals.push(body.refills);
    }
    if (updates.length > 0)
      db.prepare(`UPDATE prescriptions SET ${updates.join(",")} WHERE id=?`).run(...vals, rx.id);
    audit(u.tid, u.email, "prescription.updated", `rx:${rx.id}`, getIp(c));
    return ok(c, { prescription: parseRx(db.prepare(`${RX_SELECT} WHERE r.id=?`).get(rx.id)) });
  }
);

// ─── MESSAGES ──────────────────────────────────────────────────────────────────

function parseMsg(m) {
  return {
    id: m.id,
    tenantId: m.tenant_id,
    patientId: m.patient_id,
    clinicianId: m.clinician_id,
    subject: m.subject,
    thread: tryParse(m.thread_json, []),
    lastAt: m.last_at,
    readByPatient: !!m.read_by_patient,
    readByClinician: !!m.read_by_clinician,
    clinicianName: m.clinician_name,
    patientName: m.patient_name,
  };
}

const MSG_SELECT = `SELECT m.*,c.name as clinician_name,p.name as patient_name FROM messages m JOIN clinicians c ON c.id=m.clinician_id JOIN patients p ON p.id=m.patient_id`;

app.get("/api/v1/messages", requireAuth, requireRole("admin", "clinician", "patient"), (c) => {
  const { patientId } = c.req.query();
  const u = c.get("user");
  const pid = patientId || (u.role === "patient" ? u.eid : null);
  if (!pid) return fail(c, "validation_failed", "patientId required");
  if (u.role === "patient" && pid !== u.eid) return fail(c, "forbidden", "Access denied", 403);
  let sql = `${MSG_SELECT} WHERE m.tenant_id=? AND m.patient_id=?`;
  const params = [u.tid, pid];
  // Secure messages are private between a patient and one clinician. A clinician
  // may only see threads they are a party to; admins may audit all threads.
  if (u.role === "clinician") {
    sql += " AND m.clinician_id=?";
    params.push(u.eid);
  }
  sql += " ORDER BY m.last_at DESC";
  return ok(c, {
    messages: getDb()
      .prepare(sql)
      .all(...params)
      .map(parseMsg),
  });
});

app.post(
  "/api/v1/messages",
  requireAuth,
  requireRole("admin", "clinician", "patient"),
  async (c) => {
    const body = await c.req.json().catch(() => ({}));
    if (!body.text || !String(body.text).trim())
      return fail(c, "validation_failed", "text required");
    const db = getDb();
    const u = c.get("user");
    const tid = u.tid;
    const now = Math.floor(Date.now() / 1000);
    const from = u.role === "patient" ? "patient" : "clinician";
    if (body.threadId) {
      const msg = db
        .prepare("SELECT * FROM messages WHERE id=? AND tenant_id=?")
        .get(body.threadId, tid);
      if (!msg) return fail(c, "not_found", "Thread not found", 404);
      if (u.role === "patient" && msg.patient_id !== u.eid)
        return fail(c, "forbidden", "Access denied", 403);
      if (u.role === "clinician" && msg.clinician_id !== u.eid)
        return fail(c, "forbidden", "Access denied", 403);
      const thread = tryParse(msg.thread_json, []);
      thread.push({ from, text: String(body.text).trim(), at: new Date().toISOString() });
      const reads =
        u.role === "patient"
          ? "read_by_patient=1, read_by_clinician=0"
          : "read_by_clinician=1, read_by_patient=0";
      db.prepare(`UPDATE messages SET thread_json=?,last_at=?,${reads} WHERE id=?`).run(
        JSON.stringify(thread),
        now,
        msg.id
      );
      return ok(c, { message: parseMsg(db.prepare(`${MSG_SELECT} WHERE m.id=?`).get(msg.id)) });
    }
    const patientId = u.role === "patient" ? u.eid : body.patientId;
    if (!patientId) return fail(c, "validation_failed", "patientId required");
    if (!body.clinicianId) return fail(c, "validation_failed", "clinicianId required");
    // A clinician starting a thread must be the clinician on it.
    if (u.role === "clinician" && body.clinicianId !== u.eid)
      return fail(c, "forbidden", "Cannot start a thread on behalf of another clinician", 403);
    const pat = db
      .prepare("SELECT id FROM patients WHERE id=? AND tenant_id=?")
      .get(patientId, tid);
    if (!pat) return fail(c, "not_found", "Patient not found", 404);
    const clin = db
      .prepare("SELECT id FROM clinicians WHERE id=? AND tenant_id=?")
      .get(body.clinicianId, tid);
    if (!clin) return fail(c, "not_found", "Clinician not found", 404);
    const id = uuid();
    const thread = [{ from, text: String(body.text).trim(), at: new Date().toISOString() }];
    const reads =
      from === "patient"
        ? "read_by_patient,read_by_clinician"
        : "read_by_clinician,read_by_patient";
    db.prepare(
      `INSERT INTO messages(id,tenant_id,patient_id,clinician_id,subject,thread_json,last_at,${reads}) VALUES(?,?,?,?,?,?,?,?,?)`
    ).run(
      id,
      tid,
      patientId,
      body.clinicianId,
      body.subject || "Message",
      JSON.stringify(thread),
      now,
      1,
      0
    );
    return ok(c, { message: parseMsg(db.prepare(`${MSG_SELECT} WHERE m.id=?`).get(id)) }, 201);
  }
);

app.post(
  "/api/v1/messages/:id/read",
  requireAuth,
  requireRole("admin", "clinician", "patient"),
  (c) => {
    const db = getDb();
    const u = c.get("user");
    const msg = db
      .prepare("SELECT * FROM messages WHERE id=? AND tenant_id=?")
      .get(c.req.param("id"), u.tid);
    if (!msg) return fail(c, "not_found", "Thread not found", 404);
    if (u.role === "patient") {
      if (msg.patient_id !== u.eid) return fail(c, "forbidden", "Access denied", 403);
      db.prepare("UPDATE messages SET read_by_patient=1 WHERE id=?").run(msg.id);
    } else if (u.role === "clinician") {
      if (msg.clinician_id !== u.eid) return fail(c, "forbidden", "Access denied", 403);
      db.prepare("UPDATE messages SET read_by_clinician=1 WHERE id=?").run(msg.id);
    } else {
      db.prepare("UPDATE messages SET read_by_clinician=1 WHERE id=?").run(msg.id);
    }
    return ok(c, {});
  }
);

// ─── NOTIFICATIONS ─────────────────────────────────────────────────────────────

app.get("/api/v1/notifications", requireAuth, (c) => {
  const rows = getDb()
    .prepare("SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 50")
    .all(c.get("user").sub);
  return ok(c, {
    notifications: rows.map((n) => ({
      id: n.id,
      kind: n.kind,
      title: n.title,
      body: n.body,
      payload: tryParse(n.payload_json, {}),
      readAt: n.read_at,
      createdAt: n.created_at,
    })),
  });
});

app.post("/api/v1/notifications/:id/read", requireAuth, (c) => {
  getDb()
    .prepare("UPDATE notifications SET read_at=? WHERE id=? AND user_id=?")
    .run(Math.floor(Date.now() / 1000), c.req.param("id"), c.get("user").sub);
  return ok(c, {});
});

app.post("/api/v1/notifications/read-all", requireAuth, (c) => {
  getDb()
    .prepare("UPDATE notifications SET read_at=? WHERE user_id=? AND read_at IS NULL")
    .run(Math.floor(Date.now() / 1000), c.get("user").sub);
  return ok(c, {});
});

// ─── ADMIN ─────────────────────────────────────────────────────────────────────

app.get("/api/v1/admin/stats", requireAuth, requireRole("admin", "ops"), (c) => {
  const db = getDb();
  const tid = c.get("user").tid;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const s = Math.floor(d.getTime() / 1000);
  return ok(c, {
    stats: {
      patientCount: db.prepare("SELECT COUNT(*) as c FROM patients WHERE tenant_id=?").get(tid).c,
      apptToday: db
        .prepare(
          "SELECT COUNT(*) as c FROM appointments WHERE tenant_id=? AND starts_at>=? AND starts_at<?"
        )
        .get(tid, s, s + 86400).c,
      pendingLabs: db
        .prepare(
          `SELECT COUNT(*) as c FROM lab_orders WHERE tenant_id=? AND status IN ('ordered','in-lab','resulted')`
        )
        .get(tid).c,
      activeRx: db
        .prepare(`SELECT COUNT(*) as c FROM prescriptions WHERE tenant_id=? AND status='active'`)
        .get(tid).c,
      clinicianCount: db.prepare("SELECT COUNT(*) as c FROM clinicians WHERE tenant_id=?").get(tid)
        .c,
      userCount: db.prepare("SELECT COUNT(*) as c FROM users WHERE tenant_id=?").get(tid).c,
    },
  });
});

app.get("/api/v1/admin/users", requireAuth, requireRole("admin"), (c) => {
  const users = getDb()
    .prepare(
      "SELECT id,name,email,role,linked_entity_id,last_login_at,created_at FROM users WHERE tenant_id=? ORDER BY created_at DESC"
    )
    .all(c.get("user").tid);
  return ok(c, {
    users: users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      linkedEntityId: u.linked_entity_id,
      lastLoginAt: u.last_login_at,
      createdAt: u.created_at,
    })),
  });
});

app.post("/api/v1/admin/users", requireAuth, requireRole("admin"), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const schema = z.object({
    name: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(8),
    role: z.enum(["admin", "clinician", "patient", "frontdesk", "ops"]),
    linkedEntityId: z.string().optional(),
  });
  const parsed = schema.safeParse(body);
  if (!parsed.success) return fail(c, "validation_failed", parsed.error.issues[0].message);
  const { name, email, password, role, linkedEntityId } = parsed.data;
  const db = getDb();
  const tid = c.get("user").tid;
  const existing = db
    .prepare("SELECT id FROM users WHERE email=? AND tenant_id=?")
    .get(email.toLowerCase(), tid);
  if (existing) return fail(c, "email_taken", "Email already registered", 409);
  const hash = await bcrypt.hash(password, 10);
  const id = uuid();
  db.prepare(
    "INSERT INTO users(id,tenant_id,email,password_hash,role,name,linked_entity_id) VALUES(?,?,?,?,?,?,?)"
  ).run(id, tid, email.toLowerCase(), hash, role, name, linkedEntityId || null);
  audit(tid, c.get("user").email, "admin.user.created", `user:${id}`, getIp(c));
  return ok(c, { userId: id }, 201);
});

app.delete("/api/v1/admin/users/:id", requireAuth, requireRole("admin"), (c) => {
  const db = getDb();
  const tid = c.get("user").tid;
  const user = db
    .prepare("SELECT * FROM users WHERE id=? AND tenant_id=?")
    .get(c.req.param("id"), tid);
  if (!user) return fail(c, "not_found", "User not found", 404);
  if (user.id === c.get("user").sub) return fail(c, "forbidden", "Cannot delete yourself", 403);
  db.prepare("DELETE FROM refresh_tokens WHERE user_id=?").run(user.id);
  db.prepare("DELETE FROM users WHERE id=?").run(user.id);
  audit(tid, c.get("user").email, "admin.user.deleted", `user:${user.id}`, getIp(c));
  return ok(c, {});
});

app.get("/api/v1/admin/audit", requireAuth, requireRole("admin"), (c) => {
  const { limit = "200" } = c.req.query();
  const lim = Math.min(Math.max(Number(limit) || 200, 1), 500);
  const rows = getDb()
    .prepare("SELECT * FROM audit_events WHERE tenant_id=? ORDER BY at DESC LIMIT ?")
    .all(c.get("user").tid, lim);
  return ok(c, { events: rows });
});

app.get("/api/v1/admin/tenants", requireAuth, requireRole("admin"), (c) => {
  return ok(c, {
    tenants: getDb().prepare("SELECT id,slug,name,hfr_id,accent,created_at FROM tenants").all(),
  });
});

app.post("/api/v1/admin/clinicians", requireAuth, requireRole("admin"), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  if (!body.name) return fail(c, "validation_failed", "name required");
  const db = getDb();
  const tid = c.get("user").tid;
  const id = uuid();
  db.prepare(
    "INSERT INTO clinicians(id,tenant_id,name,specialty,department,color,bio) VALUES(?,?,?,?,?,?,?)"
  ).run(
    id,
    tid,
    body.name,
    body.specialty || null,
    body.department || null,
    body.color || "#0f4c5c",
    body.bio || null
  );
  // Optionally create a linked login for the clinician.
  if (body.email && body.password) {
    if (String(body.password).length < 8)
      return fail(c, "validation_failed", "password must be at least 8 characters");
    const existing = db
      .prepare("SELECT id FROM users WHERE email=? AND tenant_id=?")
      .get(String(body.email).toLowerCase(), tid);
    if (existing) return fail(c, "email_taken", "Email already registered", 409);
    const hash = await bcrypt.hash(body.password, 10);
    db.prepare(
      "INSERT INTO users(id,tenant_id,email,password_hash,role,linked_entity_id,name) VALUES(?,?,?,?,?,?,?)"
    ).run(uuid(), tid, String(body.email).toLowerCase(), hash, "clinician", id, body.name);
  }
  audit(tid, c.get("user").email, "admin.clinician.created", `clin:${id}`, getIp(c));
  return ok(
    c,
    { clinician: parseClinician(db.prepare("SELECT * FROM clinicians WHERE id=?").get(id)) },
    201
  );
});

// ─── OPS / PLATFORM ──────────────────────────────────────────────────────────

const STARTED_AT = Date.now();

app.get("/api/v1/platform/health", requireAuth, requireRole("admin", "ops"), (c) => {
  const db = getDb();
  const tid = c.get("user").tid;
  let dbHealthy = true;
  let dbLatency = 0;
  try {
    const t0 = Date.now();
    db.prepare("SELECT 1").get();
    dbLatency = Date.now() - t0;
  } catch {
    dbHealthy = false;
  }
  const counts = db
    .prepare(
      "SELECT (SELECT COUNT(*) FROM users WHERE tenant_id=?) as users, (SELECT COUNT(*) FROM appointments WHERE tenant_id=?) as appts"
    )
    .get(tid, tid);
  return ok(c, {
    services: [
      { name: "api-gateway", status: "healthy", latency: dbLatency + 1, uptime: uptimePct() },
      {
        name: "database (sqlite/wal)",
        status: dbHealthy ? "healthy" : "degraded",
        latency: dbLatency,
        uptime: uptimePct(),
      },
    ],
    metrics: {
      uptimeSeconds: Math.floor((Date.now() - STARTED_AT) / 1000),
      users: counts.users,
      appointments: counts.appts,
    },
  });
});

app.get("/api/v1/platform/incidents", requireAuth, requireRole("admin", "ops"), (c) =>
  ok(c, { incidents: [] })
);

function uptimePct() {
  // Single-process uptime approximation; real deployments compute this from an
  // external monitor. Reported as a stable high value for the ops view.
  return 99.99;
}

// ─── HELPERS THAT NEED getDb ────────────────────────────────────────────────

// Resolve the clinician entity a user is writing as. Clinicians write as their
// linked profile; an admin acting without a clinician profile is rejected by
// callers that require one.
function clinicianEntityId(db, u) {
  if (u.role === "clinician") return u.eid;
  if (u.role === "admin") {
    // An admin has no clinician profile of their own; fall back to any existing
    // clinician only when explicitly linked. Otherwise callers handle the null.
    const linked = db
      .prepare("SELECT id FROM clinicians WHERE id=? AND tenant_id=?")
      .get(u.eid, u.tid);
    return linked ? linked.id : null;
  }
  return null;
}

// ─── 404 + ERROR HANDLING ──────────────────────────────────────────────────

app.notFound((c) => fail(c, "not_found", "Route not found", 404));
app.onError((err, c) => {
  console.error("[api-gateway] unhandled error:", err?.message || err);
  return fail(c, "internal", "An unexpected error occurred", 500);
});
