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

function audit(tenantId, actor, action, scope, ip, extra = {}) {
  try {
    getDb()
      .prepare(
        "INSERT INTO audit_events(id,tenant_id,actor,action,scope,ip,user_agent,diff_json) VALUES(?,?,?,?,?,?,?,?)"
      )
      .run(
        uuid(),
        tenantId,
        actor,
        action,
        scope || null,
        ip || null,
        extra.ua || null,
        extra.diff ? JSON.stringify(extra.diff) : null
      );
  } catch (_) {}
}

function getIp(c) {
  return c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

function getUa(c) {
  return c.req.header("user-agent") || null;
}

// Users are linked to their patient/clinician entity via linked_entity_id;
// resolve the login account for an entity so it can receive notifications.
function linkedUserId(db, tid, entityId) {
  if (!entityId) return null;
  const row = db
    .prepare("SELECT id FROM users WHERE linked_entity_id=? AND tenant_id=?")
    .get(entityId, tid);
  return row ? row.id : null;
}

function notifyUser(db, tid, userId, kind, title, body, payload) {
  if (!userId) return;
  db.prepare(
    "INSERT INTO notifications(id,tenant_id,user_id,kind,title,body,payload_json) VALUES(?,?,?,?,?,?,?)"
  ).run(uuid(), tid, userId, kind, title, body || null, JSON.stringify(payload || {}));
}

// ─── RATE LIMITING ───────────────────────────────────────────────────────────
// In-memory sliding window per key. Limits are read from the environment at
// request time so operators can tune them without a code change; the test
// environment gets a high default so suites are unaffected unless a test
// explicitly sets the env var to assert 429 behaviour.
const rateBuckets = new Map();

function rateLimited(key, max, windowSec) {
  const now = Date.now();
  const cutoff = now - windowSec * 1000;
  let hits = rateBuckets.get(key);
  if (!hits) {
    if (rateBuckets.size > 5000) rateBuckets.clear(); // bound memory under abuse
    hits = [];
    rateBuckets.set(key, hits);
  }
  while (hits.length && hits[0] <= cutoff) hits.shift();
  if (hits.length >= max) return true;
  hits.push(now);
  return false;
}

function rateMax(envName, prodDefault) {
  const v = Number(process.env[envName]);
  if (Number.isFinite(v) && v > 0) return v;
  return NODE_ENV === "test" ? 10000 : prodDefault;
}

// ─── DRUG SAFETY ─────────────────────────────────────────────────────────────
// A deliberately small, clinically real reference set. It is a safety net for
// the most common severe reactions, not a full formulary — prescribers can
// override any warning with a recorded reason.
const ALLERGY_CLASSES = {
  penicillin: ["penicillin", "amoxicillin", "ampicillin", "augmentin", "amoxiclav", "piperacillin"],
  sulfa: [
    "sulfamethoxazole",
    "cotrimoxazole",
    "co-trimoxazole",
    "bactrim",
    "sulfasalazine",
    "sulfadiazine",
  ],
  aspirin: ["aspirin", "acetylsalicylic"],
  nsaid: ["ibuprofen", "naproxen", "diclofenac", "ketorolac"],
};

function allergyWarnings(allergies, drug) {
  const d = String(drug).toLowerCase();
  const out = [];
  for (const a of allergies || []) {
    const sub = String(a.substance || "").toLowerCase();
    if (!sub) continue;
    let hit = d.includes(sub) || sub.includes(d);
    if (!hit) {
      for (const [cls, members] of Object.entries(ALLERGY_CLASSES)) {
        const subInClass = sub.includes(cls) || members.some((m) => sub.includes(m));
        const drugInClass = d.includes(cls) || members.some((m) => d.includes(m));
        if (subInClass && drugInClass) {
          hit = true;
          break;
        }
      }
    }
    if (hit)
      out.push({
        type: "allergy",
        substance: a.substance,
        severity: a.severity || "unknown",
        reaction: a.reaction || null,
      });
  }
  return out;
}

const INTERACTION_PAIRS = [
  [["warfarin"], ["aspirin", "ibuprofen", "naproxen", "diclofenac"], "Increased bleeding risk"],
  [["sildenafil", "tadalafil"], ["nitroglycerin", "isosorbide", "nitrate"], "Severe hypotension"],
  [
    ["tramadol"],
    ["fluoxetine", "sertraline", "paroxetine", "escitalopram"],
    "Serotonin syndrome risk",
  ],
  [["methotrexate"], ["trimethoprim", "cotrimoxazole", "bactrim"], "Bone-marrow toxicity"],
  [["clopidogrel"], ["omeprazole", "esomeprazole"], "Reduced antiplatelet effect"],
  [
    ["simvastatin", "atorvastatin"],
    ["clarithromycin", "erythromycin", "itraconazole"],
    "Myopathy / rhabdomyolysis risk",
  ],
  [
    ["lisinopril", "enalapril", "ramipril", "losartan", "telmisartan"],
    ["spironolactone", "eplerenone"],
    "Hyperkalaemia risk",
  ],
  [["digoxin"], ["amiodarone", "verapamil"], "Digoxin toxicity risk"],
];

function interactionWarnings(activeDrugs, drug) {
  const d = String(drug).toLowerCase();
  const out = [];
  for (const existing of activeDrugs || []) {
    const e = String(existing).toLowerCase();
    for (const [a, b, risk] of INTERACTION_PAIRS) {
      const dInA = a.some((m) => d.includes(m));
      const dInB = b.some((m) => d.includes(m));
      const eInA = a.some((m) => e.includes(m));
      const eInB = b.some((m) => e.includes(m));
      if ((dInA && eInB) || (dInB && eInA)) out.push({ type: "interaction", with: existing, risk });
    }
  }
  return out;
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
  let payload;
  // The catch must cover ONLY token verification — downstream handler errors
  // belong to app.onError, not a misleading 401.
  try {
    ({ payload } = await jwtVerify(header.slice(7), JWT_SECRET, { algorithms: [JWT_ALG] }));
  } catch {
    return fail(c, "no_session", "Token expired or invalid", 401);
  }
  // Only access tokens are valid for API calls. Refresh tokens (type:'refresh')
  // carry no role/eid and must never be accepted here.
  if (payload.type !== "access") return fail(c, "no_session", "Invalid token type", 401);
  c.set("user", payload);
  await next();
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
  if (rateLimited(`login:${getIp(c)}`, rateMax("LOGIN_RATE_MAX", 10), 900))
    return fail(c, "rate_limited", "Too many login attempts, please try again later", 429);
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
  audit(user.tenant_id, user.email, "auth.login", `user:${user.id}`, getIp(c), { ua: getUa(c) });
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
  if (rateLimited(`signup:${getIp(c)}`, rateMax("SIGNUP_RATE_MAX", 5), 3600))
    return fail(c, "rate_limited", "Too many signup attempts, please try again later", 429);
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

app.post("/api/v1/auth/change-password", requireAuth, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const schema = z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8).max(128),
  });
  const parsed = schema.safeParse(body);
  if (!parsed.success) return fail(c, "validation_failed", parsed.error.issues[0].message);
  const db = getDb();
  const u = c.get("user");
  const user = db.prepare("SELECT * FROM users WHERE id=?").get(u.sub);
  if (!user) return fail(c, "not_found", "User not found", 404);
  const match = await bcrypt.compare(parsed.data.currentPassword, user.password_hash);
  if (!match) return fail(c, "invalid_credentials", "Current password is incorrect", 401);
  const hash = await bcrypt.hash(parsed.data.newPassword, 10);
  const now = Math.floor(Date.now() / 1000);
  db.prepare("UPDATE users SET password_hash=? WHERE id=?").run(hash, user.id);
  // Changing the password ends every existing session on every device.
  db.prepare("UPDATE refresh_tokens SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL").run(
    now,
    user.id
  );
  audit(user.tenant_id, user.email, "auth.password_changed", `user:${user.id}`, getIp(c), {
    ua: getUa(c),
  });
  return ok(c, {});
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
  const diff = {};
  for (const [bk, dbk] of Object.entries(map)) {
    if (body[bk] !== undefined) {
      updates.push(`${dbk}=?`);
      vals.push(typeof body[bk] === "object" ? JSON.stringify(body[bk]) : body[bk]);
      diff[bk] = body[bk];
    }
  }
  if (updates.length > 0)
    db.prepare(`UPDATE patients SET ${updates.join(",")} WHERE id=?`).run(...vals, patient.id);
  const updated = db.prepare("SELECT * FROM patients WHERE id=?").get(patient.id);
  audit(tid, u.email, "patient.updated", `pat:${patient.id}`, getIp(c), { ua: getUa(c), diff });
  return ok(c, { patient: parsePatient(updated) });
});

