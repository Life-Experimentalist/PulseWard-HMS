import { get, post, patch, del, login, tokenFor, ACCOUNTS } from "./_helpers.mjs";

let adminToken, adminUserId;
let patientToken;

beforeAll(async () => {
  const a = await login(ACCOUNTS.admin);
  adminToken = a.token;
  adminUserId = a.user.id;
  patientToken = await tokenFor(ACCOUNTS.patient);
});

describe("admin: stats and directory", () => {
  test("admin reads tenant stats", async () => {
    const { status, body } = await get("/api/v1/admin/stats", { token: adminToken });
    expect(status).toBe(200);
    expect(body.stats.patientCount).toBeGreaterThanOrEqual(3);
    expect(body.stats.clinicianCount).toBeGreaterThanOrEqual(3);
  });

  test("admin lists users, audit events, and tenants", async () => {
    const users = await get("/api/v1/admin/users", { token: adminToken });
    expect(users.status).toBe(200);
    expect(users.body.users.length).toBeGreaterThan(0);

    const audit = await get("/api/v1/admin/audit", { token: adminToken });
    expect(audit.status).toBe(200);
    expect(audit.body.events.length).toBeGreaterThan(0);

    const tenants = await get("/api/v1/admin/tenants", { token: adminToken });
    expect(tenants.status).toBe(200);
    expect(tenants.body.tenants.some((t) => t.slug === "default")).toBe(true);
  });

  test("a patient cannot read admin stats", async () => {
    const { status, body } = await get("/api/v1/admin/stats", { token: patientToken });
    expect(status).toBe(403);
    expect(body.error).toBe("forbidden");
  });
});

describe("admin: user management", () => {
  test("admin creates a user, and duplicates/weak input are rejected", async () => {
    const email = `frontdesk.${Date.now()}@pulseward.com`;
    const created = await post(
      "/api/v1/admin/users",
      {
        name: "Front Desk",
        email,
        password: "DeskPass@1",
        role: "frontdesk",
      },
      { token: adminToken }
    );
    expect(created.status).toBe(201);
    expect(created.body.userId).toBeTruthy();

    const dup = await post(
      "/api/v1/admin/users",
      {
        name: "Front Desk",
        email,
        password: "DeskPass@1",
        role: "frontdesk",
      },
      { token: adminToken }
    );
    expect(dup.status).toBe(409);
    expect(dup.body.error).toBe("email_taken");

    const weak = await post(
      "/api/v1/admin/users",
      {
        name: "Weak",
        email: `weak.${Date.now()}@pulseward.com`,
        password: "short",
        role: "ops",
      },
      { token: adminToken }
    );
    expect(weak.status).toBe(400);
    expect(weak.body.error).toBe("validation_failed");

    const badRole = await post(
      "/api/v1/admin/users",
      {
        name: "Bad Role",
        email: `br.${Date.now()}@pulseward.com`,
        password: "GoodPass@1",
        role: "superuser",
      },
      { token: adminToken }
    );
    expect(badRole.status).toBe(400);
    expect(badRole.body.error).toBe("validation_failed");
  });

  test("admin deletes a user but cannot delete themselves", async () => {
    const created = await post(
      "/api/v1/admin/users",
      {
        name: "Deletable",
        email: `del.${Date.now()}@pulseward.com`,
        password: "DelPass@1",
        role: "frontdesk",
      },
      { token: adminToken }
    );
    const id = created.body.userId;

    const ok = await del(`/api/v1/admin/users/${id}`, { token: adminToken });
    expect(ok.status).toBe(200);

    const self = await del(`/api/v1/admin/users/${adminUserId}`, { token: adminToken });
    expect(self.status).toBe(403);
    expect(self.body.error).toBe("forbidden");

    const missing = await del(`/api/v1/admin/users/does-not-exist`, { token: adminToken });
    expect(missing.status).toBe(404);
  });
});

