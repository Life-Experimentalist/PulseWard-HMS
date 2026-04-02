const express = require("express");
const routes = require("../../services/appointment-service/routes");

describe("appointment-service lifecycle and conflict reliability", () => {
  let server;
  let baseUrl;

  async function requestJson(relativePath, options) {
    const response = await fetch(`${baseUrl}${relativePath}`, options);
    const body = await response.json().catch(() => ({}));
    return { status: response.status, body };
  }

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/v1", routes);

    server = await new Promise((resolve) => {
      const next = app.listen(0, () => resolve(next));
    });

    const address = server.address();
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  test("blocks overlapping appointments for same clinician and tenant", async () => {
    const first = await requestJson("/api/v1/appointments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        actorRole: "frontdesk",
        tenantKey: "m41-conflict",
        patientId: "pat-1001",
        clinicianId: "cln-1001",
        appointmentDate: "2026-04-02T09:00:00Z",
        durationMinutes: 30,
        status: "scheduled",
      }),
    });

    expect(first.status).toBe(201);

    const conflicting = await requestJson("/api/v1/appointments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        actorRole: "frontdesk",
        tenantKey: "m41-conflict",
        patientId: "pat-1002",
        clinicianId: "cln-1001",
        appointmentDate: "2026-04-02T09:15:00Z",
        durationMinutes: 30,
        status: "scheduled",
      }),
    });

    expect(conflicting.status).toBe(409);
    expect(conflicting.body.code).toBe("APPOINTMENT_SLOT_CONFLICT");
    expect(conflicting.body.details.conflictingAppointmentId).toBe(first.body.id);
  });

  test("enforces status transition matrix and optimistic version checks", async () => {
    const created = await requestJson("/api/v1/appointments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        actorRole: "frontdesk",
        tenantKey: "m41-transition",
        patientId: "pat-2001",
        clinicianId: "cln-2001",
        appointmentDate: "2026-04-02T10:00:00Z",
        durationMinutes: 30,
        status: "scheduled",
      }),
    });

    expect(created.status).toBe(201);
    expect(created.body.version).toBe(1);

    const invalidTransition = await requestJson(`/api/v1/appointments/${created.body.id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        actorRole: "operations",
        expectedVersion: 1,
        status: "completed",
      }),
    });

    expect(invalidTransition.status).toBe(409);
    expect(invalidTransition.body.code).toBe("APPOINTMENT_STATUS_TRANSITION_INVALID");

    const checkedIn = await requestJson(`/api/v1/appointments/${created.body.id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        actorRole: "operations",
        expectedVersion: 1,
        status: "checked-in",
      }),
    });

    expect(checkedIn.status).toBe(200);
    expect(checkedIn.body.status).toBe("checked-in");
    expect(checkedIn.body.version).toBe(2);

    const staleVersion = await requestJson(`/api/v1/appointments/${created.body.id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        actorRole: "operations",
        expectedVersion: 1,
        status: "in-consultation",
      }),
    });

    expect(staleVersion.status).toBe(409);
    expect(staleVersion.body.code).toBe("APPOINTMENT_VERSION_CONFLICT");

    const consultation = await requestJson(`/api/v1/appointments/${created.body.id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        actorRole: "operations",
        expectedVersion: 2,
        status: "in-consultation",
      }),
    });

    expect(consultation.status).toBe(200);
    expect(consultation.body.status).toBe("in-consultation");
    expect(consultation.body.version).toBe(3);

    const completed = await requestJson(`/api/v1/appointments/${created.body.id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        actorRole: "operations",
        expectedVersion: 3,
        status: "completed",
      }),
    });

    expect(completed.status).toBe(200);
    expect(completed.body.status).toBe("completed");
    expect(completed.body.version).toBe(4);
    expect(Array.isArray(completed.body.statusHistory)).toBe(true);
    expect(completed.body.statusHistory.length).toBeGreaterThanOrEqual(4);
  });

  test("returns existing appointment for idempotent create retries", async () => {
    const first = await requestJson("/api/v1/appointments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        actorRole: "frontdesk",
        tenantKey: "m41-idempotent",
        patientId: "pat-3001",
        clinicianId: "cln-3001",
        appointmentDate: "2026-04-02T12:00:00Z",
        status: "scheduled",
        clientRequestId: "req-3001",
      }),
    });

    expect(first.status).toBe(201);

    const replay = await requestJson("/api/v1/appointments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        actorRole: "frontdesk",
        tenantKey: "m41-idempotent",
        patientId: "pat-3001",
        clinicianId: "cln-3001",
        appointmentDate: "2026-04-02T12:00:00Z",
        status: "scheduled",
        clientRequestId: "req-3001",
      }),
    });

    expect(replay.status).toBe(200);
    expect(replay.body.id).toBe(first.body.id);
    expect(replay.body.idempotentReplay).toBe(true);
  });
});