app.post(
  "/api/v1/patients/:id/vitals",
  requireAuth,
  requireRole("clinician", "admin", "frontdesk"),
  async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const schema = z.object({
      bp: z.string().max(20).optional(),
      hr: z.number().optional(),
      temp: z.number().optional(),
      weight: z.number().optional(),
      spo2: z.number().optional(),
      rr: z.number().optional(),
    });
    const parsed = schema.safeParse(body);
    if (!parsed.success) return fail(c, "validation_failed", parsed.error.issues[0].message);
    const snap = Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => v !== undefined));
    if (Object.keys(snap).length === 0)
      return fail(c, "validation_failed", "At least one vital sign is required");
    const db = getDb();
    const u = c.get("user");
    const patient = db
      .prepare("SELECT * FROM patients WHERE id=? AND tenant_id=?")
      .get(c.req.param("id"), u.tid);
    if (!patient) return fail(c, "not_found", "Patient not found", 404);
    let series = tryParse(patient.vitals_json, []);
    // Legacy records stored a single vitals object; fold it into the series.
    if (series && !Array.isArray(series)) series = [{ at: patient.created_at, ...series }];
    if (!Array.isArray(series)) series = [];
    series.push({ at: Math.floor(Date.now() / 1000), by: u.email, ...snap });
    db.prepare("UPDATE patients SET vitals_json=? WHERE id=?").run(
      JSON.stringify(series),
      patient.id
    );
    audit(u.tid, u.email, "patient.vitals_recorded", `pat:${patient.id}`, getIp(c), {
      diff: snap,
    });
    return ok(c, { vitals: series }, 201);
  }
);

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
  // The clinician may have blocked this window (leave, training, emergency).
  const blocked = db
    .prepare(
      "SELECT id FROM availability_blocks WHERE tenant_id=? AND clinician_id=? AND starts_at<? AND ends_at>? LIMIT 1"
    )
    .get(tid, clinicianId, endsAt, startsAt);
  if (blocked)
    return fail(c, "clinician_unavailable", "The clinician is unavailable at this time", 409);
  // Guard against the same patient stacking bookings within 30 minutes of
  // each other (double-booked patients are a front-desk headache).
  const PAD = 1800;
  const stacked = db
    .prepare(
      `SELECT id FROM appointments WHERE tenant_id=? AND patient_id=? AND status NOT IN ('cancelled','no-show') AND starts_at<? AND starts_at+duration_min*60>? LIMIT 1`
    )
    .get(tid, patientId, endsAt + PAD, startsAt - PAD);
  if (stacked)
    return fail(
      c,
      "patient_stacking",
      "This patient already has an appointment within 30 minutes of this slot",
      422
    );
  const id = uuid();
  db.prepare(
    "INSERT INTO appointments(id,tenant_id,patient_id,clinician_id,starts_at,duration_min,kind,reason) VALUES(?,?,?,?,?,?,?,?)"
  ).run(id, tid, patientId, clinicianId, startsAt, durationMin, kind, reason || null);
  notifyUser(
    db,
    tid,
    linkedUserId(db, tid, patientId),
    "appointment.booked",
    "Appointment Confirmed",
    `Your appointment is confirmed for ${new Date(startsAt * 1000).toLocaleString("en-IN")}.`,
    { appointmentId: id }
  );
  const appt = db.prepare(`${APPT_SELECT} WHERE a.id=?`).get(id);
  audit(tid, c.get("user").email, "appointment.booked", `appt:${id}`, getIp(c), { ua: getUa(c) });
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
  const diff = {};
  for (const [bk, dbk] of Object.entries(map)) {
    if (body[bk] !== undefined) {
      updates.push(`${dbk}=?`);
      vals.push(body[bk]);
      diff[bk] = body[bk];
    }
  }
  if (updates.length > 0)
    db.prepare(`UPDATE appointments SET ${updates.join(",")} WHERE id=?`).run(...vals, appt.id);
  const updated = db.prepare(`${APPT_SELECT} WHERE a.id=?`).get(appt.id);
  const patientUid = linkedUserId(db, tid, appt.patient_id);
  if (body.status === "cancelled" && appt.status !== "cancelled") {
    notifyUser(
      db,
      tid,
      patientUid,
      "appointment.cancelled",
      "Appointment Cancelled",
      `Your appointment on ${new Date(appt.starts_at * 1000).toLocaleString(
        "en-IN"
      )} has been cancelled.`,
      { appointmentId: appt.id }
    );
    // If the patient cancelled, tell the clinician their slot freed up.
    if (u.role === "patient")
      notifyUser(
        db,
        tid,
        linkedUserId(db, tid, appt.clinician_id),
        "appointment.cancelled",
        "Appointment Cancelled by Patient",
        `${updated.patient_name} cancelled the appointment on ${new Date(
          appt.starts_at * 1000
        ).toLocaleString("en-IN")}.`,
        { appointmentId: appt.id }
      );
  } else if (body.startsAt !== undefined && body.startsAt !== appt.starts_at) {
    notifyUser(
      db,
      tid,
      patientUid,
      "appointment.rescheduled",
      "Appointment Rescheduled",
      `Your appointment has been moved to ${new Date(body.startsAt * 1000).toLocaleString(
        "en-IN"
      )}.`,
      { appointmentId: appt.id }
    );
  }
  audit(tid, c.get("user").email, "appointment.updated", `appt:${appt.id}`, getIp(c), {
    ua: getUa(c),
    diff,
  });
  return ok(c, { appointment: parseAppt(updated) });
});

