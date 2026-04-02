const express = require("express");

const ehrRoutes = require("../../services/ehr-service/routes");

describe("ehr-service route edge coverage", () => {
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
    app.use("/ehr", ehrRoutes);

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

  test("supports record listing filters and includeDeleted behavior", async () => {
    const first = await requestJson("/ehr/records", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actorRole: "doctor",
        tenantKey: "m43-ehr-tenant-a",
        patientId: "pat-ehr-a",
        encounterAt: "2026-05-04T09:00:00Z",
        clinicalSummary: "Record A",
      }),
    });

    const second = await requestJson("/ehr/records", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actorRole: "doctor",
        tenantKey: "m43-ehr-tenant-b",
        patientId: "pat-ehr-b",
        encounterAt: "2026-05-04T10:00:00Z",
        clinicalSummary: "Record B",
      }),
    });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);

    const filtered = await requestJson(
      "/ehr/records?tenantKey=m43-ehr-tenant-a&patientId=pat-ehr-a",
      {
        method: "GET",
      }
    );

    expect(filtered.status).toBe(200);
    expect(filtered.body.total).toBeGreaterThanOrEqual(1);
    expect(
      filtered.body.records.every(
        (record) => record.tenantKey === "m43-ehr-tenant-a" && record.patientId === "pat-ehr-a"
      )
    ).toBe(true);

    const deleted = await requestJson(`/ehr/records/${first.body.id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actorRole: "admin" }),
    });

    expect(deleted.status).toBe(204);

    const hiddenDeleted = await requestJson(`/ehr/records/${first.body.id}`, {
      method: "GET",
    });
    expect(hiddenDeleted.status).toBe(404);
    expect(hiddenDeleted.body.code).toBe("EHR_RECORD_DELETED");

    const visibleDeleted = await requestJson(`/ehr/records/${first.body.id}?includeDeleted=true`, {
      method: "GET",
    });
    expect(visibleDeleted.status).toBe(200);
    expect(visibleDeleted.body.status).toBe("deleted");

    const listIncludeDeleted = await requestJson(
      "/ehr/records?tenantKey=m43-ehr-tenant-a&includeDeleted=true",
      {
        method: "GET",
      }
    );
    expect(listIncludeDeleted.status).toBe(200);
    expect(listIncludeDeleted.body.records.some((record) => record.id === first.body.id)).toBe(
      true
    );
  });

  test("validates record update and delete error branches", async () => {
    const created = await requestJson("/ehr/records", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actorRole: "doctor",
        tenantKey: "m43-ehr-validate",
        patientId: "pat-ehr-validate",
        encounterAt: "2026-05-04T11:00:00Z",
        clinicalSummary: "Validation record",
      }),
    });

    expect(created.status).toBe(201);

    const badEncounter = await requestJson(`/ehr/records/${created.body.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actorRole: "doctor",
        expectedVersion: 1,
        encounterAt: "bad-date",
      }),
    });

    expect(badEncounter.status).toBe(400);
    expect(badEncounter.body.code).toBe("EHR_RECORD_PAYLOAD_INVALID");

    const emptyPatch = await requestJson(`/ehr/records/${created.body.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actorRole: "doctor",
        expectedVersion: 1,
      }),
    });

    expect(emptyPatch.status).toBe(400);
    expect(emptyPatch.body.code).toBe("EHR_RECORD_PATCH_EMPTY");

    const missingDeleteRole = await requestJson(`/ehr/records/${created.body.id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(missingDeleteRole.status).toBe(400);
    expect(missingDeleteRole.body.code).toBe("EHR_ACTOR_ROLE_REQUIRED");

    const missingRecordDelete = await requestJson("/ehr/records/rec-missing-delete", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actorRole: "admin" }),
    });

    expect(missingRecordDelete.status).toBe(404);
    expect(missingRecordDelete.body.code).toBe("EHR_RECORD_NOT_FOUND");

    const deleted = await requestJson(`/ehr/records/${created.body.id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actorRole: "admin" }),
    });

    expect(deleted.status).toBe(204);

    const updateDeleted = await requestJson(`/ehr/records/${created.body.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actorRole: "doctor",
        expectedVersion: 2,
        notes: "Should fail",
      }),
    });

    expect(updateDeleted.status).toBe(409);
    expect(updateDeleted.body.code).toBe("EHR_RECORD_DELETED");
  });

  test("validates prescription and status endpoint error handling", async () => {
    const createdRecord = await requestJson("/ehr/records", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actorRole: "doctor",
        tenantKey: "m43-ehr-rx",
        patientId: "pat-ehr-rx",
        encounterAt: "2026-05-04T12:00:00Z",
        clinicalSummary: "Prescription validation",
      }),
    });

    expect(createdRecord.status).toBe(201);

    const listMissingRecord = await requestJson("/ehr/records/rec-missing/prescriptions", {
      method: "GET",
    });

    expect(listMissingRecord.status).toBe(404);

    const createMissingFields = await requestJson(
      `/ehr/records/${createdRecord.body.id}/prescriptions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actorRole: "doctor",
          medicationName: "Amoxicillin",
        }),
      }
    );

    expect(createMissingFields.status).toBe(400);
    expect(createMissingFields.body.code).toBe("EHR_PRESCRIPTION_PAYLOAD_INVALID");

    const prescription = await requestJson(`/ehr/records/${createdRecord.body.id}/prescriptions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actorRole: "doctor",
        medicationName: "Azithromycin",
        dosage: "250mg",
        frequency: "once daily",
        durationDays: 3,
      }),
    });

    expect(prescription.status).toBe(201);

    const handoffMissing = await requestJson(
      `/ehr/records/${createdRecord.body.id}/prescriptions/rx-does-not-exist/handoff`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actorRole: "doctor" }),
      }
    );

    expect(handoffMissing.status).toBe(404);
    expect(handoffMissing.body.code).toBe("EHR_PRESCRIPTION_NOT_FOUND");

    const invalidStatus = await requestJson(
      `/ehr/records/${createdRecord.body.id}/prescriptions/${prescription.body.id}/status`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actorRole: "operations", status: "unknown" }),
      }
    );

    expect(invalidStatus.status).toBe(400);
    expect(invalidStatus.body.code).toBe("EHR_PRESCRIPTION_STATUS_INVALID");

    const missingPrescriptionStatus = await requestJson(
      `/ehr/records/${createdRecord.body.id}/prescriptions/rx-does-not-exist/status`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actorRole: "operations", status: "accepted" }),
      }
    );

    expect(missingPrescriptionStatus.status).toBe(404);
    expect(missingPrescriptionStatus.body.code).toBe("EHR_PRESCRIPTION_NOT_FOUND");

    const validStatus = await requestJson(
      `/ehr/records/${createdRecord.body.id}/prescriptions/${prescription.body.id}/status`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actorRole: "operations", status: "accepted" }),
      }
    );

    expect(validStatus.status).toBe(200);
    expect(validStatus.body.status).toBe("accepted");
  });
});
