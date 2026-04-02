const express = require("express");

const labRoutes = require("../../services/lab-service/routes");

describe("lab-service route edge coverage", () => {
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
    app.use("/api", labRoutes);

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

  test("supports catalog CRUD and missing-resource behavior", async () => {
    const invalidCreate = await requestJson("/api/lab-tests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "CBC" }),
    });

    expect(invalidCreate.status).toBe(400);
    expect(invalidCreate.body.code).toBe("LAB_TEST_PAYLOAD_INVALID");

    const created = await requestJson("/api/lab-tests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "CBC",
        description: "Complete blood count",
        price: 450,
        turnaroundHours: 8,
      }),
    });

    expect(created.status).toBe(201);

    const all = await requestJson("/api/lab-tests", { method: "GET" });
    expect(all.status).toBe(200);
    expect(Array.isArray(all.body)).toBe(true);
    expect(all.body.some((item) => item.id === created.body.id)).toBe(true);

    const updateMissing = await requestJson("/api/lab-tests/lab-missing", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Updated" }),
    });

    expect(updateMissing.status).toBe(404);
    expect(updateMissing.body.code).toBe("LAB_TEST_NOT_FOUND");

    const updated = await requestJson(`/api/lab-tests/${created.body.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        price: 500,
        turnaroundHours: 6,
      }),
    });

    expect(updated.status).toBe(200);
    expect(updated.body.price).toBe(500);
    expect(updated.body.turnaroundHours).toBe(6);

    const deleted = await requestJson(`/api/lab-tests/${created.body.id}`, {
      method: "DELETE",
    });

    expect(deleted.status).toBe(204);

    const deleteMissing = await requestJson(`/api/lab-tests/${created.body.id}`, {
      method: "DELETE",
    });

    expect(deleteMissing.status).toBe(404);
    expect(deleteMissing.body.code).toBe("LAB_TEST_NOT_FOUND");
  });

  test("validates order creation and reporting edge branches", async () => {
    const invalidOrderedAt = await requestJson("/api/lab-tests/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actorRole: "doctor",
        patientId: "pat-lab-edge-a",
        testCode: "cbc",
        requestedByClinicianId: "cln-lab-edge-a",
        orderedAt: "bad-date",
      }),
    });

    expect(invalidOrderedAt.status).toBe(400);
    expect(invalidOrderedAt.body.code).toBe("LAB_ORDER_PAYLOAD_INVALID");

    const invalidPriority = await requestJson("/api/lab-tests/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actorRole: "doctor",
        patientId: "pat-lab-edge-b",
        testCode: "cbc",
        requestedByClinicianId: "cln-lab-edge-b",
        orderedAt: "2026-05-04T13:00:00Z",
        priority: "high",
      }),
    });

    expect(invalidPriority.status).toBe(400);
    expect(invalidPriority.body.code).toBe("LAB_ORDER_PAYLOAD_INVALID");

    const created = await requestJson("/api/lab-tests/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actorRole: "doctor",
        tenantKey: "m43-lab-route",
        patientId: "pat-lab-edge-c",
        ehrRecordId: "rec-lab-edge-c",
        testCode: "cbc",
        requestedByClinicianId: "cln-lab-edge-c",
        orderedAt: "2026-05-04T14:00:00Z",
      }),
    });

    expect(created.status).toBe(201);

    const listed = await requestJson(
      "/api/lab-tests/orders?tenantKey=m43-lab-route&patientId=pat-lab-edge-c&status=ordered",
      { method: "GET" }
    );

    expect(listed.status).toBe(200);
    expect(listed.body.total).toBeGreaterThanOrEqual(1);
    expect(listed.body.orders.some((order) => order.id === created.body.id)).toBe(true);

    const notFoundGet = await requestJson("/api/lab-tests/orders/order-missing", {
      method: "GET",
    });

    expect(notFoundGet.status).toBe(404);
    expect(notFoundGet.body.code).toBe("LAB_ORDER_NOT_FOUND");

    const resultInvalid = await requestJson(`/api/lab-tests/orders/${created.body.id}/result`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actorRole: "technician",
        summary: "ready",
        observedAt: "invalid",
      }),
    });

    expect(resultInvalid.status).toBe(400);
    expect(resultInvalid.body.code).toBe("LAB_RESULT_PAYLOAD_INVALID");

    const resultOk = await requestJson(`/api/lab-tests/orders/${created.body.id}/result`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actorRole: "technician",
        summary: "normal",
        observedAt: "2026-05-04T15:00:00Z",
      }),
    });

    expect(resultOk.status).toBe(200);
    expect(resultOk.body.status).toBe("result-ready");

    const reportOk = await requestJson(`/api/lab-tests/orders/${created.body.id}/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actorRole: "operations" }),
    });

    expect(reportOk.status).toBe(200);
    expect(reportOk.body.status).toBe("reported");

    const statusAfterReport = await requestJson(`/api/lab-tests/orders/${created.body.id}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actorRole: "technician", status: "processing" }),
    });

    expect(statusAfterReport.status).toBe(400);
    expect(statusAfterReport.body.code).toBe("LAB_ORDER_STATUS_INVALID");

    const triggerView = await requestJson(`/api/lab-tests/orders/${created.body.id}/triggers`, {
      method: "GET",
    });

    expect(triggerView.status).toBe(200);
    expect(triggerView.body.total).toBeGreaterThanOrEqual(3);

    const triggerMissing = await requestJson("/api/lab-tests/orders/order-missing/triggers", {
      method: "GET",
    });

    expect(triggerMissing.status).toBe(404);
    expect(triggerMissing.body.code).toBe("LAB_ORDER_NOT_FOUND");

    const resultMissingOrder = await requestJson("/api/lab-tests/orders/order-missing/result", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actorRole: "technician",
        summary: "n/a",
        observedAt: "2026-05-04T16:00:00Z",
      }),
    });

    expect(resultMissingOrder.status).toBe(404);
    expect(resultMissingOrder.body.code).toBe("LAB_ORDER_NOT_FOUND");

    const reportMissingOrder = await requestJson("/api/lab-tests/orders/order-missing/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actorRole: "operations" }),
    });

    expect(reportMissingOrder.status).toBe(404);
    expect(reportMissingOrder.body.code).toBe("LAB_ORDER_NOT_FOUND");
  });
});