describe("admin: clinician onboarding", () => {
  test("admin creates a clinician with an optional linked login", async () => {
    const email = `dr.new.${Date.now()}@pulseward.com`;
    const created = await post(
      "/api/v1/admin/clinicians",
      {
        name: "Dr. New Hire",
        specialty: "Dermatology",
        email,
        password: "ClinPass@1",
      },
      { token: adminToken }
    );
    expect(created.status).toBe(201);
    expect(created.body.clinician.name).toBe("Dr. New Hire");

    // The linked login now works.
    const auth = await post("/api/v1/auth/login", { email, password: "ClinPass@1" });
    expect(auth.status).toBe(200);
    expect(auth.body.role).toBe("clinician");
  });

  test("creating a clinician without a name is rejected", async () => {
    const { status, body } = await post(
      "/api/v1/admin/clinicians",
      { specialty: "X" },
      { token: adminToken }
    );
    expect(status).toBe(400);
    expect(body.error).toBe("validation_failed");
  });
});

describe("ops: role boundaries", () => {
  let opsToken;

  beforeAll(async () => {
    const email = `ops.${Date.now()}@pulseward.com`;
    await post(
      "/api/v1/admin/users",
      {
        name: "Ops One",
        email,
        password: "OpsPass@1",
        role: "ops",
      },
      { token: adminToken }
    );
    const auth = await post("/api/v1/auth/login", { email, password: "OpsPass@1" });
    opsToken = auth.body.token;
  });

  test("ops may read stats and platform health", async () => {
    const stats = await get("/api/v1/admin/stats", { token: opsToken });
    expect(stats.status).toBe(200);

    const health = await get("/api/v1/platform/health", { token: opsToken });
    expect(health.status).toBe(200);
  });

  test("ops may not manage users", async () => {
    const users = await get("/api/v1/admin/users", { token: opsToken });
    expect(users.status).toBe(403);
    expect(users.body.error).toBe("forbidden");
  });
});

describe("platform: health and incidents", () => {
  test("admin sees the two-service health payload and metrics", async () => {
    const { status, body } = await get("/api/v1/platform/health", { token: adminToken });
    expect(status).toBe(200);
    expect(body.services.length).toBe(2);
    expect(body.services.map((s) => s.name)).toContain("api-gateway");
    expect(typeof body.metrics.uptimeSeconds).toBe("number");
    expect(typeof body.metrics.users).toBe("number");
  });

  test("incidents start empty, then support the full open→resolve lifecycle", async () => {
    const empty = await get("/api/v1/platform/incidents", { token: adminToken });
    expect(empty.status).toBe(200);
    expect(empty.body.incidents).toEqual([]);

    const bad = await post(
      "/api/v1/platform/incidents",
      { severity: "sev9", title: "Nope" },
      { token: adminToken }
    );
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe("validation_failed");

    const opened = await post(
      "/api/v1/platform/incidents",
      { severity: "sev2", title: "Elevated API latency", detail: "p95 above 800ms" },
      { token: adminToken }
    );
    expect(opened.status).toBe(201);
    expect(opened.body.incident.status).toBe("open");
    expect(opened.body.incident.service).toBe("api-gateway");
    expect(opened.body.incident.owner).toBeTruthy();
    const incId = opened.body.incident.id;

    const listed = await get("/api/v1/platform/incidents", { token: adminToken });
    expect(listed.body.incidents.map((i) => i.id)).toContain(incId);

    const monitoring = await patch(
      `/api/v1/platform/incidents/${incId}`,
      { status: "monitoring" },
      { token: adminToken }
    );
    expect(monitoring.status).toBe(200);
    expect(monitoring.body.incident.status).toBe("monitoring");

    const resolved = await patch(
      `/api/v1/platform/incidents/${incId}`,
      { status: "resolved" },
      { token: adminToken }
    );
    expect(resolved.status).toBe(200);
    expect(resolved.body.incident.resolvedAt).toBeTruthy();

    // Resolved incidents cannot be reopened.
    const reopen = await patch(
      `/api/v1/platform/incidents/${incId}`,
      { status: "open" },
      { token: adminToken }
    );
    expect(reopen.status).toBe(422);
    expect(reopen.body.error).toBe("invalid_transition");

    // A patient cannot touch incidents.
    const denied = await get("/api/v1/platform/incidents", { token: patientToken });
    expect(denied.status).toBe(403);
  });

  test("a patient cannot reach platform health", async () => {
    const { status, body } = await get("/api/v1/platform/health", { token: patientToken });
    expect(status).toBe(403);
    expect(body.error).toBe("forbidden");
  });
});
