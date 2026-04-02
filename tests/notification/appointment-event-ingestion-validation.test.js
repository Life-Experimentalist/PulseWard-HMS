const express = require("express");

const notificationRoutes = require("../../services/notification-service/routes");

describe("notification appointment-event ingestion validation", () => {
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
    app.use("/api/v1", notificationRoutes);

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

  test("rejects invalid appointment event payload with explicit failure reasons", async () => {
    const response = await requestJson("/api/v1/integrations/appointments/events", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tenantKey: "m43-notification",
      }),
    });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("NOTIFICATION_APPOINTMENT_EVENT_INVALID");
    expect(Array.isArray(response.body.details.failures)).toBe(true);
    expect(response.body.details.failures).toContain("appointmentId is required");
    expect(response.body.details.failures).toContain("eventType is required");
    expect(response.body.details.failures).toContain("correlationId is required");
  });

  test("supports receipt list filters and receipt-by-id retrieval", async () => {
    const payload = {
      tenantKey: "m43-notification-filter",
      appointmentId: "apt-m43-filter-1",
      patientId: "pat-m43-filter-1",
      clinicianId: "cln-m43-filter-1",
      eventType: "appointment.rescheduled",
      correlationId: "m43-notification-correlation-1",
      message: "Appointment rescheduled",
      recipient: "pat-m43-filter-1",
      metadata: {
        reason: "filter-check",
      },
    };

    const created = await requestJson("/api/v1/integrations/appointments/events", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    expect(created.status).toBe(201);
    expect(created.body.duplicate).toBe(false);

    const list = await requestJson(
      "/api/v1/integrations/appointments/events?tenantKey=m43-notification-filter&eventType=appointment.rescheduled",
      {
        method: "GET",
      }
    );

    expect(list.status).toBe(200);
    expect(list.body.total).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(list.body.receipts)).toBe(true);
    expect(
      list.body.receipts.some((receipt) => receipt.correlationId === payload.correlationId)
    ).toBe(true);

    const receiptId = created.body.receipt.id;
    const byId = await requestJson(`/api/v1/integrations/appointments/events/${receiptId}`, {
      method: "GET",
    });

    expect(byId.status).toBe(200);
    expect(byId.body.id).toBe(receiptId);
    expect(byId.body.eventType).toBe("appointment.rescheduled");

    const notFound = await requestJson(
      "/api/v1/integrations/appointments/events/receipt-does-not-exist",
      {
        method: "GET",
      }
    );

    expect(notFound.status).toBe(404);
    expect(notFound.body.code).toBe("NOTIFICATION_APPOINTMENT_EVENT_NOT_FOUND");
  });
});
