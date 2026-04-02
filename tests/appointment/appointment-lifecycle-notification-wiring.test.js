const express = require("express");

const appointmentRoutes = require("../../services/appointment-service/routes");
const notificationRoutes = require("../../services/notification-service/routes");

describe("M4.2 appointment lifecycle notification wiring", () => {
  let appointmentServer;
  let notificationServer;
  let appointmentBaseUrl;
  let notificationBaseUrl;
  const originalEndpoint = process.env.APPOINTMENT_NOTIFICATION_EVENT_ENDPOINT;
  const originalRetries = process.env.APPOINTMENT_NOTIFICATION_MAX_RETRIES;
  const originalTimeout = process.env.APPOINTMENT_NOTIFICATION_TIMEOUT_MS;

  async function requestJson(baseUrl, relativePath, options) {
    const response = await fetch(`${baseUrl}${relativePath}`, options);
    const body = await response.json().catch(() => ({}));
    return { status: response.status, body };
  }

  async function startServer(routes) {
    const app = express();
    app.use(express.json());
    app.use("/api/v1", routes);

    const server = await new Promise((resolve) => {
      const next = app.listen(0, () => resolve(next));
    });

    const address = server.address();
    return {
      server,
      baseUrl: `http://127.0.0.1:${address.port}`,
    };
  }

  beforeAll(async () => {
    const notificationRuntime = await startServer(notificationRoutes);
    notificationServer = notificationRuntime.server;
    notificationBaseUrl = notificationRuntime.baseUrl;

    process.env.APPOINTMENT_NOTIFICATION_EVENT_ENDPOINT =
      `${notificationBaseUrl}/api/v1/integrations/appointments/events`;
    process.env.APPOINTMENT_NOTIFICATION_MAX_RETRIES = "2";
    process.env.APPOINTMENT_NOTIFICATION_TIMEOUT_MS = "1200";

    const appointmentRuntime = await startServer(appointmentRoutes);
    appointmentServer = appointmentRuntime.server;
    appointmentBaseUrl = appointmentRuntime.baseUrl;
  });

  afterAll(async () => {
    if (appointmentServer) {
      await new Promise((resolve) => appointmentServer.close(resolve));
    }

    if (notificationServer) {
      await new Promise((resolve) => notificationServer.close(resolve));
    }

    if (originalEndpoint === undefined) {
      delete process.env.APPOINTMENT_NOTIFICATION_EVENT_ENDPOINT;
    } else {
      process.env.APPOINTMENT_NOTIFICATION_EVENT_ENDPOINT = originalEndpoint;
    }

    if (originalRetries === undefined) {
      delete process.env.APPOINTMENT_NOTIFICATION_MAX_RETRIES;
    } else {
      process.env.APPOINTMENT_NOTIFICATION_MAX_RETRIES = originalRetries;
    }

    if (originalTimeout === undefined) {
      delete process.env.APPOINTMENT_NOTIFICATION_TIMEOUT_MS;
    } else {
      process.env.APPOINTMENT_NOTIFICATION_TIMEOUT_MS = originalTimeout;
    }
  });

  test("dispatches appointment.created event with propagated correlation id", async () => {
    const correlationSeed = "m42-create-correlation";

    const created = await requestJson(appointmentBaseUrl, "/api/v1/appointments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-correlation-id": correlationSeed,
      },
      body: JSON.stringify({
        actorRole: "frontdesk",
        tenantKey: "m42-wire-created",
        patientId: "pat-m42-1001",
        clinicianId: "cln-m42-1001",
        appointmentDate: "2026-05-02T09:00:00Z",
        durationMinutes: 30,
        status: "scheduled",
      }),
    });

    expect(created.status).toBe(201);
    expect(created.body.id).toBeTruthy();

    const expectedCorrelationId = `${correlationSeed}:appointment.created:${created.body.id}`;

    const dispatchEvents = await requestJson(
      appointmentBaseUrl,
      `/api/v1/integrations/notifications/dispatch-events?appointmentId=${created.body.id}`,
      {
        method: "GET",
      }
    );

    expect(dispatchEvents.status).toBe(200);
    expect(dispatchEvents.body.total).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(dispatchEvents.body.events)).toBe(true);

    const createdDispatch = dispatchEvents.body.events.find(
      (eventItem) => eventItem.eventType === "appointment.created"
    );

    expect(createdDispatch).toBeTruthy();
    expect(createdDispatch.status).toBe("delivered");
    expect(createdDispatch.responseStatus).toBe(201);
    expect(createdDispatch.correlationId).toBe(expectedCorrelationId);

    const receiptList = await requestJson(
      notificationBaseUrl,
      `/api/v1/integrations/appointments/events?correlationId=${encodeURIComponent(expectedCorrelationId)}`,
      {
        method: "GET",
      }
    );

    expect(receiptList.status).toBe(200);
    expect(receiptList.body.total).toBe(1);
    expect(receiptList.body.receipts[0].eventType).toBe("appointment.created");
    expect(receiptList.body.receipts[0].correlationId).toBe(expectedCorrelationId);
  });

  test("emits status and reschedule lifecycle events on update", async () => {
    const created = await requestJson(appointmentBaseUrl, "/api/v1/appointments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-correlation-id": "m42-update-create",
      },
      body: JSON.stringify({
        actorRole: "frontdesk",
        tenantKey: "m42-wire-update",
        patientId: "pat-m42-2001",
        clinicianId: "cln-m42-2001",
        appointmentDate: "2026-05-02T11:00:00Z",
        durationMinutes: 30,
        status: "scheduled",
      }),
    });

    expect(created.status).toBe(201);

    const updateCorrelationSeed = "m42-update-correlation";

    const updated = await requestJson(appointmentBaseUrl, `/api/v1/appointments/${created.body.id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "x-correlation-id": updateCorrelationSeed,
      },
      body: JSON.stringify({
        actorRole: "operations",
        expectedVersion: created.body.version,
        status: "checked-in",
        appointmentDate: "2026-05-02T11:30:00Z",
      }),
    });

    expect(updated.status).toBe(200);
    expect(updated.body.status).toBe("checked-in");

    const dispatchEvents = await requestJson(
      appointmentBaseUrl,
      `/api/v1/integrations/notifications/dispatch-events?appointmentId=${created.body.id}`,
      {
        method: "GET",
      }
    );

    expect(dispatchEvents.status).toBe(200);

    const statusUpdatedDispatch = dispatchEvents.body.events.find(
      (eventItem) => eventItem.eventType === "appointment.status-updated"
    );
    const rescheduledDispatch = dispatchEvents.body.events.find(
      (eventItem) => eventItem.eventType === "appointment.rescheduled"
    );

    expect(statusUpdatedDispatch).toBeTruthy();
    expect(rescheduledDispatch).toBeTruthy();
    expect(statusUpdatedDispatch.status).toBe("delivered");
    expect(rescheduledDispatch.status).toBe("delivered");

    const statusCorrelation = `${updateCorrelationSeed}:appointment.status-updated:${created.body.id}`;
    const rescheduleCorrelation = `${updateCorrelationSeed}:appointment.rescheduled:${created.body.id}`;

    expect(statusUpdatedDispatch.correlationId).toBe(statusCorrelation);
    expect(rescheduledDispatch.correlationId).toBe(rescheduleCorrelation);

    const receipts = await requestJson(
      notificationBaseUrl,
      `/api/v1/integrations/appointments/events?appointmentId=${created.body.id}`,
      {
        method: "GET",
      }
    );

    expect(receipts.status).toBe(200);
    expect(receipts.body.total).toBeGreaterThanOrEqual(3);
    expect(
      receipts.body.receipts.some(
        (receipt) =>
          receipt.eventType === "appointment.status-updated" &&
          receipt.correlationId === statusCorrelation
      )
    ).toBe(true);
    expect(
      receipts.body.receipts.some(
        (receipt) =>
          receipt.eventType === "appointment.rescheduled" &&
          receipt.correlationId === rescheduleCorrelation
      )
    ).toBe(true);
  });

  test("returns duplicate receipt for correlation replay", async () => {
    const replayPayload = {
      tenantKey: "m42-wire-replay",
      appointmentId: "apt-m42-replay-1",
      patientId: "pat-m42-replay-1",
      clinicianId: "cln-m42-replay-1",
      eventType: "appointment.created",
      correlationId: "m42-replay-correlation-1",
      message: "Appointment created for patient",
      recipient: "pat-m42-replay-1",
      sourceService: "appointment-service",
      channel: "appointment-lifecycle",
      metadata: {
        reason: "replay-test",
      },
    };

    const accepted = await requestJson(notificationBaseUrl, "/api/v1/integrations/appointments/events", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(replayPayload),
    });

    expect(accepted.status).toBe(201);
    expect(accepted.body.duplicate).toBe(false);

    const replay = await requestJson(notificationBaseUrl, "/api/v1/integrations/appointments/events", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(replayPayload),
    });

    expect(replay.status).toBe(200);
    expect(replay.body.duplicate).toBe(true);
    expect(replay.body.receipt.id).toBe(accepted.body.receipt.id);
    expect(replay.body.notification.id).toBe(accepted.body.notification.id);
  });
});
