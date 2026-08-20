import { get, post, patch, login, tokenFor, ACCOUNTS } from "./_helpers.mjs";

const nowS = () => Math.floor(Date.now() / 1000);
const future = (days, extra = 0) => nowS() + 86400 * days + extra;

let adminToken;
let patientToken, patientOwnId;
let sharmaToken, sharmaEntityId; // clinician1
let otherPatientId; // patient2

beforeAll(async () => {
  adminToken = await tokenFor(ACCOUNTS.admin);

  const p = await login(ACCOUNTS.patient);
  patientToken = p.token;
  patientOwnId = p.user.linkedEntityId;

  const s = await login(ACCOUNTS.drSharma);
  sharmaToken = s.token;
  sharmaEntityId = s.user.linkedEntityId;

  const list = await get("/api/v1/patients?q=Vikram", { token: adminToken });
  otherPatientId = list.body.patients[0].id;
});

describe("patients: creation and lookup", () => {
  test("admin creates a patient and receives a formatted MRN", async () => {
    const { status, body } = await post(
      "/api/v1/patients",
      {
        name: "Test Created Patient",
        gender: "M",
        phone: "+91 90000 00001",
      },
      { token: adminToken }
    );
    expect(status).toBe(201);
    expect(body.patient.name).toBe("Test Created Patient");
    expect(body.patient.mrn).toMatch(/^PW-26-\d{5}$/);
  });

  test("creating a patient without a name is rejected", async () => {
    const { status, body } = await post(
      "/api/v1/patients",
      { phone: "123" },
      { token: adminToken }
    );
    expect(status).toBe(400);
    expect(body.error).toBe("validation_failed");
  });

  test("a patient cannot create patient records", async () => {
    const { status, body } = await post(
      "/api/v1/patients",
      { name: "Nope" },
      { token: patientToken }
    );
    expect(status).toBe(403);
    expect(body.error).toBe("forbidden");
  });

  test("admin can search the roster and read a single record", async () => {
    const list = await get("/api/v1/patients?q=Riya", { token: adminToken });
    expect(list.status).toBe(200);
    expect(list.body.patients.length).toBeGreaterThan(0);
    const one = await get(`/api/v1/patients/${list.body.patients[0].id}`, { token: adminToken });
    expect(one.status).toBe(200);
    expect(one.body.patient.name).toContain("Riya");
  });
});

describe("appointments: booking", () => {
  test("a patient can book with a clinician for themselves", async () => {
    const { status, body } = await post(
      "/api/v1/appointments",
      {
        patientId: patientOwnId,
        clinicianId: sharmaEntityId,
        startsAt: future(50, 3600),
        durationMin: 30,
        reason: "Routine review",
      },
      { token: patientToken }
    );
    expect(status).toBe(201);
    expect(body.appointment.status).toBe("scheduled");
    expect(body.appointment.patientId).toBe(patientOwnId);
  });

  test("overlapping the same clinician returns 409 slot_taken", async () => {
    const base = future(52, 3600);
    const first = await post(
      "/api/v1/appointments",
      {
        patientId: patientOwnId,
        clinicianId: sharmaEntityId,
        startsAt: base,
        durationMin: 30,
      },
      { token: patientToken }
    );
    expect(first.status).toBe(201);

    const overlap = await post(
      "/api/v1/appointments",
      {
        patientId: patientOwnId,
        clinicianId: sharmaEntityId,
        startsAt: base + 600,
        durationMin: 30,
      },
      { token: patientToken }
    );
    expect(overlap.status).toBe(409);
    expect(overlap.body.error).toBe("slot_taken");
  });

  test("a patient cannot book on behalf of another patient", async () => {
    const { status, body } = await post(
      "/api/v1/appointments",
      {
        patientId: otherPatientId,
        clinicianId: sharmaEntityId,
        startsAt: future(53, 3600),
      },
      { token: patientToken }
    );
    expect(status).toBe(403);
    expect(body.error).toBe("forbidden");
  });

  test("booking against an unknown clinician returns 404", async () => {
    const { status, body } = await post(
      "/api/v1/appointments",
      {
        patientId: patientOwnId,
        clinicianId: "no-such-clinician",
        startsAt: future(54, 3600),
      },
      { token: patientToken }
    );
    expect(status).toBe(404);
    expect(body.error).toBe("not_found");
  });

  test("a non-positive startsAt is rejected by validation", async () => {
    const { status, body } = await post(
      "/api/v1/appointments",
      {
        patientId: patientOwnId,
        clinicianId: sharmaEntityId,
        startsAt: -1,
      },
      { token: patientToken }
    );
    expect(status).toBe(400);
    expect(body.error).toBe("validation_failed");
  });
});

