import { get, post, login, tokenFor, ACCOUNTS } from "./_helpers.mjs";

describe("auth: login", () => {
  test("valid credentials return access + refresh tokens and a user object", async () => {
    const { status, body } = await post("/api/v1/auth/login", {
      email: ACCOUNTS.admin.email,
      password: ACCOUNTS.admin.password,
    });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(typeof body.token).toBe("string");
    expect(typeof body.refresh).toBe("string");
    expect(body.role).toBe("admin");
    expect(body.user.email).toBe(ACCOUNTS.admin.email);
    expect(body.user.tenantId).toBeTruthy();
  });

  test("email is matched case-insensitively and trimmed", async () => {
    const { status, body } = await post("/api/v1/auth/login", {
      email: "  ADMIN@PulseWard.com  ",
      password: ACCOUNTS.admin.password,
    });
    expect(status).toBe(200);
    expect(body.user.email).toBe("admin@pulseward.com");
  });

  test("wrong password is rejected with 401 invalid_credentials", async () => {
    const { status, body } = await post("/api/v1/auth/login", {
      email: ACCOUNTS.admin.email,
      password: "wrong-password",
    });
    expect(status).toBe(401);
    expect(body.error).toBe("invalid_credentials");
  });

  test("unknown email is rejected with 401 invalid_credentials (no user enumeration)", async () => {
    const { status, body } = await post("/api/v1/auth/login", {
      email: "nobody@pulseward.com",
      password: "whatever12",
    });
    expect(status).toBe(401);
    expect(body.error).toBe("invalid_credentials");
  });

  test("missing fields are rejected with 400 validation_failed", async () => {
    const { status, body } = await post("/api/v1/auth/login", { email: ACCOUNTS.admin.email });
    expect(status).toBe(400);
    expect(body.error).toBe("validation_failed");
  });
});

describe("auth: access-token type enforcement (token-type confusion)", () => {
  test("a refresh token cannot be used as a Bearer access token", async () => {
    const { refresh } = await login(ACCOUNTS.patient);
    const { status, body } = await get("/api/v1/auth/me", { token: refresh });
    expect(status).toBe(401);
    expect(body.error).toBe("no_session");
  });

  test("a valid access token authenticates /auth/me", async () => {
    const { token, user } = await login(ACCOUNTS.patient);
    const { status, body } = await get("/api/v1/auth/me", { token });
    expect(status).toBe(200);
    expect(body.user.email).toBe(user.email);
  });

  test("a non-Bearer authorization header is rejected", async () => {
    const { status, body } = await get("/api/v1/auth/me", {
      headers: { Authorization: "Basic abc" },
    });
    expect(status).toBe(401);
    expect(body.error).toBe("no_session");
  });

  test("a garbage bearer token is rejected", async () => {
    const { status, body } = await get("/api/v1/auth/me", { token: "not-a-jwt" });
    expect(status).toBe(401);
    expect(body.error).toBe("no_session");
  });
});

describe("auth: signup", () => {
  test("creates a patient account that can immediately authenticate", async () => {
    const email = `newpatient.${Date.now()}@example.com`;
    const { status, body } = await post("/api/v1/auth/signup", {
      name: "New Patient",
      email,
      password: "Sup3rSecret!",
      gender: "F",
    });
    expect(status).toBe(201);
    expect(body.role).toBe("patient");
    expect(body.user.linkedEntityId).toBeTruthy();
    expect(typeof body.token).toBe("string");

    const me = await get("/api/v1/auth/me", { token: body.token });
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(email.toLowerCase());
  });

  test("duplicate email is rejected with 409 email_taken", async () => {
    const { status, body } = await post("/api/v1/auth/signup", {
      name: "Dup",
      email: ACCOUNTS.patient.email,
      password: "Sup3rSecret!",
    });
    expect(status).toBe(409);
    expect(body.error).toBe("email_taken");
  });

  test("a short password is rejected with validation_failed", async () => {
    const { status, body } = await post("/api/v1/auth/signup", {
      name: "Short Pw",
      email: `short.${Date.now()}@example.com`,
      password: "short",
    });
    expect(status).toBe(400);
    expect(body.error).toBe("validation_failed");
  });

  test("a one-character name is rejected with validation_failed", async () => {
    const { status, body } = await post("/api/v1/auth/signup", {
      name: "A",
      email: `a.${Date.now()}@example.com`,
      password: "Sup3rSecret!",
    });
    expect(status).toBe(400);
    expect(body.error).toBe("validation_failed");
  });
});

describe("auth: refresh rotation + reuse detection", () => {
  test("a refresh token rotates to a new pair", async () => {
    const { refresh } = await login(ACCOUNTS.drSharma);
    const { status, body } = await post("/api/v1/auth/refresh", { refresh });
    expect(status).toBe(200);
    expect(typeof body.token).toBe("string");
    expect(typeof body.refresh).toBe("string");
    expect(body.refresh).not.toBe(refresh);
  });

  test("replaying a consumed refresh token revokes the whole family", async () => {
    const { refresh: r0 } = await login(ACCOUNTS.drMehta);

    // First rotation consumes r0 and issues r1.
    const first = await post("/api/v1/auth/refresh", { refresh: r0 });
    expect(first.status).toBe(200);
    const r1 = first.body.refresh;

    // Replaying r0 is reuse — rejected, and it burns the whole family.
    const replay = await post("/api/v1/auth/refresh", { refresh: r0 });
    expect(replay.status).toBe(401);
    expect(replay.body.error).toBe("no_session");

    // r1 was legitimately issued but is now revoked by the reuse response.
    const afterReuse = await post("/api/v1/auth/refresh", { refresh: r1 });
    expect(afterReuse.status).toBe(401);
    expect(afterReuse.body.error).toBe("no_session");
  });

  test("an access token presented as a refresh token is rejected", async () => {
    const token = await tokenFor(ACCOUNTS.patient);
    const { status, body } = await post("/api/v1/auth/refresh", { refresh: token });
    expect(status).toBe(401);
    expect(body.error).toBe("no_session");
  });

  test("a missing refresh token returns 401 no_session", async () => {
    const { status, body } = await post("/api/v1/auth/refresh", {});
    expect(status).toBe(401);
    expect(body.error).toBe("no_session");
  });
});

describe("auth: logout", () => {
  test("logout is idempotent with no body", async () => {
    const { status, body } = await post("/api/v1/auth/logout", {});
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
  });

  test("logout revokes the family so the refresh token can no longer rotate", async () => {
    const { refresh } = await login(ACCOUNTS.patient);
    const out = await post("/api/v1/auth/logout", { refresh });
    expect(out.status).toBe(200);

    const after = await post("/api/v1/auth/refresh", { refresh });
    expect(after.status).toBe(401);
    expect(after.body.error).toBe("no_session");
  });
});

describe("auth: me", () => {
  test("requires authentication", async () => {
    const { status, body } = await get("/api/v1/auth/me");
    expect(status).toBe(401);
    expect(body.error).toBe("no_session");
  });
});
