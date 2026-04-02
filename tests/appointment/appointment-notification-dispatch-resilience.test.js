const express = require("express");

const appointmentRoutes = require("../../services/appointment-service/routes");

describe("appointment notification dispatch resilience", () => {
  let appointmentServer;
  let appointmentBaseUrl;
  let slowNotificationServer;
  let slowNotificationBaseUrl;
  const originalEndpoint = process.env.APPOINTMENT_NOTIFICATION_EVENT_ENDPOINT;
  const originalRetries = process.env.APPOINTMENT_NOTIFICATION_MAX_RETRIES;
  const originalTimeout = process.env.APPOINTMENT_NOTIFICATION_TIMEOUT_MS;
  const originalLateThreshold = process.env.APPOINTMENT_NOTIFICATION_LATE_THRESHOLD_MS;
  const originalDeadLetterMax = process.env.APPOINTMENT_NOTIFICATION_DEAD_LETTER_MAX;

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

  async function startSlowNotificationRuntime() {
    const app = express();
    app.use(express.json());
    app.post("/api/v1/integrations/appointments/events", function (_req, res) {
      setTimeout(function () {
        res.status(201).json({
          duplicate: false,
          receipt: {
            id: "slow-receipt-id",
          },
        });
      }, 250);
    });

    slowNotificationServer = await new Promise((resolve) => {
      const next = app.listen(0, () => resolve(next));
    });

    const address = slowNotificationServer.address();
    slowNotificationBaseUrl = `http://127.0.0.1:${address.port}`;
  }

  beforeAll(async () => {
    await startAppointmentRuntime();
  });

  afterAll(async () => {
    if (appointmentServer) {
      await new Promise((resolve) => appointmentServer.close(resolve));
    }

    if (slowNotificationServer) {
      await new Promise((resolve) => slowNotificationServer.close(resolve));
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

    if (originalLateThreshold === undefined) {
      delete process.env.APPOINTMENT_NOTIFICATION_LATE_THRESHOLD_MS;
    } else {
      process.env.APPOINTMENT_NOTIFICATION_LATE_THRESHOLD_MS = originalLateThreshold;
    }

    if (originalDeadLetterMax === undefined) {
      delete process.env.APPOINTMENT_NOTIFICATION_DEAD_LETTER_MAX;
    } else {
      process.env.APPOINTMENT_NOTIFICATION_DEAD_LETTER_MAX = originalDeadLetterMax;
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

    const deadLetter = await requestJson(
      `/api/v1/integrations/notifications/dead-letter?correlationId=${encodeURIComponent(
        correlationId
      )}`,
      {
        method: "GET",
      }
    );

    expect(deadLetter.status).toBe(200);
    expect(deadLetter.body.total).toBe(1);
    expect(deadLetter.body.events[0].deadLetterReason).toBe("endpoint-not-configured");
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

    const deadLetter = await requestJson(
      `/api/v1/integrations/notifications/dead-letter?correlationId=${encodeURIComponent(
        correlationId
      )}`,
      {
        method: "GET",
      }
    );

    expect(deadLetter.status).toBe(200);
    expect(deadLetter.body.total).toBe(1);
    expect(deadLetter.body.events[0].deadLetterReason).toBe("retry-exhausted");

    const telemetry = await requestJson(
      "/api/v1/integrations/notifications/dispatch-telemetry?tenantKey=m43-appointment-dispatch&windowMinutes=120",
      {
        method: "GET",
      }
    );

    expect(telemetry.status).toBe(200);
    expect(telemetry.body.counters.totalDispatches).toBeGreaterThanOrEqual(1);
    expect(telemetry.body.counters.missedReminders).toBeGreaterThanOrEqual(1);
    expect(telemetry.body.counters.deadLettered).toBeGreaterThanOrEqual(1);
  });

  test("tracks delayed reminder telemetry and late-delivery dead-letter records", async () => {
    await startSlowNotificationRuntime();

    process.env.APPOINTMENT_NOTIFICATION_EVENT_ENDPOINT = `${slowNotificationBaseUrl}/api/v1/integrations/appointments/events`;
    process.env.APPOINTMENT_NOTIFICATION_MAX_RETRIES = "1";
    process.env.APPOINTMENT_NOTIFICATION_TIMEOUT_MS = "1200";
    process.env.APPOINTMENT_NOTIFICATION_LATE_THRESHOLD_MS = "50";
    process.env.APPOINTMENT_NOTIFICATION_DEAD_LETTER_MAX = "100";

    const correlationSeed = "m44-dispatch-delayed";
    const created = await requestJson("/api/v1/appointments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-correlation-id": correlationSeed,
      },
      body: JSON.stringify({
        actorRole: "frontdesk",
        tenantKey: "m44-appointment-dispatch",
        patientId: "pat-m44-delayed",
        clinicianId: "cln-m44-delayed",
        appointmentDate: "2026-05-03T11:00:00Z",
        status: "scheduled",
      }),
    });

    expect(created.status).toBe(201);
    const correlationId = `${correlationSeed}:appointment.created:${created.body.id}`;

    const telemetry = await requestJson(
      "/api/v1/integrations/notifications/dispatch-telemetry?tenantKey=m44-appointment-dispatch&windowMinutes=120&lateThresholdMs=50",
      {
        method: "GET",
      }
    );

    expect(telemetry.status).toBe(200);
    expect(telemetry.body.counters.totalDispatches).toBeGreaterThanOrEqual(1);
    expect(telemetry.body.counters.delivered).toBeGreaterThanOrEqual(1);
    expect(telemetry.body.counters.delayedReminders).toBeGreaterThanOrEqual(1);
    expect(telemetry.body.counters.deadLettered).toBeGreaterThanOrEqual(1);

    const deadLetter = await requestJson(
      `/api/v1/integrations/notifications/dead-letter?tenantKey=m44-appointment-dispatch&correlationId=${encodeURIComponent(
        correlationId
      )}&reason=late-delivery`,
      {
        method: "GET",
      }
    );

    expect(deadLetter.status).toBe(200);
    expect(deadLetter.body.total).toBe(1);
    expect(deadLetter.body.events[0].deadLetterReason).toBe("late-delivery");
    expect(deadLetter.body.events[0].status).toBe("delivered");
  });
});
