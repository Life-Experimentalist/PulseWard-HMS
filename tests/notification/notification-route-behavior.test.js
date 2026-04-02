const express = require("express");

const notificationRoutes = require("../../services/notification-service/routes");

describe("notification-service route behavior", () => {
  let server;
  let baseUrl;
  const originalTelegram = process.env.INTEGRATION_TELEGRAM_CREDENTIALS;
  const originalEmail = process.env.INTEGRATION_EMAIL_SMTP_CREDENTIALS;

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

    if (originalTelegram === undefined) {
      delete process.env.INTEGRATION_TELEGRAM_CREDENTIALS;
    } else {
      process.env.INTEGRATION_TELEGRAM_CREDENTIALS = originalTelegram;
    }

    if (originalEmail === undefined) {
      delete process.env.INTEGRATION_EMAIL_SMTP_CREDENTIALS;
    } else {
      process.env.INTEGRATION_EMAIL_SMTP_CREDENTIALS = originalEmail;
    }
  });

  test("supports notification create/list/get/delete with not-found handling", async () => {
    const created = await requestJson("/api/v1/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: "Route behavior test",
        recipient: "ops@example.com",
      }),
    });

    expect(created.status).toBe(201);
    expect(created.body.id).toBeTruthy();

    const list = await requestJson("/api/v1/notifications", {
      method: "GET",
    });

    expect(list.status).toBe(200);
    expect(Array.isArray(list.body)).toBe(true);
    expect(list.body.some((item) => item.id === created.body.id)).toBe(true);

    const getById = await requestJson(`/api/v1/notifications/${created.body.id}`, {
      method: "GET",
    });

    expect(getById.status).toBe(200);
    expect(getById.body.id).toBe(created.body.id);

    const deleted = await requestJson(`/api/v1/notifications/${created.body.id}`, {
      method: "DELETE",
    });

    expect(deleted.status).toBe(204);

    const getMissing = await requestJson(`/api/v1/notifications/${created.body.id}`, {
      method: "GET",
    });

    expect(getMissing.status).toBe(404);

    const deleteMissing = await requestJson(`/api/v1/notifications/${created.body.id}`, {
      method: "DELETE",
    });

    expect(deleteMissing.status).toBe(404);
  });

  test("returns messaging provider metadata and setup/config diagnostics", async () => {
    const providers = await requestJson(
      "/api/v1/integrations/messaging/providers?tenantKey=default",
      {
        method: "GET",
      }
    );

    expect(providers.status).toBe(200);
    expect(Array.isArray(providers.body)).toBe(true);
    expect(providers.body.some((item) => item.key === "telegram-bot")).toBe(true);

    const setup = await requestJson(
      "/api/v1/integrations/messaging/telegram/setup?tenantKey=default",
      {
        method: "GET",
      }
    );

    expect(setup.status).toBe(200);
    expect(Array.isArray(setup.body.setupSteps)).toBe(true);
    expect(setup.body.setupSteps.length).toBeGreaterThan(0);

    process.env.INTEGRATION_TELEGRAM_CREDENTIALS = JSON.stringify({
      botToken: "test-token",
      chatId: "chat-42",
    });
    process.env.INTEGRATION_EMAIL_SMTP_CREDENTIALS = JSON.stringify({
      host: "smtp.example.com",
      user: "user",
      pass: "pass",
      from: "ops@example.com",
    });

    const telegramReady = await requestJson(
      "/api/v1/integrations/messaging/telegram/config-status?tenantKey=default",
      {
        method: "GET",
      }
    );

    expect(telegramReady.status).toBe(200);
    expect(telegramReady.body.configured).toBe(true);
    expect(telegramReady.body.hasChatId).toBe(true);

    const emailReady = await requestJson(
      "/api/v1/integrations/messaging/email/config-status?tenantKey=default",
      {
        method: "GET",
      }
    );

    expect(emailReady.status).toBe(200);
    expect(emailReady.body.configured).toBe(true);
    expect(emailReady.body.hasFromAddress).toBe(true);

    process.env.INTEGRATION_TELEGRAM_CREDENTIALS = "raw-not-json";
    const telegramRaw = await requestJson(
      "/api/v1/integrations/messaging/telegram/config-status?tenantKey=default",
      {
        method: "GET",
      }
    );

    expect(telegramRaw.status).toBe(200);
    expect(telegramRaw.body.configured).toBe(false);
    expect(telegramRaw.body.hasChatId).toBe(false);
  });

  test("supports messaging test success path and error path", async () => {
    const success = await requestJson("/api/v1/integrations/messaging/test", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tenantKey: "default",
        channel: "website-hook",
        recipient: "ops@example.com",
        message: "routing smoke",
        dryRun: "false",
      }),
    });

    expect(success.status).toBe(200);
    expect(success.body.accepted).toBe(true);

    const failed = await requestJson("/api/v1/integrations/messaging/test", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tenantKey: "default",
        channel: "unknown-channel",
        recipient: "ops@example.com",
        message: "should fail",
      }),
    });

    expect(failed.status).toBe(400);
    expect(failed.body.accepted).toBe(false);
    expect(String(failed.body.detail || "")).toContain("Messaging route not configured");
  });
});