// ─── AVAILABILITY ─────────────────────────────────────────────────────────────

function parseBlock(b) {
  return {
    id: b.id,
    tenantId: b.tenant_id,
    clinicianId: b.clinician_id,
    startsAt: b.starts_at,
    endsAt: b.ends_at,
    kind: b.kind,
    reason: b.reason,
    createdAt: b.created_at,
    clinicianName: b.clinician_name,
  };
}

const BLOCK_SELECT = `SELECT b.*,c.name as clinician_name FROM availability_blocks b JOIN clinicians c ON c.id=b.clinician_id`;

app.get("/api/v1/availability", requireAuth, (c) => {
  const db = getDb();
  const u = c.get("user");
  const { clinicianId } = c.req.query();
  let sql = `${BLOCK_SELECT} WHERE b.tenant_id=?`;
  const params = [u.tid];
  const cid = clinicianId || (u.role === "clinician" ? u.eid : null);
  if (cid) {
    sql += " AND b.clinician_id=?";
    params.push(cid);
  }
  sql += " ORDER BY b.starts_at LIMIT 500";
  const rows = db
    .prepare(sql)
    .all(...params)
    .map(parseBlock);
  // Patients only need to know WHEN a clinician is unavailable, not why.
  if (u.role === "patient")
    return ok(c, {
      blocks: rows.map((b) => ({
        id: b.id,
        clinicianId: b.clinicianId,
        startsAt: b.startsAt,
        endsAt: b.endsAt,
      })),
    });
  return ok(c, { blocks: rows });
});

