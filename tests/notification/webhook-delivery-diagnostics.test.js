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
    expect(duplicate.body.replayAttempt.fingerprint).toBe(
      verified.body.replayAttempt.fingerprint
    );

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
