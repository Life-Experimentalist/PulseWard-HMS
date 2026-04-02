const express = require("express");
const routes = require("../../services/lab-service/routes");

describe("lab-service order, result, and trigger alignment", () => {
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
    app.use("/api", routes);

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

  test("creates lab order, records result, reports outcome, and tracks downstream triggers", async () => {
    const createOrder = await requestJson("/api/lab-tests/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        actorRole: "doctor",
        tenantKey: "citycare-hospital",
        patientId: "pat-lab-1001",
        ehrRecordId: "rec-lab-1001",
        testCode: "cbc",
        requestedByClinicianId: "cln-lab-1001",
        priority: "urgent",
        orderedAt: "2026-04-02T15:00:00Z",
      }),
    });

    expect(createOrder.status).toBe(201);
    expect(createOrder.body.status).toBe("ordered");
    expect(createOrder.body.clinicalTriggers).toHaveLength(1);

    const transitionStatus = await requestJson(
      `/api/lab-tests/orders/${createOrder.body.id}/status`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          actorRole: "technician",
          status: "sample-collected",
        }),
      }
    );

    expect(transitionStatus.status).toBe(200);
    expect(transitionStatus.body.status).toBe("sample-collected");

    const recordResult = await requestJson(`/api/lab-tests/orders/${createOrder.body.id}/result`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        actorRole: "technician",
        summary: "Hemoglobin slightly low",
        values: {
          hemoglobin: 10.8,
        },
        observedAt: "2026-04-02T16:00:00Z",
        reportedBy: "tech-11",
      }),
    });

    expect(recordResult.status).toBe(200);
    expect(recordResult.body.status).toBe("result-ready");
    expect(recordResult.body.result).toBeTruthy();

    const reportResult = await requestJson(`/api/lab-tests/orders/${createOrder.body.id}/report`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        actorRole: "operations",
      }),
    });

    expect(reportResult.status).toBe(200);
    expect(reportResult.body.status).toBe("reported");

    const triggers = await requestJson(`/api/lab-tests/orders/${createOrder.body.id}/triggers`, {
      method: "GET",
    });

    expect(triggers.status).toBe(200);
    expect(triggers.body.orderId).toBe(createOrder.body.id);
    expect(triggers.body.total).toBe(4);
    expect(
      triggers.body.triggers.map((trigger) => `${trigger.triggerType}:${trigger.targetService}`)
    ).toEqual([
      "clinical.lab.order.created:ehr-service",
      "clinical.lab.result.ready:ehr-service",
      "clinical.lab.result.reported:ehr-service",
      "clinical.lab.result.reported:billing-service",
    ]);

    const updatedOrder = await requestJson(`/api/lab-tests/orders/${createOrder.body.id}`, {
      method: "GET",
    });

    expect(updatedOrder.status).toBe(200);
    expect(updatedOrder.body.history.map((event) => event.eventType)).toEqual([
      "lab.order.created",
      "lab.order.status-updated",
      "lab.result.recorded",
      "lab.result.reported",
    ]);
  });

  test("enforces error semantics for actor role, invalid status, and pre-result report", async () => {
    const missingActor = await requestJson("/api/lab-tests/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        patientId: "pat-lab-2001",
        testCode: "rft",
        orderedAt: "2026-04-02T17:00:00Z",
        requestedByClinicianId: "cln-lab-2001",
      }),
    });

    expect(missingActor.status).toBe(400);
    expect(missingActor.body.code).toBe("LAB_ACTOR_ROLE_REQUIRED");

    const createOrder = await requestJson("/api/lab-tests/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        actorRole: "doctor",
        tenantKey: "citycare-hospital",
        patientId: "pat-lab-2002",
        ehrRecordId: "rec-lab-2002",
        testCode: "lft",
        requestedByClinicianId: "cln-lab-2002",
        orderedAt: "2026-04-02T17:10:00Z",
      }),
    });

    expect(createOrder.status).toBe(201);

    const invalidStatus = await requestJson(`/api/lab-tests/orders/${createOrder.body.id}/status`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        actorRole: "technician",
        status: "bad-state",
      }),
    });

    expect(invalidStatus.status).toBe(400);
    expect(invalidStatus.body.code).toBe("LAB_ORDER_STATUS_INVALID");

    const reportBeforeResult = await requestJson(`/api/lab-tests/orders/${createOrder.body.id}/report`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        actorRole: "operations",
      }),
    });

    expect(reportBeforeResult.status).toBe(400);
    expect(reportBeforeResult.body.code).toBe("LAB_RESULT_MISSING");
  });
});
