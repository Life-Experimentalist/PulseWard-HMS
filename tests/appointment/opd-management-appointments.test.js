const express = require("express");
const routes = require("../../services/appointment-service/routes");

describe("appointment-service OPD management and appointment entry semantics", () => {
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

  test("creates appointment when actor role is allowed", async () => {
    const response = await requestJson("/api/v1/appointments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        actorRole: "frontdesk",
        tenantKey: "m32-opd-allow",
        patientId: "pat-1001",
        clinicianId: "cln-42",
        appointmentDate: "2026-04-02T09:00:00Z",
        status: "scheduled",
      }),
    });

    expect(response.status).toBe(201);
    expect(response.body.id).toBeTruthy();
    expect(response.body.createdByRole).toBe("frontdesk");
    expect(response.body.tenantKey).toBe("m32-opd-allow");
  });

  test("blocks appointment update when actor role is not allowed", async () => {
    const createResponse = await requestJson("/api/v1/appointments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        actorRole: "frontdesk",
        tenantKey: "m32-opd-block",
        patientId: "pat-2001",
        clinicianId: "cln-84",
        appointmentDate: "2026-04-02T10:00:00Z",
      }),
    });

    expect(createResponse.status).toBe(201);

    const updateResponse = await requestJson(`/api/v1/appointments/${createResponse.body.id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        actorRole: "patient",
        appointmentDate: "2026-04-02T10:30:00Z",
      }),
    });

    expect(updateResponse.status).toBe(403);
    expect(updateResponse.body.code).toBe("APPOINTMENT_ENTRY_ROLE_BLOCKED");
    expect(updateResponse.body.details.action).toBe("appointment.update");
  });

  test("creates OPD intake entry with appointment draft handoff", async () => {
    const response = await requestJson("/api/v1/opd/entries", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        actorRole: "frontdesk",
        tenantKey: "m32-opd-intake",
        patientId: "pat-3001",
        clinicianId: "cln-12",
        visitReason: "post-discharge follow-up",
        triageLevel: "high",
        visitType: "follow-up",
        requestedDateTime: "2026-04-02T11:00:00Z",
        createAppointment: true,
      }),
    });

    expect(response.status).toBe(201);
    expect(response.body.opdEntry.id).toBeTruthy();
    expect(response.body.opdEntry.status).toBe("intake-recorded");
    expect(response.body.appointmentDraft).toBeTruthy();
    expect(response.body.appointmentDraft.status).toBe("pending-triage");
    expect(response.body.appointmentDraft.source).toBe("opd");
    expect(response.body.appointmentDraft.opdEntryId).toBe(response.body.opdEntry.id);
  });

  test("filters OPD entries by tenant and triage level", async () => {
    await requestJson("/api/v1/opd/entries", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        actorRole: "nurse",
        tenantKey: "m32-opd-filter",
        patientId: "pat-4001",
        visitReason: "urgent check",
        triageLevel: "critical",
        requestedDateTime: "2026-04-02T12:00:00Z",
      }),
    });

    await requestJson("/api/v1/opd/entries", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        actorRole: "frontdesk",
        tenantKey: "m32-opd-filter",
        patientId: "pat-4002",
        visitReason: "routine review",
        triageLevel: "low",
        requestedDateTime: "2026-04-02T13:00:00Z",
      }),
    });

    const response = await requestJson(
      "/api/v1/opd/entries?tenantKey=m32-opd-filter&triageLevel=critical&limit=20",
      {
        method: "GET",
      }
    );

    expect(response.status).toBe(200);
    expect(response.body.total).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(response.body.entries)).toBe(true);
    expect(response.body.entries.every((entry) => entry.tenantKey === "m32-opd-filter")).toBe(true);
    expect(response.body.entries.every((entry) => entry.triageLevel === "critical")).toBe(true);
  });
});
