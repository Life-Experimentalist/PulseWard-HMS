const express = require("express");
const { createHmac } = require("crypto");

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

  test("verifies webhook signatures against configured secret", async () => {
    delete process.env.INTEGRATION_WEBHOOK_ENDPOINT;
    process.env.INTEGRATION_WEBHOOK_SIGNING_SECRET = "m5-3-signing-secret";

    const payload = {
      eventType: "appointment.created",
      appointmentId: "apt-1001",
      tenantKey: "default",
    };
    const signature = `sha256=${createHmac("sha256", "m5-3-signing-secret")
      .update(JSON.stringify(payload), "utf8")
      .digest("hex")}`;

    const verified = await requestJson("/api/v1/integrations/messaging/webhook/signature/verify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tenantKey: "default",
        payload,
        signature,
      }),
    });

    expect(verified.status).toBe(200);
    expect(verified.body.valid).toBe(true);
    expect(verified.body.algorithm).toBe("sha256");
    expect(verified.body.signatureHeader).toBe("x-pulseward-signature");

    const invalid = await requestJson("/api/v1/integrations/messaging/webhook/signature/verify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tenantKey: "default",
        payload,
        signature: "sha256=invalid-signature",
      }),
    });

    expect(invalid.status).toBe(200);
    expect(invalid.body.valid).toBe(false);
    expect(invalid.body.detail).toContain("failed");
  });

  test("returns messaging retry-policy controls and channel coverage", async () => {
    const retryPolicy = await requestJson(
      "/api/v1/integrations/messaging/retry-policy?tenantKey=default&providerKey=generic-webhook",
      {
        method: "GET",
      }
    );

    expect(retryPolicy.status).toBe(200);
    expect(retryPolicy.body.tenantKey).toBe("default");
    expect(retryPolicy.body.providerKey).toBe("generic-webhook");
    expect(retryPolicy.body.providerEnabled).toBe(true);
    expect(retryPolicy.body.readinessStatus).toBe("ready");
    expect(retryPolicy.body.policy.mode).toBeTruthy();
    expect(retryPolicy.body.policy.maxAttempts).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(retryPolicy.body.policy.retryOn)).toBe(true);
    expect(retryPolicy.body.channelCoverage.defaultChannels).toContain("website-hook");
    expect(retryPolicy.body.guidance.deliveryTestEndpoint).toBe(
      "POST /api/v1/integrations/messaging/test"
    );
  });
});
