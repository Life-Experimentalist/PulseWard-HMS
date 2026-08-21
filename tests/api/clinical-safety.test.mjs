import { post, patch, login, tokenFor, ACCOUNTS } from "./_helpers.mjs";

let adminToken;
let sharmaToken;
let patientToken, patientOwnId;
let annieId; // patient with a documented severe penicillin allergy

beforeAll(async () => {
  adminToken = await tokenFor(ACCOUNTS.admin);
  sharmaToken = await tokenFor(ACCOUNTS.drSharma);
  const p = await login(ACCOUNTS.patient);
  patientToken = p.token;
  patientOwnId = p.user.linkedEntityId;

  const created = await post(
    "/api/v1/patients",
    { name: "Allergy Annie", phone: "+919876511111" },
    { token: adminToken }
  );
  annieId = created.body.patient.id;
  const flagged = await patch(
    `/api/v1/patients/${annieId}`,
    {
      allergiesJson: [
        { substance: "Penicillin", severity: "life-threatening", reaction: "anaphylaxis" },
      ],
    },
    { token: sharmaToken }
  );
  if (flagged.status !== 200) throw new Error(`allergy setup failed: ${flagged.status}`);
});

describe("patients cannot alter their own clinical data", () => {
  test("a patient editing allergiesJson on their own record is refused", async () => {
    const { status, body } = await patch(
      `/api/v1/patients/${patientOwnId}`,
      { allergiesJson: [] },
      { token: patientToken }
    );
    expect(status).toBe(403);
    expect(body.error).toBe("forbidden");
  });
});

describe("vitals recording", () => {
  test("a clinician records vitals and the series grows", async () => {
    const first = await post(
      `/api/v1/patients/${annieId}/vitals`,
      { bp: "120/80", hr: 72, spo2: 98 },
      { token: sharmaToken }
    );
    expect(first.status).toBe(201);
    expect(first.body.vitals.length).toBe(1);
    expect(first.body.vitals[0].bp).toBe("120/80");
    expect(first.body.vitals[0].by).toBeTruthy();

    const second = await post(
      `/api/v1/patients/${annieId}/vitals`,
      { hr: 76, temp: 37.1 },
      { token: sharmaToken }
    );
    expect(second.status).toBe(201);
    expect(second.body.vitals.length).toBe(2);
  });

  test("an empty vitals payload is rejected", async () => {
    const { status, body } = await post(
      `/api/v1/patients/${annieId}/vitals`,
      {},
      { token: sharmaToken }
    );
    expect(status).toBe(400);
    expect(body.error).toBe("validation_failed");
  });

  test("vitals for an unknown patient 404s, and patients cannot record vitals", async () => {
    const missing = await post("/api/v1/patients/nope/vitals", { hr: 70 }, { token: sharmaToken });
    expect(missing.status).toBe(404);

    const denied = await post(
      `/api/v1/patients/${annieId}/vitals`,
      { hr: 70 },
      { token: patientToken }
    );
    expect(denied.status).toBe(403);
  });
});

describe("prescription drug-safety gate", () => {
  test("prescribing a penicillin-class drug to an allergic patient is blocked", async () => {
    const { status, body } = await post(
      "/api/v1/prescriptions",
      { patientId: annieId, drug: "Amoxicillin", dose: "500mg", freq: "TID" },
      { token: sharmaToken }
    );
    expect(status).toBe(422);
    expect(body.error).toBe("drug_allergy");
    expect(body.warnings.some((w) => w.type === "allergy")).toBe(true);
  });

  test("a blank overrideReason does not bypass the gate", async () => {
    const { status } = await post(
      "/api/v1/prescriptions",
      { patientId: annieId, drug: "Amoxicillin", overrideReason: "   " },
      { token: sharmaToken }
    );
    expect(status).toBe(422);
  });

  test("a documented override reason allows the prescription and is recorded", async () => {
    const { status, body } = await post(
      "/api/v1/prescriptions",
      {
        patientId: annieId,
        drug: "Amoxicillin",
        dose: "500mg",
        freq: "TID",
        overrideReason: "Desensitization protocol under supervision",
      },
      { token: sharmaToken }
    );
    expect(status).toBe(201);
    expect(body.prescription.overrideReason).toBe("Desensitization protocol under supervision");
  });

  test("known drug interactions with active prescriptions are blocked", async () => {
    const warfarin = await post(
      "/api/v1/prescriptions",
      { patientId: annieId, drug: "Warfarin", dose: "5mg", freq: "OD" },
      { token: sharmaToken }
    );
    expect(warfarin.status).toBe(201);

    const { status, body } = await post(
      "/api/v1/prescriptions",
      { patientId: annieId, drug: "Ibuprofen", dose: "400mg", freq: "PRN" },
      { token: sharmaToken }
    );
    expect(status).toBe(422);
    expect(body.error).toBe("drug_interaction");
    expect(body.warnings.some((w) => w.type === "interaction")).toBe(true);
  });
});

