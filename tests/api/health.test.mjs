import { get, login, ACCOUNTS } from "./_helpers.mjs";

describe("health + bootstrap", () => {
  test("GET /health is public and reports version 1.0.0", async () => {
    const { status, body } = await get("/health");
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.service).toBe("api-gateway");
    expect(body.version).toBe("1.0.0");
  });

  test("seeded demo accounts can all log in", async () => {
    for (const acct of Object.values(ACCOUNTS)) {
      const auth = await login(acct);
      expect(auth.token).toBeTruthy();
      expect(auth.refresh).toBeTruthy();
      expect(auth.user.email).toBe(acct.email);
    }
  });

  test("unknown route returns a structured 404", async () => {
    const { status, body } = await get("/api/v1/does-not-exist");
    expect(status).toBe(404);
    expect(body.ok).toBe(false);
    expect(body.error).toBe("not_found");
  });
});
