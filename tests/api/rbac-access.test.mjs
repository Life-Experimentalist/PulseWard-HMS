import { get, patch, login, tokenFor, ACCOUNTS } from "./_helpers.mjs";

// Cross-patient access control. The seeded `patient@pulseward.com` account is
// linked to patient1 (Riya Patel). Another patient — patient2 (Vikram Singh) —
// exists in the same tenant. A logged-in patient must never reach patient2's
// records through any resource endpoint.

let patientToken;
let ownId; // patient1 (the logged-in patient's own linked entity)
let otherId; // patient2

beforeAll(async () => {
  const auth = await login(ACCOUNTS.patient);
  patientToken = auth.token;
  ownId = auth.user.linkedEntityId;

  const adminToken = await tokenFor(ACCOUNTS.admin);
  const list = await get("/api/v1/patients?q=Vikram", { token: adminToken });
  otherId = list.body.patients[0].id;
  expect(otherId).toBeTruthy();
  expect(otherId).not.toBe(ownId);
});

describe("rbac: a patient can reach their own record", () => {
  test("GET /patients/:ownId succeeds", async () => {
    const { status, body } = await get(`/api/v1/patients/${ownId}`, { token: patientToken });
    expect(status).toBe(200);
    expect(body.patient.id).toBe(ownId);
  });
});

describe("rbac: a patient cannot reach another patient (Vuln 3 — broken access control)", () => {
  test("GET /patients/:otherId is forbidden", async () => {
    const { status, body } = await get(`/api/v1/patients/${otherId}`, { token: patientToken });
    expect(status).toBe(403);
    expect(body.error).toBe("forbidden");
  });

  test("GET /notes?patientId=:otherId is forbidden", async () => {
    const { status, body } = await get(`/api/v1/notes?patientId=${otherId}`, {
      token: patientToken,
    });
    expect(status).toBe(403);
    expect(body.error).toBe("forbidden");
  });

  test("GET /labs?patientId=:otherId is forbidden", async () => {
    const { status, body } = await get(`/api/v1/labs?patientId=${otherId}`, {
      token: patientToken,
    });
    expect(status).toBe(403);
    expect(body.error).toBe("forbidden");
  });

  test("GET /prescriptions?patientId=:otherId is forbidden", async () => {
    const { status, body } = await get(`/api/v1/prescriptions?patientId=${otherId}`, {
      token: patientToken,
    });
    expect(status).toBe(403);
    expect(body.error).toBe("forbidden");
  });

  test("GET /messages?patientId=:otherId is forbidden", async () => {
    const { status, body } = await get(`/api/v1/messages?patientId=${otherId}`, {
      token: patientToken,
    });
    expect(status).toBe(403);
    expect(body.error).toBe("forbidden");
  });

  test("PATCH /patients/:otherId is forbidden", async () => {
    const { status, body } = await patch(
      `/api/v1/patients/${otherId}`,
      { phone: "+91 00000 00000" },
      { token: patientToken }
    );
    expect(status).toBe(403);
    expect(body.error).toBe("forbidden");
  });
});

describe("rbac: a patient cannot mutate their own clinical data", () => {
  test("PATCH own record with clinical fields is forbidden", async () => {
    const { status, body } = await patch(
      `/api/v1/patients/${ownId}`,
      {
        allergiesJson: [{ substance: "None", severity: "mild" }],
      },
      { token: patientToken }
    );
    expect(status).toBe(403);
    expect(body.error).toBe("forbidden");
  });

  test("PATCH own record with a demographic field succeeds", async () => {
    const { status, body } = await patch(
      `/api/v1/patients/${ownId}`,
      {
        phone: "+91 99999 11111",
      },
      { token: patientToken }
    );
    expect(status).toBe(200);
    expect(body.patient.phone).toBe("+91 99999 11111");
  });
});

describe("rbac: patient is denied administrative and cross-patient list endpoints", () => {
  test("GET /patients (roster) is forbidden for a patient", async () => {
    const { status, body } = await get("/api/v1/patients", { token: patientToken });
    expect(status).toBe(403);
    expect(body.error).toBe("forbidden");
  });

  test("GET /labs/all (all-patient PHI) is forbidden for a patient", async () => {
    const { status, body } = await get("/api/v1/labs/all", { token: patientToken });
    expect(status).toBe(403);
    expect(body.error).toBe("forbidden");
  });

  test("GET /admin/stats is forbidden for a patient", async () => {
    const { status, body } = await get("/api/v1/admin/stats", { token: patientToken });
    expect(status).toBe(403);
    expect(body.error).toBe("forbidden");
  });
});

describe("rbac: unauthenticated requests are rejected before any data access", () => {
  test("GET /patients without a token returns 401", async () => {
    const { status, body } = await get("/api/v1/patients");
    expect(status).toBe(401);
    expect(body.error).toBe("no_session");
  });
});
