const fs = require("fs");
const path = require("path");
const express = require("express");
const routes = require("../../services/auth-service/routes");

describe("auth-service admin settings auth policy", () => {
  let server;
  let baseUrl;
  let tempStorePath;

  async function requestJson(relativePath, options) {
    const response = await fetch(`${baseUrl}${relativePath}`, options);
    const body = await response.json().catch(() => ({}));
    return { status: response.status, body };
  }

  beforeAll(async () => {
    tempStorePath = path.join(
      __dirname,
      `tmp-admin-settings-${process.pid}-${Date.now()}.json`
    );

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

  test("validates auth policy payload without persistence", async () => {
    const response = await requestJson("/api/v1/admin/settings/auth-policy/validate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tenantKey: "citycare-hospital",
        authPolicy: {
          enabledProviders: ["email-password", "google-oauth"],
          primaryProvider: "google-oauth",
          otpChannel: "email",
          mfaRequired: true,
          sessionTtlMinutes: 90,
          passwordMinLength: 10,
          allowSelfRegistration: false,
        },
      }),
    });

    expect(response.status).toBe(200);
    expect(response.body.valid).toBe(true);
    expect(response.body.tenantKey).toBe("citycare-hospital");
    expect(response.body.authPolicy.primaryProvider).toBe("google-oauth");
  });

  test("rejects invalid auth policy payload", async () => {
    const response = await requestJson("/api/v1/admin/settings/auth-policy/validate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tenantKey: "citycare-hospital",
        authPolicy: {
          enabledProviders: ["invalid-provider"],
          primaryProvider: "invalid-provider",
          otpChannel: "pager",
          sessionTtlMinutes: 5,
          passwordMinLength: 3,
        },
      }),
    });

    expect(response.status).toBe(400);
    expect(response.body.valid).toBe(false);
    expect(Array.isArray(response.body.errors)).toBe(true);
    expect(response.body.errors.length).toBeGreaterThan(0);
  });

  test("persists normalized auth policy through admin settings", async () => {
    const saveResponse = await requestJson("/api/v1/admin/settings", {
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
          authPolicy: {
            enabledProviders: ["email-password", "otp"],
            primaryProvider: "email-password",
            otpChannel: "both",
            mfaRequired: true,
            sessionTtlMinutes: 120,
            passwordMinLength: 12,
            allowSelfRegistration: true,
          },
        },
      }),
    });

    expect(saveResponse.status).toBe(200);
    expect(saveResponse.body.settings.authPolicy.enabledProviders).toEqual([
      "email-password",
      "otp",
    ]);
    expect(saveResponse.body.settings.authPolicy.otpChannel).toBe("both");

    const fetchResponse = await requestJson(
      "/api/v1/admin/settings?tenantKey=citycare-hospital",
      {
        method: "GET",
      }
    );

    expect(fetchResponse.status).toBe(200);
    expect(fetchResponse.body.settings.authPolicy.sessionTtlMinutes).toBe(120);
    expect(fetchResponse.body.settings.authPolicy.passwordMinLength).toBe(12);
    expect(fetchResponse.body.settings.authPolicy.allowSelfRegistration).toBe(true);
  });
});