describe("appointments: status state machine", () => {
  test("an invalid transition is rejected with 422", async () => {
    const created = await post(
      "/api/v1/appointments",
      {
        patientId: patientOwnId,
        clinicianId: sharmaEntityId,
        startsAt: future(60, 3600),
        durationMin: 30,
      },
      { token: patientToken }
    );
    const id = created.body.appointment.id;

    const jump = await patch(
      `/api/v1/appointments/${id}`,
      { status: "completed" },
      { token: sharmaToken }
    );
    expect(jump.status).toBe(422);
    expect(jump.body.error).toBe("invalid_transition");
  });

  test("the owning clinician can walk scheduled → checked-in → in-progress → completed", async () => {
    const created = await post(
      "/api/v1/appointments",
      {
        patientId: patientOwnId,
        clinicianId: sharmaEntityId,
        startsAt: future(61, 3600),
        durationMin: 30,
      },
      { token: patientToken }
    );
    const id = created.body.appointment.id;

    const a = await patch(
      `/api/v1/appointments/${id}`,
      { status: "checked-in" },
      { token: sharmaToken }
    );
    expect(a.status).toBe(200);
    expect(a.body.appointment.status).toBe("checked-in");

    const b = await patch(
      `/api/v1/appointments/${id}`,
      { status: "in-progress" },
      { token: sharmaToken }
    );
    expect(b.status).toBe(200);

    const d = await patch(
      `/api/v1/appointments/${id}`,
      { status: "completed" },
      { token: sharmaToken }
    );
    expect(d.status).toBe(200);
    expect(d.body.appointment.status).toBe("completed");
  });

  test("a patient may cancel but not otherwise change status", async () => {
    const created = await post(
      "/api/v1/appointments",
      {
        patientId: patientOwnId,
        clinicianId: sharmaEntityId,
        startsAt: future(62, 3600),
        durationMin: 30,
      },
      { token: patientToken }
    );
    const id = created.body.appointment.id;

    const bad = await patch(
      `/api/v1/appointments/${id}`,
      { status: "checked-in" },
      { token: patientToken }
    );
    expect(bad.status).toBe(403);
    expect(bad.body.error).toBe("forbidden");

    const cancel = await patch(
      `/api/v1/appointments/${id}`,
      { status: "cancelled" },
      { token: patientToken }
    );
    expect(cancel.status).toBe(200);
    expect(cancel.body.appointment.status).toBe("cancelled");
  });
});

describe("appointments: listing is role-scoped", () => {
  test("a patient only sees their own appointments", async () => {
    const { status, body } = await get("/api/v1/appointments", { token: patientToken });
    expect(status).toBe(200);
    expect(Array.isArray(body.appointments)).toBe(true);
    for (const a of body.appointments) expect(a.patientId).toBe(patientOwnId);
  });

  test("a clinician only sees their own appointments", async () => {
    const { status, body } = await get("/api/v1/appointments", { token: sharmaToken });
    expect(status).toBe(200);
    for (const a of body.appointments) expect(a.clinicianId).toBe(sharmaEntityId);
  });
});