describe("note addenda", () => {
  let noteId;

  test("addenda are refused on unsigned notes", async () => {
    const created = await post(
      "/api/v1/notes",
      { patientId: annieId, type: "soap", title: "Initial consult", body: { plan: "observe" } },
      { token: sharmaToken }
    );
    expect(created.status).toBe(201);
    noteId = created.body.note.id;

    const { status, body } = await post(
      `/api/v1/notes/${noteId}/addendum`,
      { body: { note: "too early" } },
      { token: sharmaToken }
    );
    expect(status).toBe(409);
    expect(body.error).toBe("conflict");
  });

  test("a signed note accepts an addendum chained by hash", async () => {
    const signed = await post(`/api/v1/notes/${noteId}/sign`, {}, { token: sharmaToken });
    expect(signed.status).toBe(200);

    const { status, body } = await post(
      `/api/v1/notes/${noteId}/addendum`,
      { body: { note: "Patient called: symptoms resolved" } },
      { token: sharmaToken }
    );
    expect(status).toBe(201);
    expect(body.note.addendumOf).toBe(noteId);
    expect(body.note.prevHash).toBeTruthy();
    expect(body.note.title).toContain("Addendum");
  });

  test("an admin without a clinician profile cannot add an addendum", async () => {
    const { status, body } = await post(
      `/api/v1/notes/${noteId}/addendum`,
      { body: { note: "nope" } },
      { token: adminToken }
    );
    expect(status).toBe(409);
    expect(body.error).toBe("no_clinician_profile");
  });
});

describe("change-password", () => {
  const email = `pw.rotate.${Date.now()}@pulseward.com`;
  const oldPassword = "InitPass@1";
  const newPassword = "RotatedPass@2";
  let token, refresh;

  beforeAll(async () => {
    const created = await post(
      "/api/v1/admin/users",
      { name: "PW Rotator", email, password: oldPassword, role: "frontdesk" },
      { token: adminToken }
    );
    if (created.status !== 201) throw new Error(`user setup failed: ${created.status}`);
    const auth = await post("/api/v1/auth/login", { email, password: oldPassword });
    token = auth.body.token;
    refresh = auth.body.refresh;
  });

  test("the wrong current password is rejected", async () => {
    const { status, body } = await post(
      "/api/v1/auth/change-password",
      { currentPassword: "WrongPass@9", newPassword },
      { token }
    );
    expect(status).toBe(401);
    expect(body.error).toBe("invalid_credentials");
  });

  test("a too-short new password is rejected", async () => {
    const { status, body } = await post(
      "/api/v1/auth/change-password",
      { currentPassword: oldPassword, newPassword: "short" },
      { token }
    );
    expect(status).toBe(400);
    expect(body.error).toBe("validation_failed");
  });

  test("changing the password revokes existing refresh tokens", async () => {
    const changed = await post(
      "/api/v1/auth/change-password",
      { currentPassword: oldPassword, newPassword },
      { token }
    );
    expect(changed.status).toBe(200);

    // The pre-change refresh token no longer works.
    const replay = await post("/api/v1/auth/refresh", { refresh });
    expect(replay.status).toBe(401);

    // The old password is dead; the new one works.
    const oldLogin = await post("/api/v1/auth/login", { email, password: oldPassword });
    expect(oldLogin.status).toBe(401);
    const newLogin = await post("/api/v1/auth/login", { email, password: newPassword });
    expect(newLogin.status).toBe(200);
  });
});
