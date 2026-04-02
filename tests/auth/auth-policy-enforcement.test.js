const fs = require("fs");
const path = require("path");
const express = require("express");
const routes = require("../../services/auth-service/routes");

describe("auth-service policy enforcement", () => {
  let server;
  let baseUrl;
  let tempStorePath;

  async function requestJson(relativePath, options) {
    const response = await fetch(`${baseUrl}${relativePath}`, options);
    const body = await response.json().catch(() => ({}));
    return { status: response.status, body };
  }

  async function saveTenantPolicy(authPolicy) {
    return requestJson("/api/v1/admin/settings", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tenantKey: "citycare-hospital",
        settings: {
          routing: {
            authBaseUrl: "http://localhost:5101",
            notificationBaseUrl: "http://localhost:5102",
            appointmentBaseUrl: "http://localhost:5103",
          },
          ui: {
            lastTab: "identity",
          },
          authPolicy,
        },
      }),
    });
  }

  beforeAll(async () => {
    tempStorePath = path.join(__dirname, `tmp-auth-policy-${process.pid}-${Date.now()}.json`);
    process.env.AUTH_ADMIN_SETTINGS_STORE_PATH = tempStorePath;

    const app = express();
    app.use(express.json());
    app.use("/api/v1", routes);

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

    if (tempStorePath && fs.existsSync(tempStorePath)) {
      fs.unlinkSync(tempStorePath);
    }

    delete process.env.AUTH_ADMIN_SETTINGS_STORE_PATH;
  });

  test("allows password login when provider is enabled", async () => {
    const settingsResponse = await saveTenantPolicy({
      enabledProviders: ["email-password", "otp"],
      primaryProvider: "email-password",
      otpChannel: "email",
      mfaRequired: false,
      sessionTtlMinutes: 60,
      passwordMinLength: 8,
      allowSelfRegistration: false,
    });

    expect(settingsResponse.status).toBe(200);

    const loginResponse = await requestJson("/api/v1/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: "admin@citycare.example.com",
        password: "secret",
        role: "admin",
        tenantKey: "citycare-hospital",
      }),
    });

    expect(loginResponse.status).toBe(200);
    expect(loginResponse.body.token).toBeTruthy();
  });

  test("blocks password login when provider is disabled", async () => {
    const settingsResponse = await saveTenantPolicy({
      enabledProviders: ["google-oauth"],
      primaryProvider: "google-oauth",
      otpChannel: "email",
      mfaRequired: false,
      sessionTtlMinutes: 60,
      passwordMinLength: 8,
      allowSelfRegistration: false,
    });

    expect(settingsResponse.status).toBe(200);

    const loginResponse = await requestJson("/api/v1/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: "admin@citycare.example.com",
        password: "secret",
        role: "admin",
        tenantKey: "citycare-hospital",
      }),
    });

    expect(loginResponse.status).toBe(403);
    expect(loginResponse.body.code).toBe("AUTH_POLICY_PROVIDER_BLOCKED");
    expect(loginResponse.body.details.provider).toBe("email-password");
    expect(loginResponse.body.details.tenantKey).toBe("citycare-hospital");
    expect(loginResponse.body.audit.eventType).toBe("auth.policy.denied");
  });

  test("blocks Google callback when google-oauth is disabled", async () => {
    const settingsResponse = await saveTenantPolicy({
      enabledProviders: ["email-password"],
      primaryProvider: "email-password",
      otpChannel: "email",
      mfaRequired: false,
      sessionTtlMinutes: 60,
      passwordMinLength: 8,
      allowSelfRegistration: false,
    });

    expect(settingsResponse.status).toBe(200);

    const callbackResponse = await requestJson("/api/v1/auth/oauth/google/callback", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: "doctor@citycare.example.com",
        role: "doctor",
        tenantKey: "citycare-hospital",
      }),
    });

    expect(callbackResponse.status).toBe(403);
    expect(callbackResponse.body.code).toBe("AUTH_POLICY_PROVIDER_BLOCKED");
    expect(callbackResponse.body.details.provider).toBe("google-oauth");
  });

  test("returns provider readiness with policy-enabled flags", async () => {
    const settingsResponse = await saveTenantPolicy({
      enabledProviders: ["email-password", "otp"],
      primaryProvider: "email-password",
      otpChannel: "both",
      mfaRequired: true,
      sessionTtlMinutes: 120,
      passwordMinLength: 12,
      allowSelfRegistration: false,
    });

    expect(settingsResponse.status).toBe(200);

    const providersResponse = await requestJson(
      "/api/v1/auth/oauth/providers?tenantKey=citycare-hospital",
      {
        method: "GET",
      }
    );

    expect(providersResponse.status).toBe(200);
    expect(providersResponse.body.tenantKey).toBe("citycare-hospital");
    expect(Array.isArray(providersResponse.body.providers)).toBe(true);

    const googleProvider = providersResponse.body.providers.find((item) => item.key === "google-oauth");
    expect(googleProvider.policyEnabled).toBe(false);
  });
});