app.post("/api/v1/availability", requireAuth, requireRole("clinician", "admin"), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const schema = z.object({
    clinicianId: z.string().optional(),
    startsAt: z.number().int().positive(),
    endsAt: z.number().int().positive(),
    kind: z.enum(["leave", "holiday", "training", "emergency"]).default("leave"),
    reason: z.string().max(500).optional(),
  });
  const parsed = schema.safeParse(body);
  if (!parsed.success) return fail(c, "validation_failed", parsed.error.issues[0].message);
  const db = getDb();
  const u = c.get("user");
  const tid = u.tid;
  if (u.role === "clinician" && parsed.data.clinicianId && parsed.data.clinicianId !== u.eid)
    return fail(c, "forbidden", "Clinicians can only block their own calendar", 403);
  const clinicianId = u.role === "clinician" ? u.eid : parsed.data.clinicianId;
  if (!clinicianId) return fail(c, "validation_failed", "clinicianId required");
  const { startsAt, endsAt, kind, reason } = parsed.data;
  if (endsAt <= startsAt) return fail(c, "validation_failed", "endsAt must be after startsAt");
  if (endsAt - startsAt > 30 * 86400)
    return fail(c, "validation_failed", "A block cannot span more than 30 days");
  const clin = db
    .prepare("SELECT id FROM clinicians WHERE id=? AND tenant_id=?")
    .get(clinicianId, tid);
  if (!clin) return fail(c, "not_found", "Clinician not found", 404);
  const id = uuid();
  db.prepare(
    "INSERT INTO availability_blocks(id,tenant_id,clinician_id,starts_at,ends_at,kind,reason) VALUES(?,?,?,?,?,?,?)"
  ).run(id, tid, clinicianId, startsAt, endsAt, kind, reason || null);
  // Surface every live appointment the new block collides with so the caller
  // can decide per appointment: queue for the front desk, reschedule, or cancel.
  const affected = db
    .prepare(
      `${APPT_SELECT} WHERE a.tenant_id=? AND a.clinician_id=? AND a.status IN ('scheduled','checked-in') AND a.starts_at<? AND a.starts_at+a.duration_min*60>? ORDER BY a.starts_at`
    )
    .all(tid, clinicianId, endsAt, startsAt)
    .map(parseAppt);
  audit(tid, u.email, "availability.blocked", `block:${id}`, getIp(c), {
    diff: { clinicianId, startsAt, endsAt, kind },
  });
  const block = db.prepare(`${BLOCK_SELECT} WHERE b.id=?`).get(id);
  return ok(c, { block: parseBlock(block), affectedAppointments: affected }, 201);
});

app.delete("/api/v1/availability/:id", requireAuth, requireRole("clinician", "admin"), (c) => {
  const db = getDb();
  const u = c.get("user");
  const block = db
    .prepare("SELECT * FROM availability_blocks WHERE id=? AND tenant_id=?")
    .get(c.req.param("id"), u.tid);
  if (!block) return fail(c, "not_found", "Block not found", 404);
  if (u.role !== "admin" && block.clinician_id !== u.eid)
    return fail(c, "forbidden", "Only the owning clinician can remove this block", 403);
  // Queue items are history of displaced appointments — detach rather than
  // let the FK block the delete (or cascade them away).
  transaction(db, () => {
    db.prepare("UPDATE reassignment_queue SET block_id=NULL WHERE block_id=?").run(block.id);
    db.prepare("DELETE FROM availability_blocks WHERE id=?").run(block.id);
  })();
  audit(u.tid, u.email, "availability.unblocked", `block:${block.id}`, getIp(c));
  return ok(c, {});
});

// ─── REASSIGNMENT QUEUE ──────────────────────────────────────────────────────
// Appointments displaced by an availability block land here for the front desk
// or an admin to resolve: hand to another clinician, move the time, or cancel.

function parseQueueItem(r) {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    appointmentId: r.appointment_id,
    blockId: r.block_id,
    reason: r.reason,
    status: r.status,
    resolution: tryParse(r.resolution_json, null),
    createdAt: r.created_at,
    resolvedAt: r.resolved_at,
    startsAt: r.starts_at,
    durationMin: r.duration_min,
    apptStatus: r.appt_status,
    patientId: r.patient_id,
    patientName: r.patient_name,
    mrn: r.mrn,
    clinicianId: r.clinician_id,
    clinicianName: r.clinician_name,
    department: r.department,
  };
}

const RQ_SELECT = `SELECT q.*,a.starts_at,a.duration_min,a.status as appt_status,a.patient_id,a.clinician_id,p.name as patient_name,p.mrn,c.name as clinician_name,c.department FROM reassignment_queue q JOIN appointments a ON a.id=q.appointment_id JOIN patients p ON p.id=a.patient_id JOIN clinicians c ON c.id=a.clinician_id`;

app.get(
  "/api/v1/reassignments",
  requireAuth,
  requireRole("admin", "frontdesk", "clinician", "ops"),
  (c) => {
    const u = c.get("user");
    const { status = "open" } = c.req.query();
    let sql = `${RQ_SELECT} WHERE q.tenant_id=?`;
    const params = [u.tid];
    if (status !== "all") {
      sql += " AND q.status=?";
      params.push(status);
    }
    sql += " ORDER BY a.starts_at LIMIT 200";
    return ok(c, {
      queue: getDb()
        .prepare(sql)
        .all(...params)
        .map(parseQueueItem),
    });
  }
);

app.post(
  "/api/v1/reassignments",
  requireAuth,
  requireRole("clinician", "admin", "frontdesk"),
  async (c) => {
    const body = await c.req.json().catch(() => ({}));
    if (!body.appointmentId) return fail(c, "validation_failed", "appointmentId required");
    const db = getDb();
    const u = c.get("user");
    const tid = u.tid;
    const appt = db
      .prepare("SELECT * FROM appointments WHERE id=? AND tenant_id=?")
      .get(body.appointmentId, tid);
    if (!appt) return fail(c, "not_found", "Appointment not found", 404);
    if (u.role === "clinician" && appt.clinician_id !== u.eid)
      return fail(c, "forbidden", "Access denied", 403);
    const open = db
      .prepare("SELECT id FROM reassignment_queue WHERE appointment_id=? AND status='open'")
      .get(appt.id);
    if (open)
      return fail(c, "conflict", "This appointment is already queued for reassignment", 409);
    const id = uuid();
    db.prepare(
      "INSERT INTO reassignment_queue(id,tenant_id,appointment_id,block_id,reason) VALUES(?,?,?,?,?)"
    ).run(id, tid, appt.id, body.blockId || null, body.reason || null);
    audit(tid, u.email, "reassignment.queued", `queue:${id}`, getIp(c));
    return ok(c, { item: parseQueueItem(db.prepare(`${RQ_SELECT} WHERE q.id=?`).get(id)) }, 201);
  }
);

