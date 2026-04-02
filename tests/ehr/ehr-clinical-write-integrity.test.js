const express = require("express");
const routes = require("../../services/ehr-service/routes");

describe("ehr-service clinical write integrity", () => {
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
    app.use("/ehr", routes);

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

  test("creates record and seeds timeline version", async () => {
    const createResponse = await requestJson("/ehr/records", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        actorRole: "doctor",
        tenantKey: "citycare-hospital",
        patientId: "pat-1001",
        clinicianId: "cln-1001",
        encounterType: "opd",
        encounterAt: "2026-04-02T09:00:00Z",
        clinicalSummary: "Initial consultation for fever",
      }),
    });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.id).toBeTruthy();
    expect(createResponse.body.version).toBe(1);

    const timelineResponse = await requestJson(
      `/ehr/records/${createResponse.body.id}/timeline`,
      {
        method: "GET",
      }
    );

    expect(timelineResponse.status).toBe(200);
    expect(timelineResponse.body.totalEvents).toBe(1);
    expect(timelineResponse.body.events[0].eventType).toBe("ehr.record.created");
    expect(timelineResponse.body.events[0].sequence).toBe(1);
  });

  test("enforces optimistic version conflict on updates", async () => {
    const createResponse = await requestJson("/ehr/records", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        actorRole: "doctor",
        tenantKey: "citycare-hospital",
        patientId: "pat-1002",
        clinicianId: "cln-1002",
        encounterType: "opd",
        encounterAt: "2026-04-02T10:00:00Z",
        clinicalSummary: "Migraine and dizziness",
      }),
    });

    expect(createResponse.status).toBe(201);

    const updateOkResponse = await requestJson(`/ehr/records/${createResponse.body.id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        actorRole: "doctor",
        expectedVersion: 1,
        diagnosis: "Migraine",
      }),
    });

    expect(updateOkResponse.status).toBe(200);
    expect(updateOkResponse.body.version).toBe(2);

    const updateConflictResponse = await requestJson(`/ehr/records/${createResponse.body.id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        actorRole: "doctor",
        expectedVersion: 1,
        notes: "Conflicting write",
      }),
    });

    expect(updateConflictResponse.status).toBe(409);
    expect(updateConflictResponse.body.code).toBe("EHR_RECORD_VERSION_CONFLICT");
    expect(updateConflictResponse.body.details.currentVersion).toBe(2);
  });

  test("preserves timeline history across update and delete", async () => {
    const createResponse = await requestJson("/ehr/records", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        actorRole: "doctor",
        tenantKey: "citycare-hospital",
        patientId: "pat-1003",
        clinicianId: "cln-1003",
        encounterType: "opd",
        encounterAt: "2026-04-02T11:00:00Z",
        clinicalSummary: "Annual checkup",
      }),
    });

    expect(createResponse.status).toBe(201);

    const updateResponse = await requestJson(`/ehr/records/${createResponse.body.id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        actorRole: "nurse",
        expectedVersion: 1,
        notes: "Vitals stable",
      }),
    });

    expect(updateResponse.status).toBe(200);

    const deleteResponse = await requestJson(`/ehr/records/${createResponse.body.id}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        actorRole: "admin",
      }),
    });

    expect(deleteResponse.status).toBe(204);

    const getDeletedResponse = await requestJson(`/ehr/records/${createResponse.body.id}`, {
      method: "GET",
    });

    expect(getDeletedResponse.status).toBe(404);
    expect(getDeletedResponse.body.code).toBe("EHR_RECORD_DELETED");

    const timelineResponse = await requestJson(`/ehr/records/${createResponse.body.id}/timeline`, {
      method: "GET",
    });

    expect(timelineResponse.status).toBe(200);
    expect(timelineResponse.body.totalEvents).toBe(3);
    expect(timelineResponse.body.events.map((event) => event.eventType)).toEqual([
      "ehr.record.created",
      "ehr.record.updated",
      "ehr.record.deleted",
    ]);
  });
});
