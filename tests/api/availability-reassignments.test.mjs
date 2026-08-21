import { get, post, del, login, tokenFor, ACCOUNTS } from "./_helpers.mjs";

// Fixed far-future window so nothing collides with seeded appointments.
const T0 = Math.floor(Date.now() / 1000) + 90 * 86400;
const T1 = T0 + 10 * 86400;

let adminToken;
let patientToken, patientId;
let sharmaToken, sharmaEid;
let mehtaToken, mehtaEid;
let apptA; // booked before the block, sits inside it
let blockId;

beforeAll(async () => {
  adminToken = await tokenFor(ACCOUNTS.admin);
  const p = await login(ACCOUNTS.patient);
  patientToken = p.token;
  patientId = p.user.linkedEntityId;
  const s = await login(ACCOUNTS.drSharma);
  sharmaToken = s.token;
  sharmaEid = s.user.linkedEntityId;
  const m = await login(ACCOUNTS.drMehta);
  mehtaToken = m.token;
  mehtaEid = m.user.linkedEntityId;
});

describe("availability blocks", () => {
  test("a patient books an appointment before any block exists", async () => {
    const { status, body } = await post(
      "/api/v1/appointments",
      { patientId, clinicianId: sharmaEid, startsAt: T0 + 3600, reason: "check-up" },
      { token: patientToken }
    );
    expect(status).toBe(201);
    apptA = body.appointment;
  });

  test("a clinician blocks their own calendar and sees affected appointments", async () => {
    const { status, body } = await post(
      "/api/v1/availability",
      { startsAt: T0, endsAt: T0 + 7200, kind: "training", reason: "CPR refresher" },
      { token: sharmaToken }
    );
    expect(status).toBe(201);
    expect(body.block.kind).toBe("training");
    expect(body.block.clinicianId).toBe(sharmaEid);
    expect(body.affectedAppointments.map((a) => a.id)).toContain(apptA.id);
    blockId = body.block.id;
  });

  test("invalid block windows are rejected", async () => {
    const backwards = await post(
      "/api/v1/availability",
      { startsAt: T0 + 100, endsAt: T0 },
      { token: sharmaToken }
    );
    expect(backwards.status).toBe(400);
    expect(backwards.body.error).toBe("validation_failed");

    const tooLong = await post(
      "/api/v1/availability",
      { startsAt: T0, endsAt: T0 + 31 * 86400 },
      { token: sharmaToken }
    );
    expect(tooLong.status).toBe(400);
  });

  test("a clinician cannot block another clinician's calendar", async () => {
    const { status, body } = await post(
      "/api/v1/availability",
      { clinicianId: mehtaEid, startsAt: T0, endsAt: T0 + 3600 },
      { token: sharmaToken }
    );
    expect(status).toBe(403);
    expect(body.error).toBe("forbidden");
  });

  test("booking inside a blocked window is refused", async () => {
    const { status, body } = await post(
      "/api/v1/appointments",
      { patientId, clinicianId: sharmaEid, startsAt: T0 },
      { token: patientToken }
    );
    expect(status).toBe(409);
    expect(body.error).toBe("clinician_unavailable");
  });

  test("patients see a sanitized availability view (times only)", async () => {
    const { status, body } = await get(`/api/v1/availability?clinicianId=${sharmaEid}`, {
      token: patientToken,
    });
    expect(status).toBe(200);
    const mine = body.blocks.find((b) => b.id === blockId);
    expect(mine).toBeTruthy();
    expect(mine.startsAt).toBe(T0);
    expect(mine.kind).toBeUndefined();
    expect(mine.reason).toBeUndefined();
  });
});

describe("booking guards: stacking and double-booking", () => {
  test("the same patient cannot stack appointments within 30 minutes", async () => {
    const first = await post(
      "/api/v1/appointments",
      { patientId, clinicianId: mehtaEid, startsAt: T1 },
      { token: patientToken }
    );
    expect(first.status).toBe(201);

    const stacked = await post(
      "/api/v1/appointments",
      { patientId, clinicianId: sharmaEid, startsAt: T1 + 1800 },
      { token: patientToken }
    );
    expect(stacked.status).toBe(422);
    expect(stacked.body.error).toBe("patient_stacking");
  });

  test("a second patient cannot take an occupied slot", async () => {
    const created = await post(
      "/api/v1/patients",
      { name: "Second Patient", phone: "+919876500000" },
      { token: adminToken }
    );
    expect(created.status).toBe(201);
    const p2 = created.body.patient.id;

    const { status, body } = await post(
      "/api/v1/appointments",
      { patientId: p2, clinicianId: mehtaEid, startsAt: T1 },
      { token: adminToken }
    );
    expect(status).toBe(409);
    expect(body.error).toBe("slot_taken");
  });
});

