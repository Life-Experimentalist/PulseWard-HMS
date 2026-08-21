import { get, post, patch, del, tokenFor, ACCOUNTS } from "./_helpers.mjs";

let patientToken;
let sharmaToken;

beforeAll(async () => {
  patientToken = await tokenFor(ACCOUNTS.patient);
  sharmaToken = await tokenFor(ACCOUNTS.drSharma);
});

afterAll(() => {
  delete process.env.LOGIN_RATE_MAX;
  delete process.env.SIGNUP_RATE_MAX;
});

describe("personal tasks", () => {
  let taskId;

  test("a user creates a task (quadrant defaults to do)", async () => {
    const { status, body } = await post(
      "/api/v1/tasks",
      { title: "Refill prescriptions" },
      { token: patientToken }
    );
    expect(status).toBe(201);
    expect(body.task.quadrant).toBe("do");
    expect(body.task.done).toBe(false);
    taskId = body.task.id;
  });

  test("invalid task input is rejected", async () => {
    const empty = await post("/api/v1/tasks", { title: "   " }, { token: patientToken });
    expect(empty.status).toBe(400);

    const badQuadrant = await post(
      "/api/v1/tasks",
      { title: "ok", quadrant: "someday" },
      { token: patientToken }
    );
    expect(badQuadrant.status).toBe(400);
  });

  test("the owner can update and complete the task", async () => {
    const { status, body } = await patch(
      `/api/v1/tasks/${taskId}`,
      { done: true, quadrant: "schedule" },
      { token: patientToken }
    );
    expect(status).toBe(200);
    expect(body.task.done).toBe(true);
    expect(body.task.quadrant).toBe("schedule");
  });

  test("tasks are private to their owner", async () => {
    const list = await get("/api/v1/tasks", { token: sharmaToken });
    expect(list.status).toBe(200);
    expect(list.body.tasks.map((t) => t.id)).not.toContain(taskId);

    const foreignPatch = await patch(
      `/api/v1/tasks/${taskId}`,
      { done: false },
      { token: sharmaToken }
    );
    expect(foreignPatch.status).toBe(404);

    const foreignDelete = await del(`/api/v1/tasks/${taskId}`, { token: sharmaToken });
    expect(foreignDelete.status).toBe(404);
  });

  test("the owner deletes the task; deleting again 404s", async () => {
    const removed = await del(`/api/v1/tasks/${taskId}`, { token: patientToken });
    expect(removed.status).toBe(200);

    const again = await del(`/api/v1/tasks/${taskId}`, { token: patientToken });
    expect(again.status).toBe(404);
  });
});

describe("login rate limiting", () => {
  test("repeated failures from one IP hit the limit; other IPs are unaffected", async () => {
    process.env.LOGIN_RATE_MAX = "3";
    const attempt = (ip) =>
      post(
        "/api/v1/auth/login",
        { email: ACCOUNTS.patient.email, password: "WrongPass@0" },
        { headers: { "x-forwarded-for": ip } }
      );

    for (let i = 0; i < 3; i++) {
      const { status } = await attempt("10.9.9.9");
      expect(status).toBe(401);
    }

    const blocked = await attempt("10.9.9.9");
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toBe("rate_limited");

    // Correct credentials are also blocked from the throttled IP.
    const evenValid = await post(
      "/api/v1/auth/login",
      { email: ACCOUNTS.patient.email, password: ACCOUNTS.patient.password },
      { headers: { "x-forwarded-for": "10.9.9.9" } }
    );
    expect(evenValid.status).toBe(429);

    // A different source IP still gets through.
    const otherIp = await attempt("10.9.9.10");
    expect(otherIp.status).toBe(401);

    delete process.env.LOGIN_RATE_MAX;
  });
});

describe("signup rate limiting", () => {
  test("signups from one IP are throttled independently of logins", async () => {
    process.env.SIGNUP_RATE_MAX = "2";
    const signup = (n) =>
      post(
        "/api/v1/auth/signup",
        {
          name: `Rate Tester ${n}`,
          email: `rate.${Date.now()}.${n}@example.com`,
          password: "SignPass@1",
        },
        { headers: { "x-forwarded-for": "10.8.8.8" } }
      );

    const first = await signup(1);
    expect(first.status).not.toBe(429);
    const second = await signup(2);
    expect(second.status).not.toBe(429);

    const third = await signup(3);
    expect(third.status).toBe(429);
    expect(third.body.error).toBe("rate_limited");

    delete process.env.SIGNUP_RATE_MAX;
  });
});
