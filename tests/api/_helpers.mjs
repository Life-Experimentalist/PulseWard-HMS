// Shared bootstrap for api-gateway integration tests.
//
// Each Jest test file gets its own module registry, so importing this helper
// runs it once per file. We set a UNIQUE DB_PATH before importing app.js so
// every file gets its own freshly-seeded SQLite database — fully isolated,
// no shared state, safe under --runInBand. process.loadEnvFile() inside app.js
// does NOT override already-set env vars, so our DB_PATH wins over any .env.

import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dbFile = join(tmpdir(), `pw-test-${randomBytes(8).toString("hex")}.db`);
process.env.DB_PATH = dbFile;
process.env.NODE_ENV =
  process.env.NODE_ENV === "production" ? "test" : process.env.NODE_ENV || "test";

// Dynamic import runs AFTER the env writes above (static imports are hoisted).
const mod = await import("../../services/api-gateway/app.js");
export const app = mod.app;

// Seeded demo accounts (see services/api-gateway/db.js seedIfEmpty).
export const ACCOUNTS = {
  admin: { email: "admin@pulseward.com", password: "Admin@123" },
  drSharma: { email: "dr.sharma@pulseward.com", password: "Doctor@123" },
  drMehta: { email: "dr.mehta@pulseward.com", password: "Doctor@123" },
  patient: { email: "patient@pulseward.com", password: "Patient@123" },
};

/** Low-level request against the in-process Hono app. */
export async function call(method, path, { token, body, headers = {} } = {}) {
  const h = { ...headers };
  if (body !== undefined) h["Content-Type"] = "application/json";
  if (token) h.Authorization = `Bearer ${token}`;
  const res = await app.request(path, {
    method,
    headers: h,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, body: json ?? {} };
}

export const get = (path, opts) => call("GET", path, opts);
export const post = (path, body, opts) => call("POST", path, { ...opts, body });
export const patch = (path, body, opts) => call("PATCH", path, { ...opts, body });
export const del = (path, opts) => call("DELETE", path, opts);

/** Log in and return the full auth payload ({ token, refresh, role, user }). */
export async function login(account) {
  const { status, body } = await post("/api/v1/auth/login", {
    email: account.email,
    password: account.password,
  });
  if (status !== 200)
    throw new Error(`login failed for ${account.email}: ${status} ${JSON.stringify(body)}`);
  return body;
}

/** Log in and return just the access token. */
export async function tokenFor(account) {
  return (await login(account)).token;
}
