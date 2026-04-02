const express = require("express");

const authRoutes = require("../../services/auth-service/routes");

describe("auth-service route surface coverage", () => {
  let server;
  let baseUrl;
  const originalGoogleClientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const originalGoogleClientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const originalAbhaClientId = process.env.ABHA_CLIENT_ID;
  const originalAbhaClientSecret = process.env.ABHA_CLIENT_SECRET;
  const originalAbhaGateway = process.env.ABHA_GATEWAY_BASE_URL;
  const originalAbhaEnabled = process.env.ABHA_ENABLED;

  async function requestJson(relativePath, options) {
    const response = await fetch(`${baseUrl}${relativePath}`, options);
    const body = await response.json().catch(() => ({}));
    return { status: response.status, body };
  }

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/v1", authRoutes);

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

    process.env.GOOGLE_OAUTH_CLIENT_ID = originalGoogleClientId;
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = originalGoogleClientSecret;
    process.env.ABHA_CLIENT_ID = originalAbhaClientId;
    process.env.ABHA_CLIENT_SECRET = originalAbhaClientSecret;
    process.env.ABHA_GATEWAY_BASE_URL = originalAbhaGateway;
    process.env.ABHA_ENABLED = originalAbhaEnabled;
  });

  test("supports role listing and register validation paths", async () => {
    const roles = await requestJson("/api/v1/auth/roles", {
      method: "GET",
    });

    expect(roles.status).toBe(200);
    expect(Array.isArray(roles.body.roles)).toBe(true);
    expect(roles.body.roles).toContain("doctor");

    const missingFields = await requestJson("/api/v1/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "u@example.com" }),
    });

    expect(missingFields.status).toBe(400);
    expect(missingFields.body.message).toContain("required");

    const unsupportedRole = await requestJson("/api/v1/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "u@example.com",
        password: "secret",
        role: "owner",
      }),
    });

    expect(unsupportedRole.status).toBe(400);
    expect(unsupportedRole.body.message).toContain("Unsupported role");

    const success = await requestJson("/api/v1/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "doctor@example.com",
        password: "secret",
        role: "doctor",
        tenantKey: "citycare-hospital",
      }),
    });

    expect(success.status).toBe(201);
    expect(success.body.userId).toBeTruthy();
  });

  test("returns oauth provider and google config readiness", async () => {
    process.env.GOOGLE_OAUTH_CLIENT_ID = "";
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = "";

    const providers = await requestJson("/api/v1/auth/oauth/providers?tenantKey=default", {
      method: "GET",
    });

    expect(providers.status).toBe(200);
    expect(Array.isArray(providers.body.providers)).toBe(true);
    expect(providers.body.providers.some((provider) => provider.key === "google-oauth")).toBe(true);

    const googleNotConfigured = await requestJson("/api/v1/auth/oauth/google/config-status", {
      method: "GET",
    });

    expect(googleNotConfigured.status).toBe(200);
    expect(googleNotConfigured.body.configured).toBe(false);

    process.env.GOOGLE_OAUTH_CLIENT_ID = "real-google-client-id";
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = "real-google-client-secret";

    const googleConfigured = await requestJson("/api/v1/auth/oauth/google/config-status", {
      method: "GET",
    });

    expect(googleConfigured.status).toBe(200);
    expect(googleConfigured.body.configured).toBe(true);
    expect(googleConfigured.body.hasClientId).toBe(true);
    expect(googleConfigured.body.hasClientSecret).toBe(true);
  });

  test("exposes ABHA and domain/admin config support routes", async () => {
    process.env.ABHA_ENABLED = "true";
    process.env.ABHA_CLIENT_ID = "";
    process.env.ABHA_CLIENT_SECRET = "";
    process.env.ABHA_GATEWAY_BASE_URL = "";

    const abhaConfig = await requestJson("/api/v1/platform/abha/config-status", {
      method: "GET",
    });

    expect(abhaConfig.status).toBe(200);
    expect(abhaConfig.body.enabled).toBe(true);
    expect(abhaConfig.body.configured).toBe(false);

    const abhaHealthMissing = await requestJson("/api/v1/platform/abha/health-check", {
      method: "GET",
    });

    expect(abhaHealthMissing.status).toBe(400);
    expect(abhaHealthMissing.body.checkId).toBeTruthy();
    expect(abhaHealthMissing.body.reachable).toBe(false);

    const abhaEvidence = await requestJson(
      "/api/v1/platform/abha/health-check/evidence?limit=5&outcome=unreachable",
      {
        method: "GET",
      }
    );

    expect(abhaEvidence.status).toBe(200);
    expect(abhaEvidence.body.outcomeFilter).toBe("unreachable");
    expect(abhaEvidence.body.totalRecorded).toBeGreaterThan(0);
    expect(abhaEvidence.body.summary.unreachableCount).toBeGreaterThan(0);
    expect(Array.isArray(abhaEvidence.body.events)).toBe(true);
    expect(abhaEvidence.body.automation.relatedEndpoints.healthCheck).toBe(
      "GET /api/v1/platform/abha/health-check"
    );

    const abhaOperationalReadiness = await requestJson(
      "/api/v1/platform/abha/operational-readiness",
      {
        method: "GET",
      }
    );

    expect(abhaOperationalReadiness.status).toBe(200);
    expect(abhaOperationalReadiness.body.enabled).toBe(true);
    expect(abhaOperationalReadiness.body.configured).toBe(false);
    expect(abhaOperationalReadiness.body.readinessStatus).toBe("at-risk");
    expect(abhaOperationalReadiness.body.diagnostics.healthCheckEvidenceEndpoint).toBe(
      "GET /api/v1/platform/abha/health-check/evidence"
    );
    expect(abhaOperationalReadiness.body.runbook.document).toBe(
      "docs/runbooks/abha-operational-readiness.md"
    );
    expect(Array.isArray(abhaOperationalReadiness.body.runbook.setupChecklist)).toBe(true);

    const storageMeta = await requestJson("/api/v1/admin/settings/storage", {
      method: "GET",
    });

    expect(storageMeta.status).toBe(200);
    expect(storageMeta.body.source).toBe("auth-service-json-store");
    expect(storageMeta.body.path).toBeTruthy();

    const domainConfig = await requestJson(
      "/api/v1/platform/domain-config?tenantKey=citycare-hospital",
      {
        method: "GET",
      }
    );

    expect(domainConfig.status).toBe(200);
    expect(domainConfig.body.tenant.tenantKey).toBe("citycare-hospital");

    const validateMissing = await requestJson("/api/v1/platform/domain-config/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantKey: "citycare-hospital" }),
    });

    expect(validateMissing.status).toBe(400);

    const validateAllowed = await requestJson("/api/v1/platform/domain-config/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenantKey: "citycare-hospital",
        origin: "https://citycare.example.com",
      }),
    });

    expect(validateAllowed.status).toBe(200);
    expect(validateAllowed.body.allowed).toBe(true);

    const fullDomain = await requestJson("/api/v1/platform/domain-config/all", {
      method: "GET",
    });

    expect(fullDomain.status).toBe(200);
    expect(fullDomain.body.platform).toBeTruthy();
    expect(Array.isArray(fullDomain.body.tenants)).toBe(true);
  });
});
