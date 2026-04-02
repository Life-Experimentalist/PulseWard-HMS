const express = require("express");

const notificationRoutes = require("../../services/notification-service/routes");

describe("notification messaging connector diagnostics", () => {
  let server;
  let baseUrl;
  const originalWhatsApp = process.env.INTEGRATION_WHATSAPP_CREDENTIALS;

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

    if (originalWhatsApp === undefined) {
      delete process.env.INTEGRATION_WHATSAPP_CREDENTIALS;
    } else {
      process.env.INTEGRATION_WHATSAPP_CREDENTIALS = originalWhatsApp;
    }
  });

  test("returns WhatsApp setup checklist and config readiness details", async () => {
    const setup = await requestJson(
      "/api/v1/integrations/messaging/whatsapp/setup?tenantKey=default",
      {
        method: "GET",
      }
    );

    expect(setup.status).toBe(200);
    expect(setup.body.providerEnabled).toBe(false);
    expect(Array.isArray(setup.body.setupSteps)).toBe(true);
    expect(setup.body.setupSteps.length).toBeGreaterThan(0);

    delete process.env.INTEGRATION_WHATSAPP_CREDENTIALS;
    const notConfigured = await requestJson(
      "/api/v1/integrations/messaging/whatsapp/config-status?tenantKey=default",
      {
        method: "GET",
      }
    );

    expect(notConfigured.status).toBe(200);
    expect(notConfigured.body.configured).toBe(false);
    expect(notConfigured.body.hasAccessToken).toBe(false);
    expect(notConfigured.body.hasPhoneNumberId).toBe(false);
    expect(notConfigured.body.hasSenderNumber).toBe(false);

    process.env.INTEGRATION_WHATSAPP_CREDENTIALS = JSON.stringify({
      accessToken: "wa-token",
      phoneNumberId: "123456789",
    });

    const configured = await requestJson(
      "/api/v1/integrations/messaging/whatsapp/config-status?tenantKey=default",
      {
        method: "GET",
      }
    );

    expect(configured.status).toBe(200);
    expect(configured.body.configured).toBe(true);
    expect(configured.body.hasAccessToken).toBe(true);
    expect(configured.body.hasPhoneNumberId).toBe(true);
    expect(configured.body.hasSenderNumber).toBe(false);

    process.env.INTEGRATION_WHATSAPP_CREDENTIALS = "raw-secret";
    const rawSecret = await requestJson(
      "/api/v1/integrations/messaging/whatsapp/config-status?tenantKey=default",
      {
        method: "GET",
      }
    );

    expect(rawSecret.status).toBe(200);
    expect(rawSecret.body.configured).toBe(false);
  });
});
