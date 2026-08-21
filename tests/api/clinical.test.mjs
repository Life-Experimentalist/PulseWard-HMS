import { get, post, patch, login, tokenFor, ACCOUNTS } from "./_helpers.mjs";

let adminToken;
let patientToken, patientOwnId;
let sharmaToken;
let mehtaToken;

beforeAll(async () => {
  adminToken = await tokenFor(ACCOUNTS.admin);
  const p = await login(ACCOUNTS.patient);
  patientToken = p.token;
  patientOwnId = p.user.linkedEntityId;
  sharmaToken = await tokenFor(ACCOUNTS.drSharma);
  mehtaToken = await tokenFor(ACCOUNTS.drMehta);
});

describe("notes: authoring, signing, and immutability", () => {
  let noteId;

  test("a clinician creates a note for a patient", async () => {
    const { status, body } = await post(
      "/api/v1/notes",
      {
        patientId: patientOwnId,
        type: "soap",
        title: "Follow-up",
        body: { subjective: "stable", plan: "continue" },
      },
      { token: sharmaToken }
    );
    expect(status).toBe(201);
    expect(body.note.signedAt).toBeFalsy();
    noteId = body.note.id;
  });

  test("the author can edit an unsigned note", async () => {
    const { status, body } = await patch(
      `/api/v1/notes/${noteId}`,
      { title: "Follow-up (edited)" },
      { token: sharmaToken }
    );
    expect(status).toBe(200);
    expect(body.note.title).toBe("Follow-up (edited)");
  });

  test("a different clinician cannot edit the note", async () => {
    const { status, body } = await patch(
      `/api/v1/notes/${noteId}`,
      { title: "hijack" },
      { token: mehtaToken }
    );
    expect(status).toBe(403);
    expect(body.error).toBe("forbidden");
  });

  test("signing the note stamps signedAt", async () => {
    const { status, body } = await post(`/api/v1/notes/${noteId}/sign`, {}, { token: sharmaToken });
    expect(status).toBe(200);
    expect(body.note.signedAt).toBeTruthy();
  });

  test("a signed note cannot be signed again", async () => {
    const { status, body } = await post(`/api/v1/notes/${noteId}/sign`, {}, { token: sharmaToken });
    expect(status).toBe(409);
    expect(body.error).toBe("already_signed");
  });

  test("a signed note cannot be edited", async () => {
    const { status, body } = await patch(
      `/api/v1/notes/${noteId}`,
      { title: "nope" },
      { token: sharmaToken }
    );
    expect(status).toBe(409);
    expect(body.error).toBe("already_signed");
  });

  test("a patient cannot author notes", async () => {
    const { status, body } = await post(
      "/api/v1/notes",
      { patientId: patientOwnId, body: {} },
      { token: patientToken }
    );
    expect(status).toBe(403);
    expect(body.error).toBe("forbidden");
  });

  test("an admin with no clinician profile cannot author a note", async () => {
    const { status, body } = await post(
      "/api/v1/notes",
      { patientId: patientOwnId, body: {} },
      { token: adminToken }
    );
    expect(status).toBe(409);
    expect(body.error).toBe("no_clinician_profile");
  });

  test("creating a note without patientId is rejected", async () => {
    const { status, body } = await post("/api/v1/notes", { body: {} }, { token: sharmaToken });
    expect(status).toBe(400);
    expect(body.error).toBe("validation_failed");
  });

  test("a patient can read their own notes", async () => {
    const { status, body } = await get("/api/v1/notes", { token: patientToken });
    expect(status).toBe(200);
    expect(Array.isArray(body.notes)).toBe(true);
  });
});

