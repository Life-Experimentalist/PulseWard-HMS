const express = require("express");
const { createHash, createHmac } = require("crypto");

const notificationRoutes = require("../../services/notification-service/routes");

describe("notification webhook delivery diagnostics", () => {
  let server;
  let baseUrl;
  const originalWebhookEndpoint = process.env.INTEGRATION_WEBHOOK_ENDPOINT;
  const originalWebhookSigningSecret = process.env.INTEGRATION_WEBHOOK_SIGNING_SECRET;
  const originalFaultEvidenceSigningSecret = process.env.INTEGRATION_FAULT_EVIDENCE_SIGNING_SECRET;

  async function requestJson(relativePath, options) {
    const response = await fetch(`${baseUrl}${relativePath}`, options);
    const body = await response.json().catch(() => ({}));
    return { status: response.status, body };
  }

  async function requestText(relativePath, options) {
    const response = await fetch(`${baseUrl}${relativePath}`, options);
    const body = await response.text();
    return { status: response.status, body, headers: response.headers };
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

    if (originalFaultEvidenceSigningSecret === undefined) {
      delete process.env.INTEGRATION_FAULT_EVIDENCE_SIGNING_SECRET;
    } else {
      process.env.INTEGRATION_FAULT_EVIDENCE_SIGNING_SECRET = originalFaultEvidenceSigningSecret;
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

  test("simulates messaging fault injection and lists telemetry events", async () => {
    const simulated = await requestJson(
      "/api/v1/integrations/messaging/fault-injection/simulate?tenantKey=default&providerKey=generic-webhook&scenario=provider-5xx",
      {
        method: "GET",
      }
    );

    expect(simulated.status).toBe(200);
    expect(simulated.body.tenantKey).toBe("default");
    expect(simulated.body.providerKey).toBe("generic-webhook");
    expect(simulated.body.scenario).toBe("provider-5xx");
    expect(simulated.body.simulation.classification).toBe("retryable");
    expect(simulated.body.simulation.expectedAction).toContain("retry");
    expect(simulated.body.diagnostics.eventsEndpoint).toBe(
      "GET /api/v1/integrations/messaging/fault-injection/events"
    );

    const events = await requestJson(
      "/api/v1/integrations/messaging/fault-injection/events?tenantKey=default&providerKey=generic-webhook&limit=5",
      {
        method: "GET",
      }
    );

    expect(events.status).toBe(200);
    expect(events.body.totalRecorded).toBeGreaterThan(0);
    expect(events.body.returned).toBeGreaterThan(0);
    expect(events.body.summary.totalCount).toBeGreaterThan(0);
    expect(Array.isArray(events.body.events)).toBe(true);
    expect(events.body.events[0].providerKey).toBe("generic-webhook");
    expect(events.body.diagnostics.retentionApplyEndpoint).toBe(
      "POST /api/v1/integrations/messaging/fault-injection/retention/apply"
    );
  });

  test("exports fault-injection evidence and applies retention controls", async () => {
    await requestJson(
      "/api/v1/integrations/messaging/fault-injection/simulate?tenantKey=default&providerKey=generic-webhook&scenario=network-timeout",
      {
        method: "GET",
      }
    );

    await requestJson(
      "/api/v1/integrations/messaging/fault-injection/simulate?tenantKey=default&providerKey=generic-webhook&scenario=rate-limit",
      {
        method: "GET",
      }
    );

    const retentionBefore = await requestJson(
      "/api/v1/integrations/messaging/fault-injection/retention",
      {
        method: "GET",
      }
    );

    expect(retentionBefore.status).toBe(200);
    expect(retentionBefore.body.retention.maxEvents).toBeGreaterThanOrEqual(10);
    expect(retentionBefore.body.telemetry.totalRecorded).toBeGreaterThan(0);

    const applied = await requestJson(
      "/api/v1/integrations/messaging/fault-injection/retention/apply",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          maxEvents: 2,
          pruneNow: true,
        }),
      }
    );

    expect(applied.status).toBe(200);
    expect(applied.body.retention.maxEvents).toBe(10);
    expect(applied.body.retention.pruneStrategy).toBe("drop-oldest");
    expect(applied.body.diagnostics.statusEndpoint).toBe(
      "GET /api/v1/integrations/messaging/fault-injection/retention"
    );

    const exportJson = await requestJson(
      "/api/v1/integrations/messaging/fault-injection/export?tenantKey=default&providerKey=generic-webhook&format=json&limit=20",
      {
        method: "GET",
      }
    );

    expect(exportJson.status).toBe(200);
    expect(exportJson.body.format).toBe("json");
    expect(exportJson.body.retention.maxEvents).toBe(10);
    expect(Array.isArray(exportJson.body.events)).toBe(true);
    expect(exportJson.body.diagnostics.retentionEndpoint).toBe(
      "GET /api/v1/integrations/messaging/fault-injection/retention"
    );

    const exportCsv = await requestText(
      "/api/v1/integrations/messaging/fault-injection/export?tenantKey=default&providerKey=generic-webhook&format=csv&limit=5",
      {
        method: "GET",
      }
    );

    expect(exportCsv.status).toBe(200);
    expect(exportCsv.headers.get("content-type")).toContain("text/csv");
    expect(exportCsv.body).toContain("eventId,occurredAt,tenantKey,providerKey");

    const invalidApply = await requestJson(
      "/api/v1/integrations/messaging/fault-injection/retention/apply",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          pruneNow: true,
        }),
      }
    );

    expect(invalidApply.status).toBe(400);
    expect(invalidApply.body.code).toBe("NOTIFICATION_FAULT_RETENTION_MAX_REQUIRED");
  });

  test("builds signed fault-injection evidence manifest for incident handoff", async () => {
    process.env.INTEGRATION_FAULT_EVIDENCE_SIGNING_SECRET = "m5-7-evidence-signing-secret";
    const manifestNonce = "incident-2026-04-03";

    await requestJson(
      "/api/v1/integrations/messaging/fault-injection/simulate?tenantKey=default&providerKey=generic-webhook&scenario=provider-5xx",
      {
        method: "GET",
      }
    );

    const manifest = await requestJson(
      `/api/v1/integrations/messaging/fault-injection/manifest?tenantKey=default&providerKey=generic-webhook&limit=10&includeEvents=true&nonce=${encodeURIComponent(
        manifestNonce
      )}`,
      {
        method: "GET",
      }
    );

    expect(manifest.status).toBe(200);
    expect(manifest.body.signatureStatus).toBe("signed");
    expect(manifest.body.signer.algorithm).toBe("hmac-sha256");
    expect(manifest.body.signer.secretSource).toBe("INTEGRATION_FAULT_EVIDENCE_SIGNING_SECRET");
    expect(manifest.body.digest.algorithm).toBe("sha256");
    expect(manifest.body.digest.value).toHaveLength(64);
    expect(manifest.body.manifestVersion).toBe("m5.9.v1");
    expect(manifest.body.replayDefense.issuedAt).toBe(manifest.body.generatedAt);
    expect(manifest.body.replayDefense.nonce).toBe(manifestNonce);
    expect(manifest.body.replayDefense.maxAgeSeconds).toBeGreaterThan(0);
    expect(manifest.body.signature).toContain("sha256=");
    expect(manifest.body.evidence.returned).toBeGreaterThan(0);
    expect(Array.isArray(manifest.body.evidence.eventIds)).toBe(true);
    expect(Array.isArray(manifest.body.eventDigests)).toBe(true);
    expect(Array.isArray(manifest.body.events)).toBe(true);
    expect(manifest.body.diagnostics.exportEndpoint).toBe(
      "GET /api/v1/integrations/messaging/fault-injection/export"
    );

    const expectedSignature = `sha256=${createHmac("sha256", "m5-7-evidence-signing-secret")
      .update(manifest.body.digest.value, "utf8")
      .digest("hex")}`;
    expect(manifest.body.signature).toBe(expectedSignature);

    const verified = await requestJson(
      "/api/v1/integrations/messaging/fault-injection/manifest/verify",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tenantKey: "default",
          providerKey: "generic-webhook",
          limit: 10,
          manifestVersion: manifest.body.manifestVersion,
          issuedAt: manifest.body.replayDefense.issuedAt,
          nonce: manifest.body.replayDefense.nonce,
          expectedNonce: manifestNonce,
          digest: manifest.body.digest.value,
          signature: manifest.body.signature,
        }),
      }
    );

    expect(verified.status).toBe(200);
    expect(verified.body.valid).toBe(true);
    expect(verified.body.checks.versionMatch).toBe(true);
    expect(verified.body.checks.digestMatch).toBe(true);
    expect(verified.body.checks.signatureMatch).toBe(true);
    expect(verified.body.checks.signingConfigured).toBe(true);
    expect(verified.body.checks.freshnessMatch).toBe(true);
    expect(verified.body.checks.nonceMatch).toBe(true);
    expect(verified.body.replayAttempt.duplicateSuppressed).toBe(false);
    expect(verified.body.replayAttempt.suppressCount).toBe(0);
    expect(verified.body.diagnostics.replayAttemptsEndpoint).toBe(
      "GET /api/v1/integrations/messaging/fault-injection/manifest/verify/attempts"
    );
    expect(verified.body.diagnostics.replayAttemptsExportEndpoint).toBe(
      "GET /api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/export"
    );
    expect(verified.body.diagnostics.replayAttemptsRetentionEndpoint).toBe(
      "GET /api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/retention"
    );
    expect(verified.body.diagnostics.replayAttemptsRetentionApplyEndpoint).toBe(
      "POST /api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/retention/apply"
    );
    expect(verified.body.diagnostics.retentionSaturationEndpoint).toBe(
      "GET /api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/retention"
    );
    expect(verified.body.diagnostics.retentionSaturationPath).toBe("telemetry.saturation");
    expect(verified.body.diagnostics.retentionSaturationTrendEndpoint).toBe(
      "GET /api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/retention/saturation-trend"
    );
    expect(verified.body.diagnostics.retentionSaturationTrendPath).toBe(
      "telemetry.saturationTrend"
    );
    expect(verified.body.diagnostics.manifestEndpoint).toBe(
      "GET /api/v1/integrations/messaging/fault-injection/manifest"
    );

    const duplicate = await requestJson(
      "/api/v1/integrations/messaging/fault-injection/manifest/verify",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tenantKey: "default",
          providerKey: "generic-webhook",
          limit: 10,
          manifestVersion: manifest.body.manifestVersion,
          issuedAt: manifest.body.replayDefense.issuedAt,
          nonce: manifest.body.replayDefense.nonce,
          expectedNonce: manifestNonce,
          digest: manifest.body.digest.value,
          signature: manifest.body.signature,
        }),
      }
    );

    expect(duplicate.status).toBe(200);
    expect(duplicate.body.valid).toBe(true);
    expect(duplicate.body.replayAttempt.duplicateSuppressed).toBe(true);
    expect(duplicate.body.replayAttempt.suppressCount).toBe(1);
    expect(duplicate.body.replayAttempt.attemptId).toBe(verified.body.replayAttempt.attemptId);
    expect(duplicate.body.replayAttempt.fingerprint).toBe(verified.body.replayAttempt.fingerprint);

    const auditByFingerprint = await requestJson(
      `/api/v1/integrations/messaging/fault-injection/manifest/verify/attempts?fingerprint=${encodeURIComponent(
        verified.body.replayAttempt.fingerprint
      )}&duplicateSuppressed=true&limit=10`,
      {
        method: "GET",
      }
    );

    expect(auditByFingerprint.status).toBe(200);
    expect(auditByFingerprint.body.totalMatched).toBeGreaterThanOrEqual(1);
    expect(auditByFingerprint.body.summary.totalSuppressedEvents).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(auditByFingerprint.body.attempts)).toBe(true);
    expect(auditByFingerprint.body.attempts[0].attemptId).toBe(
      verified.body.replayAttempt.attemptId
    );
    expect(auditByFingerprint.body.attempts[0].fingerprint).toBe(
      verified.body.replayAttempt.fingerprint
    );
    expect(auditByFingerprint.body.attempts[0].duplicateSuppressed).toBe(true);
    expect(auditByFingerprint.body.attempts[0].suppressCount).toBeGreaterThanOrEqual(1);
    expect(auditByFingerprint.body.diagnostics.retentionEndpoint).toBe(
      "GET /api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/retention"
    );
    expect(auditByFingerprint.body.diagnostics.retentionApplyEndpoint).toBe(
      "POST /api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/retention/apply"
    );
    expect(auditByFingerprint.body.diagnostics.retentionSaturationEndpoint).toBe(
      "GET /api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/retention"
    );
    expect(auditByFingerprint.body.diagnostics.retentionSaturationPath).toBe(
      "telemetry.saturation"
    );
    expect(auditByFingerprint.body.diagnostics.retentionSaturationTrendEndpoint).toBe(
      "GET /api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/retention/saturation-trend"
    );
    expect(auditByFingerprint.body.diagnostics.retentionSaturationTrendPath).toBe(
      "telemetry.saturationTrend"
    );

    const attemptsExportJson = await requestJson(
      `/api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/export?fingerprint=${encodeURIComponent(
        verified.body.replayAttempt.fingerprint
      )}&duplicateSuppressed=true&limit=10`,
      {
        method: "GET",
      }
    );

    expect(attemptsExportJson.status).toBe(200);
    expect(attemptsExportJson.body.format).toBe("json");
    expect(attemptsExportJson.body.totalMatched).toBeGreaterThanOrEqual(1);
    expect(attemptsExportJson.body.summary.totalSuppressedEvents).toBeGreaterThanOrEqual(1);
    expect(attemptsExportJson.body.diagnostics.attemptsEndpoint).toBe(
      "GET /api/v1/integrations/messaging/fault-injection/manifest/verify/attempts"
    );
    expect(attemptsExportJson.body.diagnostics.retentionEndpoint).toBe(
      "GET /api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/retention"
    );
    expect(attemptsExportJson.body.diagnostics.retentionApplyEndpoint).toBe(
      "POST /api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/retention/apply"
    );
    expect(attemptsExportJson.body.diagnostics.retentionSaturationEndpoint).toBe(
      "GET /api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/retention"
    );
    expect(attemptsExportJson.body.diagnostics.retentionSaturationPath).toBe(
      "telemetry.saturation"
    );
    expect(attemptsExportJson.body.diagnostics.retentionSaturationTrendEndpoint).toBe(
      "GET /api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/retention/saturation-trend"
    );
    expect(attemptsExportJson.body.diagnostics.retentionSaturationTrendPath).toBe(
      "telemetry.saturationTrend"
    );
    expect(Array.isArray(attemptsExportJson.body.attempts)).toBe(true);

    const attemptsExportCsv = await requestText(
      `/api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/export?fingerprint=${encodeURIComponent(
        verified.body.replayAttempt.fingerprint
      )}&duplicateSuppressed=true&format=csv&limit=10`,
      {
        method: "GET",
      }
    );

    expect(attemptsExportCsv.status).toBe(200);
    expect(attemptsExportCsv.headers.get("content-type")).toContain("text/csv");
    expect(attemptsExportCsv.body).toContain("attemptId,fingerprint,firstVerifiedAt");
    expect(attemptsExportCsv.body).toContain(verified.body.replayAttempt.attemptId);

    const tampered = await requestJson(
      "/api/v1/integrations/messaging/fault-injection/manifest/verify",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tenantKey: "default",
          providerKey: "generic-webhook",
          limit: 10,
          manifestVersion: manifest.body.manifestVersion,
          issuedAt: manifest.body.replayDefense.issuedAt,
          nonce: manifest.body.replayDefense.nonce,
          expectedNonce: manifestNonce,
          digest: "sha256=0000000000000000000000000000000000000000000000000000000000000000",
          signature: manifest.body.signature,
        }),
      }
    );

    expect(tampered.status).toBe(200);
    expect(tampered.body.valid).toBe(false);
    expect(tampered.body.checks.digestMatch).toBe(false);

    const nonceMismatch = await requestJson(
      "/api/v1/integrations/messaging/fault-injection/manifest/verify",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tenantKey: "default",
          providerKey: "generic-webhook",
          limit: 10,
          manifestVersion: manifest.body.manifestVersion,
          issuedAt: manifest.body.replayDefense.issuedAt,
          nonce: manifest.body.replayDefense.nonce,
          expectedNonce: "incident-2026-04-03-mismatch",
          digest: manifest.body.digest.value,
          signature: manifest.body.signature,
        }),
      }
    );

    expect(nonceMismatch.status).toBe(200);
    expect(nonceMismatch.body.valid).toBe(false);
    expect(nonceMismatch.body.checks.nonceMatch).toBe(false);

    const staleIssuedAt = new Date(Date.now() - 3600 * 1000).toISOString();
    const staleDigestPayload = {
      filters: manifest.body.evidence.filters,
      totalMatched: manifest.body.evidence.totalMatched,
      returned: manifest.body.evidence.returned,
      summary: manifest.body.evidence.summary,
      retention: manifest.body.evidence.retention,
      eventDigests: manifest.body.eventDigests,
      replayDefense: {
        issuedAt: staleIssuedAt,
        nonce: manifestNonce,
      },
    };
    const staleDigest = createHash("sha256")
      .update(JSON.stringify(staleDigestPayload), "utf8")
      .digest("hex");
    const staleSignature = `sha256=${createHmac("sha256", "m5-7-evidence-signing-secret")
      .update(staleDigest, "utf8")
      .digest("hex")}`;

    const stale = await requestJson(
      "/api/v1/integrations/messaging/fault-injection/manifest/verify",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tenantKey: "default",
          providerKey: "generic-webhook",
          limit: 10,
          manifestVersion: manifest.body.manifestVersion,
          issuedAt: staleIssuedAt,
          maxAgeSeconds: 300,
          nonce: manifestNonce,
          expectedNonce: manifestNonce,
          digest: staleDigest,
          signature: staleSignature,
        }),
      }
    );

    expect(stale.status).toBe(200);
    expect(stale.body.valid).toBe(false);
    expect(stale.body.checks.digestMatch).toBe(true);
    expect(stale.body.checks.signatureMatch).toBe(true);
    expect(stale.body.checks.freshnessMatch).toBe(false);

    const attemptsRetentionStatus = await requestJson(
      "/api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/retention",
      {
        method: "GET",
      }
    );

    expect(attemptsRetentionStatus.status).toBe(200);
    expect(attemptsRetentionStatus.body.retention.dedupeWindowSeconds).toBeGreaterThanOrEqual(30);
    expect(attemptsRetentionStatus.body.retention.maxEntries).toBeGreaterThanOrEqual(50);
    expect(attemptsRetentionStatus.body.telemetry.totalRecorded).toBeGreaterThanOrEqual(1);
    expect(attemptsRetentionStatus.body.telemetry.saturation.currentEntries).toBe(
      attemptsRetentionStatus.body.telemetry.totalRecorded
    );
    expect(
      attemptsRetentionStatus.body.telemetry.saturation.utilizationPercent
    ).toBeGreaterThanOrEqual(0);
    expect(
      attemptsRetentionStatus.body.telemetry.saturation.utilizationPercent
    ).toBeLessThanOrEqual(100);
    expect(["normal", "warning", "critical"]).toContain(
      attemptsRetentionStatus.body.telemetry.saturation.alertLevel
    );
    expect(
      attemptsRetentionStatus.body.telemetry.saturation.recommendedAction.length
    ).toBeGreaterThan(0);
    expect(attemptsRetentionStatus.body.diagnostics.applyEndpoint).toBe(
      "POST /api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/retention/apply"
    );
    expect(attemptsRetentionStatus.body.diagnostics.retentionSaturationEndpoint).toBe(
      "GET /api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/retention"
    );
    expect(attemptsRetentionStatus.body.diagnostics.retentionSaturationPath).toBe(
      "telemetry.saturation"
    );
    expect(attemptsRetentionStatus.body.diagnostics.retentionSaturationTrendEndpoint).toBe(
      "GET /api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/retention/saturation-trend"
    );
    expect(attemptsRetentionStatus.body.diagnostics.retentionSaturationTrendPath).toBe(
      "telemetry.saturationTrend"
    );
    expect(attemptsRetentionStatus.body.diagnostics.retentionEscalationPath).toBe(
      "telemetry.escalation"
    );
    expect(attemptsRetentionStatus.body.telemetry.saturationTrend.summary.windowMinutes).toBe(60);
    expect(attemptsRetentionStatus.body.telemetry.saturationTrend.summary.requestedLimit).toBe(24);
    expect(
      attemptsRetentionStatus.body.telemetry.saturationTrend.summary.totalInWindow
    ).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(attemptsRetentionStatus.body.telemetry.saturationTrend.snapshots)).toBe(
      true
    );
    expect(attemptsRetentionStatus.body.telemetry.saturationTrend.snapshots.length).toBeGreaterThan(
      0
    );
    expect(Array.isArray(attemptsRetentionStatus.body.telemetry.anomalies)).toBe(true);
    expect(
      [null, "warning", "critical"].includes(
        attemptsRetentionStatus.body.telemetry.highestAnomalySeverity
      )
    ).toBe(true);

    const attemptsRetentionApplied = await requestJson(
      "/api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/retention/apply",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          dedupeWindowSeconds: 300,
          maxEntries: 300,
          pruneNow: true,
        }),
      }
    );

    expect(attemptsRetentionApplied.status).toBe(200);
    expect(attemptsRetentionApplied.body.retention.dedupeWindowSeconds).toBe(300);
    expect(attemptsRetentionApplied.body.retention.maxEntries).toBe(300);
    expect(attemptsRetentionApplied.body.retention.source).toBe("api");
    expect(attemptsRetentionApplied.body.telemetry.saturation.currentEntries).toBe(
      attemptsRetentionApplied.body.telemetry.totalRecorded
    );
    expect(["normal", "warning", "critical"]).toContain(
      attemptsRetentionApplied.body.telemetry.saturation.alertLevel
    );
    expect(
      attemptsRetentionApplied.body.telemetry.saturation.recommendedAction.length
    ).toBeGreaterThan(0);
    expect(attemptsRetentionApplied.body.diagnostics.statusEndpoint).toBe(
      "GET /api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/retention"
    );
    expect(attemptsRetentionApplied.body.diagnostics.retentionSaturationEndpoint).toBe(
      "GET /api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/retention"
    );
    expect(attemptsRetentionApplied.body.diagnostics.retentionSaturationPath).toBe(
      "telemetry.saturation"
    );
    expect(attemptsRetentionApplied.body.diagnostics.retentionSaturationTrendEndpoint).toBe(
      "GET /api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/retention/saturation-trend"
    );
    expect(attemptsRetentionApplied.body.diagnostics.retentionSaturationTrendPath).toBe(
      "telemetry.saturationTrend"
    );
    expect(attemptsRetentionApplied.body.diagnostics.retentionEscalationPath).toBe(
      "telemetry.escalation"
    );
    expect(attemptsRetentionApplied.body.telemetry.saturationTrend.summary.windowMinutes).toBe(60);
    expect(attemptsRetentionApplied.body.telemetry.saturationTrend.summary.requestedLimit).toBe(24);
    expect(
      attemptsRetentionApplied.body.telemetry.saturationTrend.summary.totalInWindow
    ).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(attemptsRetentionApplied.body.telemetry.anomalies)).toBe(true);
    expect(
      [null, "warning", "critical"].includes(
        attemptsRetentionApplied.body.telemetry.highestAnomalySeverity
      )
    ).toBe(true);

    const attemptsRetentionTrend = await requestJson(
      "/api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/retention/saturation-trend?windowMinutes=60&limit=2",
      {
        method: "GET",
      }
    );

    expect(attemptsRetentionTrend.status).toBe(200);
    expect(attemptsRetentionTrend.body.query.windowMinutes).toBe(60);
    expect(attemptsRetentionTrend.body.query.limit).toBe(2);
    expect(attemptsRetentionTrend.body.summary.windowMinutes).toBe(60);
    expect(attemptsRetentionTrend.body.summary.requestedLimit).toBe(2);
    expect(attemptsRetentionTrend.body.summary.returned).toBeLessThanOrEqual(2);
    expect(attemptsRetentionTrend.body.summary.totalInWindow).toBeGreaterThanOrEqual(
      attemptsRetentionTrend.body.summary.returned
    );
    expect(attemptsRetentionTrend.body.summary.hasMore).toBe(
      attemptsRetentionTrend.body.summary.totalInWindow >
        attemptsRetentionTrend.body.summary.returned
    );
    expect(Array.isArray(attemptsRetentionTrend.body.snapshots)).toBe(true);
    expect(Array.isArray(attemptsRetentionTrend.body.summary.anomalies)).toBe(true);
    expect(
      [null, "warning", "critical"].includes(
        attemptsRetentionTrend.body.summary.highestAnomalySeverity
      )
    ).toBe(true);
    if (attemptsRetentionTrend.body.snapshots.length > 0) {
      expect(Date.parse(attemptsRetentionTrend.body.snapshots[0].capturedAt)).not.toBeNaN();
      expect(["normal", "warning", "critical"]).toContain(
        attemptsRetentionTrend.body.snapshots[attemptsRetentionTrend.body.snapshots.length - 1]
          .alertLevel
      );
    }
    expect(attemptsRetentionTrend.body.diagnostics.retentionSaturationPath).toBe(
      "latestSaturation"
    );
    expect(attemptsRetentionTrend.body.diagnostics.retentionSaturationTrendPath).toBe("snapshots");
    expect(attemptsRetentionTrend.body.diagnostics.retentionEscalationPath).toBe(
      "summary.escalation"
    );

    const anomalyRetentionApplied = await requestJson(
      "/api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/retention/apply",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          dedupeWindowSeconds: 600,
          maxEntries: 60,
          pruneNow: false,
        }),
      }
    );

    expect(anomalyRetentionApplied.status).toBe(200);
    expect(anomalyRetentionApplied.body.retention.maxEntries).toBe(60);

    for (let index = 0; index < 50; index += 1) {
      await requestJson("/api/v1/integrations/messaging/fault-injection/manifest/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tenantKey: "default",
          providerKey: "generic-webhook",
          limit: 10,
          manifestVersion: manifest.body.manifestVersion,
          issuedAt: manifest.body.replayDefense.issuedAt,
          nonce: manifest.body.replayDefense.nonce,
          expectedNonce: `incident-2026-04-03-anomaly-${index}`,
          digest: manifest.body.digest.value,
          signature: manifest.body.signature,
        }),
      });
    }

    await requestJson(
      "/api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/retention?windowMinutes=60&limit=200",
      {
        method: "GET",
      }
    );
    await requestJson(
      "/api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/retention?windowMinutes=60&limit=200",
      {
        method: "GET",
      }
    );
    const anomalyRetentionStatus = await requestJson(
      "/api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/retention?windowMinutes=60&limit=200",
      {
        method: "GET",
      }
    );

    expect(anomalyRetentionStatus.status).toBe(200);
    expect(Array.isArray(anomalyRetentionStatus.body.telemetry.anomalies)).toBe(true);
    expect(anomalyRetentionStatus.body.telemetry.anomalyTracking.statePersistence).toBe(
      "memory-only"
    );
    expect(anomalyRetentionStatus.body.diagnostics.retentionAnomalyTriageEndpointTemplate).toBe(
      "POST /api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/retention/anomalies/{anomalyInstanceId}/triage"
    );

    const anomalyTrendStatus = await requestJson(
      "/api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/retention/saturation-trend?windowMinutes=60&limit=200",
      {
        method: "GET",
      }
    );

    expect(anomalyTrendStatus.status).toBe(200);
    expect(Array.isArray(anomalyTrendStatus.body.summary.anomalies)).toBe(true);
    expect(anomalyTrendStatus.body.summary.anomalies.length).toBeGreaterThan(0);
    expect(["warning", "critical"]).toContain(
      anomalyTrendStatus.body.summary.highestAnomalySeverity
    );

    const anomalyKeys = anomalyTrendStatus.body.summary.anomalies.map((item) => item.key);
    expect(
      anomalyKeys.some((key) => key === "sustained-warning" || key === "sustained-critical")
    ).toBe(true);

    anomalyTrendStatus.body.summary.anomalies.forEach((item) => {
      expect(["sustained-warning", "sustained-critical", "accelerating-utilization"]).toContain(
        item.key
      );
      expect(["warning", "critical"]).toContain(item.severity);
      expect(item.recommendedAction.length).toBeGreaterThan(0);
      expect(typeof item.anomalyInstanceId).toBe("string");
      expect(item.anomalyInstanceId.length).toBeGreaterThan(10);
      expect(["active", "cleared"]).toContain(item.status);
      expect(typeof item.triage).toBe("object");
      expect(typeof item.triage.notesCount).toBe("number");
      expect(typeof item.triage.acknowledged).toBe("boolean");
      expect(typeof item.escalation).toBe("object");
      expect(typeof item.escalation.state).toBe("string");
    });

    expect(anomalyTrendStatus.body.summary.anomalyTracking.statePersistence).toBe("memory-only");
    expect(anomalyTrendStatus.body.diagnostics.retentionAnomalyTriageEndpointTemplate).toBe(
      "POST /api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/retention/anomalies/{anomalyInstanceId}/triage"
    );

    const triageTarget = anomalyTrendStatus.body.summary.anomalies[0];

    const escalationPolicyApplied = await requestJson(
      "/api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/retention/apply?windowMinutes=60&limit=200",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          dedupeWindowSeconds: 600,
          maxEntries: 60,
          pruneNow: false,
          escalationPolicy: {
            enabled: true,
            warningUnacknowledgedEscalateAfterSeconds: 0,
            criticalUnacknowledgedEscalateAfterSeconds: 0,
            criticalUnmitigatedEscalateAfterSeconds: 0,
            mitigationNoteTypes: ["mitigation-plan", "status-update"],
            autoDeescalateOnMitigation: true,
          },
        }),
      }
    );

    expect(escalationPolicyApplied.status).toBe(200);
    expect(escalationPolicyApplied.body.retention.escalationPolicyChanged).toBe(true);
    expect(
      escalationPolicyApplied.body.telemetry.escalation.activeEscalations
    ).toBeGreaterThanOrEqual(1);

    const escalatedTrendStatus = await requestJson(
      "/api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/retention/saturation-trend?windowMinutes=60&limit=200",
      {
        method: "GET",
      }
    );

    expect(escalatedTrendStatus.status).toBe(200);
    const escalatedTarget = escalatedTrendStatus.body.summary.anomalies.find(
      (item) => item.anomalyInstanceId === triageTarget.anomalyInstanceId
    );
    expect(escalatedTarget).toBeTruthy();
    expect(escalatedTarget.escalation.state.startsWith("escalated-")).toBe(true);

    const triageAcknowledge = await requestJson(
      `/api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/retention/anomalies/${encodeURIComponent(
        triageTarget.anomalyInstanceId
      )}/triage`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          acknowledge: true,
          acknowledgedBy: "ops-oncall@pulseward",
          note: "Capacity tuning planned for this shift.",
          noteType: "mitigation-plan",
          mitigationApplied: true,
          mitigationType: "retention-tuning",
          mitigationEvidenceRef: "INC-2026-04-03-m5-18",
        }),
      }
    );

    expect(triageAcknowledge.status).toBe(200);
    expect(triageAcknowledge.body.anomaly.anomalyInstanceId).toBe(triageTarget.anomalyInstanceId);
    expect(triageAcknowledge.body.anomaly.triage.acknowledged).toBe(true);
    expect(triageAcknowledge.body.anomaly.triage.acknowledgedBy).toBe("ops-oncall@pulseward");
    expect(triageAcknowledge.body.anomaly.triage.notesCount).toBeGreaterThanOrEqual(1);
    expect(triageAcknowledge.body.audit.actionType).toBe("acknowledge-and-note");
    expect(["deescalated", "unchanged"]).toContain(
      triageAcknowledge.body.audit.escalationTransition
    );

    const triageNoteOnly = await requestJson(
      `/api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/retention/anomalies/${encodeURIComponent(
        triageTarget.anomalyInstanceId
      )}/triage`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          note: "Incident bridge informed and mitigation owner assigned.",
          noteType: "status-update",
          noteAuthor: "ops-shift-b",
        }),
      }
    );

    expect(triageNoteOnly.status).toBe(200);
    expect(triageNoteOnly.body.audit.actionType).toBe("note-only");

    const retentionAfterTriage = await requestJson(
      "/api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/retention?windowMinutes=60&limit=200",
      {
        method: "GET",
      }
    );

    expect(retentionAfterTriage.status).toBe(200);
    const triagedInRetention = retentionAfterTriage.body.telemetry.anomalies.find(
      (item) => item.anomalyInstanceId === triageTarget.anomalyInstanceId
    );
    expect(triagedInRetention).toBeTruthy();
    expect(triagedInRetention.triage.acknowledged).toBe(true);
    expect(triagedInRetention.triage.notesCount).toBeGreaterThanOrEqual(2);
    expect(triagedInRetention.escalation.state).toBe("monitoring");

    const trendAfterTriage = await requestJson(
      "/api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/retention/saturation-trend?windowMinutes=60&limit=200",
      {
        method: "GET",
      }
    );

    expect(trendAfterTriage.status).toBe(200);
    const triagedInTrend = trendAfterTriage.body.summary.anomalies.find(
      (item) => item.anomalyInstanceId === triageTarget.anomalyInstanceId
    );
    expect(triagedInTrend).toBeTruthy();
    expect(triagedInTrend.triage.acknowledged).toBe(true);

    const mitigationWithoutNote = await requestJson(
      `/api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/retention/anomalies/${encodeURIComponent(
        triageTarget.anomalyInstanceId
      )}/triage`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mitigationApplied: true,
        }),
      }
    );

    expect(mitigationWithoutNote.status).toBe(400);
    expect(mitigationWithoutNote.body.code).toBe(
      "NOTIFICATION_FAULT_MANIFEST_VERIFY_ANOMALY_MITIGATION_NOTE_REQUIRED"
    );

    const closureApply = await requestJson(
      "/api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/retention/apply?windowMinutes=60&limit=200",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          dedupeWindowSeconds: 600,
          maxEntries: 5000,
          pruneNow: false,
        }),
      }
    );

    expect(closureApply.status).toBe(200);

    const closureStatus = await requestJson(
      "/api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/retention?windowMinutes=60&limit=200",
      {
        method: "GET",
      }
    );

    expect(closureStatus.status).toBe(200);
    expect(Array.isArray(closureStatus.body.telemetry.recentlyClosedAnomalies)).toBe(true);
    expect(closureStatus.body.telemetry.recentlyClosedAnomalies.length).toBeGreaterThan(0);
    expect(
      ["signal-cleared", "retention-prune", "manual-reset"].includes(
        closureStatus.body.telemetry.recentlyClosedAnomalies[0].closedReason
      )
    ).toBe(true);
    expect(typeof closureStatus.body.telemetry.recentlyClosedAnomalies[0].closedAt).toBe("string");

    const escalationPolicyInvalid = await requestJson(
      "/api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/retention/apply",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          escalationPolicy: {
            warningUnacknowledgedEscalateAfterSeconds: 10,
            criticalUnacknowledgedEscalateAfterSeconds: 30,
          },
        }),
      }
    );

    expect(escalationPolicyInvalid.status).toBe(400);
    expect(escalationPolicyInvalid.body.code).toBe(
      "NOTIFICATION_FAULT_MANIFEST_VERIFY_ESCALATION_POLICY_ORDER_INVALID"
    );

    const triageMissingPayload = await requestJson(
      `/api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/retention/anomalies/${encodeURIComponent(
        triageTarget.anomalyInstanceId
      )}/triage`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      }
    );

    expect(triageMissingPayload.status).toBe(400);
    expect(triageMissingPayload.body.code).toBe(
      "NOTIFICATION_FAULT_MANIFEST_VERIFY_ANOMALY_TRIAGE_REQUIRED"
    );

    const triageMissingActor = await requestJson(
      `/api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/retention/anomalies/${encodeURIComponent(
        triageTarget.anomalyInstanceId
      )}/triage`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          acknowledge: true,
        }),
      }
    );

    expect(triageMissingActor.status).toBe(400);
    expect(triageMissingActor.body.code).toBe(
      "NOTIFICATION_FAULT_MANIFEST_VERIFY_ANOMALY_ACKNOWLEDGED_BY_REQUIRED"
    );

    const triageLongNote = await requestJson(
      `/api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/retention/anomalies/${encodeURIComponent(
        triageTarget.anomalyInstanceId
      )}/triage`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          note: "x".repeat(5000),
        }),
      }
    );

    expect(triageLongNote.status).toBe(400);
    expect(triageLongNote.body.code).toBe(
      "NOTIFICATION_FAULT_MANIFEST_VERIFY_ANOMALY_NOTE_TOO_LONG"
    );

    const triageNotFound = await requestJson(
      "/api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/retention/anomalies/00000000-0000-4000-8000-000000000000/triage",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          note: "missing anomaly instance check",
        }),
      }
    );

    expect(triageNotFound.status).toBe(404);
    expect(triageNotFound.body.code).toBe("NOTIFICATION_FAULT_MANIFEST_VERIFY_ANOMALY_NOT_FOUND");

    const attemptsRetentionMissingPayload = await requestJson(
      "/api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/retention/apply",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          pruneNow: true,
        }),
      }
    );

    expect(attemptsRetentionMissingPayload.status).toBe(400);
    expect(attemptsRetentionMissingPayload.body.code).toBe(
      "NOTIFICATION_FAULT_MANIFEST_VERIFY_ATTEMPT_RETENTION_REQUIRED"
    );

    const missingIssuedAt = await requestJson(
      "/api/v1/integrations/messaging/fault-injection/manifest/verify",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          digest: manifest.body.digest.value,
          signature: manifest.body.signature,
        }),
      }
    );

    expect(missingIssuedAt.status).toBe(400);
    expect(missingIssuedAt.body.code).toBe("NOTIFICATION_FAULT_MANIFEST_ISSUED_AT_REQUIRED");

    const missingDigest = await requestJson(
      "/api/v1/integrations/messaging/fault-injection/manifest/verify",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          issuedAt: manifest.body.replayDefense.issuedAt,
          signature: manifest.body.signature,
        }),
      }
    );

    expect(missingDigest.status).toBe(400);
    expect(missingDigest.body.code).toBe("NOTIFICATION_FAULT_MANIFEST_DIGEST_REQUIRED");
  });
});