describe("reassignment queue lifecycle", () => {
  let queueId;

  test("the owning clinician queues an affected appointment", async () => {
    const { status, body } = await post(
      "/api/v1/reassignments",
      { appointmentId: apptA.id, blockId, reason: "training block" },
      { token: sharmaToken }
    );
    expect(status).toBe(201);
    expect(body.item.status).toBe("open");
    expect(body.item.appointmentId).toBe(apptA.id);
    queueId = body.item.id;
  });

  test("the same appointment cannot be queued twice", async () => {
    const { status, body } = await post(
      "/api/v1/reassignments",
      { appointmentId: apptA.id },
      { token: sharmaToken }
    );
    expect(status).toBe(409);
    expect(body.error).toBe("conflict");
  });

  test("clinicians cannot resolve queue items", async () => {
    const { status } = await post(
      `/api/v1/reassignments/${queueId}/resolve`,
      { action: "reassign", clinicianId: mehtaEid },
      { token: sharmaToken }
    );
    expect(status).toBe(403);
  });

  test("an admin reassigns the appointment to another clinician", async () => {
    const { status, body } = await post(
      `/api/v1/reassignments/${queueId}/resolve`,
      { action: "reassign", clinicianId: mehtaEid },
      { token: adminToken }
    );
    expect(status).toBe(200);
    expect(body.item.status).toBe("resolved");
    expect(body.item.resolution.action).toBe("reassign");
    expect(body.item.clinicianId).toBe(mehtaEid);
  });

  test("a resolved item cannot be resolved again", async () => {
    const { status, body } = await post(
      `/api/v1/reassignments/${queueId}/resolve`,
      { action: "cancel" },
      { token: adminToken }
    );
    expect(status).toBe(409);
    expect(body.error).toBe("conflict");
  });

  test("resolve can reschedule an appointment to a free slot", async () => {
    const booked = await post(
      "/api/v1/appointments",
      { patientId, clinicianId: sharmaEid, startsAt: T1 + 86400 },
      { token: patientToken }
    );
    expect(booked.status).toBe(201);
    const queued = await post(
      "/api/v1/reassignments",
      { appointmentId: booked.body.appointment.id },
      { token: sharmaToken }
    );
    const newTime = T1 + 86400 + 7200;
    const { status, body } = await post(
      `/api/v1/reassignments/${queued.body.item.id}/resolve`,
      { action: "reschedule", startsAt: newTime },
      { token: adminToken }
    );
    expect(status).toBe(200);
    expect(body.item.startsAt).toBe(newTime);
    expect(body.item.resolution.startsAt).toBe(newTime);
  });

  test("resolve can cancel a scheduled appointment", async () => {
    const booked = await post(
      "/api/v1/appointments",
      { patientId, clinicianId: sharmaEid, startsAt: T1 + 3 * 86400 },
      { token: patientToken }
    );
    expect(booked.status).toBe(201);
    const queued = await post(
      "/api/v1/reassignments",
      { appointmentId: booked.body.appointment.id },
      { token: sharmaToken }
    );
    const { status, body } = await post(
      `/api/v1/reassignments/${queued.body.item.id}/resolve`,
      { action: "cancel" },
      { token: adminToken }
    );
    expect(status).toBe(200);
    expect(body.item.apptStatus).toBe("cancelled");
  });
});

describe("removing a block", () => {
  test("only the owning clinician (or admin) can remove a block", async () => {
    const denied = await del(`/api/v1/availability/${blockId}`, { token: mehtaToken });
    expect(denied.status).toBe(403);

    const removed = await del(`/api/v1/availability/${blockId}`, { token: sharmaToken });
    expect(removed.status).toBe(200);

    // The window is bookable again (appt A moved to Dr. Mehta earlier).
    const rebook = await post(
      "/api/v1/appointments",
      { patientId, clinicianId: sharmaEid, startsAt: T0 },
      { token: patientToken }
    );
    expect(rebook.status).toBe(201);
  });
});