describe("labs: lifecycle", () => {
  let labId;

  test("a clinician orders a lab (defaults to ordered)", async () => {
    const { status, body } = await post(
      "/api/v1/labs",
      { patientId: patientOwnId, panel: "CBC" },
      { token: sharmaToken }
    );
    expect(status).toBe(201);
    expect(body.lab.status).toBe("ordered");
    labId = body.lab.id;
  });

  test("the order can progress to in-lab and resulted", async () => {
    const a = await patch(`/api/v1/labs/${labId}`, { status: "in-lab" }, { token: sharmaToken });
    expect(a.status).toBe(200);
    const b = await patch(
      `/api/v1/labs/${labId}`,
      {
        status: "resulted",
        results: { WBC: { value: "6.1", unit: "k/uL" } },
      },
      { token: sharmaToken }
    );
    expect(b.status).toBe(200);
    expect(b.body.lab.results.WBC.value).toBe("6.1");
  });

  test("marking reviewed stamps reviewedAt", async () => {
    const { status, body } = await patch(
      `/api/v1/labs/${labId}`,
      { status: "reviewed" },
      { token: sharmaToken }
    );
    expect(status).toBe(200);
    expect(body.lab.reviewedAt).toBeTruthy();
  });

  test("a different clinician cannot modify the order", async () => {
    const { status, body } = await patch(
      `/api/v1/labs/${labId}`,
      { status: "cancelled" },
      { token: mehtaToken }
    );
    expect(status).toBe(403);
    expect(body.error).toBe("forbidden");
  });

  test("ordering a lab without a panel is rejected", async () => {
    const { status, body } = await post(
      "/api/v1/labs",
      { patientId: patientOwnId },
      { token: sharmaToken }
    );
    expect(status).toBe(400);
    expect(body.error).toBe("validation_failed");
  });

  test("a patient reads only their own labs and cannot list all labs", async () => {
    const own = await get("/api/v1/labs", { token: patientToken });
    expect(own.status).toBe(200);
    expect(Array.isArray(own.body.labs)).toBe(true);

    const all = await get("/api/v1/labs/all", { token: patientToken });
    expect(all.status).toBe(403);
  });

  test("a clinician can list all labs they ordered", async () => {
    const { status, body } = await get("/api/v1/labs/all", { token: sharmaToken });
    expect(status).toBe(200);
    expect(Array.isArray(body.labs)).toBe(true);
  });
});

describe("prescriptions: lifecycle", () => {
  let rxId;

  test("a clinician prescribes for a patient", async () => {
    const { status, body } = await post(
      "/api/v1/prescriptions",
      {
        patientId: patientOwnId,
        drug: "Atorvastatin",
        dose: "10mg",
        freq: "OD",
      },
      { token: sharmaToken }
    );
    expect(status).toBe(201);
    expect(body.prescription.status).toBe("active");
    rxId = body.prescription.id;
  });

  test("discontinuing without a reason is rejected", async () => {
    const { status, body } = await patch(
      `/api/v1/prescriptions/${rxId}`,
      { status: "discontinued" },
      { token: sharmaToken }
    );
    expect(status).toBe(400);
    expect(body.error).toBe("validation_failed");
  });

  test("the prescription can be discontinued with a reason", async () => {
    const { status, body } = await patch(
      `/api/v1/prescriptions/${rxId}`,
      { status: "discontinued", reason: "Patient reported myalgia" },
      { token: sharmaToken }
    );
    expect(status).toBe(200);
    expect(body.prescription.status).toBe("discontinued");
    expect(body.prescription.discontinuedReason).toBe("Patient reported myalgia");
  });

  test("a discontinued prescription cannot be dispensed", async () => {
    const { status, body } = await patch(
      `/api/v1/prescriptions/${rxId}`,
      { status: "dispensed" },
      { token: sharmaToken }
    );
    expect(status).toBe(422);
    expect(body.error).toBe("invalid_transition");
  });

  test("prescribing without a drug is rejected", async () => {
    const { status, body } = await post(
      "/api/v1/prescriptions",
      { patientId: patientOwnId },
      { token: sharmaToken }
    );
    expect(status).toBe(400);
    expect(body.error).toBe("validation_failed");
  });

  test("a patient reads their own active prescriptions", async () => {
    const { status, body } = await get("/api/v1/prescriptions?active=true", {
      token: patientToken,
    });
    expect(status).toBe(200);
    for (const rx of body.prescriptions) expect(rx.status).toBe("active");
  });
});