app.post(
  "/api/v1/reassignments/:id/resolve",
  requireAuth,
  requireRole("admin", "frontdesk"),
  async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const action = body.action;
    if (!["reassign", "reschedule", "cancel"].includes(action))
      return fail(c, "validation_failed", "action must be reassign, reschedule, or cancel");
    const db = getDb();
    const u = c.get("user");
    const tid = u.tid;
    const item = db
      .prepare("SELECT * FROM reassignment_queue WHERE id=? AND tenant_id=?")
      .get(c.req.param("id"), tid);
    if (!item) return fail(c, "not_found", "Queue item not found", 404);
    if (item.status !== "open") return fail(c, "conflict", "Queue item already resolved", 409);
    const appt = db
      .prepare("SELECT * FROM appointments WHERE id=? AND tenant_id=?")
      .get(item.appointment_id, tid);
    if (!appt) return fail(c, "not_found", "Appointment not found", 404);
    const now = Math.floor(Date.now() / 1000);
    const patientUid = linkedUserId(db, tid, appt.patient_id);
    const resolution = { action, by: u.email, at: now };
    if (action === "cancel") {
      if (appt.status !== "scheduled")
        return fail(c, "invalid_transition", `Cannot cancel a ${appt.status} appointment`, 422);
      db.prepare("UPDATE appointments SET status='cancelled' WHERE id=?").run(appt.id);
      notifyUser(
        db,
        tid,
        patientUid,
        "appointment.cancelled",
        "Appointment Cancelled",
        `Your appointment on ${new Date(appt.starts_at * 1000).toLocaleString(
          "en-IN"
        )} was cancelled by the hospital. Please rebook at your convenience.`,
        { appointmentId: appt.id }
      );
    } else if (action === "reassign") {
      const target = db
        .prepare("SELECT id FROM clinicians WHERE id=? AND tenant_id=?")
        .get(body.clinicianId || "", tid);
      if (!target) return fail(c, "not_found", "Target clinician not found", 404);
      const endsAt = appt.starts_at + appt.duration_min * 60;
      const busy = db
        .prepare(
          `SELECT id FROM appointments WHERE tenant_id=? AND clinician_id=? AND id!=? AND status NOT IN ('cancelled','no-show') AND starts_at<? AND starts_at+duration_min*60>? LIMIT 1`
        )
        .get(tid, target.id, appt.id, endsAt, appt.starts_at);
      if (busy)
        return fail(c, "slot_taken", "The target clinician already has a booking then", 409);
      const blocked = db
        .prepare(
          "SELECT id FROM availability_blocks WHERE tenant_id=? AND clinician_id=? AND starts_at<? AND ends_at>? LIMIT 1"
        )
        .get(tid, target.id, endsAt, appt.starts_at);
      if (blocked)
        return fail(c, "clinician_unavailable", "The target clinician is unavailable then", 409);
      db.prepare("UPDATE appointments SET clinician_id=? WHERE id=?").run(target.id, appt.id);
      resolution.clinicianId = target.id;
      notifyUser(
        db,
        tid,
        patientUid,
        "appointment.reassigned",
        "Appointment Update",
        `Your appointment on ${new Date(appt.starts_at * 1000).toLocaleString(
          "en-IN"
        )} has been moved to a different clinician.`,
        { appointmentId: appt.id }
      );
    } else {
      const startsAt = Number(body.startsAt);
      if (!Number.isInteger(startsAt) || startsAt <= 0)
        return fail(c, "validation_failed", "startsAt (unix seconds) required");
      const endsAt = startsAt + appt.duration_min * 60;
      const busy = db
        .prepare(
          `SELECT id FROM appointments WHERE tenant_id=? AND clinician_id=? AND id!=? AND status NOT IN ('cancelled','no-show') AND starts_at<? AND starts_at+duration_min*60>? LIMIT 1`
        )
        .get(tid, appt.clinician_id, appt.id, endsAt, startsAt);
      if (busy) return fail(c, "slot_taken", "That slot is already booked", 409);
      const blocked = db
        .prepare(
          "SELECT id FROM availability_blocks WHERE tenant_id=? AND clinician_id=? AND starts_at<? AND ends_at>? LIMIT 1"
        )
        .get(tid, appt.clinician_id, endsAt, startsAt);
      if (blocked)
        return fail(
          c,
          "clinician_unavailable",
          "The clinician is unavailable at the new time",
          409
        );
      db.prepare("UPDATE appointments SET starts_at=? WHERE id=?").run(startsAt, appt.id);
      resolution.startsAt = startsAt;
      notifyUser(
        db,
        tid,
        patientUid,
        "appointment.rescheduled",
        "Appointment Rescheduled",
        `Your appointment has been moved to ${new Date(startsAt * 1000).toLocaleString("en-IN")}.`,
        { appointmentId: appt.id }
      );
    }
    db.prepare(
      "UPDATE reassignment_queue SET status='resolved', resolution_json=?, resolved_at=? WHERE id=?"
    ).run(JSON.stringify(resolution), now, item.id);
    audit(tid, u.email, "reassignment.resolved", `queue:${item.id}`, getIp(c), {
      diff: resolution,
    });
    return ok(c, { item: parseQueueItem(db.prepare(`${RQ_SELECT} WHERE q.id=?`).get(item.id)) });
  }
);

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
    prevHash: n.prev_hash,
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

