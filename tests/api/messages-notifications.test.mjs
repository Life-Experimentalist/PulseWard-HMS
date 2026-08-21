import { get, post, login, tokenFor, ACCOUNTS } from "./_helpers.mjs";

let patientToken, patientOwnId;
let sharmaToken, sharmaEntityId; // clinician1
let mehtaToken;

beforeAll(async () => {
  const p = await login(ACCOUNTS.patient);
  patientToken = p.token;
  patientOwnId = p.user.linkedEntityId;
  const s = await login(ACCOUNTS.drSharma);
  sharmaToken = s.token;
  sharmaEntityId = s.user.linkedEntityId;
  mehtaToken = await tokenFor(ACCOUNTS.drMehta);
});

describe("messages: secure threads", () => {
  let threadId;

  test("a patient starts a thread with a clinician", async () => {
    const { status, body } = await post(
      "/api/v1/messages",
      {
        clinicianId: sharmaEntityId,
        subject: "Symptom question",
        text: "Is dizziness a side effect?",
      },
      { token: patientToken }
    );
    expect(status).toBe(201);
    expect(body.message.thread.length).toBe(1);
    expect(body.message.readByPatient).toBe(true);
    threadId = body.message.id;
  });

  test("replying appends to the thread", async () => {
    const { status, body } = await post(
      "/api/v1/messages",
      {
        threadId,
        text: "Yes it can be, please monitor it.",
      },
      { token: sharmaToken }
    );
    expect(status).toBe(200);
    expect(body.message.thread.length).toBe(2);
    // A clinician reply marks it unread for the patient.
    expect(body.message.readByClinician).toBe(true);
    expect(body.message.readByPatient).toBe(false);
  });

  test("the party clinician sees the thread", async () => {
    const { status, body } = await get(`/api/v1/messages?patientId=${patientOwnId}`, {
      token: sharmaToken,
    });
    expect(status).toBe(200);
    expect(body.messages.some((m) => m.id === threadId)).toBe(true);
  });

  test("a non-party clinician does not see the thread", async () => {
    const { status, body } = await get(`/api/v1/messages?patientId=${patientOwnId}`, {
      token: mehtaToken,
    });
    expect(status).toBe(200);
    expect(body.messages.some((m) => m.id === threadId)).toBe(false);
  });

  test("marking a thread read succeeds for the patient", async () => {
    const { status } = await post(`/api/v1/messages/${threadId}/read`, {}, { token: patientToken });
    expect(status).toBe(200);
  });

  test("an empty message body is rejected", async () => {
    const { status, body } = await post(
      "/api/v1/messages",
      {
        clinicianId: sharmaEntityId,
        text: "   ",
      },
      { token: patientToken }
    );
    expect(status).toBe(400);
    expect(body.error).toBe("validation_failed");
  });

  test("a patient sees their own message list", async () => {
    const { status, body } = await get("/api/v1/messages", { token: patientToken });
    expect(status).toBe(200);
    for (const m of body.messages) expect(m.patientId).toBe(patientOwnId);
  });

  test("a clinician with no patientId gets their whole inbox", async () => {
    const { status, body } = await get("/api/v1/messages", { token: sharmaToken });
    expect(status).toBe(200);
    expect(body.messages.some((m) => m.id === threadId)).toBe(true);
    for (const m of body.messages) expect(m.clinicianId).toBe(sharmaEntityId);

    // The other clinician's inbox stays empty of this thread.
    const other = await get("/api/v1/messages", { token: mehtaToken });
    expect(other.status).toBe(200);
    expect(other.body.messages.some((m) => m.id === threadId)).toBe(false);
  });

  test("an admin without a patientId scope is still refused", async () => {
    const adminToken = await tokenFor(ACCOUNTS.admin);
    const { status, body } = await get("/api/v1/messages", { token: adminToken });
    expect(status).toBe(400);
    expect(body.error).toBe("validation_failed");
  });
});

describe("notifications: user-scoped inbox", () => {
  test("a patient reads their seeded notifications", async () => {
    const { status, body } = await get("/api/v1/notifications", { token: patientToken });
    expect(status).toBe(200);
    expect(Array.isArray(body.notifications)).toBe(true);
    expect(body.notifications.length).toBeGreaterThan(0);
  });

  test("a single notification can be marked read", async () => {
    const list = await get("/api/v1/notifications", { token: patientToken });
    const id = list.body.notifications[0].id;
    const { status } = await post(`/api/v1/notifications/${id}/read`, {}, { token: patientToken });
    expect(status).toBe(200);
  });

  test("read-all marks the whole inbox read", async () => {
    const { status } = await post("/api/v1/notifications/read-all", {}, { token: patientToken });
    expect(status).toBe(200);
    const after = await get("/api/v1/notifications", { token: patientToken });
    for (const n of after.body.notifications) expect(n.readAt).toBeTruthy();
  });

  test("the inbox requires authentication", async () => {
    const { status, body } = await get("/api/v1/notifications");
    expect(status).toBe(401);
    expect(body.error).toBe("no_session");
  });
});
