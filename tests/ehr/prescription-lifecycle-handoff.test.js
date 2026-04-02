const express = require("express");
const ehrRoutes = require("../../services/ehr-service/routes");
const pharmacyApp = require("../../services/pharmacy-service/src");

describe("ehr-pharmacy prescription lifecycle handoff", () => {
  let ehrServer;
  let pharmacyServer;
  let ehrBaseUrl;
  let pharmacyBaseUrl;

  async function requestJson(baseUrl, relativePath, options) {
    const response = await fetch(`${baseUrl}${relativePath}`, options);
    const body = await response.json().catch(() => ({}));
    return { status: response.status, body };
  }

  beforeAll(async () => {
    const ehrApp = express();
    ehrApp.use(express.json());
    ehrApp.use("/ehr", ehrRoutes);

    ehrServer = await new Promise((resolve) => {
      const next = ehrApp.listen(0, () => resolve(next));
    });

    pharmacyServer = await new Promise((resolve) => {
      const next = pharmacyApp.listen(0, () => resolve(next));
    });

    const ehrAddress = ehrServer.address();
    const pharmacyAddress = pharmacyServer.address();
    ehrBaseUrl = `http://127.0.0.1:${ehrAddress.port}`;
    pharmacyBaseUrl = `http://127.0.0.1:${pharmacyAddress.port}`;
  });

  afterAll(async () => {
    if (ehrServer) {
      await new Promise((resolve) => ehrServer.close(resolve));
    }

    if (pharmacyServer) {
      await new Promise((resolve) => pharmacyServer.close(resolve));
    }
  });

  test("creates prescription in EHR, hands off to pharmacy, and syncs lifecycle statuses", async () => {
    const createRecord = await requestJson(ehrBaseUrl, "/ehr/records", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        actorRole: "doctor",
        tenantKey: "citycare-hospital",
        patientId: "pat-rx-1001",
        clinicianId: "cln-rx-1001",
        encounterType: "opd",
        encounterAt: "2026-04-02T14:00:00Z",
        clinicalSummary: "Prescription consultation",
      }),
    });

    expect(createRecord.status).toBe(201);

    const createPrescription = await requestJson(
      ehrBaseUrl,
      `/ehr/records/${createRecord.body.id}/prescriptions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          actorRole: "doctor",
          medicationName: "Amoxicillin",
          dosage: "500mg",
          frequency: "twice daily",
          durationDays: 5,
          notes: "Take after meals",
        }),
      }
    );

    expect(createPrescription.status).toBe(201);
    expect(createPrescription.body.status).toBe("drafted");

    const handoff = await requestJson(
      ehrBaseUrl,
      `/ehr/records/${createRecord.body.id}/prescriptions/${createPrescription.body.id}/handoff`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          actorRole: "doctor",
          target: "pharmacy-service",
          referenceId: "handoff-rx-1001",
        }),
      }
    );

    expect(handoff.status).toBe(200);
    expect(handoff.body.prescription.status).toBe("handed-off");

    const pharmacyHandoff = await requestJson(
      pharmacyBaseUrl,
      "/api/pharmacy/prescriptions/handoff",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          actorRole: "doctor",
          tenantKey: createPrescription.body.tenantKey,
          prescriptionId: createPrescription.body.id,
          ehrRecordId: createRecord.body.id,
          patientId: createPrescription.body.patientId,
          clinicianId: createPrescription.body.clinicianId,
          medicationName: createPrescription.body.medicationName,
          dosage: createPrescription.body.dosage,
          frequency: createPrescription.body.frequency,
          durationDays: createPrescription.body.durationDays,
          notes: createPrescription.body.notes,
        }),
      }
    );

    expect(pharmacyHandoff.status).toBe(201);
    expect(pharmacyHandoff.body.status).toBe("received");

    const pharmacyStatus = await requestJson(
      pharmacyBaseUrl,
      `/api/pharmacy/prescriptions/${pharmacyHandoff.body.id}/status`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          actorRole: "pharmacist",
          status: "fulfilled",
        }),
      }
    );

    expect(pharmacyStatus.status).toBe(200);
    expect(pharmacyStatus.body.status).toBe("fulfilled");

    const ehrStatusSync = await requestJson(
      ehrBaseUrl,
      `/ehr/records/${createRecord.body.id}/prescriptions/${createPrescription.body.id}/status`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          actorRole: "operations",
          status: "fulfilled",
        }),
      }
    );

    expect(ehrStatusSync.status).toBe(200);
    expect(ehrStatusSync.body.status).toBe("fulfilled");

    const timeline = await requestJson(
      ehrBaseUrl,
      `/ehr/records/${createRecord.body.id}/timeline`,
      {
        method: "GET",
      }
    );

    expect(timeline.status).toBe(200);
    expect(timeline.body.events.map((event) => event.eventType)).toEqual([
      "ehr.record.created",
      "ehr.prescription.created",
      "ehr.prescription.handoff",
      "ehr.prescription.status-updated",
    ]);
  });

  test("prevents duplicate pharmacy handoff for same prescription id", async () => {
    const first = await requestJson(pharmacyBaseUrl, "/api/pharmacy/prescriptions/handoff", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        actorRole: "doctor",
        tenantKey: "citycare-hospital",
        prescriptionId: "rx-duplicate-1001",
        ehrRecordId: "rec-duplicate-1001",
        patientId: "pat-duplicate-1001",
        medicationName: "Ibuprofen",
      }),
    });

    expect(first.status).toBe(201);

    const second = await requestJson(pharmacyBaseUrl, "/api/pharmacy/prescriptions/handoff", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        actorRole: "doctor",
        tenantKey: "citycare-hospital",
        prescriptionId: "rx-duplicate-1001",
        ehrRecordId: "rec-duplicate-1001",
        patientId: "pat-duplicate-1001",
        medicationName: "Ibuprofen",
      }),
    });

    expect(second.status).toBe(409);
    expect(second.body.code).toBe("PHARMACY_PRESCRIPTION_EXISTS");
  });
});