app.post(
  "/api/v1/notes/:id/addendum",
  requireAuth,
  requireRole("clinician", "admin"),
  async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const db = getDb();
    const u = c.get("user");
    const target = db
      .prepare("SELECT * FROM notes WHERE id=? AND tenant_id=?")
      .get(c.req.param("id"), u.tid);
    if (!target) return fail(c, "not_found", "Note not found", 404);
    if (!target.signed_at)
      return fail(c, "conflict", "Addenda can only be added to signed notes", 409);
    const clinicianId = clinicianEntityId(db, u);
    if (!clinicianId)
      return fail(c, "no_clinician_profile", "No clinician profile is linked to this account", 409);
    const id = uuid();
    // prev_hash chains the addendum to the exact signed content it amends.
    db.prepare(
      "INSERT INTO notes(id,tenant_id,patient_id,clinician_id,appointment_id,type,title,body_json,diagnoses_json,addendum_of,prev_hash) VALUES(?,?,?,?,?,?,?,?,?,?,?)"
    ).run(
      id,
      u.tid,
      target.patient_id,
      clinicianId,
      target.appointment_id,
      target.type,
      body.title || `Addendum: ${target.title || "note"}`,
      JSON.stringify(body.body || {}),
      JSON.stringify(body.diagnoses || []),
      target.id,
      sha256(target.body_json || "")
    );
    audit(u.tid, u.email, "note.addendum", `note:${id}`, getIp(c));
    return ok(c, { note: parseNote(db.prepare(`${NOTE_SELECT} WHERE n.id=?`).get(id)) }, 201);
  }
);

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
  const LAB_VALID = {
    ordered: ["in-lab", "resulted", "cancelled"],
    "in-lab": ["resulted", "cancelled"],
    resulted: ["reviewed"],
    reviewed: [],
    cancelled: [],
  };
  if (body.status && body.status !== lab.status && !LAB_VALID[lab.status]?.includes(body.status))
    return fail(c, "invalid_transition", `Cannot move from ${lab.status} to ${body.status}`, 422);
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
  if (body.status === "resulted" && lab.status !== "resulted")
    notifyUser(
      db,
      u.tid,
      linkedUserId(db, u.tid, lab.patient_id),
      "lab.resulted",
      "Lab Results Ready",
      `Results for your ${lab.panel} panel are ready to view.`,
      { labId: lab.id }
    );
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
    overrideReason: r.override_reason,
    discontinuedReason: r.discontinued_reason,
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
    .prepare("SELECT id,allergies_json FROM patients WHERE id=? AND tenant_id=?")
    .get(body.patientId, tid);
  if (!pat) return fail(c, "not_found", "Patient not found", 404);
  const clinicianId = clinicianEntityId(db, u);
  if (!clinicianId)
    return fail(c, "no_clinician_profile", "No clinician profile is linked to this account", 409);
  // Safety gate: check the drug against recorded allergies and every active or
  // dispensed prescription. Warnings block unless the prescriber overrides
  // with a recorded reason.
  const activeDrugs = db
    .prepare(
      `SELECT drug FROM prescriptions WHERE tenant_id=? AND patient_id=? AND status IN ('active','dispensed')`
    )
    .all(tid, body.patientId)
    .map((r) => r.drug);
  const warnings = [
    ...allergyWarnings(tryParse(pat.allergies_json, []), body.drug),
    ...interactionWarnings(activeDrugs, body.drug),
  ];
  if (warnings.length > 0 && !String(body.overrideReason || "").trim()) {
    const code = warnings.some((w) => w.type === "allergy") ? "drug_allergy" : "drug_interaction";
    return c.json(
      {
        ok: false,
        error: code,
        message: "Safety warnings found; pass overrideReason to prescribe anyway",
        warnings,
      },
      422
    );
  }
  const id = uuid();
  db.prepare(
    "INSERT INTO prescriptions(id,tenant_id,patient_id,clinician_id,appointment_id,drug,form,dose,freq,duration,refills,instructions,override_reason) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)"
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
    body.instructions || null,
    warnings.length > 0 ? String(body.overrideReason).trim() : null
  );
  audit(tid, u.email, "prescription.created", `rx:${id}`, getIp(c), {
    diff:
      warnings.length > 0
        ? { warnings, overrideReason: String(body.overrideReason).trim() }
        : undefined,
  });
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
    const RX_VALID = {
      active: ["dispensed", "completed", "discontinued"],
      dispensed: ["completed", "discontinued"],
      completed: [],
      discontinued: [],
    };
    if (body.status && body.status !== rx.status && !RX_VALID[rx.status]?.includes(body.status))
      return fail(c, "invalid_transition", `Cannot move from ${rx.status} to ${body.status}`, 422);
    if (body.status === "discontinued" && !String(body.reason || "").trim())
      return fail(c, "validation_failed", "A reason is required to discontinue a prescription");
    const updates = [];
    const vals = [];
    if (body.status) {
      updates.push("status=?");
      vals.push(body.status);
    }
    if (body.status === "discontinued") {
      updates.push("discontinued_reason=?");
      vals.push(String(body.reason).trim());
    }
    if (body.refills !== undefined) {
      updates.push("refills=?");
      vals.push(body.refills);
    }
    if (updates.length > 0)
      db.prepare(`UPDATE prescriptions SET ${updates.join(",")} WHERE id=?`).run(...vals, rx.id);
    if (body.status === "discontinued")
      notifyUser(
        db,
        u.tid,
        linkedUserId(db, u.tid, rx.patient_id),
        "prescription.discontinued",
        "Prescription Discontinued",
        `${rx.drug} has been discontinued: ${String(body.reason).trim()}`,
        { prescriptionId: rx.id }
      );
    audit(u.tid, u.email, "prescription.updated", `rx:${rx.id}`, getIp(c), {
      diff: { status: body.status, reason: body.reason, refills: body.refills },
    });
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
  // A clinician with no patientId gets their whole inbox; other roles must scope.
  if (!pid && u.role !== "clinician") return fail(c, "validation_failed", "patientId required");
  if (u.role === "patient" && pid !== u.eid) return fail(c, "forbidden", "Access denied", 403);
  let sql = `${MSG_SELECT} WHERE m.tenant_id=?`;
  const params = [u.tid];
  if (pid) {
    sql += " AND m.patient_id=?";
    params.push(pid);
  }
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
      const otherEntity = u.role === "patient" ? msg.clinician_id : msg.patient_id;
      notifyUser(
        db,
        tid,
        linkedUserId(db, tid, otherEntity),
        "message.received",
        "New Message",
        `You have a new message in "${msg.subject}".`,
        { threadId: msg.id }
      );
      audit(tid, u.email, "message.sent", `msg:${msg.id}`, getIp(c));
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
    const otherEntity = from === "patient" ? body.clinicianId : patientId;
    notifyUser(
      db,
      tid,
      linkedUserId(db, tid, otherEntity),
      "message.received",
      "New Message",
      `You have a new message in "${body.subject || "Message"}".`,
      { threadId: id }
    );
    audit(tid, u.email, "message.sent", `msg:${id}`, getIp(c));
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

