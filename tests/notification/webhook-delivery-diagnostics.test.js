const express = require("express");

const notificationRoutes = require("../../services/notification-service/routes");

describe("notification webhook delivery diagnostics", () => {
  let server;
  let baseUrl;
  const originalWebhookEndpoint = process.env.INTEGRATION_WEBHOOK_ENDPOINT;
  const originalWebhookSigningSecret = process.env.INTEGRATION_WEBHOOK_SIGNING_SECRET;

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

    if (originalWebhookEndpoint === undefined) {
      delete process.env.INTEGRATION_WEBHOOK_ENDPOINT;
    } else {
      process.env.INTEGRATION_WEBHOOK_ENDPOINT = originalWebhookEndpoint;
    }

    if (originalWebhookSigningSecret === undefined) {
      delete process.env.INTEGRATION_WEBHOOK_SIGNING_SECRET;
    } else {
      process.env.INTEGRATION_WEBHOOK_SIGNING_SECRET = originalWebhookSigningSecret;
    }
  });

  test("reports healthy webhook readiness with default tenant routing coverage", async () => {
    delete process.env.INTEGRATION_WEBHOOK_ENDPOINT;
    process.env.INTEGRATION_WEBHOOK_SIGNING_SECRET = "signing-secret";

    const diagnostics = await requestJson(
      "/api/v1/integrations/messaging/webhook/diagnostics?tenantKey=default",
      {
        method: "GET",
      }
    );

    expect(diagnostics.status).toBe(200);
    expect(diagnostics.body.tenantKey).toBe("default");
    expect(diagnostics.body.providerEnabled).toBe(true);
    expect(diagnostics.body.endpointConfigured).toBe(true);
    expect(diagnostics.body.endpointUrlValid).toBe(true);
    expect(diagnostics.body.readinessStatus).toBe("healthy");
    expect(diagnostics.body.routeCoverage.defaultChannels).toContain("website-hook");
    expect(diagnostics.body.routeCoverage.fallbackChannels.length).toBeGreaterThanOrEqual(1);
    expect(diagnostics.body.signingSecret.configured).toBe(true);
  });

  test("reports degraded readiness for invalid webhook endpoint override", async () => {
    process.env.INTEGRATION_WEBHOOK_ENDPOINT = "not-a-valid-url";
    delete process.env.INTEGRATION_WEBHOOK_SIGNING_SECRET;

    const diagnostics = await requestJson(
      "/api/v1/integrations/messaging/webhook/diagnostics?tenantKey=citycare-hospital",
      {
        method: "GET",
      }
    );

    expect(diagnostics.status).toBe(200);
    expect(diagnostics.body.providerEnabled).toBe(true);
    expect(diagnostics.body.endpointConfigured).toBe(true);
    expect(diagnostics.body.endpointUrlValid).toBe(false);
    expect(diagnostics.body.readinessStatus).toBe("degraded");
    expect(diagnostics.body.signingSecret.configured).toBe(false);
  });
});
