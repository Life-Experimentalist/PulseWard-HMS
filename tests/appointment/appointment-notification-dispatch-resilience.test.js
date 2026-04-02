const express = require("express");

const appointmentRoutes = require("../../services/appointment-service/routes");

describe("appointment notification dispatch resilience", () => {
  let appointmentServer;
  let appointmentBaseUrl;
  const originalEndpoint = process.env.APPOINTMENT_NOTIFICATION_EVENT_ENDPOINT;
  const originalRetries = process.env.APPOINTMENT_NOTIFICATION_MAX_RETRIES;
  const originalTimeout = process.env.APPOINTMENT_NOTIFICATION_TIMEOUT_MS;

  async function requestJson(relativePath, options) {
    const response = await fetch(`${appointmentBaseUrl}${relativePath}`, options);
    const body = await response.json().catch(() => ({}));
    return { status: response.status, body };
  }

  async function startAppointmentRuntime() {
    const app = express();
    app.use(express.json());
    app.use("/api/v1", appointmentRoutes);

    appointmentServer = await new Promise((resolve) => {
      const next = app.listen(0, () => resolve(next));
    });

    const address = appointmentServer.address();
    appointmentBaseUrl = `http://127.0.0.1:${address.port}`;
  }

  beforeAll(async () => {
    await startAppointmentRuntime();
  });

  afterAll(async () => {
    if (appointmentServer) {
      await new Promise((resolve) => appointmentServer.close(resolve));
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

  test("marks dispatch as skipped when notification endpoint is not configured", async () => {
    delete process.env.APPOINTMENT_NOTIFICATION_EVENT_ENDPOINT;
    process.env.APPOINTMENT_NOTIFICATION_MAX_RETRIES = "2";
    process.env.APPOINTMENT_NOTIFICATION_TIMEOUT_MS = "800";

    const correlationSeed = "m43-dispatch-skip";
    const created = await requestJson("/api/v1/appointments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-correlation-id": correlationSeed,
      },
      body: JSON.stringify({
        actorRole: "frontdesk",
        tenantKey: "m43-appointment-dispatch",
        patientId: "pat-m43-skip",
        clinicianId: "cln-m43-skip",
        appointmentDate: "2026-05-03T09:00:00Z",
        status: "scheduled",
      }),
    });

    expect(created.status).toBe(201);

    const correlationId = `${correlationSeed}:appointment.created:${created.body.id}`;

    const dispatchEvents = await requestJson(
      `/api/v1/integrations/notifications/dispatch-events?correlationId=${encodeURIComponent(
        correlationId
      )}`,
      {
        method: "GET",
      }
    );

    expect(dispatchEvents.status).toBe(200);
    expect(dispatchEvents.body.total).toBe(1);
    expect(dispatchEvents.body.events[0].status).toBe("skipped");
    expect(dispatchEvents.body.events[0].attempts).toBe(0);
    expect(dispatchEvents.body.events[0].lastError).toContain("not configured");
  });

  test("marks dispatch as failed with bounded attempts when endpoint is unreachable", async () => {
    process.env.APPOINTMENT_NOTIFICATION_EVENT_ENDPOINT =
      "http://127.0.0.1:1/api/v1/integrations/appointments/events";
    process.env.APPOINTMENT_NOTIFICATION_MAX_RETRIES = "2";
    process.env.APPOINTMENT_NOTIFICATION_TIMEOUT_MS = "500";

    const correlationSeed = "m43-dispatch-fail";
    const created = await requestJson("/api/v1/appointments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-correlation-id": correlationSeed,
      },
      body: JSON.stringify({
        actorRole: "frontdesk",
        tenantKey: "m43-appointment-dispatch",
        patientId: "pat-m43-fail",
        clinicianId: "cln-m43-fail",
        appointmentDate: "2026-05-03T10:00:00Z",
        status: "scheduled",
      }),
    });

    expect(created.status).toBe(201);

    const correlationId = `${correlationSeed}:appointment.created:${created.body.id}`;

    const dispatchEvents = await requestJson(
      `/api/v1/integrations/notifications/dispatch-events?correlationId=${encodeURIComponent(
        correlationId
      )}`,
      {
        method: "GET",
      }
    );

    expect(dispatchEvents.status).toBe(200);
    expect(dispatchEvents.body.total).toBe(1);
    expect(dispatchEvents.body.events[0].status).toBe("failed");
    expect(dispatchEvents.body.events[0].attempts).toBe(2);
    expect(dispatchEvents.body.events[0].lastError).toBeTruthy();

    const filteredFailed = await requestJson(
      `/api/v1/integrations/notifications/dispatch-events?status=failed&tenantKey=m43-appointment-dispatch`,
      {
        method: "GET",
      }
    );

    expect(filteredFailed.status).toBe(200);
    expect(filteredFailed.body.total).toBeGreaterThanOrEqual(1);
    expect(filteredFailed.body.events.every((eventItem) => eventItem.status === "failed")).toBe(
      true
    );
    expect(
      filteredFailed.body.events.some((eventItem) => eventItem.correlationId === correlationId)
    ).toBe(true);
  });
});
