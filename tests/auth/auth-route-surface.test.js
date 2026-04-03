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
    expect(abhaOperationalReadiness.body.diagnostics.consentFlowSimulationEndpoint).toBe(
      "GET /api/v1/platform/abha/consent-flow/simulation"
    );
    expect(abhaOperationalReadiness.body.diagnostics.fallbackDecisionTelemetryEndpoint).toBe(
      "GET /api/v1/platform/abha/fallback-decision/telemetry"
    );
    expect(abhaOperationalReadiness.body.runbook.document).toBe(
      "docs/runbooks/abha-operational-readiness.md"
    );
    expect(Array.isArray(abhaOperationalReadiness.body.runbook.setupChecklist)).toBe(true);

    const abhaConsentSimulation = await requestJson(
      "/api/v1/platform/abha/consent-flow/simulation?tenantKey=citycare-hospital&scenario=gateway-timeout",
      {
        method: "GET",
      }
    );

    expect(abhaConsentSimulation.status).toBe(200);
    expect(abhaConsentSimulation.body.tenantKey).toBe("citycare-hospital");
    expect(abhaConsentSimulation.body.scenario).toBe("gateway-timeout");
    expect(abhaConsentSimulation.body.simulationStatus).toBe("at-risk");
    expect(Array.isArray(abhaConsentSimulation.body.steps)).toBe(true);
    expect(abhaConsentSimulation.body.evidence.healthCheckEvidenceEndpoint).toBe(
      "GET /api/v1/platform/abha/health-check/evidence"
    );

    const fallbackTelemetry = await requestJson(
      "/api/v1/platform/abha/fallback-decision/telemetry?tenantKey=citycare-hospital&scenario=gateway-timeout&limit=5",
      {
        method: "GET",
      }
    );

    expect(fallbackTelemetry.status).toBe(200);
    expect(fallbackTelemetry.body.tenantKey).toBe("citycare-hospital");
    expect(fallbackTelemetry.body.scenario).toBe("gateway-timeout");
    expect(fallbackTelemetry.body.latestDecision.decisionCode).toMatch(
      /ABHA_(GATEWAY_TIMEOUT|CONFIG_AT_RISK)_USE_BASELINE/
    );
    expect(fallbackTelemetry.body.latestDecision.shouldFallback).toBe(true);
    expect(fallbackTelemetry.body.summary.totalCount).toBeGreaterThan(0);
    expect(fallbackTelemetry.body.summary.fallbackCount).toBeGreaterThan(0);
    expect(Array.isArray(fallbackTelemetry.body.events)).toBe(true);
    expect(fallbackTelemetry.body.diagnostics.consentSimulationEndpoint).toBe(
      "GET /api/v1/platform/abha/consent-flow/simulation"
    );

    const blockedTransaction = await requestJson("/api/v1/platform/abha/transactions/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenantKey: "citycare-hospital",
        dryRun: true,
        consent: {
          granted: false,
        },
        resourceType: "health-record",
        payload: {
          summary: "No consent path",
        },
      }),
    });

    expect(blockedTransaction.status).toBe(403);
    expect(blockedTransaction.body.status).toBe("blocked");
    expect(blockedTransaction.body.error).toBe("ABHA_CONSENT_REQUIRED");

    const fallbackTransaction = await requestJson("/api/v1/platform/abha/transactions/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenantKey: "citycare-hospital",
        dryRun: true,
        consent: {
          granted: true,
          consentId: "consent-citycare-fallback",
        },
        resourceType: "health-record",
        payload: {
          summary: "Fallback expected",
        },
      }),
    });

    expect(fallbackTransaction.status).toBe(202);
    expect(fallbackTransaction.body.status).toBe("fallback");

    process.env.ABHA_CLIENT_ID = "real-abha-client-id";
    process.env.ABHA_CLIENT_SECRET = "real-abha-client-secret";
    process.env.ABHA_GATEWAY_BASE_URL = "https://abha-gateway.citycare.internal";

    const simulatedReadTransaction = await requestJson("/api/v1/platform/abha/transactions/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenantKey: "citycare-hospital",
        dryRun: true,
        fallbackScenario: "happy-path",
        consent: {
          granted: true,
          consentId: "consent-citycare-read",
          purpose: "opd-followup-review",
        },
        resourceType: "health-record",
        resourceId: "hr-1001",
        payload: {
          summary: "Review blood pressure trend",
          clinicianId: "cln-42",
        },
      }),
    });

    expect(simulatedReadTransaction.status).toBe(200);
    expect(simulatedReadTransaction.body.status).toBe("simulated");
    expect(simulatedReadTransaction.body.operation).toBe("read");
    expect(simulatedReadTransaction.body.abha.primaryPathEligible).toBe(true);
    expect(simulatedReadTransaction.body.requestMeta.dataKeyCount).toBeGreaterThan(0);

    const simulatedWriteTransaction = await requestJson(
      "/api/v1/platform/abha/transactions/write",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantKey: "citycare-hospital",
          dryRun: true,
          fallbackScenario: "happy-path",
          consent: {
            granted: true,
            consentId: "consent-citycare-write",
            purpose: "clinical-note-sync",
          },
          resourceType: "clinical-note",
          resourceId: "note-77",
          payload: {
            noteCode: "NOTE-77",
            updatedBy: "dr-rao",
          },
        }),
      }
    );

    expect(simulatedWriteTransaction.status).toBe(200);
    expect(simulatedWriteTransaction.body.status).toBe("simulated");
    expect(simulatedWriteTransaction.body.operation).toBe("write");

    const transactionEvidence = await requestJson(
      "/api/v1/platform/abha/transactions/evidence?tenantKey=citycare-hospital&operation=read&status=simulated&limit=5",
      {
        method: "GET",
      }
    );

    expect(transactionEvidence.status).toBe(200);
    expect(transactionEvidence.body.operationFilter).toBe("read");
    expect(transactionEvidence.body.statusFilter).toBe("simulated");
    expect(Array.isArray(transactionEvidence.body.events)).toBe(true);
    expect(transactionEvidence.body.summary.simulatedCount).toBeGreaterThan(0);
    expect(transactionEvidence.body.summary.readCount).toBeGreaterThan(0);
    expect(transactionEvidence.body.summary.totalCount).toBeGreaterThan(0);
    expect(transactionEvidence.body.automation.relatedEndpoints.read).toBe(
      "POST /api/v1/platform/abha/transactions/read"
    );

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
