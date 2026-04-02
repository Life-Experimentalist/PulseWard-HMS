const express = require("express");

const appointmentRoutes = require("../../services/appointment-service/routes");

describe("appointment-service route edge coverage", () => {
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
    app.use("/api/v1", appointmentRoutes);

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

  test("validates appointment create/update/cancel error branches", async () => {
    const missingRole = await requestJson("/api/v1/appointments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patientId: "pat-edge-1001",
        appointmentDate: "2026-05-05T09:00:00Z",
      }),
    });

    expect(missingRole.status).toBe(400);
    expect(missingRole.body.code).toBe("APPOINTMENT_ENTRY_ROLE_REQUIRED");

    const invalidPayload = await requestJson("/api/v1/appointments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actorRole: "frontdesk",
        patientId: "pat-edge-1002",
        appointmentDate: "invalid-date",
      }),
    });

    expect(invalidPayload.status).toBe(400);
    expect(invalidPayload.body.code).toBe("APPOINTMENT_PAYLOAD_INVALID");

    const missingClinicianForScheduled = await requestJson("/api/v1/appointments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actorRole: "frontdesk",
        patientId: "pat-edge-1003",
        appointmentDate: "2026-05-05T10:00:00Z",
        status: "scheduled",
      }),
    });

    expect(missingClinicianForScheduled.status).toBe(400);
    expect(missingClinicianForScheduled.body.message).toContain("clinicianId is required");

    const create = await requestJson("/api/v1/appointments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actorRole: "frontdesk",
        tenantKey: "m43-appointment-edge",
        patientId: "pat-edge-1004",
        clinicianId: "cln-edge-1004",
        appointmentDate: "2026-05-05T11:00:00Z",
        status: "scheduled",
      }),
    });

    expect(create.status).toBe(201);

    const invalidExpectedVersion = await requestJson(`/api/v1/appointments/${create.body.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actorRole: "operations",
        expectedVersion: "one",
        status: "checked-in",
      }),
    });

    expect(invalidExpectedVersion.status).toBe(400);
    expect(invalidExpectedVersion.body.code).toBe("APPOINTMENT_PAYLOAD_INVALID");

    const updateNotFound = await requestJson("/api/v1/appointments/apt-not-found", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actorRole: "operations",
        status: "checked-in",
      }),
    });

    expect(updateNotFound.status).toBe(404);

    const missingCancelRole = await requestJson(`/api/v1/appointments/${create.body.id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
    });

    expect(missingCancelRole.status).toBe(400);
    expect(missingCancelRole.body.code).toBe("APPOINTMENT_ENTRY_ROLE_REQUIRED");

    const deleteNotFound = await requestJson("/api/v1/appointments/apt-not-found", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        "x-actor-role": "operations",
      },
    });

    expect(deleteNotFound.status).toBe(404);
  });

  test("enforces cancel transition rules for completed appointments", async () => {
    const created = await requestJson("/api/v1/appointments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actorRole: "frontdesk",
        tenantKey: "m43-appointment-completed",
        patientId: "pat-edge-2001",
        clinicianId: "cln-edge-2001",
        appointmentDate: "2026-05-05T12:00:00Z",
        status: "scheduled",
      }),
    });

    expect(created.status).toBe(201);

    const checkedIn = await requestJson(`/api/v1/appointments/${created.body.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actorRole: "operations",
        expectedVersion: created.body.version,
        status: "checked-in",
      }),
    });
    expect(checkedIn.status).toBe(200);

    const consulting = await requestJson(`/api/v1/appointments/${created.body.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actorRole: "operations",
        expectedVersion: checkedIn.body.version,
        status: "in-consultation",
      }),
    });
    expect(consulting.status).toBe(200);

    const completed = await requestJson(`/api/v1/appointments/${created.body.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actorRole: "operations",
        expectedVersion: consulting.body.version,
        status: "completed",
      }),
    });
    expect(completed.status).toBe(200);

    const cancelCompleted = await requestJson(`/api/v1/appointments/${created.body.id}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        "x-actor-role": "operations",
      },
    });

    expect(cancelCompleted.status).toBe(409);
    expect(cancelCompleted.body.code).toBe("APPOINTMENT_STATUS_TRANSITION_INVALID");
  });

  test("validates OPD payload errors and calendar integration endpoints", async () => {
    const invalidOpd = await requestJson("/api/v1/opd/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actorRole: "frontdesk",
        patientId: "pat-opd-1001",
        visitReason: "Checkup",
        requestedDateTime: "invalid",
      }),
    });

    expect(invalidOpd.status).toBe(400);
    expect(invalidOpd.body.code).toBe("OPD_ENTRY_PAYLOAD_INVALID");

    const providers = await requestJson(
      "/api/v1/integrations/calendars/providers?tenantKey=default",
      {
        method: "GET",
      }
    );

    expect(providers.status).toBe(200);
    expect(Array.isArray(providers.body)).toBe(true);
    expect(providers.body.some((provider) => provider.key === "google-calendar")).toBe(true);

    const testSuccess = await requestJson("/api/v1/integrations/calendars/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenantKey: "default",
        providerKey: "ics-calendar",
        appointmentId: "apt-calendar-test-1",
        clinicianId: "cln-calendar-test-1",
        patientId: "pat-calendar-test-1",
      }),
    });

    expect(testSuccess.status).toBe(200);
    expect(testSuccess.body.accepted).toBe(true);

    const fallbackSuccess = await requestJson("/api/v1/integrations/calendars/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenantKey: "default",
        providerKey: "unknown-provider",
        appointmentId: "apt-calendar-test-2",
      }),
    });

    expect(fallbackSuccess.status).toBe(200);
    expect(fallbackSuccess.body.accepted).toBe(true);
    expect(fallbackSuccess.body.provider).toBe("google-calendar");
  });
});