// ─── TASKS ─────────────────────────────────────────────────────────────────────
// Personal Eisenhower-matrix task list, private to each signed-in user.

function parseTask(t) {
  return {
    id: t.id,
    userId: t.user_id,
    title: t.title,
    quadrant: t.quadrant,
    done: !!t.done,
    createdAt: t.created_at,
  };
}

const TASK_QUADRANTS = ["do", "schedule", "delegate", "eliminate"];

app.get("/api/v1/tasks", requireAuth, (c) => {
  const u = c.get("user");
  const rows = getDb()
    .prepare(
      "SELECT * FROM tasks WHERE tenant_id=? AND user_id=? ORDER BY created_at DESC LIMIT 500"
    )
    .all(u.tid, u.sub);
  return ok(c, { tasks: rows.map(parseTask) });
});

app.post("/api/v1/tasks", requireAuth, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const title = String(body.title || "").trim();
  if (!title || title.length > 300)
    return fail(c, "validation_failed", "title required (max 300 chars)");
  const quadrant = body.quadrant || "do";
  if (!TASK_QUADRANTS.includes(quadrant))
    return fail(c, "validation_failed", "quadrant must be do, schedule, delegate, or eliminate");
  const u = c.get("user");
  const db = getDb();
  const id = uuid();
  db.prepare("INSERT INTO tasks(id,tenant_id,user_id,title,quadrant) VALUES(?,?,?,?,?)").run(
    id,
    u.tid,
    u.sub,
    title,
    quadrant
  );
  return ok(c, { task: parseTask(db.prepare("SELECT * FROM tasks WHERE id=?").get(id)) }, 201);
});

app.patch("/api/v1/tasks/:id", requireAuth, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const u = c.get("user");
  const db = getDb();
  const task = db
    .prepare("SELECT * FROM tasks WHERE id=? AND tenant_id=? AND user_id=?")
    .get(c.req.param("id"), u.tid, u.sub);
  if (!task) return fail(c, "not_found", "Task not found", 404);
  if (body.quadrant !== undefined && !TASK_QUADRANTS.includes(body.quadrant))
    return fail(c, "validation_failed", "quadrant must be do, schedule, delegate, or eliminate");
  const updates = [];
  const vals = [];
  if (body.title !== undefined) {
    const t = String(body.title).trim();
    if (!t || t.length > 300) return fail(c, "validation_failed", "title required (max 300 chars)");
    updates.push("title=?");
    vals.push(t);
  }
  if (body.quadrant !== undefined) {
    updates.push("quadrant=?");
    vals.push(body.quadrant);
  }
  if (body.done !== undefined) {
    updates.push("done=?");
    vals.push(body.done ? 1 : 0);
  }
  if (updates.length > 0)
    db.prepare(`UPDATE tasks SET ${updates.join(",")} WHERE id=?`).run(...vals, task.id);
  return ok(c, { task: parseTask(db.prepare("SELECT * FROM tasks WHERE id=?").get(task.id)) });
});

