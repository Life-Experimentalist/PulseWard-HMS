const express = require("express");
const routes = require("../../services/billing-service/src");

describe("billing-service clinical trigger hook processing", () => {
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
    app.use("/", routes);

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

  test("processes lab and prescription clinical triggers into billing records", async () => {
    const labHook = await requestJson("/billing/hooks/clinical-trigger", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        actorRole: "operations",
        tenantKey: "citycare-hospital",
        patientId: "pat-billing-1001",
        triggerType: "clinical.lab.result.reported",
        sourceService: "lab-service",
        sourceReferenceId: "ord-lab-1001",
        correlationId: "corr-lab-1001",
        amount: 72.5,
      }),
    });

    expect(labHook.status).toBe(201);
    expect(labHook.body.billingRecord.status).toBe("ready-for-invoice");
    expect(labHook.body.billingRecord.amount).toBe(72.5);

    const prescriptionHook = await requestJson("/billing/hooks/clinical-trigger", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        actorRole: "system",
        tenantKey: "citycare-hospital",
        patientId: "pat-billing-1001",
        triggerType: "clinical.prescription.handed-off",
        sourceService: "ehr-service",
        sourceReferenceId: "rx-1001",
        correlationId: "corr-rx-1001",
      }),
    });

    expect(prescriptionHook.status).toBe(201);
    expect(prescriptionHook.body.billingRecord.status).toBe("pending-verification");
    expect(prescriptionHook.body.billingRecord.amount).toBe(0);

    const listReceipts = await requestJson(
      "/billing/hooks/clinical-trigger?tenantKey=citycare-hospital&patientId=pat-billing-1001",
      {
        method: "GET",
      }
    );

    expect(listReceipts.status).toBe(200);
    expect(listReceipts.body.total).toBe(2);
    expect(listReceipts.body.receipts.map((item) => item.triggerType)).toEqual([
      "clinical.lab.result.reported",
      "clinical.prescription.handed-off",
    ]);

    const listBilling = await requestJson("/billing?tenantKey=citycare-hospital&patientId=pat-billing-1001", {
      method: "GET",
    });

    expect(listBilling.status).toBe(200);
    expect(listBilling.body.total).toBe(2);
    expect(listBilling.body.records.map((record) => record.status)).toEqual([
      "ready-for-invoice",
      "pending-verification",
    ]);

    const getReceipt = await requestJson(`/billing/hooks/clinical-trigger/${labHook.body.receipt.id}`, {
      method: "GET",
    });

    expect(getReceipt.status).toBe(200);
    expect(getReceipt.body.correlationId).toBe("corr-lab-1001");
  });

  test("rejects invalid role and duplicate clinical trigger correlations", async () => {
    const invalidRole = await requestJson("/billing/hooks/clinical-trigger", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        actorRole: "doctor",
        tenantKey: "citycare-hospital",
        patientId: "pat-billing-2001",
        triggerType: "clinical.lab.result.reported",
        sourceService: "lab-service",
        sourceReferenceId: "ord-lab-2001",
        correlationId: "corr-lab-2001",
      }),
    });

    expect(invalidRole.status).toBe(403);
    expect(invalidRole.body.code).toBe("BILLING_ACTOR_ROLE_NOT_ALLOWED");

    const first = await requestJson("/billing/hooks/clinical-trigger", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        actorRole: "operations",
        tenantKey: "citycare-hospital",
        patientId: "pat-billing-2002",
        triggerType: "clinical.prescription.fulfilled",
        sourceService: "pharmacy-service",
        sourceReferenceId: "rx-2002",
        correlationId: "corr-rx-2002",
      }),
    });

    expect(first.status).toBe(201);

    const duplicate = await requestJson("/billing/hooks/clinical-trigger", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        actorRole: "operations",
        tenantKey: "citycare-hospital",
        patientId: "pat-billing-2002",
        triggerType: "clinical.prescription.fulfilled",
        sourceService: "pharmacy-service",
        sourceReferenceId: "rx-2002",
        correlationId: "corr-rx-2002",
      }),
    });

    expect(duplicate.status).toBe(409);
    expect(duplicate.body.code).toBe("BILLING_TRIGGER_DUPLICATE");
  });
});