app.delete("/api/v1/tasks/:id", requireAuth, (c) => {
  const u = c.get("user");
  const res = getDb()
    .prepare("DELETE FROM tasks WHERE id=? AND tenant_id=? AND user_id=?")
    .run(c.req.param("id"), u.tid, u.sub);
  if (!res.changes) return fail(c, "not_found", "Task not found", 404);
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
  const { q } = c.req.query();
  let sql =
    "SELECT id,name,email,role,linked_entity_id,last_login_at,created_at FROM users WHERE tenant_id=?";
  const params = [c.get("user").tid];
  if (q) {
    sql += " AND (name LIKE ? OR email LIKE ?)";
    params.push(`%${q}%`, `%${q}%`);
  }
  sql += " ORDER BY created_at DESC";
  const users = getDb()
    .prepare(sql)
    .all(...params);
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
      {
        name: "api-gateway",
        status: "healthy",
        latency: dbLatency + 1,
        uptime: uptimePct(db, tid),
      },
      {
        name: "database (sqlite/wal)",
        status: dbHealthy ? "healthy" : "degraded",
        latency: dbLatency,
        uptime: uptimePct(db, tid),
      },
    ],
    metrics: {
      uptimeSeconds: Math.floor((Date.now() - STARTED_AT) / 1000),
      users: counts.users,
      appointments: counts.appts,
    },
  });
});

function parseIncident(i) {
  return {
    id: i.id,
    tenantId: i.tenant_id,
    severity: i.severity,
    title: i.title,
    service: i.service,
    detail: i.detail,
    status: i.status,
    owner: i.owner,
    openedAt: i.opened_at,
    resolvedAt: i.resolved_at,
  };
}

app.get("/api/v1/platform/incidents", requireAuth, requireRole("admin", "ops"), (c) => {
  const rows = getDb()
    .prepare("SELECT * FROM incidents WHERE tenant_id=? ORDER BY opened_at DESC LIMIT 100")
    .all(c.get("user").tid);
  return ok(c, { incidents: rows.map(parseIncident) });
});

app.post("/api/v1/platform/incidents", requireAuth, requireRole("admin", "ops"), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const schema = z.object({
    severity: z.enum(["sev1", "sev2", "sev3"]),
    title: z.string().min(3).max(200),
    service: z.string().max(100).optional(),
    detail: z.string().max(2000).optional(),
    owner: z.string().max(200).optional(),
  });
  const parsed = schema.safeParse(body);
  if (!parsed.success) return fail(c, "validation_failed", parsed.error.issues[0].message);
  const db = getDb();
  const u = c.get("user");
  const id = uuid();
  db.prepare(
    "INSERT INTO incidents(id,tenant_id,severity,title,service,detail,owner) VALUES(?,?,?,?,?,?,?)"
  ).run(
    id,
    u.tid,
    parsed.data.severity,
    parsed.data.title,
    parsed.data.service || "api-gateway",
    parsed.data.detail || null,
    parsed.data.owner || u.email
  );
  audit(u.tid, u.email, "incident.opened", `inc:${id}`, getIp(c));
  return ok(
    c,
    { incident: parseIncident(db.prepare("SELECT * FROM incidents WHERE id=?").get(id)) },
    201
  );
});

app.patch("/api/v1/platform/incidents/:id", requireAuth, requireRole("admin", "ops"), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const db = getDb();
  const u = c.get("user");
  const inc = db
    .prepare("SELECT * FROM incidents WHERE id=? AND tenant_id=?")
    .get(c.req.param("id"), u.tid);
  if (!inc) return fail(c, "not_found", "Incident not found", 404);
  const INC_VALID = {
    open: ["monitoring", "resolved"],
    monitoring: ["open", "resolved"],
    resolved: [],
  };
  if (body.status && body.status !== inc.status && !INC_VALID[inc.status]?.includes(body.status))
    return fail(c, "invalid_transition", `Cannot move from ${inc.status} to ${body.status}`, 422);
  if (body.severity && !["sev1", "sev2", "sev3"].includes(body.severity))
    return fail(c, "validation_failed", "severity must be sev1, sev2, or sev3");
  const updates = [];
  const vals = [];
  const map = { status: "status", severity: "severity", owner: "owner", detail: "detail" };
  for (const [bk, dbk] of Object.entries(map)) {
    if (body[bk] !== undefined) {
      updates.push(`${dbk}=?`);
      vals.push(body[bk]);
    }
  }
  if (body.status === "resolved" && inc.status !== "resolved") {
    updates.push("resolved_at=?");
    vals.push(Math.floor(Date.now() / 1000));
  }
  if (updates.length > 0)
    db.prepare(`UPDATE incidents SET ${updates.join(",")} WHERE id=?`).run(...vals, inc.id);
  audit(u.tid, u.email, "incident.updated", `inc:${inc.id}`, getIp(c), { diff: body });
  return ok(c, {
    incident: parseIncident(db.prepare("SELECT * FROM incidents WHERE id=?").get(inc.id)),
  });
});

// Uptime over the trailing 30 days, derived from recorded incidents: sev1
// downtime counts in full, sev2 at 40% weight, sev3 not at all.
function uptimePct(db, tid) {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - 30 * 86400;
  const rows = db
    .prepare(
      "SELECT severity, opened_at, resolved_at FROM incidents WHERE tenant_id=? AND severity IN ('sev1','sev2') AND opened_at < ?"
    )
    .all(tid, now);
  let downtime = 0;
  for (const r of rows) {
    const start = Math.max(r.opened_at, windowStart);
    const end = Math.min(r.resolved_at || now, now);
    if (end <= start) continue;
    downtime += (end - start) * (r.severity === "sev1" ? 1 : 0.4);
  }
  const pct = Math.max(0, 100 - (downtime / (30 * 86400)) * 100);
  return Math.round(pct * 100) / 100;
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
