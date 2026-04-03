const fs = require("fs");
const os = require("os");
const { spawnSync } = require("child_process");
const path = require("path");

const repoRoot = path.resolve(__dirname, "../..");
const scriptPath = path.resolve(__dirname, "../../scripts/check-contract-coverage.mjs");
const notificationSpecSource = "services/notification-service/openapi.yaml";

function runStrictContractCheck(extraEnv) {
  return spawnSync("node", [scriptPath, "--strict"], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      ...(extraEnv || {}),
    },
  });
}

function buildOutput(result) {
  return `${result.stdout || ""}\n${result.stderr || ""}`;
}

function replaceOneOrThrow(source, matcher, replacement, hint) {
  const replaced = source.replace(matcher, replacement);
  if (replaced === source) {
    throw new Error(`Could not apply mutation for ${hint}`);
  }

  return replaced;
}

function withMutatedNotificationSpec(mutateSource, assertions) {
  const sourcePath = path.resolve(repoRoot, notificationSpecSource);
  const sourceText = fs.readFileSync(sourcePath, "utf8");
  const mutatedText = mutateSource(sourceText);

  expect(mutatedText).not.toBe(sourceText);

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pulseward-contract-check-"));
  const mutatedSpecPath = path.join(tempDir, "notification-openapi.yaml");

  fs.writeFileSync(mutatedSpecPath, mutatedText, "utf8");

  try {
    const result = runStrictContractCheck({
      CONTRACT_CHECK_SPEC_OVERRIDES: JSON.stringify({
        [notificationSpecSource]: mutatedSpecPath,
      }),
    });
    const output = buildOutput(result);
    assertions(result, output);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

describe("M1 parity regression guard", () => {
  test("strict contract parity check passes", () => {
    const result = runStrictContractCheck();
    const combinedOutput = buildOutput(result);

    expect(result.status).toBe(0);
    expect(combinedOutput).toContain("Mode: strict");
    expect(combinedOutput).toContain(
      "Schema check passed: critical request/response schema coverage is present."
    );
    expect(combinedOutput).toContain(
      "Contract check passed: presence, parity, and schema checks are within baseline."
    );
  });

  test("previously drifted services remain parity clean", () => {
    const result = runStrictContractCheck();
    const output = buildOutput(result);

    expect(output).toContain("- api-gateway");
    expect(output).toContain("- ehr-service");
    expect(output).toContain("- lab-service");
    expect(output).toContain("- billing-service");

    expect(output).toContain("runtime-only (0): none");
    expect(output).toContain("spec-only (0): none");
  });

  test("critical endpoint schema checks stay covered", () => {
    const result = runStrictContractCheck();
    const output = buildOutput(result);

    expect(output).toContain("Critical endpoint schema checks:");
    expect(output).toContain("PASS: auth-service POST /auth/login");
    expect(output).toContain("PASS: auth-service POST /auth/otp/request");
    expect(output).toContain("PASS: auth-service POST /auth/otp/verify");
    expect(output).toContain("PASS: auth-service GET /auth/session/events");
    expect(output).toContain("PASS: auth-service POST /auth/workflow-entry/check");
    expect(output).toContain("PASS: auth-service GET /auth/oauth/google/start");
    expect(output).toContain("PASS: auth-service POST /auth/oauth/google/callback");
    expect(output).toContain("PASS: auth-service GET /auth/oauth/clerk/start");
    expect(output).toContain("PASS: ehr-service POST /ehr/records");
    expect(output).toContain("PASS: ehr-service PUT /ehr/records/{id}");
    expect(output).toContain("PASS: ehr-service GET /ehr/records/{id}/timeline");
    expect(output).toContain("PASS: ehr-service POST /ehr/records/{id}/prescriptions");
    expect(output).toContain(
      "PASS: ehr-service POST /ehr/records/{id}/prescriptions/{prescriptionId}/handoff"
    );
    expect(output).toContain("PASS: appointment-service POST /appointments");
    expect(output).toContain("PASS: appointment-service PUT /appointments/{id}");
    expect(output).toContain("PASS: appointment-service POST /opd/entries");
    expect(output).toContain("PASS: notification-service POST /integrations/messaging/test");
    expect(output).toContain("PASS: notification-service POST /integrations/appointments/events");
    expect(output).toContain(
      "PASS: notification-service GET /integrations/messaging/fault-injection/manifest/verify/attempts/retention"
    );
    expect(output).toContain(
      "PASS: notification-service GET /integrations/messaging/fault-injection/manifest/verify/attempts/retention/saturation-trend"
    );
    expect(output).toContain(
      "PASS: notification-service GET /integrations/messaging/fault-injection/manifest/verify/attempts/retention/escalations/export"
    );
    expect(output).toContain(
      "PASS: notification-service POST /integrations/messaging/fault-injection/manifest/verify/attempts/retention/anomalies/{anomalyInstanceId}/triage"
    );
    expect(output).toContain(
      "PASS: notification-service POST /integrations/messaging/fault-injection/manifest/verify/attempts/retention/apply"
    );
    expect(output).toContain("PASS: pharmacy-service POST /prescriptions/handoff");
    expect(output).toContain("PASS: pharmacy-service PUT /prescriptions/{id}/status");
    expect(output).toContain("PASS: lab-service POST /lab-tests/orders");
    expect(output).toContain("PASS: lab-service PUT /lab-tests/orders/{id}/status");
    expect(output).toContain("PASS: lab-service POST /lab-tests/orders/{id}/result");
    expect(output).toContain("PASS: lab-service POST /lab-tests/orders/{id}/report");
    expect(output).toContain("PASS: billing-service POST /billing/hooks/clinical-trigger");
    expect(output).toContain("PASS: auth-service POST /admin/settings/auth-policy/validate");
    expect(output).toContain("PASS: auth-service PUT /admin/settings");
    expect(output).toContain("Critical parameter contract checks:");
    expect(output).toContain(
      "PASS: notification-service GET /integrations/messaging/fault-injection/manifest/verify/attempts/retention/saturation-trend parameters"
    );
    expect(output).toContain(
      "PASS: notification-service GET /integrations/messaging/fault-injection/manifest/verify/attempts/retention parameters"
    );
    expect(output).toContain(
      "PASS: notification-service GET /integrations/messaging/fault-injection/manifest/verify/attempts/retention/escalations/export parameters"
    );
    expect(output).toContain(
      "PASS: notification-service GET /integrations/messaging/fault-injection/manifest/verify/attempts/retention/escalations/export boolean filter parameter contract"
    );
    expect(output).toContain(
      "PASS: notification-service GET /integrations/messaging/fault-injection/manifest/verify/attempts/retention/escalations/export escalation state/severity filter parameter contract"
    );
    expect(output).toContain(
      "PASS: notification-service POST /integrations/messaging/fault-injection/manifest/verify/attempts/retention/anomalies/{anomalyInstanceId}/triage path parameter contract"
    );
    expect(output).toContain(
      "PASS: notification-service POST /integrations/messaging/fault-injection/manifest/verify/attempts/retention/anomalies/{anomalyInstanceId}/triage request schema acknowledge anchor"
    );
    expect(output).toContain(
      "PASS: notification-service POST /integrations/messaging/fault-injection/manifest/verify/attempts/retention/anomalies/{anomalyInstanceId}/triage request schema acknowledgedBy anchor"
    );
    expect(output).toContain(
      "PASS: notification-service POST /integrations/messaging/fault-injection/manifest/verify/attempts/retention/anomalies/{anomalyInstanceId}/triage request schema mitigationApplied anchor"
    );
    expect(output).toContain(
      "PASS: notification-service POST /integrations/messaging/fault-injection/manifest/verify/attempts/retention/anomalies/{anomalyInstanceId}/triage request schema note anchor"
    );
    expect(output).toContain(
      "PASS: notification-service POST /integrations/messaging/fault-injection/manifest/verify/attempts/retention/anomalies/{anomalyInstanceId}/triage request schema noteType anchor"
    );
    expect(output).toContain(
      "PASS: notification-service POST /integrations/messaging/fault-injection/manifest/verify/attempts/retention/anomalies/{anomalyInstanceId}/triage request schema noteAuthor anchor"
    );
    expect(output).toContain(
      "PASS: notification-service POST /integrations/messaging/fault-injection/manifest/verify/attempts/retention/anomalies/{anomalyInstanceId}/triage request schema mitigationEvidenceRef anchor"
    );
    expect(output).toContain(
      "PASS: notification-service POST /integrations/messaging/fault-injection/manifest/verify/attempts/retention/anomalies/{anomalyInstanceId}/triage request schema mitigationType anchor"
    );
    expect(output).toContain(
      "PASS: notification-service POST /integrations/messaging/fault-injection/manifest/verify/attempts/retention/apply request schema pruneNow anchor"
    );
    expect(output).toContain(
      "PASS: notification-service POST /integrations/messaging/fault-injection/manifest/verify/attempts/retention/apply request schema dryRun anchor"
    );
    expect(output).toContain(
      "PASS: notification-service POST /integrations/messaging/fault-injection/manifest/verify/attempts/retention/apply request schema escalation policy autoDeescalateOnMitigation anchor"
    );
    expect(output).toContain(
      "PASS: notification-service POST /integrations/messaging/fault-injection/manifest/verify/attempts/retention/apply request schema escalation policy enabled anchor"
    );
    expect(output).toContain(
      "PASS: notification-service POST /integrations/messaging/fault-injection/manifest/verify/attempts/retention/apply request schema escalation export policy includeRecentlyClosedByDefault anchor"
    );
    expect(output).toContain(
      "PASS: notification-service POST /integrations/messaging/fault-injection/manifest/verify/attempts/retention/apply request schema escalation export policy defaultFormat anchor"
    );
    expect(output).toContain(
      "PASS: notification-service POST /integrations/messaging/fault-injection/manifest/verify/attempts/retention/apply request schema escalation export policy enabled anchor"
    );
    expect(output).toContain(
      "PASS: notification-service POST /integrations/messaging/fault-injection/manifest/verify/attempts/retention/apply request schema escalation export policy maxExportRows anchor"
    );
    expect(output).toContain(
      "PASS: notification-service POST /integrations/messaging/fault-injection/manifest/verify/attempts/retention/apply request schema dedupeWindowSeconds anchor"
    );
    expect(output).toContain(
      "PASS: notification-service POST /integrations/messaging/fault-injection/manifest/verify/attempts/retention/apply request schema maxEntries anchor"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptEscalationPolicy warningUnacknowledgedEscalateAfterSeconds schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptEscalationPolicy criticalUnacknowledgedEscalateAfterSeconds schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptEscalationPolicy criticalUnmitigatedEscalateAfterSeconds schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptAnomalyEscalationAcknowledgementSla status schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptAnomalyEscalationAcknowledgementSla breached schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptAnomalyEscalationAcknowledgementSla acknowledged schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptEscalationExportResponse escalations schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptEscalationExportResponse totalMatched schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptEscalationExportItem escalationActionRequired schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptEscalationExportFilters triageAcknowledged schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptEscalationExportResponse returned schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptEscalationExportItem acknowledgementSlaBreached schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptEscalationExportFilters limit schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptEscalationExportResponse totalTracked schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptEscalationExportFilters actionRequired schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptEscalationExportItem acknowledgementSlaBreachSeconds schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptEscalationExportItem triageNotesCount schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptEscalationExportItem acknowledgementSlaTargetSeconds schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptEscalationExportFilters breached schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptEscalationExportItem triageAcknowledged schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptEscalationExportItem acknowledgementSlaElapsedSeconds schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptEscalationExportItem acknowledgementSlaRemainingSeconds schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptEscalationExportItem triageAcknowledgedAt schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptEscalationExportItem triageAcknowledgedBy schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptEscalationExportItem acknowledgementSlaStatus schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptEscalationExportItem escalationState schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptEscalationExportItem escalationSeverity schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptEscalationExportItem escalationTrigger schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptEscalationExportItem escalationPendingSince schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptEscalationExportItem escalationEscalatedAt schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptEscalationExportItem escalationResolvedAt schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptEscalationExportItem escalationDueAt schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptEscalationExportItem firstDetectedAt schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptEscalationExportItem lastDetectedAt schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptEscalationExportItem recommendedAction schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptEscalationExportItem closedAt schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptEscalationExportItem closedReason schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptEscalationExportItem anomalyKey schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptEscalationExportItem anomalySeverity schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptEscalationExportItem anomalyStatus schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptEscalationExportFilters includeRecentlyClosed schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptEscalationExportFilters state schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptEscalationExportFilters acknowledgementSlaStatus schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptEscalationExportItem anomalyInstanceId schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptEscalationExportResponse exportedAt schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptEscalationExportResponse format schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptEscalationExportFilters escalationSeverity schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptEscalationExportDiagnostics retentionEndpoint schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptEscalationExportDiagnostics retentionTrendEndpoint schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptEscalationExportDiagnostics retentionAnomalyTriageEndpointTemplate schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptEscalationExportDiagnostics retentionEscalationExportEndpointTemplate schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptEscalationExportPolicy enabled schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptEscalationExportPolicy defaultFormat schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptEscalationExportPolicy maxExportRows schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptEscalationExportPolicy includeRecentlyClosedByDefault schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptEscalationExportResponse policy schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptEscalationExportResponse filters schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptEscalationExportResponse diagnostics schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptEscalationExportItem diagnostics schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptRetentionApplyRequest escalationPolicy schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptRetentionApplyRequest escalationExportPolicy schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptRetentionApplyResponse appliedAt schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptRetentionApplyResponse telemetry schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptRetentionApplyResponse diagnostics schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptRetentionStatusResponse retention schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptRetentionStatusResponse telemetry schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptRetentionStatusResponse diagnostics schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptRetentionSaturationTrendResponse queriedAt schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptRetentionSaturationTrendResponse snapshots schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptRetentionSaturationTrendResponse diagnostics schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptRetentionSaturationTrendResponse query schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptRetentionSaturationTrendResponse summary schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptRetentionSaturationTrendResponse latestSaturation schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptRetentionApplyResponse retention schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptRetentionPolicy dedupeWindowSeconds schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptRetentionPolicy maxEntries schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptRetentionPolicy minDedupeWindowSeconds schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptRetentionPolicy maxDedupeWindowSeconds schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptRetentionPolicy minMaxEntries schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptRetentionPolicy maxMaxEntries schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptRetentionPolicy source schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptRetentionPolicy pruneStrategy schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptRetentionPolicy escalationPolicy schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptRetentionPolicy escalationExportPolicy schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptRetentionPolicy lifecyclePolicy schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptRetentionTelemetry totalRecorded schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptRetentionTelemetry duplicateSuppressedAttempts schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptRetentionTelemetry totalSuppressedEvents schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptRetentionTelemetry oldestFirstVerifiedAt schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptRetentionTelemetry latestLastVerifiedAt schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptRetentionTelemetry saturation schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptRetentionTelemetry saturationTrend schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptRetentionTelemetry anomalies schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptRetentionTelemetry highestAnomalySeverity schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptRetentionTelemetry anomalyTracking schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptRetentionTelemetry escalation schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptRetentionTelemetry recentlyClosedAnomalies schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptAnomalyTrackingSummary statePersistence schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptAnomalyTrackingSummary retainedAnomalyInstances schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptAnomalyTrackingSummary retainedActionEntries schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptAnomalyTrackingSummary activeCount schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptAnomalyTrackingSummary acknowledgedActiveCount schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptAnomalyTrackingSummary unacknowledgedActiveCount schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptAnomalyTrackingSummary escalation schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptAnomalyTrackingSummary noteCount schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptAnomalyTrackingSummary retainedRecentlyClosedEntries schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptEscalationTelemetry activeEscalations schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptEscalationTelemetry pendingEscalations schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptEscalationTelemetry highestEscalationSeverity schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptEscalationAcknowledgementSlaSummary trackedCount schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptEscalationAcknowledgementSlaSummary applicableCount schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptEscalationAcknowledgementSlaSummary withinSlaCount schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptEscalationAcknowledgementSlaSummary breachedCount schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptEscalationAcknowledgementSlaSummary acknowledgedCount schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptEscalationAcknowledgementSlaSummary acknowledgedWithinSlaCount schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptEscalationAcknowledgementSlaSummary acknowledgedBreachedCount schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptEscalationAcknowledgementSlaSummary openBreachCount schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptEscalationAcknowledgementSlaSummary averageAcknowledgementSeconds schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptEscalationAcknowledgementSlaSummary p95AcknowledgementSeconds schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptEscalationTelemetry byState schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptEscalationTelemetry acknowledgementSla schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptRecentlyClosedAnomaly anomalyInstanceId schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptRecentlyClosedAnomaly key schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptRecentlyClosedAnomaly severity schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptRecentlyClosedAnomaly closedAt schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptRecentlyClosedAnomaly closedReason schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptRecentlyClosedAnomaly clearanceEvidence schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptRecentlyClosedAnomaly clearanceEvidence additionalProperties contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptAnomalyTriageNote noteId schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptAnomalyTriageNote noteType schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptAnomalyTriageNote content schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptAnomalyTriageNote createdAt schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptAnomalyTriageNote author schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptAnomalyTriageNote mitigationApplied schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptAnomalyTriageNote mitigationType schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptAnomalyTriageNote mitigationEvidenceRef schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptAnomalyTriageState acknowledged schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptAnomalyTriageState acknowledgedAt schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptAnomalyTriageState acknowledgedBy schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptAnomalyTriageState notesCount schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptAnomalyTriageState latestNote schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptAnomalyTriageResponse updatedAt schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptAnomalyTriageResponse anomaly schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptAnomalyTriageResponse audit schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptAnomalyTriageResponse diagnostics schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptRetentionSaturationTrend summary schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptRetentionSaturationTrend snapshots schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptRetentionSaturationTrendSummary windowMinutes schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptRetentionSaturationTrendSummary requestedLimit schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptRetentionSaturationTrendSummary totalInWindow schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptRetentionSaturationTrendSummary returned schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptRetentionSaturationTrendSummary hasMore schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptRetentionSaturationTrendSummary firstCapturedAt schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptRetentionSaturationTrendSummary lastCapturedAt schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptRetentionSaturationTrendSummary minUtilizationPercent schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptRetentionSaturationTrendSummary maxUtilizationPercent schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptRetentionSaturationTrendSummary avgUtilizationPercent schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptRetentionSaturationTrendSummary latestUtilizationPercent schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptRetentionSaturationTrendSummary latestAlertLevel schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptRetentionSaturationTrendSummary trendDirection schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptRetentionSaturationTrendSummary anomalies schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptRetentionSaturationTrendSummary highestAnomalySeverity schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptRetentionSaturationTrendSummary anomalyTracking schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptRetentionSaturationTrendSummary escalation schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptRetentionSaturationTrendSummary recentlyClosedCount schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptRetentionSaturationAnomaly key schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptRetentionSaturationAnomaly severity schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptRetentionSaturationAnomaly recommendedAction schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptRetentionSaturationAnomaly evidence schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptRetentionSaturationAnomaly anomalyInstanceId schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptRetentionSaturationAnomaly status schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptRetentionSaturationAnomaly firstDetectedAt schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptRetentionSaturationAnomaly lastDetectedAt schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptRetentionSaturationAnomaly triage schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptRetentionSaturationAnomaly closedAt schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptRetentionSaturationAnomaly closedReason schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptRetentionSaturationAnomaly clearanceEvidence schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptRetentionSaturationAnomaly closureHistory schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptRetentionSaturationAnomaly escalation schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptAnomalyClosureRecord closedAt schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptAnomalyClosureRecord closedReason schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptAnomalyClosureRecord clearanceEvidence schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptAnomalyEscalationState state schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptAnomalyEscalationState severity schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service MessagingFaultManifestVerifyAttemptAnomalyEscalationState trigger schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service GET /integrations/messaging/fault-injection/manifest/verify/attempts/retention response schema ref contract"
    );
    expect(output).toContain(
      "PASS: notification-service GET /integrations/messaging/fault-injection/manifest/verify/attempts/retention/saturation-trend response schema ref contract"
    );
    expect(output).toContain(
      "PASS: notification-service GET /integrations/messaging/fault-injection/manifest/verify/attempts/retention/escalations/export JSON response schema ref contract"
    );
    expect(output).toContain(
      "PASS: notification-service POST /integrations/messaging/fault-injection/manifest/verify/attempts/retention/anomalies/{anomalyInstanceId}/triage response schema ref contract"
    );
    expect(output).toContain(
      "PASS: notification-service POST /integrations/messaging/fault-injection/manifest/verify/attempts/retention/apply response schema ref contract"
    );
    expect(output).toContain(
      "PASS: notification-service GET /integrations/messaging/fault-injection/manifest/verify/attempts/retention/escalations/export 400 error response schema ref contract"
    );
    expect(output).toContain(
      "PASS: notification-service GET /integrations/messaging/fault-injection/manifest/verify/attempts/retention/escalations/export 403 error response schema ref contract"
    );
    expect(output).toContain(
      "PASS: notification-service POST /integrations/messaging/fault-injection/manifest/verify/attempts/retention/anomalies/{anomalyInstanceId}/triage 400 error response schema ref contract"
    );
    expect(output).toContain(
      "PASS: notification-service POST /integrations/messaging/fault-injection/manifest/verify/attempts/retention/anomalies/{anomalyInstanceId}/triage 404 error response schema ref contract"
    );
    expect(output).toContain(
      "PASS: notification-service POST /integrations/messaging/fault-injection/manifest/verify/attempts/retention/apply 400 error response schema ref contract"
    );
    expect(output).toContain(
      "PASS: notification-service NotificationErrorResponse message schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service NotificationErrorResponse code schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service NotificationErrorResponse details schema property contract"
    );
    expect(output).toContain(
      "PASS: notification-service NotificationErrorResponse details additionalProperties contract"
    );
    expect(output).toContain(
      "PASS: notification-service GET /integrations/messaging/fault-injection/manifest/verify/attempts/retention/escalations/export response media-type contract"
    );
    expect(output).toContain(
      "PASS: notification-service GET /integrations/messaging/fault-injection/manifest/verify/attempts/export response media-type contract"
    );
  });

  test("fails strict check when retention trend parameter defaults drift", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(\/integrations\/messaging\/fault-injection\/manifest\/verify\/attempts\/retention\/saturation-trend:[\s\S]*?- name: limit[\s\S]*?default:\s*)24/,
          "$199",
          "saturation-trend limit default"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service GET /integrations/messaging/fault-injection/manifest/verify/attempts/retention/saturation-trend parameters"
        );
        expect(output).toContain("default expected 24 got 99");
      }
    );
  });

  test("fails strict check when retention status parameter defaults drift", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(\/integrations\/messaging\/fault-injection\/manifest\/verify\/attempts\/retention:[\s\S]*?- name: limit[\s\S]*?default:\s*)24/,
          "$199",
          "retention status limit default"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service GET /integrations/messaging/fault-injection/manifest/verify/attempts/retention parameters"
        );
        expect(output).toContain("default expected 24 got 99");
      }
    );
  });

  test("fails strict check when escalation export enum contract drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(\/integrations\/messaging\/fault-injection\/manifest\/verify\/attempts\/retention\/escalations\/export:[\s\S]*?enum:\s*[\r\n]+\s*-\s*json[\r\n]+\s*-\s*)csv/,
          "$1yaml",
          "escalation export format enum"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service GET /integrations/messaging/fault-injection/manifest/verify/attempts/retention/escalations/export parameters"
        );
        expect(output).toContain("enum missing csv");
      }
    );
  });

  test("fails strict check when retention apply dryRun schema anchor drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptRetentionApplyRequest:[\s\S]*?dryRun:[\s\S]*?default:\s*)false/,
          "$1true",
          "retention apply dryRun default"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service POST /integrations/messaging/fault-injection/manifest/verify/attempts/retention/apply request schema dryRun anchor"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptRetentionApplyRequest.dryRun default expected false got true"
        );
      }
    );
  });

  test("fails strict check when escalation export csv response contract drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(\/integrations\/messaging\/fault-injection\/manifest\/verify\/attempts\/retention\/escalations\/export:[\s\S]*?content:[\s\S]*?)text\/csv:/,
          "$1text/plain:",
          "escalation export csv response content type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service GET /integrations/messaging/fault-injection/manifest/verify/attempts/retention/escalations/export response media-type contract"
        );
        expect(output).toContain("response 200 missing content type text/csv");
      }
    );
  });

  test("fails strict check when verify-attempt export csv response contract drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(\/integrations\/messaging\/fault-injection\/manifest\/verify\/attempts\/export:[\s\S]*?content:[\s\S]*?)text\/csv:/,
          "$1text/plain:",
          "verify-attempt export csv response content type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service GET /integrations/messaging/fault-injection/manifest/verify/attempts/export response media-type contract"
        );
        expect(output).toContain("response 200 missing content type text/csv");
      }
    );
  });

  test("fails strict check when triage request schema ref drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(\/integrations\/messaging\/fault-injection\/manifest\/verify\/attempts\/retention\/anomalies\/\{anomalyInstanceId\}\/triage:[\s\S]*?requestBody:[\s\S]*?\$ref:\s*")[^"]+("?)/,
          "$1#/components/schemas/MessagingFaultManifestVerifyAttemptRetentionApplyRequest$2",
          "triage request schema ref"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service POST /integrations/messaging/fault-injection/manifest/verify/attempts/retention/anomalies/{anomalyInstanceId}/triage request schema acknowledge anchor"
        );
        expect(output).toContain(
          "requestBody schema ref expected #/components/schemas/MessagingFaultManifestVerifyAttemptAnomalyTriageRequest got #/components/schemas/MessagingFaultManifestVerifyAttemptRetentionApplyRequest"
        );
      }
    );
  });

  test("fails strict check when triage acknowledge default drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptAnomalyTriageRequest:[\s\S]*?acknowledge:[\s\S]*?default:\s*)false/,
          "$1true",
          "triage acknowledge default"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service POST /integrations/messaging/fault-injection/manifest/verify/attempts/retention/anomalies/{anomalyInstanceId}/triage request schema acknowledge anchor"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptAnomalyTriageRequest.acknowledge default expected false got true"
        );
      }
    );
  });

  test("fails strict check when triage mitigationApplied default drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptAnomalyTriageRequest:[\s\S]*?mitigationApplied:[\s\S]*?default:\s*)false/,
          "$1true",
          "triage mitigationApplied default"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service POST /integrations/messaging/fault-injection/manifest/verify/attempts/retention/anomalies/{anomalyInstanceId}/triage request schema mitigationApplied anchor"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptAnomalyTriageRequest.mitigationApplied default expected false got true"
        );
      }
    );
  });

  test("fails strict check when escalation export triageAcknowledged type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(\/integrations\/messaging\/fault-injection\/manifest\/verify\/attempts\/retention\/escalations\/export:[\s\S]*?- name: triageAcknowledged[\s\S]*?type:\s*)boolean/,
          "$1string",
          "escalation export triageAcknowledged type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service GET /integrations/messaging/fault-injection/manifest/verify/attempts/retention/escalations/export boolean filter parameter contract"
        );
        expect(output).toContain(
          "parameter query:triageAcknowledged type expected boolean got string"
        );
      }
    );
  });

  test("fails strict check when escalation export breached type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(\/integrations\/messaging\/fault-injection\/manifest\/verify\/attempts\/retention\/escalations\/export:[\s\S]*?- name: breached[\s\S]*?type:\s*)boolean/,
          "$1integer",
          "escalation export breached type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service GET /integrations/messaging/fault-injection/manifest/verify/attempts/retention/escalations/export boolean filter parameter contract"
        );
        expect(output).toContain("parameter query:breached type expected boolean got integer");
      }
    );
  });

  test("fails strict check when retention apply pruneNow default drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptRetentionApplyRequest:[\s\S]*?pruneNow:[\s\S]*?default:\s*)true/,
          "$1false",
          "retention apply pruneNow default"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service POST /integrations/messaging/fault-injection/manifest/verify/attempts/retention/apply request schema pruneNow anchor"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptRetentionApplyRequest.pruneNow default expected true got false"
        );
      }
    );
  });

  test("fails strict check when escalation policy autoDeescalateOnMitigation default drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptEscalationPolicy:[\s\S]*?autoDeescalateOnMitigation:[\s\S]*?default:\s*)true/,
          "$1false",
          "escalation policy autoDeescalateOnMitigation default"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service POST /integrations/messaging/fault-injection/manifest/verify/attempts/retention/apply request schema escalation policy autoDeescalateOnMitigation anchor"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptEscalationPolicy.autoDeescalateOnMitigation default expected true got false"
        );
      }
    );
  });

  test("fails strict check when escalation export policy includeRecentlyClosedByDefault default drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptEscalationExportPolicy:[\s\S]*?includeRecentlyClosedByDefault:[\s\S]*?default:\s*)false/,
          "$1true",
          "escalation export policy includeRecentlyClosedByDefault default"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service POST /integrations/messaging/fault-injection/manifest/verify/attempts/retention/apply request schema escalation export policy includeRecentlyClosedByDefault anchor"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptEscalationExportPolicy.includeRecentlyClosedByDefault default expected false got true"
        );
      }
    );
  });

  test("fails strict check when escalation export policy defaultFormat drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptEscalationExportPolicy:[\s\S]*?defaultFormat:[\s\S]*?default:\s*)json/,
          "$1csv",
          "escalation export policy defaultFormat"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service POST /integrations/messaging/fault-injection/manifest/verify/attempts/retention/apply request schema escalation export policy defaultFormat anchor"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptEscalationExportPolicy.defaultFormat default expected json got csv"
        );
      }
    );
  });

  test("fails strict check when retention status response schema ref drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(\/integrations\/messaging\/fault-injection\/manifest\/verify\/attempts\/retention:[\s\S]*?"200":[\s\S]*?application\/json:[\s\S]*?\$ref:\s*")[^"]+("?)/,
          "$1#/components/schemas/MessagingFaultManifestVerifyAttemptRetentionApplyResponse$2",
          "retention status response schema ref"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service GET /integrations/messaging/fault-injection/manifest/verify/attempts/retention response schema ref contract"
        );
        expect(output).toContain(
          "responseBody schema ref expected #/components/schemas/MessagingFaultManifestVerifyAttemptRetentionStatusResponse got #/components/schemas/MessagingFaultManifestVerifyAttemptRetentionApplyResponse"
        );
      }
    );
  });

  test("fails strict check when retention saturation-trend response schema ref drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(\/integrations\/messaging\/fault-injection\/manifest\/verify\/attempts\/retention\/saturation-trend:[\s\S]*?"200":[\s\S]*?application\/json:[\s\S]*?\$ref:\s*")[^"]+("?)/,
          "$1#/components/schemas/MessagingFaultManifestVerifyAttemptRetentionStatusResponse$2",
          "retention saturation-trend response schema ref"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service GET /integrations/messaging/fault-injection/manifest/verify/attempts/retention/saturation-trend response schema ref contract"
        );
        expect(output).toContain(
          "responseBody schema ref expected #/components/schemas/MessagingFaultManifestVerifyAttemptRetentionSaturationTrendResponse got #/components/schemas/MessagingFaultManifestVerifyAttemptRetentionStatusResponse"
        );
      }
    );
  });

  test("fails strict check when escalation export JSON response schema ref drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(\/integrations\/messaging\/fault-injection\/manifest\/verify\/attempts\/retention\/escalations\/export:[\s\S]*?"200":[\s\S]*?application\/json:[\s\S]*?\$ref:\s*")[^"]+("?)/,
          "$1#/components/schemas/MessagingFaultManifestVerifyAttemptRetentionStatusResponse$2",
          "escalation export JSON response schema ref"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service GET /integrations/messaging/fault-injection/manifest/verify/attempts/retention/escalations/export JSON response schema ref contract"
        );
        expect(output).toContain(
          "responseBody schema ref expected #/components/schemas/MessagingFaultManifestVerifyAttemptEscalationExportResponse got #/components/schemas/MessagingFaultManifestVerifyAttemptRetentionStatusResponse"
        );
      }
    );
  });

  test("fails strict check when anomaly triage response schema ref drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(\/integrations\/messaging\/fault-injection\/manifest\/verify\/attempts\/retention\/anomalies\/\{anomalyInstanceId\}\/triage:[\s\S]*?"200":[\s\S]*?application\/json:[\s\S]*?\$ref:\s*")[^"]+("?)/,
          "$1#/components/schemas/MessagingFaultManifestVerifyAttemptRetentionApplyResponse$2",
          "anomaly triage response schema ref"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service POST /integrations/messaging/fault-injection/manifest/verify/attempts/retention/anomalies/{anomalyInstanceId}/triage response schema ref contract"
        );
        expect(output).toContain(
          "responseBody schema ref expected #/components/schemas/MessagingFaultManifestVerifyAttemptAnomalyTriageResponse got #/components/schemas/MessagingFaultManifestVerifyAttemptRetentionApplyResponse"
        );
      }
    );
  });

  test("fails strict check when retention apply response schema ref drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(\/integrations\/messaging\/fault-injection\/manifest\/verify\/attempts\/retention\/apply:[\s\S]*?"200":[\s\S]*?application\/json:[\s\S]*?\$ref:\s*")[^"]+("?)/,
          "$1#/components/schemas/MessagingFaultManifestVerifyAttemptAnomalyTriageResponse$2",
          "retention apply response schema ref"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service POST /integrations/messaging/fault-injection/manifest/verify/attempts/retention/apply response schema ref contract"
        );
        expect(output).toContain(
          "responseBody schema ref expected #/components/schemas/MessagingFaultManifestVerifyAttemptRetentionApplyResponse got #/components/schemas/MessagingFaultManifestVerifyAttemptAnomalyTriageResponse"
        );
      }
    );
  });

  test("fails strict check when escalation export 400 error response schema ref drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(\/integrations\/messaging\/fault-injection\/manifest\/verify\/attempts\/retention\/escalations\/export:[\s\S]*?"400":[\s\S]*?application\/json:[\s\S]*?\$ref:\s*")[^"]+("?)/,
          "$1#/components/schemas/MessagingFaultManifestVerifyAttemptEscalationExportResponse$2",
          "escalation export 400 error response schema ref"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service GET /integrations/messaging/fault-injection/manifest/verify/attempts/retention/escalations/export 400 error response schema ref contract"
        );
        expect(output).toContain(
          "responseBody schema ref expected #/components/schemas/NotificationErrorResponse got #/components/schemas/MessagingFaultManifestVerifyAttemptEscalationExportResponse"
        );
      }
    );
  });

  test("fails strict check when escalation export 403 error response schema ref drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(\/integrations\/messaging\/fault-injection\/manifest\/verify\/attempts\/retention\/escalations\/export:[\s\S]*?"403":[\s\S]*?application\/json:[\s\S]*?\$ref:\s*")[^"]+("?)/,
          "$1#/components/schemas/MessagingFaultManifestVerifyAttemptEscalationExportResponse$2",
          "escalation export 403 error response schema ref"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service GET /integrations/messaging/fault-injection/manifest/verify/attempts/retention/escalations/export 403 error response schema ref contract"
        );
        expect(output).toContain(
          "responseBody schema ref expected #/components/schemas/NotificationErrorResponse got #/components/schemas/MessagingFaultManifestVerifyAttemptEscalationExportResponse"
        );
      }
    );
  });

  test("fails strict check when anomaly triage 400 error response schema ref drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(\/integrations\/messaging\/fault-injection\/manifest\/verify\/attempts\/retention\/anomalies\/\{anomalyInstanceId\}\/triage:[\s\S]*?"400":[\s\S]*?application\/json:[\s\S]*?\$ref:\s*")[^"]+("?)/,
          "$1#/components/schemas/MessagingFaultManifestVerifyAttemptAnomalyTriageResponse$2",
          "anomaly triage 400 error response schema ref"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service POST /integrations/messaging/fault-injection/manifest/verify/attempts/retention/anomalies/{anomalyInstanceId}/triage 400 error response schema ref contract"
        );
        expect(output).toContain(
          "responseBody schema ref expected #/components/schemas/NotificationErrorResponse got #/components/schemas/MessagingFaultManifestVerifyAttemptAnomalyTriageResponse"
        );
      }
    );
  });

  test("fails strict check when anomaly triage 404 error response schema ref drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(\/integrations\/messaging\/fault-injection\/manifest\/verify\/attempts\/retention\/anomalies\/\{anomalyInstanceId\}\/triage:[\s\S]*?"404":[\s\S]*?application\/json:[\s\S]*?\$ref:\s*")[^"]+("?)/,
          "$1#/components/schemas/MessagingFaultManifestVerifyAttemptRetentionApplyResponse$2",
          "anomaly triage 404 error response schema ref"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service POST /integrations/messaging/fault-injection/manifest/verify/attempts/retention/anomalies/{anomalyInstanceId}/triage 404 error response schema ref contract"
        );
        expect(output).toContain(
          "responseBody schema ref expected #/components/schemas/NotificationErrorResponse got #/components/schemas/MessagingFaultManifestVerifyAttemptRetentionApplyResponse"
        );
      }
    );
  });

  test("fails strict check when retention apply 400 error response schema ref drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(\/integrations\/messaging\/fault-injection\/manifest\/verify\/attempts\/retention\/apply:[\s\S]*?"400":[\s\S]*?application\/json:[\s\S]*?\$ref:\s*")[^"]+("?)/,
          "$1#/components/schemas/MessagingFaultManifestVerifyAttemptRetentionApplyResponse$2",
          "retention apply 400 error response schema ref"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service POST /integrations/messaging/fault-injection/manifest/verify/attempts/retention/apply 400 error response schema ref contract"
        );
        expect(output).toContain(
          "responseBody schema ref expected #/components/schemas/NotificationErrorResponse got #/components/schemas/MessagingFaultManifestVerifyAttemptRetentionApplyResponse"
        );
      }
    );
  });

  test("fails strict check when NotificationErrorResponse message type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(NotificationErrorResponse:[\s\S]*?message:[\s\S]*?type:\s*)string/,
          "$1object",
          "NotificationErrorResponse message type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service NotificationErrorResponse message schema property contract"
        );
        expect(output).toContain(
          "schema property NotificationErrorResponse.message type expected string got object"
        );
      }
    );
  });

  test("fails strict check when NotificationErrorResponse code type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(NotificationErrorResponse:[\s\S]*?code:[\s\S]*?type:\s*)string/,
          "$1integer",
          "NotificationErrorResponse code type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service NotificationErrorResponse code schema property contract"
        );
        expect(output).toContain(
          "schema property NotificationErrorResponse.code type expected string got integer"
        );
      }
    );
  });

  test("fails strict check when NotificationErrorResponse details type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(NotificationErrorResponse:[\s\S]*?details:[\s\S]*?type:\s*)object/,
          "$1array",
          "NotificationErrorResponse details type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service NotificationErrorResponse details schema property contract"
        );
        expect(output).toContain(
          "schema property NotificationErrorResponse.details type expected object got array"
        );
      }
    );
  });

  test("fails strict check when NotificationErrorResponse details additionalProperties drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(NotificationErrorResponse:[\s\S]*?details:[\s\S]*?additionalProperties:\s*)true/,
          "$1false",
          "NotificationErrorResponse details additionalProperties"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service NotificationErrorResponse details additionalProperties contract"
        );
        expect(output).toContain(
          "schema property NotificationErrorResponse.details additionalProperties expected true got false"
        );
      }
    );
  });

  test("fails strict check when escalation export state filter type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(\/integrations\/messaging\/fault-injection\/manifest\/verify\/attempts\/retention\/escalations\/export:[\s\S]*?- name: state[\s\S]*?type:\s*)string/,
          "$1integer",
          "escalation export state filter type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service GET /integrations/messaging/fault-injection/manifest/verify/attempts/retention/escalations/export escalation state/severity filter parameter contract"
        );
        expect(output).toContain("parameter query:state type expected string got integer");
      }
    );
  });

  test("fails strict check when escalation export escalationSeverity filter type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(\/integrations\/messaging\/fault-injection\/manifest\/verify\/attempts\/retention\/escalations\/export:[\s\S]*?- name: escalationSeverity[\s\S]*?type:\s*)string/,
          "$1boolean",
          "escalation export escalationSeverity filter type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service GET /integrations/messaging/fault-injection/manifest/verify/attempts/retention/escalations/export escalation state/severity filter parameter contract"
        );
        expect(output).toContain(
          "parameter query:escalationSeverity type expected string got boolean"
        );
      }
    );
  });

  test("fails strict check when escalation policy enabled default drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptEscalationPolicy:[\s\S]*?enabled:[\s\S]*?default:\s*)true/,
          "$1false",
          "escalation policy enabled default"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service POST /integrations/messaging/fault-injection/manifest/verify/attempts/retention/apply request schema escalation policy enabled anchor"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptEscalationPolicy.enabled default expected true got false"
        );
      }
    );
  });

  test("fails strict check when escalation export policy enabled type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptEscalationExportPolicy:[\s\S]*?enabled:[\s\S]*?type:\s*)boolean/,
          "$1string",
          "escalation export policy enabled type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service POST /integrations/messaging/fault-injection/manifest/verify/attempts/retention/apply request schema escalation export policy enabled anchor"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptEscalationExportPolicy.enabled type expected boolean got string"
        );
      }
    );
  });

  test("fails strict check when escalation export policy maxExportRows type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptEscalationExportPolicy:[\s\S]*?maxExportRows:[\s\S]*?type:\s*)integer/,
          "$1string",
          "escalation export policy maxExportRows type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service POST /integrations/messaging/fault-injection/manifest/verify/attempts/retention/apply request schema escalation export policy maxExportRows anchor"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptEscalationExportPolicy.maxExportRows type expected integer got string"
        );
      }
    );
  });

  test("fails strict check when triage note type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptAnomalyTriageRequest:[\s\S]*?note:[\s\S]*?type:\s*)string/,
          "$1array",
          "triage note type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service POST /integrations/messaging/fault-injection/manifest/verify/attempts/retention/anomalies/{anomalyInstanceId}/triage request schema note anchor"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptAnomalyTriageRequest.note type expected string got array"
        );
      }
    );
  });

  test("fails strict check when triage noteType type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptAnomalyTriageRequest:[\s\S]*?noteType:[\s\S]*?type:\s*)string/,
          "$1boolean",
          "triage noteType type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service POST /integrations/messaging/fault-injection/manifest/verify/attempts/retention/anomalies/{anomalyInstanceId}/triage request schema noteType anchor"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptAnomalyTriageRequest.noteType type expected string got boolean"
        );
      }
    );
  });

  test("fails strict check when triage noteAuthor type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptAnomalyTriageRequest:[\s\S]*?noteAuthor:[\s\S]*?type:\s*)string/,
          "$1integer",
          "triage noteAuthor type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service POST /integrations/messaging/fault-injection/manifest/verify/attempts/retention/anomalies/{anomalyInstanceId}/triage request schema noteAuthor anchor"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptAnomalyTriageRequest.noteAuthor type expected string got integer"
        );
      }
    );
  });

  test("fails strict check when triage mitigationEvidenceRef type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptAnomalyTriageRequest:[\s\S]*?mitigationEvidenceRef:[\s\S]*?type:\s*)string/,
          "$1integer",
          "triage mitigationEvidenceRef type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service POST /integrations/messaging/fault-injection/manifest/verify/attempts/retention/anomalies/{anomalyInstanceId}/triage request schema mitigationEvidenceRef anchor"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptAnomalyTriageRequest.mitigationEvidenceRef type expected string got integer"
        );
      }
    );
  });

  test("fails strict check when triage mitigationType type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptAnomalyTriageRequest:[\s\S]*?mitigationType:[\s\S]*?type:\s*)string/,
          "$1boolean",
          "triage mitigationType type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service POST /integrations/messaging/fault-injection/manifest/verify/attempts/retention/anomalies/{anomalyInstanceId}/triage request schema mitigationType anchor"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptAnomalyTriageRequest.mitigationType type expected string got boolean"
        );
      }
    );
  });

  test("fails strict check when triage acknowledgedBy type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptAnomalyTriageRequest:[\s\S]*?acknowledgedBy:[\s\S]*?type:\s*)string/,
          "$1integer",
          "triage acknowledgedBy type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service POST /integrations/messaging/fault-injection/manifest/verify/attempts/retention/anomalies/{anomalyInstanceId}/triage request schema acknowledgedBy anchor"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptAnomalyTriageRequest.acknowledgedBy type expected string got integer"
        );
      }
    );
  });

  test("fails strict check when retention apply dedupeWindowSeconds type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptRetentionApplyRequest:[\s\S]*?dedupeWindowSeconds:[\s\S]*?type:\s*)integer/,
          "$1string",
          "retention apply dedupeWindowSeconds type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service POST /integrations/messaging/fault-injection/manifest/verify/attempts/retention/apply request schema dedupeWindowSeconds anchor"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptRetentionApplyRequest.dedupeWindowSeconds type expected integer got string"
        );
      }
    );
  });

  test("fails strict check when retention apply maxEntries type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptRetentionApplyRequest:[\s\S]*?maxEntries:[\s\S]*?type:\s*)integer/,
          "$1string",
          "retention apply maxEntries type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service POST /integrations/messaging/fault-injection/manifest/verify/attempts/retention/apply request schema maxEntries anchor"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptRetentionApplyRequest.maxEntries type expected integer got string"
        );
      }
    );
  });

  test("fails strict check when escalation policy warning threshold type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptEscalationPolicy:[\s\S]*?warningUnacknowledgedEscalateAfterSeconds:[\s\S]*?type:\s*)integer/,
          "$1string",
          "escalation policy warningUnacknowledgedEscalateAfterSeconds type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptEscalationPolicy warningUnacknowledgedEscalateAfterSeconds schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptEscalationPolicy.warningUnacknowledgedEscalateAfterSeconds type expected integer got string"
        );
      }
    );
  });

  test("fails strict check when escalation policy critical-unacknowledged threshold type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptEscalationPolicy:[\s\S]*?criticalUnacknowledgedEscalateAfterSeconds:[\s\S]*?type:\s*)integer/,
          "$1boolean",
          "escalation policy criticalUnacknowledgedEscalateAfterSeconds type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptEscalationPolicy criticalUnacknowledgedEscalateAfterSeconds schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptEscalationPolicy.criticalUnacknowledgedEscalateAfterSeconds type expected integer got boolean"
        );
      }
    );
  });

  test("fails strict check when escalation policy critical-unmitigated threshold type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptEscalationPolicy:[\s\S]*?criticalUnmitigatedEscalateAfterSeconds:[\s\S]*?type:\s*)integer/,
          "$1string",
          "escalation policy criticalUnmitigatedEscalateAfterSeconds type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptEscalationPolicy criticalUnmitigatedEscalateAfterSeconds schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptEscalationPolicy.criticalUnmitigatedEscalateAfterSeconds type expected integer got string"
        );
      }
    );
  });

  test("fails strict check when acknowledgement SLA status type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptAnomalyEscalationAcknowledgementSla:[\s\S]*?status:[\s\S]*?type:\s*)string/,
          "$1integer",
          "acknowledgement SLA status type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptAnomalyEscalationAcknowledgementSla status schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptAnomalyEscalationAcknowledgementSla.status type expected string got integer"
        );
      }
    );
  });

  test("fails strict check when acknowledgement SLA breached type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptAnomalyEscalationAcknowledgementSla:[\s\S]*?breached:[\s\S]*?type:\s*)boolean/,
          "$1string",
          "acknowledgement SLA breached type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptAnomalyEscalationAcknowledgementSla breached schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptAnomalyEscalationAcknowledgementSla.breached type expected boolean got string"
        );
      }
    );
  });

  test("fails strict check when acknowledgement SLA acknowledged type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptAnomalyEscalationAcknowledgementSla:[\s\S]*?acknowledged:[\s\S]*?type:\s*)boolean/,
          "$1integer",
          "acknowledgement SLA acknowledged type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptAnomalyEscalationAcknowledgementSla acknowledged schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptAnomalyEscalationAcknowledgementSla.acknowledged type expected boolean got integer"
        );
      }
    );
  });

  test("fails strict check when escalation export response escalations type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptEscalationExportResponse:[\s\S]*?escalations:[\s\S]*?type:\s*)array/,
          "$1object",
          "escalation export response escalations type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptEscalationExportResponse escalations schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptEscalationExportResponse.escalations type expected array got object"
        );
      }
    );
  });

  test("fails strict check when escalation export response totalMatched type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptEscalationExportResponse:[\s\S]*?totalMatched:[\s\S]*?type:\s*)integer/,
          "$1string",
          "escalation export response totalMatched type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptEscalationExportResponse totalMatched schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptEscalationExportResponse.totalMatched type expected integer got string"
        );
      }
    );
  });

  test("fails strict check when escalation export item escalationActionRequired type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptEscalationExportItem:[\s\S]*?escalationActionRequired:[\s\S]*?type:\s*)boolean/,
          "$1string",
          "escalation export item escalationActionRequired type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptEscalationExportItem escalationActionRequired schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptEscalationExportItem.escalationActionRequired type expected boolean got string"
        );
      }
    );
  });

  test("fails strict check when escalation export filters triageAcknowledged type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptEscalationExportFilters:[\s\S]*?triageAcknowledged:[\s\S]*?type:\s*)boolean/,
          "$1string",
          "escalation export filters triageAcknowledged type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptEscalationExportFilters triageAcknowledged schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptEscalationExportFilters.triageAcknowledged type expected boolean got string"
        );
      }
    );
  });

  test("fails strict check when escalation export response returned type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptEscalationExportResponse:[\s\S]*?returned:[\s\S]*?type:\s*)integer/,
          "$1string",
          "escalation export response returned type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptEscalationExportResponse returned schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptEscalationExportResponse.returned type expected integer got string"
        );
      }
    );
  });

  test("fails strict check when escalation export item acknowledgementSlaBreached type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptEscalationExportItem:[\s\S]*?acknowledgementSlaBreached:[\s\S]*?type:\s*)boolean/,
          "$1string",
          "escalation export item acknowledgementSlaBreached type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptEscalationExportItem acknowledgementSlaBreached schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptEscalationExportItem.acknowledgementSlaBreached type expected boolean got string"
        );
      }
    );
  });

  test("fails strict check when escalation export filters limit type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptEscalationExportFilters:[\s\S]*?limit:[\s\S]*?type:\s*)integer/,
          "$1string",
          "escalation export filters limit type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptEscalationExportFilters limit schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptEscalationExportFilters.limit type expected integer got string"
        );
      }
    );
  });

  test("fails strict check when escalation export response totalTracked type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptEscalationExportResponse:[\s\S]*?totalTracked:[\s\S]*?type:\s*)integer/,
          "$1string",
          "escalation export response totalTracked type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptEscalationExportResponse totalTracked schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptEscalationExportResponse.totalTracked type expected integer got string"
        );
      }
    );
  });

  test("fails strict check when escalation export filters actionRequired type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptEscalationExportFilters:[\s\S]*?actionRequired:[\s\S]*?type:\s*)boolean/,
          "$1string",
          "escalation export filters actionRequired type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptEscalationExportFilters actionRequired schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptEscalationExportFilters.actionRequired type expected boolean got string"
        );
      }
    );
  });

  test("fails strict check when escalation export item acknowledgementSlaBreachSeconds type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptEscalationExportItem:[\s\S]*?acknowledgementSlaBreachSeconds:[\s\S]*?type:\s*)integer/,
          "$1string",
          "escalation export item acknowledgementSlaBreachSeconds type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptEscalationExportItem acknowledgementSlaBreachSeconds schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptEscalationExportItem.acknowledgementSlaBreachSeconds type expected integer got string"
        );
      }
    );
  });

  test("fails strict check when escalation export item triageNotesCount type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptEscalationExportItem:[\s\S]*?triageNotesCount:[\s\S]*?type:\s*)integer/,
          "$1string",
          "escalation export item triageNotesCount type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptEscalationExportItem triageNotesCount schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptEscalationExportItem.triageNotesCount type expected integer got string"
        );
      }
    );
  });

  test("fails strict check when escalation export item acknowledgementSlaTargetSeconds type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptEscalationExportItem:[\s\S]*?acknowledgementSlaTargetSeconds:[\s\S]*?type:\s*)integer/,
          "$1string",
          "escalation export item acknowledgementSlaTargetSeconds type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptEscalationExportItem acknowledgementSlaTargetSeconds schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptEscalationExportItem.acknowledgementSlaTargetSeconds type expected integer got string"
        );
      }
    );
  });

  test("fails strict check when escalation export filters breached type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptEscalationExportFilters:[\s\S]*?breached:[\s\S]*?type:\s*)boolean/,
          "$1string",
          "escalation export filters breached type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptEscalationExportFilters breached schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptEscalationExportFilters.breached type expected boolean got string"
        );
      }
    );
  });

  test("fails strict check when escalation export item triageAcknowledged type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptEscalationExportItem:[\s\S]*?triageAcknowledged:[\s\S]*?type:\s*)boolean/,
          "$1string",
          "escalation export item triageAcknowledged type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptEscalationExportItem triageAcknowledged schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptEscalationExportItem.triageAcknowledged type expected boolean got string"
        );
      }
    );
  });

  test("fails strict check when escalation export item acknowledgementSlaElapsedSeconds type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptEscalationExportItem:[\s\S]*?acknowledgementSlaElapsedSeconds:[\s\S]*?type:\s*)integer/,
          "$1string",
          "escalation export item acknowledgementSlaElapsedSeconds type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptEscalationExportItem acknowledgementSlaElapsedSeconds schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptEscalationExportItem.acknowledgementSlaElapsedSeconds type expected integer got string"
        );
      }
    );
  });

  test("fails strict check when escalation export item acknowledgementSlaRemainingSeconds type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptEscalationExportItem:[\s\S]*?acknowledgementSlaRemainingSeconds:[\s\S]*?type:\s*)integer/,
          "$1string",
          "escalation export item acknowledgementSlaRemainingSeconds type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptEscalationExportItem acknowledgementSlaRemainingSeconds schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptEscalationExportItem.acknowledgementSlaRemainingSeconds type expected integer got string"
        );
      }
    );
  });

  test("fails strict check when escalation export item triageAcknowledgedAt type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptEscalationExportItem:[\s\S]*?triageAcknowledgedAt:[\s\S]*?type:\s*)string/,
          "$1integer",
          "escalation export item triageAcknowledgedAt type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptEscalationExportItem triageAcknowledgedAt schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptEscalationExportItem.triageAcknowledgedAt type expected string got integer"
        );
      }
    );
  });

  test("fails strict check when escalation export item triageAcknowledgedBy type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptEscalationExportItem:[\s\S]*?triageAcknowledgedBy:[\s\S]*?type:\s*)string/,
          "$1boolean",
          "escalation export item triageAcknowledgedBy type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptEscalationExportItem triageAcknowledgedBy schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptEscalationExportItem.triageAcknowledgedBy type expected string got boolean"
        );
      }
    );
  });

  test("fails strict check when escalation export item acknowledgementSlaStatus type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptEscalationExportItem:[\s\S]*?acknowledgementSlaStatus:[\s\S]*?type:\s*)string/,
          "$1integer",
          "escalation export item acknowledgementSlaStatus type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptEscalationExportItem acknowledgementSlaStatus schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptEscalationExportItem.acknowledgementSlaStatus type expected string got integer"
        );
      }
    );
  });

  test("fails strict check when escalation export item escalationState type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptEscalationExportItem:[\s\S]*?escalationState:[\s\S]*?type:\s*)string/,
          "$1integer",
          "escalation export item escalationState type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptEscalationExportItem escalationState schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptEscalationExportItem.escalationState type expected string got integer"
        );
      }
    );
  });

  test("fails strict check when escalation export item escalationSeverity type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptEscalationExportItem:[\s\S]*?escalationSeverity:[\s\S]*?type:\s*)string/,
          "$1boolean",
          "escalation export item escalationSeverity type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptEscalationExportItem escalationSeverity schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptEscalationExportItem.escalationSeverity type expected string got boolean"
        );
      }
    );
  });

  test("fails strict check when escalation export item escalationTrigger type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptEscalationExportItem:[\s\S]*?escalationTrigger:[\s\S]*?type:\s*)string/,
          "$1integer",
          "escalation export item escalationTrigger type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptEscalationExportItem escalationTrigger schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptEscalationExportItem.escalationTrigger type expected string got integer"
        );
      }
    );
  });

  test("fails strict check when escalation export item escalationPendingSince type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptEscalationExportItem:[\s\S]*?escalationPendingSince:[\s\S]*?type:\s*)string/,
          "$1integer",
          "escalation export item escalationPendingSince type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptEscalationExportItem escalationPendingSince schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptEscalationExportItem.escalationPendingSince type expected string got integer"
        );
      }
    );
  });

  test("fails strict check when escalation export item escalationEscalatedAt type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptEscalationExportItem:[\s\S]*?escalationEscalatedAt:[\s\S]*?type:\s*)string/,
          "$1boolean",
          "escalation export item escalationEscalatedAt type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptEscalationExportItem escalationEscalatedAt schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptEscalationExportItem.escalationEscalatedAt type expected string got boolean"
        );
      }
    );
  });

  test("fails strict check when escalation export item escalationResolvedAt type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptEscalationExportItem:[\s\S]*?escalationResolvedAt:[\s\S]*?type:\s*)string/,
          "$1integer",
          "escalation export item escalationResolvedAt type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptEscalationExportItem escalationResolvedAt schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptEscalationExportItem.escalationResolvedAt type expected string got integer"
        );
      }
    );
  });

  test("fails strict check when escalation export item escalationDueAt type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptEscalationExportItem:[\s\S]*?escalationDueAt:[\s\S]*?type:\s*)string/,
          "$1boolean",
          "escalation export item escalationDueAt type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptEscalationExportItem escalationDueAt schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptEscalationExportItem.escalationDueAt type expected string got boolean"
        );
      }
    );
  });

  test("fails strict check when escalation export item firstDetectedAt type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptEscalationExportItem:[\s\S]*?firstDetectedAt:[\s\S]*?type:\s*)string/,
          "$1integer",
          "escalation export item firstDetectedAt type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptEscalationExportItem firstDetectedAt schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptEscalationExportItem.firstDetectedAt type expected string got integer"
        );
      }
    );
  });

  test("fails strict check when escalation export item lastDetectedAt type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptEscalationExportItem:[\s\S]*?lastDetectedAt:[\s\S]*?type:\s*)string/,
          "$1boolean",
          "escalation export item lastDetectedAt type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptEscalationExportItem lastDetectedAt schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptEscalationExportItem.lastDetectedAt type expected string got boolean"
        );
      }
    );
  });

  test("fails strict check when escalation export item recommendedAction type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptEscalationExportItem:[\s\S]*?recommendedAction:[\s\S]*?type:\s*)string/,
          "$1boolean",
          "escalation export item recommendedAction type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptEscalationExportItem recommendedAction schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptEscalationExportItem.recommendedAction type expected string got boolean"
        );
      }
    );
  });

  test("fails strict check when escalation export item closedAt type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptEscalationExportItem:[\s\S]*?closedAt:[\s\S]*?type:\s*)string/,
          "$1integer",
          "escalation export item closedAt type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptEscalationExportItem closedAt schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptEscalationExportItem.closedAt type expected string got integer"
        );
      }
    );
  });

  test("fails strict check when escalation export item closedReason type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptEscalationExportItem:[\s\S]*?closedReason:[\s\S]*?type:\s*)string/,
          "$1boolean",
          "escalation export item closedReason type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptEscalationExportItem closedReason schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptEscalationExportItem.closedReason type expected string got boolean"
        );
      }
    );
  });

  test("fails strict check when escalation export item anomalyKey type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptEscalationExportItem:[\s\S]*?anomalyKey:[\s\S]*?type:\s*)string/,
          "$1boolean",
          "escalation export item anomalyKey type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptEscalationExportItem anomalyKey schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptEscalationExportItem.anomalyKey type expected string got boolean"
        );
      }
    );
  });

  test("fails strict check when escalation export item anomalySeverity type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptEscalationExportItem:[\s\S]*?anomalySeverity:[\s\S]*?type:\s*)string/,
          "$1integer",
          "escalation export item anomalySeverity type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptEscalationExportItem anomalySeverity schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptEscalationExportItem.anomalySeverity type expected string got integer"
        );
      }
    );
  });

  test("fails strict check when escalation export item anomalyStatus type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptEscalationExportItem:[\s\S]*?anomalyStatus:[\s\S]*?type:\s*)string/,
          "$1boolean",
          "escalation export item anomalyStatus type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptEscalationExportItem anomalyStatus schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptEscalationExportItem.anomalyStatus type expected string got boolean"
        );
      }
    );
  });

  test("fails strict check when escalation export filters includeRecentlyClosed type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptEscalationExportFilters:[\s\S]*?includeRecentlyClosed:[\s\S]*?type:\s*)boolean/,
          "$1integer",
          "escalation export filters includeRecentlyClosed type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptEscalationExportFilters includeRecentlyClosed schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptEscalationExportFilters.includeRecentlyClosed type expected boolean got integer"
        );
      }
    );
  });

  test("fails strict check when escalation export filters state type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptEscalationExportFilters:[\s\S]*?state:[\s\S]*?type:\s*)array/,
          "$1boolean",
          "escalation export filters state type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptEscalationExportFilters state schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptEscalationExportFilters.state type expected array got boolean"
        );
      }
    );
  });

  test("fails strict check when escalation export filters acknowledgementSlaStatus type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptEscalationExportFilters:[\s\S]*?acknowledgementSlaStatus:[\s\S]*?type:\s*)array/,
          "$1integer",
          "escalation export filters acknowledgementSlaStatus type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptEscalationExportFilters acknowledgementSlaStatus schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptEscalationExportFilters.acknowledgementSlaStatus type expected array got integer"
        );
      }
    );
  });

  test("fails strict check when escalation export item anomalyInstanceId type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptEscalationExportItem:[\s\S]*?anomalyInstanceId:[\s\S]*?type:\s*)string/,
          "$1integer",
          "escalation export item anomalyInstanceId type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptEscalationExportItem anomalyInstanceId schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptEscalationExportItem.anomalyInstanceId type expected string got integer"
        );
      }
    );
  });

  test("fails strict check when escalation export response exportedAt type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptEscalationExportResponse:[\s\S]*?exportedAt:[\s\S]*?type:\s*)string/,
          "$1boolean",
          "escalation export response exportedAt type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptEscalationExportResponse exportedAt schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptEscalationExportResponse.exportedAt type expected string got boolean"
        );
      }
    );
  });

  test("fails strict check when escalation export response format type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptEscalationExportResponse:[\s\S]*?format:[\s\S]*?type:\s*)string/,
          "$1integer",
          "escalation export response format type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptEscalationExportResponse format schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptEscalationExportResponse.format type expected string got integer"
        );
      }
    );
  });

  test("fails strict check when escalation export filters escalationSeverity type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptEscalationExportFilters:[\s\S]*?escalationSeverity:[\s\S]*?type:\s*)array/,
          "$1boolean",
          "escalation export filters escalationSeverity type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptEscalationExportFilters escalationSeverity schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptEscalationExportFilters.escalationSeverity type expected array got boolean"
        );
      }
    );
  });

  test("fails strict check when escalation export diagnostics retentionEndpoint type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptEscalationExportDiagnostics:[\s\S]*?retentionEndpoint:[\s\S]*?type:\s*)string/,
          "$1integer",
          "escalation export diagnostics retentionEndpoint type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptEscalationExportDiagnostics retentionEndpoint schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptEscalationExportDiagnostics.retentionEndpoint type expected string got integer"
        );
      }
    );
  });

  test("fails strict check when escalation export diagnostics retentionTrendEndpoint type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptEscalationExportDiagnostics:[\s\S]*?retentionTrendEndpoint:[\s\S]*?type:\s*)string/,
          "$1boolean",
          "escalation export diagnostics retentionTrendEndpoint type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptEscalationExportDiagnostics retentionTrendEndpoint schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptEscalationExportDiagnostics.retentionTrendEndpoint type expected string got boolean"
        );
      }
    );
  });

  test("fails strict check when escalation export diagnostics retentionAnomalyTriageEndpointTemplate type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptEscalationExportDiagnostics:[\s\S]*?retentionAnomalyTriageEndpointTemplate:[\s\S]*?type:\s*)string/,
          "$1integer",
          "escalation export diagnostics retentionAnomalyTriageEndpointTemplate type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptEscalationExportDiagnostics retentionAnomalyTriageEndpointTemplate schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptEscalationExportDiagnostics.retentionAnomalyTriageEndpointTemplate type expected string got integer"
        );
      }
    );
  });

  test("fails strict check when escalation export diagnostics retentionEscalationExportEndpointTemplate type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptEscalationExportDiagnostics:[\s\S]*?retentionEscalationExportEndpointTemplate:[\s\S]*?type:\s*)string/,
          "$1boolean",
          "escalation export diagnostics retentionEscalationExportEndpointTemplate type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptEscalationExportDiagnostics retentionEscalationExportEndpointTemplate schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptEscalationExportDiagnostics.retentionEscalationExportEndpointTemplate type expected string got boolean"
        );
      }
    );
  });

  test("fails strict check when escalation export policy enabled type drifts via policy schema contract", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptEscalationExportPolicy:[\s\S]*?enabled:[\s\S]*?type:\s*)boolean/,
          "$1string",
          "escalation export policy schema enabled type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptEscalationExportPolicy enabled schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptEscalationExportPolicy.enabled type expected boolean got string"
        );
      }
    );
  });

  test("fails strict check when escalation export policy defaultFormat type drifts via policy schema contract", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptEscalationExportPolicy:[\s\S]*?defaultFormat:[\s\S]*?type:\s*)string/,
          "$1boolean",
          "escalation export policy schema defaultFormat type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptEscalationExportPolicy defaultFormat schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptEscalationExportPolicy.defaultFormat type expected string got boolean"
        );
      }
    );
  });

  test("fails strict check when escalation export policy maxExportRows type drifts via policy schema contract", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptEscalationExportPolicy:[\s\S]*?maxExportRows:[\s\S]*?type:\s*)integer/,
          "$1string",
          "escalation export policy schema maxExportRows type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptEscalationExportPolicy maxExportRows schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptEscalationExportPolicy.maxExportRows type expected integer got string"
        );
      }
    );
  });

  test("fails strict check when escalation export policy includeRecentlyClosedByDefault type drifts via policy schema contract", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptEscalationExportPolicy:[\s\S]*?includeRecentlyClosedByDefault:[\s\S]*?type:\s*)boolean/,
          "$1string",
          "escalation export policy schema includeRecentlyClosedByDefault type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptEscalationExportPolicy includeRecentlyClosedByDefault schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptEscalationExportPolicy.includeRecentlyClosedByDefault type expected boolean got string"
        );
      }
    );
  });

  test("fails strict check when escalation export response policy property is removed", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptEscalationExportResponse:[\s\S]*?)\n\s{8}policy:\n\s{10}\$ref:\s*"#\/components\/schemas\/MessagingFaultManifestVerifyAttemptEscalationExportPolicy"/,
          "$1",
          "escalation export response policy property"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptEscalationExportResponse policy schema property contract"
        );
        expect(output).toContain(
          "missing schema property MessagingFaultManifestVerifyAttemptEscalationExportResponse.policy"
        );
      }
    );
  });

  test("fails strict check when escalation export response filters property is removed", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptEscalationExportResponse:[\s\S]*?)\n\s{8}filters:\n\s{10}\$ref:\s*"#\/components\/schemas\/MessagingFaultManifestVerifyAttemptEscalationExportFilters"/,
          "$1",
          "escalation export response filters property"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptEscalationExportResponse filters schema property contract"
        );
        expect(output).toContain(
          "missing schema property MessagingFaultManifestVerifyAttemptEscalationExportResponse.filters"
        );
      }
    );
  });

  test("fails strict check when escalation export response diagnostics property is removed", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptEscalationExportResponse:[\s\S]*?)\n\s{8}diagnostics:\n\s{10}\$ref:\s*"#\/components\/schemas\/MessagingFaultManifestVerifyAttemptEscalationExportDiagnostics"/,
          "$1",
          "escalation export response diagnostics property"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptEscalationExportResponse diagnostics schema property contract"
        );
        expect(output).toContain(
          "missing schema property MessagingFaultManifestVerifyAttemptEscalationExportResponse.diagnostics"
        );
      }
    );
  });

  test("fails strict check when escalation export item diagnostics property is removed", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptEscalationExportItem:[\s\S]*?)\n\s{8}diagnostics:\n\s{10}\$ref:\s*"#\/components\/schemas\/MessagingFaultManifestVerifyAttemptEscalationExportDiagnostics"/,
          "$1",
          "escalation export item diagnostics property"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptEscalationExportItem diagnostics schema property contract"
        );
        expect(output).toContain(
          "missing schema property MessagingFaultManifestVerifyAttemptEscalationExportItem.diagnostics"
        );
      }
    );
  });

  test("fails strict check when retention apply request escalationPolicy property is removed", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptRetentionApplyRequest:[\s\S]*?)\n\s{8}escalationPolicy:\n\s{10}\$ref:\s*"#\/components\/schemas\/MessagingFaultManifestVerifyAttemptEscalationPolicy"/,
          "$1",
          "retention apply request escalationPolicy property"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptRetentionApplyRequest escalationPolicy schema property contract"
        );
        expect(output).toContain(
          "missing schema property MessagingFaultManifestVerifyAttemptRetentionApplyRequest.escalationPolicy"
        );
      }
    );
  });

  test("fails strict check when retention apply request escalationExportPolicy property is removed", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptRetentionApplyRequest:[\s\S]*?)\n\s{8}escalationExportPolicy:\n\s{10}\$ref:\s*"#\/components\/schemas\/MessagingFaultManifestVerifyAttemptEscalationExportPolicy"/,
          "$1",
          "retention apply request escalationExportPolicy property"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptRetentionApplyRequest escalationExportPolicy schema property contract"
        );
        expect(output).toContain(
          "missing schema property MessagingFaultManifestVerifyAttemptRetentionApplyRequest.escalationExportPolicy"
        );
      }
    );
  });

  test("fails strict check when retention apply response appliedAt type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptRetentionApplyResponse:[\s\S]*?appliedAt:[\s\S]*?type:\s*)string/,
          "$1integer",
          "retention apply response appliedAt type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptRetentionApplyResponse appliedAt schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptRetentionApplyResponse.appliedAt type expected string got integer"
        );
      }
    );
  });

  test("fails strict check when retention apply response telemetry property is removed", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptRetentionApplyResponse:[\s\S]*?)\n\s{8}telemetry:\n\s{10}\$ref:\s*"#\/components\/schemas\/MessagingFaultManifestVerifyAttemptRetentionTelemetry"/,
          "$1",
          "retention apply response telemetry property"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptRetentionApplyResponse telemetry schema property contract"
        );
        expect(output).toContain(
          "missing schema property MessagingFaultManifestVerifyAttemptRetentionApplyResponse.telemetry"
        );
      }
    );
  });

  test("fails strict check when retention apply response diagnostics type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptRetentionApplyResponse:[\s\S]*?diagnostics:[\s\S]*?type:\s*)object/,
          "$1string",
          "retention apply response diagnostics type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptRetentionApplyResponse diagnostics schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptRetentionApplyResponse.diagnostics type expected object got string"
        );
      }
    );
  });

  test("fails strict check when retention status response retention property is removed", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptRetentionStatusResponse:[\s\S]*?)\n\s{8}retention:\n\s{10}\$ref:\s*"#\/components\/schemas\/MessagingFaultManifestVerifyAttemptRetentionPolicy"/,
          "$1",
          "retention status response retention property"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptRetentionStatusResponse retention schema property contract"
        );
        expect(output).toContain(
          "missing schema property MessagingFaultManifestVerifyAttemptRetentionStatusResponse.retention"
        );
      }
    );
  });

  test("fails strict check when retention status response telemetry property is removed", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptRetentionStatusResponse:[\s\S]*?)\n\s{8}telemetry:\n\s{10}\$ref:\s*"#\/components\/schemas\/MessagingFaultManifestVerifyAttemptRetentionTelemetry"/,
          "$1",
          "retention status response telemetry property"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptRetentionStatusResponse telemetry schema property contract"
        );
        expect(output).toContain(
          "missing schema property MessagingFaultManifestVerifyAttemptRetentionStatusResponse.telemetry"
        );
      }
    );
  });

  test("fails strict check when retention status response diagnostics property is removed", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptRetentionStatusResponse:[\s\S]*?)\n\s{8}diagnostics:\n\s{10}\$ref:\s*"#\/components\/schemas\/MessagingFaultManifestVerifyAttemptRetentionStatusDiagnostics"/,
          "$1",
          "retention status response diagnostics property"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptRetentionStatusResponse diagnostics schema property contract"
        );
        expect(output).toContain(
          "missing schema property MessagingFaultManifestVerifyAttemptRetentionStatusResponse.diagnostics"
        );
      }
    );
  });

  test("fails strict check when retention saturation trend response queriedAt type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptRetentionSaturationTrendResponse:[\s\S]*?queriedAt:[\s\S]*?type:\s*)string/,
          "$1integer",
          "retention saturation trend response queriedAt type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptRetentionSaturationTrendResponse queriedAt schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptRetentionSaturationTrendResponse.queriedAt type expected string got integer"
        );
      }
    );
  });

  test("fails strict check when retention saturation trend response snapshots type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptRetentionSaturationTrendResponse:[\s\S]*?snapshots:[\s\S]*?type:\s*)array/,
          "$1object",
          "retention saturation trend response snapshots type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptRetentionSaturationTrendResponse snapshots schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptRetentionSaturationTrendResponse.snapshots type expected array got object"
        );
      }
    );
  });

  test("fails strict check when retention saturation trend response diagnostics type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptRetentionSaturationTrendResponse:[\s\S]*?diagnostics:[\s\S]*?type:\s*)object/,
          "$1string",
          "retention saturation trend response diagnostics type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptRetentionSaturationTrendResponse diagnostics schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptRetentionSaturationTrendResponse.diagnostics type expected object got string"
        );
      }
    );
  });

  test("fails strict check when retention saturation trend response query type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptRetentionSaturationTrendResponse:[\s\S]*?query:[\s\S]*?type:\s*)object/,
          "$1string",
          "retention saturation trend response query type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptRetentionSaturationTrendResponse query schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptRetentionSaturationTrendResponse.query type expected object got string"
        );
      }
    );
  });

  test("fails strict check when retention saturation trend response summary property is removed", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptRetentionSaturationTrendResponse:[\s\S]*?)\n\s{8}summary:\n\s{10}\$ref:\s*"#\/components\/schemas\/MessagingFaultManifestVerifyAttemptRetentionSaturationTrendSummary"/,
          "$1",
          "retention saturation trend response summary property"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptRetentionSaturationTrendResponse summary schema property contract"
        );
        expect(output).toContain(
          "missing schema property MessagingFaultManifestVerifyAttemptRetentionSaturationTrendResponse.summary"
        );
      }
    );
  });

  test("fails strict check when retention saturation trend response latestSaturation property is removed", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptRetentionSaturationTrendResponse:[\s\S]*?)\n\s{8}latestSaturation:\n\s{10}\$ref:\s*"#\/components\/schemas\/MessagingFaultManifestVerifyAttemptRetentionSaturation"/,
          "$1",
          "retention saturation trend response latestSaturation property"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptRetentionSaturationTrendResponse latestSaturation schema property contract"
        );
        expect(output).toContain(
          "missing schema property MessagingFaultManifestVerifyAttemptRetentionSaturationTrendResponse.latestSaturation"
        );
      }
    );
  });

  test("fails strict check when retention apply response retention type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptRetentionApplyResponse:[\s\S]*?retention:[\s\S]*?type:\s*)object/,
          "$1string",
          "retention apply response retention type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptRetentionApplyResponse retention schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptRetentionApplyResponse.retention type expected object got string"
        );
      }
    );
  });

  test("fails strict check when retention policy dedupeWindowSeconds type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptRetentionPolicy:[\s\S]*?dedupeWindowSeconds:[\s\S]*?type:\s*)integer/,
          "$1string",
          "retention policy dedupeWindowSeconds type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptRetentionPolicy dedupeWindowSeconds schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptRetentionPolicy.dedupeWindowSeconds type expected integer got string"
        );
      }
    );
  });

  test("fails strict check when retention policy maxEntries type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptRetentionPolicy:[\s\S]*?maxEntries:[\s\S]*?type:\s*)integer/,
          "$1boolean",
          "retention policy maxEntries type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptRetentionPolicy maxEntries schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptRetentionPolicy.maxEntries type expected integer got boolean"
        );
      }
    );
  });

  test("fails strict check when retention policy minDedupeWindowSeconds type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptRetentionPolicy:[\s\S]*?minDedupeWindowSeconds:[\s\S]*?type:\s*)integer/,
          "$1string",
          "retention policy minDedupeWindowSeconds type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptRetentionPolicy minDedupeWindowSeconds schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptRetentionPolicy.minDedupeWindowSeconds type expected integer got string"
        );
      }
    );
  });

  test("fails strict check when retention policy maxDedupeWindowSeconds type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptRetentionPolicy:[\s\S]*?maxDedupeWindowSeconds:[\s\S]*?type:\s*)integer/,
          "$1boolean",
          "retention policy maxDedupeWindowSeconds type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptRetentionPolicy maxDedupeWindowSeconds schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptRetentionPolicy.maxDedupeWindowSeconds type expected integer got boolean"
        );
      }
    );
  });

  test("fails strict check when retention policy minMaxEntries type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptRetentionPolicy:[\s\S]*?minMaxEntries:[\s\S]*?type:\s*)integer/,
          "$1string",
          "retention policy minMaxEntries type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptRetentionPolicy minMaxEntries schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptRetentionPolicy.minMaxEntries type expected integer got string"
        );
      }
    );
  });

  test("fails strict check when retention policy maxMaxEntries type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptRetentionPolicy:[\s\S]*?maxMaxEntries:[\s\S]*?type:\s*)integer/,
          "$1string",
          "retention policy maxMaxEntries type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptRetentionPolicy maxMaxEntries schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptRetentionPolicy.maxMaxEntries type expected integer got string"
        );
      }
    );
  });

  test("fails strict check when retention policy source type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptRetentionPolicy:[\s\S]*?source:[\s\S]*?type:\s*)string/,
          "$1boolean",
          "retention policy source type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptRetentionPolicy source schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptRetentionPolicy.source type expected string got boolean"
        );
      }
    );
  });

  test("fails strict check when retention policy pruneStrategy type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptRetentionPolicy:[\s\S]*?pruneStrategy:[\s\S]*?type:\s*)string/,
          "$1integer",
          "retention policy pruneStrategy type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptRetentionPolicy pruneStrategy schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptRetentionPolicy.pruneStrategy type expected string got integer"
        );
      }
    );
  });

  test("fails strict check when retention policy escalationPolicy property is removed", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptRetentionPolicy:[\s\S]*?)\n\s{8}escalationPolicy:\n\s{10}\$ref:\s*"#\/components\/schemas\/MessagingFaultManifestVerifyAttemptEscalationPolicy"/,
          "$1",
          "retention policy escalationPolicy property"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptRetentionPolicy escalationPolicy schema property contract"
        );
        expect(output).toContain(
          "missing schema property MessagingFaultManifestVerifyAttemptRetentionPolicy.escalationPolicy"
        );
      }
    );
  });

  test("fails strict check when retention policy escalationExportPolicy property is removed", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptRetentionPolicy:[\s\S]*?)\n\s{8}escalationExportPolicy:\n\s{10}\$ref:\s*"#\/components\/schemas\/MessagingFaultManifestVerifyAttemptEscalationExportPolicy"/,
          "$1",
          "retention policy escalationExportPolicy property"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptRetentionPolicy escalationExportPolicy schema property contract"
        );
        expect(output).toContain(
          "missing schema property MessagingFaultManifestVerifyAttemptRetentionPolicy.escalationExportPolicy"
        );
      }
    );
  });

  test("fails strict check when retention policy lifecyclePolicy type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptRetentionPolicy:[\s\S]*?lifecyclePolicy:[\s\S]*?type:\s*)object/,
          "$1string",
          "retention policy lifecyclePolicy type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptRetentionPolicy lifecyclePolicy schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptRetentionPolicy.lifecyclePolicy type expected object got string"
        );
      }
    );
  });

  test("fails strict check when retention telemetry totalRecorded type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptRetentionTelemetry:[\s\S]*?totalRecorded:[\s\S]*?type:\s*)integer/,
          "$1string",
          "retention telemetry totalRecorded type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptRetentionTelemetry totalRecorded schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptRetentionTelemetry.totalRecorded type expected integer got string"
        );
      }
    );
  });

  test("fails strict check when retention telemetry duplicateSuppressedAttempts type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptRetentionTelemetry:[\s\S]*?duplicateSuppressedAttempts:[\s\S]*?type:\s*)integer/,
          "$1boolean",
          "retention telemetry duplicateSuppressedAttempts type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptRetentionTelemetry duplicateSuppressedAttempts schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptRetentionTelemetry.duplicateSuppressedAttempts type expected integer got boolean"
        );
      }
    );
  });

  test("fails strict check when retention telemetry totalSuppressedEvents type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptRetentionTelemetry:[\s\S]*?totalSuppressedEvents:[\s\S]*?type:\s*)integer/,
          "$1string",
          "retention telemetry totalSuppressedEvents type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptRetentionTelemetry totalSuppressedEvents schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptRetentionTelemetry.totalSuppressedEvents type expected integer got string"
        );
      }
    );
  });

  test("fails strict check when retention telemetry oldestFirstVerifiedAt type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptRetentionTelemetry:[\s\S]*?oldestFirstVerifiedAt:[\s\S]*?type:\s*)string/,
          "$1integer",
          "retention telemetry oldestFirstVerifiedAt type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptRetentionTelemetry oldestFirstVerifiedAt schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptRetentionTelemetry.oldestFirstVerifiedAt type expected string got integer"
        );
      }
    );
  });

  test("fails strict check when retention telemetry latestLastVerifiedAt type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptRetentionTelemetry:[\s\S]*?latestLastVerifiedAt:[\s\S]*?type:\s*)string/,
          "$1boolean",
          "retention telemetry latestLastVerifiedAt type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptRetentionTelemetry latestLastVerifiedAt schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptRetentionTelemetry.latestLastVerifiedAt type expected string got boolean"
        );
      }
    );
  });

  test("fails strict check when retention telemetry saturation property is removed", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptRetentionTelemetry:[\s\S]*?)\n\s{8}saturation:\n\s{10}\$ref:\s*"#\/components\/schemas\/MessagingFaultManifestVerifyAttemptRetentionSaturation"/,
          "$1",
          "retention telemetry saturation property"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptRetentionTelemetry saturation schema property contract"
        );
        expect(output).toContain(
          "missing schema property MessagingFaultManifestVerifyAttemptRetentionTelemetry.saturation"
        );
      }
    );
  });

  test("fails strict check when retention telemetry saturationTrend property is removed", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptRetentionTelemetry:[\s\S]*?)\n\s{8}saturationTrend:\n\s{10}\$ref:\s*"#\/components\/schemas\/MessagingFaultManifestVerifyAttemptRetentionSaturationTrend"/,
          "$1",
          "retention telemetry saturationTrend property"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptRetentionTelemetry saturationTrend schema property contract"
        );
        expect(output).toContain(
          "missing schema property MessagingFaultManifestVerifyAttemptRetentionTelemetry.saturationTrend"
        );
      }
    );
  });

  test("fails strict check when retention telemetry anomalies type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptRetentionTelemetry:[\s\S]*?anomalies:[\s\S]*?type:\s*)array/,
          "$1object",
          "retention telemetry anomalies type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptRetentionTelemetry anomalies schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptRetentionTelemetry.anomalies type expected array got object"
        );
      }
    );
  });

  test("fails strict check when retention telemetry highestAnomalySeverity type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptRetentionTelemetry:[\s\S]*?highestAnomalySeverity:[\s\S]*?type:\s*)string/,
          "$1boolean",
          "retention telemetry highestAnomalySeverity type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptRetentionTelemetry highestAnomalySeverity schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptRetentionTelemetry.highestAnomalySeverity type expected string got boolean"
        );
      }
    );
  });

  test("fails strict check when retention telemetry anomalyTracking property is removed", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptRetentionTelemetry:[\s\S]*?)\n\s{8}anomalyTracking:\n\s{10}\$ref:\s*"#\/components\/schemas\/MessagingFaultManifestVerifyAttemptAnomalyTrackingSummary"/,
          "$1",
          "retention telemetry anomalyTracking property"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptRetentionTelemetry anomalyTracking schema property contract"
        );
        expect(output).toContain(
          "missing schema property MessagingFaultManifestVerifyAttemptRetentionTelemetry.anomalyTracking"
        );
      }
    );
  });

  test("fails strict check when retention telemetry escalation property is removed", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptRetentionTelemetry:[\s\S]*?)\n\s{8}escalation:\n\s{10}\$ref:\s*"#\/components\/schemas\/MessagingFaultManifestVerifyAttemptEscalationTelemetry"/,
          "$1",
          "retention telemetry escalation property"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptRetentionTelemetry escalation schema property contract"
        );
        expect(output).toContain(
          "missing schema property MessagingFaultManifestVerifyAttemptRetentionTelemetry.escalation"
        );
      }
    );
  });

  test("fails strict check when retention telemetry recentlyClosedAnomalies type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptRetentionTelemetry:[\s\S]*?recentlyClosedAnomalies:[\s\S]*?type:\s*)array/,
          "$1object",
          "retention telemetry recentlyClosedAnomalies type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptRetentionTelemetry recentlyClosedAnomalies schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptRetentionTelemetry.recentlyClosedAnomalies type expected array got object"
        );
      }
    );
  });

  test("fails strict check when anomaly tracking summary statePersistence type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptAnomalyTrackingSummary:[\s\S]*?statePersistence:[\s\S]*?type:\s*)string/,
          "$1boolean",
          "anomaly tracking summary statePersistence type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptAnomalyTrackingSummary statePersistence schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptAnomalyTrackingSummary.statePersistence type expected string got boolean"
        );
      }
    );
  });

  test("fails strict check when anomaly tracking summary retainedAnomalyInstances type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptAnomalyTrackingSummary:[\s\S]*?retainedAnomalyInstances:[\s\S]*?type:\s*)integer/,
          "$1string",
          "anomaly tracking summary retainedAnomalyInstances type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptAnomalyTrackingSummary retainedAnomalyInstances schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptAnomalyTrackingSummary.retainedAnomalyInstances type expected integer got string"
        );
      }
    );
  });

  test("fails strict check when anomaly tracking summary retainedActionEntries type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptAnomalyTrackingSummary:[\s\S]*?retainedActionEntries:[\s\S]*?type:\s*)integer/,
          "$1boolean",
          "anomaly tracking summary retainedActionEntries type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptAnomalyTrackingSummary retainedActionEntries schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptAnomalyTrackingSummary.retainedActionEntries type expected integer got boolean"
        );
      }
    );
  });

  test("fails strict check when anomaly tracking summary activeCount type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptAnomalyTrackingSummary:[\s\S]*?activeCount:[\s\S]*?type:\s*)integer/,
          "$1string",
          "anomaly tracking summary activeCount type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptAnomalyTrackingSummary activeCount schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptAnomalyTrackingSummary.activeCount type expected integer got string"
        );
      }
    );
  });

  test("fails strict check when anomaly tracking summary acknowledgedActiveCount type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptAnomalyTrackingSummary:[\s\S]*?acknowledgedActiveCount:[\s\S]*?type:\s*)integer/,
          "$1boolean",
          "anomaly tracking summary acknowledgedActiveCount type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptAnomalyTrackingSummary acknowledgedActiveCount schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptAnomalyTrackingSummary.acknowledgedActiveCount type expected integer got boolean"
        );
      }
    );
  });

  test("fails strict check when anomaly tracking summary unacknowledgedActiveCount type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptAnomalyTrackingSummary:[\s\S]*?unacknowledgedActiveCount:[\s\S]*?type:\s*)integer/,
          "$1string",
          "anomaly tracking summary unacknowledgedActiveCount type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptAnomalyTrackingSummary unacknowledgedActiveCount schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptAnomalyTrackingSummary.unacknowledgedActiveCount type expected integer got string"
        );
      }
    );
  });

  test("fails strict check when anomaly tracking summary escalation property is removed", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptAnomalyTrackingSummary:[\s\S]*?)\n\s{8}escalation:\n\s{10}\$ref:\s*"#\/components\/schemas\/MessagingFaultManifestVerifyAttemptEscalationTelemetry"/,
          "$1",
          "anomaly tracking summary escalation property"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptAnomalyTrackingSummary escalation schema property contract"
        );
        expect(output).toContain(
          "missing schema property MessagingFaultManifestVerifyAttemptAnomalyTrackingSummary.escalation"
        );
      }
    );
  });

  test("fails strict check when anomaly tracking summary noteCount type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptAnomalyTrackingSummary:[\s\S]*?noteCount:[\s\S]*?type:\s*)integer/,
          "$1string",
          "anomaly tracking summary noteCount type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptAnomalyTrackingSummary noteCount schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptAnomalyTrackingSummary.noteCount type expected integer got string"
        );
      }
    );
  });

  test("fails strict check when anomaly tracking summary retainedRecentlyClosedEntries type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptAnomalyTrackingSummary:[\s\S]*?retainedRecentlyClosedEntries:[\s\S]*?type:\s*)integer/,
          "$1boolean",
          "anomaly tracking summary retainedRecentlyClosedEntries type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptAnomalyTrackingSummary retainedRecentlyClosedEntries schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptAnomalyTrackingSummary.retainedRecentlyClosedEntries type expected integer got boolean"
        );
      }
    );
  });

  test("fails strict check when escalation telemetry activeEscalations type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptEscalationTelemetry:[\s\S]*?activeEscalations:[\s\S]*?type:\s*)integer/,
          "$1string",
          "escalation telemetry activeEscalations type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptEscalationTelemetry activeEscalations schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptEscalationTelemetry.activeEscalations type expected integer got string"
        );
      }
    );
  });

  test("fails strict check when escalation telemetry pendingEscalations type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptEscalationTelemetry:[\s\S]*?pendingEscalations:[\s\S]*?type:\s*)integer/,
          "$1boolean",
          "escalation telemetry pendingEscalations type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptEscalationTelemetry pendingEscalations schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptEscalationTelemetry.pendingEscalations type expected integer got boolean"
        );
      }
    );
  });

  test("fails strict check when escalation telemetry highestEscalationSeverity type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptEscalationTelemetry:[\s\S]*?highestEscalationSeverity:[\s\S]*?type:\s*)string/,
          "$1integer",
          "escalation telemetry highestEscalationSeverity type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptEscalationTelemetry highestEscalationSeverity schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptEscalationTelemetry.highestEscalationSeverity type expected string got integer"
        );
      }
    );
  });

  test("fails strict check when escalation acknowledgement SLA summary trackedCount type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptEscalationAcknowledgementSlaSummary:[\s\S]*?trackedCount:[\s\S]*?type:\s*)integer/,
          "$1string",
          "escalation acknowledgement SLA summary trackedCount type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptEscalationAcknowledgementSlaSummary trackedCount schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptEscalationAcknowledgementSlaSummary.trackedCount type expected integer got string"
        );
      }
    );
  });

  test("fails strict check when escalation acknowledgement SLA summary applicableCount type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptEscalationAcknowledgementSlaSummary:[\s\S]*?applicableCount:[\s\S]*?type:\s*)integer/,
          "$1boolean",
          "escalation acknowledgement SLA summary applicableCount type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptEscalationAcknowledgementSlaSummary applicableCount schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptEscalationAcknowledgementSlaSummary.applicableCount type expected integer got boolean"
        );
      }
    );
  });

  test("fails strict check when escalation acknowledgement SLA summary withinSlaCount type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptEscalationAcknowledgementSlaSummary:[\s\S]*?withinSlaCount:[\s\S]*?type:\s*)integer/,
          "$1string",
          "escalation acknowledgement SLA summary withinSlaCount type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptEscalationAcknowledgementSlaSummary withinSlaCount schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptEscalationAcknowledgementSlaSummary.withinSlaCount type expected integer got string"
        );
      }
    );
  });

  test("fails strict check when escalation acknowledgement SLA summary breachedCount type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptEscalationAcknowledgementSlaSummary:[\s\S]*?breachedCount:[\s\S]*?type:\s*)integer/,
          "$1boolean",
          "escalation acknowledgement SLA summary breachedCount type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptEscalationAcknowledgementSlaSummary breachedCount schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptEscalationAcknowledgementSlaSummary.breachedCount type expected integer got boolean"
        );
      }
    );
  });

  test("fails strict check when escalation acknowledgement SLA summary acknowledgedCount type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptEscalationAcknowledgementSlaSummary:[\s\S]*?acknowledgedCount:[\s\S]*?type:\s*)integer/,
          "$1string",
          "escalation acknowledgement SLA summary acknowledgedCount type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptEscalationAcknowledgementSlaSummary acknowledgedCount schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptEscalationAcknowledgementSlaSummary.acknowledgedCount type expected integer got string"
        );
      }
    );
  });

  test("fails strict check when escalation acknowledgement SLA summary acknowledgedWithinSlaCount type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptEscalationAcknowledgementSlaSummary:[\s\S]*?acknowledgedWithinSlaCount:[\s\S]*?type:\s*)integer/,
          "$1boolean",
          "escalation acknowledgement SLA summary acknowledgedWithinSlaCount type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptEscalationAcknowledgementSlaSummary acknowledgedWithinSlaCount schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptEscalationAcknowledgementSlaSummary.acknowledgedWithinSlaCount type expected integer got boolean"
        );
      }
    );
  });

  test("fails strict check when escalation acknowledgement SLA summary acknowledgedBreachedCount type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptEscalationAcknowledgementSlaSummary:[\s\S]*?acknowledgedBreachedCount:[\s\S]*?type:\s*)integer/,
          "$1string",
          "escalation acknowledgement SLA summary acknowledgedBreachedCount type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptEscalationAcknowledgementSlaSummary acknowledgedBreachedCount schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptEscalationAcknowledgementSlaSummary.acknowledgedBreachedCount type expected integer got string"
        );
      }
    );
  });

  test("fails strict check when escalation acknowledgement SLA summary openBreachCount type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptEscalationAcknowledgementSlaSummary:[\s\S]*?openBreachCount:[\s\S]*?type:\s*)integer/,
          "$1boolean",
          "escalation acknowledgement SLA summary openBreachCount type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptEscalationAcknowledgementSlaSummary openBreachCount schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptEscalationAcknowledgementSlaSummary.openBreachCount type expected integer got boolean"
        );
      }
    );
  });

  test("fails strict check when escalation acknowledgement SLA summary averageAcknowledgementSeconds type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptEscalationAcknowledgementSlaSummary:[\s\S]*?averageAcknowledgementSeconds:[\s\S]*?type:\s*)integer/,
          "$1string",
          "escalation acknowledgement SLA summary averageAcknowledgementSeconds type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptEscalationAcknowledgementSlaSummary averageAcknowledgementSeconds schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptEscalationAcknowledgementSlaSummary.averageAcknowledgementSeconds type expected integer got string"
        );
      }
    );
  });

  test("fails strict check when escalation acknowledgement SLA summary p95AcknowledgementSeconds type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptEscalationAcknowledgementSlaSummary:[\s\S]*?p95AcknowledgementSeconds:[\s\S]*?type:\s*)integer/,
          "$1string",
          "escalation acknowledgement SLA summary p95AcknowledgementSeconds type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptEscalationAcknowledgementSlaSummary p95AcknowledgementSeconds schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptEscalationAcknowledgementSlaSummary.p95AcknowledgementSeconds type expected integer got string"
        );
      }
    );
  });

  test("fails strict check when escalation telemetry byState type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptEscalationTelemetry:[\s\S]*?byState:[\s\S]*?type:\s*)object/,
          "$1array",
          "escalation telemetry byState type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptEscalationTelemetry byState schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptEscalationTelemetry.byState type expected object got array"
        );
      }
    );
  });

  test("fails strict check when escalation telemetry acknowledgementSla property is removed", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptEscalationTelemetry:[\s\S]*?)\n\s{8}acknowledgementSla:\n\s{10}\$ref:\s*"#\/components\/schemas\/MessagingFaultManifestVerifyAttemptEscalationAcknowledgementSlaSummary"/,
          "$1",
          "escalation telemetry acknowledgementSla property"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptEscalationTelemetry acknowledgementSla schema property contract"
        );
        expect(output).toContain(
          "missing schema property MessagingFaultManifestVerifyAttemptEscalationTelemetry.acknowledgementSla"
        );
      }
    );
  });

  test("fails strict check when recently closed anomaly anomalyInstanceId type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptRecentlyClosedAnomaly:[\s\S]*?anomalyInstanceId:[\s\S]*?type:\s*)string/,
          "$1integer",
          "recently closed anomaly anomalyInstanceId type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptRecentlyClosedAnomaly anomalyInstanceId schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptRecentlyClosedAnomaly.anomalyInstanceId type expected string got integer"
        );
      }
    );
  });

  test("fails strict check when recently closed anomaly key type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptRecentlyClosedAnomaly:[\s\S]*?key:[\s\S]*?type:\s*)string/,
          "$1boolean",
          "recently closed anomaly key type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptRecentlyClosedAnomaly key schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptRecentlyClosedAnomaly.key type expected string got boolean"
        );
      }
    );
  });

  test("fails strict check when recently closed anomaly severity type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptRecentlyClosedAnomaly:[\s\S]*?severity:[\s\S]*?type:\s*)string/,
          "$1integer",
          "recently closed anomaly severity type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptRecentlyClosedAnomaly severity schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptRecentlyClosedAnomaly.severity type expected string got integer"
        );
      }
    );
  });

  test("fails strict check when recently closed anomaly closedAt type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptRecentlyClosedAnomaly:[\s\S]*?closedAt:[\s\S]*?type:\s*)string/,
          "$1integer",
          "recently closed anomaly closedAt type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptRecentlyClosedAnomaly closedAt schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptRecentlyClosedAnomaly.closedAt type expected string got integer"
        );
      }
    );
  });

  test("fails strict check when recently closed anomaly closedReason type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptRecentlyClosedAnomaly:[\s\S]*?closedReason:[\s\S]*?type:\s*)string/,
          "$1boolean",
          "recently closed anomaly closedReason type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptRecentlyClosedAnomaly closedReason schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptRecentlyClosedAnomaly.closedReason type expected string got boolean"
        );
      }
    );
  });

  test("fails strict check when recently closed anomaly clearanceEvidence type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptRecentlyClosedAnomaly:[\s\S]*?clearanceEvidence:[\s\S]*?type:\s*)object/,
          "$1array",
          "recently closed anomaly clearanceEvidence type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptRecentlyClosedAnomaly clearanceEvidence schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptRecentlyClosedAnomaly.clearanceEvidence type expected object got array"
        );
      }
    );
  });

  test("fails strict check when recently closed anomaly clearanceEvidence additionalProperties drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptRecentlyClosedAnomaly:[\s\S]*?clearanceEvidence:[\s\S]*?additionalProperties:\s*)true/,
          "$1false",
          "recently closed anomaly clearanceEvidence additionalProperties"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptRecentlyClosedAnomaly clearanceEvidence additionalProperties contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptRecentlyClosedAnomaly.clearanceEvidence additionalProperties expected true got false"
        );
      }
    );
  });

  test("fails strict check when anomaly triage note noteId type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptAnomalyTriageNote:[\s\S]*?noteId:[\s\S]*?type:\s*)string/,
          "$1integer",
          "anomaly triage note noteId type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptAnomalyTriageNote noteId schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptAnomalyTriageNote.noteId type expected string got integer"
        );
      }
    );
  });

  test("fails strict check when anomaly triage note noteType type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptAnomalyTriageNote:[\s\S]*?noteType:[\s\S]*?type:\s*)string/,
          "$1boolean",
          "anomaly triage note noteType type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptAnomalyTriageNote noteType schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptAnomalyTriageNote.noteType type expected string got boolean"
        );
      }
    );
  });

  test("fails strict check when anomaly triage note content type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptAnomalyTriageNote:[\s\S]*?content:[\s\S]*?type:\s*)string/,
          "$1integer",
          "anomaly triage note content type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptAnomalyTriageNote content schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptAnomalyTriageNote.content type expected string got integer"
        );
      }
    );
  });

  test("fails strict check when anomaly triage note createdAt type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptAnomalyTriageNote:[\s\S]*?createdAt:[\s\S]*?type:\s*)string/,
          "$1boolean",
          "anomaly triage note createdAt type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptAnomalyTriageNote createdAt schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptAnomalyTriageNote.createdAt type expected string got boolean"
        );
      }
    );
  });

  test("fails strict check when anomaly triage note author type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptAnomalyTriageNote:[\s\S]*?author:[\s\S]*?type:\s*)string/,
          "$1object",
          "anomaly triage note author type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptAnomalyTriageNote author schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptAnomalyTriageNote.author type expected string got object"
        );
      }
    );
  });

  test("fails strict check when anomaly triage note mitigationApplied type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptAnomalyTriageNote:[\s\S]*?mitigationApplied:[\s\S]*?type:\s*)boolean/,
          "$1string",
          "anomaly triage note mitigationApplied type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptAnomalyTriageNote mitigationApplied schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptAnomalyTriageNote.mitigationApplied type expected boolean got string"
        );
      }
    );
  });

  test("fails strict check when anomaly triage note mitigationType type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptAnomalyTriageNote:[\s\S]*?mitigationType:[\s\S]*?type:\s*)string/,
          "$1integer",
          "anomaly triage note mitigationType type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptAnomalyTriageNote mitigationType schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptAnomalyTriageNote.mitigationType type expected string got integer"
        );
      }
    );
  });

  test("fails strict check when anomaly triage note mitigationEvidenceRef type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptAnomalyTriageNote:[\s\S]*?mitigationEvidenceRef:[\s\S]*?type:\s*)string/,
          "$1boolean",
          "anomaly triage note mitigationEvidenceRef type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptAnomalyTriageNote mitigationEvidenceRef schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptAnomalyTriageNote.mitigationEvidenceRef type expected string got boolean"
        );
      }
    );
  });

  test("fails strict check when anomaly triage state acknowledged type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptAnomalyTriageState:[\s\S]*?acknowledged:[\s\S]*?type:\s*)boolean/,
          "$1string",
          "anomaly triage state acknowledged type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptAnomalyTriageState acknowledged schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptAnomalyTriageState.acknowledged type expected boolean got string"
        );
      }
    );
  });

  test("fails strict check when anomaly triage state acknowledgedAt type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptAnomalyTriageState:[\s\S]*?acknowledgedAt:[\s\S]*?type:\s*)string/,
          "$1integer",
          "anomaly triage state acknowledgedAt type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptAnomalyTriageState acknowledgedAt schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptAnomalyTriageState.acknowledgedAt type expected string got integer"
        );
      }
    );
  });

  test("fails strict check when anomaly triage state acknowledgedBy type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptAnomalyTriageState:[\s\S]*?acknowledgedBy:[\s\S]*?type:\s*)string/,
          "$1boolean",
          "anomaly triage state acknowledgedBy type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptAnomalyTriageState acknowledgedBy schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptAnomalyTriageState.acknowledgedBy type expected string got boolean"
        );
      }
    );
  });

  test("fails strict check when anomaly triage state notesCount type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptAnomalyTriageState:[\s\S]*?notesCount:[\s\S]*?type:\s*)integer/,
          "$1string",
          "anomaly triage state notesCount type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptAnomalyTriageState notesCount schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptAnomalyTriageState.notesCount type expected integer got string"
        );
      }
    );
  });

  test("fails strict check when anomaly triage state latestNote property is removed", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptAnomalyTriageState:[\s\S]*?)\n\s{8}latestNote:\n\s{10}allOf:\n\s{12}- \$ref:\s*"#\/components\/schemas\/MessagingFaultManifestVerifyAttemptAnomalyTriageNote"\n\s{10}nullable:\s*true/,
          "$1",
          "anomaly triage state latestNote property"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptAnomalyTriageState latestNote schema property contract"
        );
        expect(output).toContain(
          "missing schema property MessagingFaultManifestVerifyAttemptAnomalyTriageState.latestNote"
        );
      }
    );
  });

  test("fails strict check when anomaly triage response updatedAt type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptAnomalyTriageResponse:[\s\S]*?updatedAt:[\s\S]*?type:\s*)string/,
          "$1integer",
          "anomaly triage response updatedAt type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptAnomalyTriageResponse updatedAt schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptAnomalyTriageResponse.updatedAt type expected string got integer"
        );
      }
    );
  });

  test("fails strict check when anomaly triage response anomaly property is removed", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptAnomalyTriageResponse:[\s\S]*?)\n\s{8}anomaly:\n\s{10}\$ref:\s*"#\/components\/schemas\/MessagingFaultManifestVerifyAttemptRetentionSaturationAnomaly"/,
          "$1",
          "anomaly triage response anomaly property"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptAnomalyTriageResponse anomaly schema property contract"
        );
        expect(output).toContain(
          "missing schema property MessagingFaultManifestVerifyAttemptAnomalyTriageResponse.anomaly"
        );
      }
    );
  });

  test("fails strict check when anomaly triage response audit type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptAnomalyTriageResponse:[\s\S]*?audit:[\s\S]*?type:\s*)object/,
          "$1integer",
          "anomaly triage response audit type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptAnomalyTriageResponse audit schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptAnomalyTriageResponse.audit type expected object got integer"
        );
      }
    );
  });

  test("fails strict check when anomaly triage response diagnostics type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptAnomalyTriageResponse:[\s\S]*?diagnostics:[\s\S]*?type:\s*)object/,
          "$1string",
          "anomaly triage response diagnostics type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptAnomalyTriageResponse diagnostics schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptAnomalyTriageResponse.diagnostics type expected object got string"
        );
      }
    );
  });

  test("fails strict check when retention saturation trend summary property is removed", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptRetentionSaturationTrend:[\s\S]*?)\n\s{8}summary:\n\s{10}\$ref:\s*"#\/components\/schemas\/MessagingFaultManifestVerifyAttemptRetentionSaturationTrendSummary"/,
          "$1",
          "retention saturation trend summary property"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptRetentionSaturationTrend summary schema property contract"
        );
        expect(output).toContain(
          "missing schema property MessagingFaultManifestVerifyAttemptRetentionSaturationTrend.summary"
        );
      }
    );
  });

  test("fails strict check when retention saturation trend snapshots type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptRetentionSaturationTrend:[\s\S]*?snapshots:[\s\S]*?type:\s*)array/,
          "$1boolean",
          "retention saturation trend snapshots type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptRetentionSaturationTrend snapshots schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptRetentionSaturationTrend.snapshots type expected array got boolean"
        );
      }
    );
  });

  test("fails strict check when retention saturation trend summary windowMinutes type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptRetentionSaturationTrendSummary:[\s\S]*?windowMinutes:[\s\S]*?type:\s*)integer/,
          "$1string",
          "retention saturation trend summary windowMinutes type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptRetentionSaturationTrendSummary windowMinutes schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptRetentionSaturationTrendSummary.windowMinutes type expected integer got string"
        );
      }
    );
  });

  test("fails strict check when retention saturation trend summary requestedLimit type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptRetentionSaturationTrendSummary:[\s\S]*?requestedLimit:[\s\S]*?type:\s*)integer/,
          "$1boolean",
          "retention saturation trend summary requestedLimit type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptRetentionSaturationTrendSummary requestedLimit schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptRetentionSaturationTrendSummary.requestedLimit type expected integer got boolean"
        );
      }
    );
  });

  test("fails strict check when retention saturation trend summary totalInWindow type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptRetentionSaturationTrendSummary:[\s\S]*?totalInWindow:[\s\S]*?type:\s*)integer/,
          "$1string",
          "retention saturation trend summary totalInWindow type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptRetentionSaturationTrendSummary totalInWindow schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptRetentionSaturationTrendSummary.totalInWindow type expected integer got string"
        );
      }
    );
  });

  test("fails strict check when retention saturation trend summary returned type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptRetentionSaturationTrendSummary:[\s\S]*?returned:[\s\S]*?type:\s*)integer/,
          "$1boolean",
          "retention saturation trend summary returned type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptRetentionSaturationTrendSummary returned schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptRetentionSaturationTrendSummary.returned type expected integer got boolean"
        );
      }
    );
  });

  test("fails strict check when retention saturation trend summary hasMore type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptRetentionSaturationTrendSummary:[\s\S]*?hasMore:[\s\S]*?type:\s*)boolean/,
          "$1string",
          "retention saturation trend summary hasMore type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptRetentionSaturationTrendSummary hasMore schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptRetentionSaturationTrendSummary.hasMore type expected boolean got string"
        );
      }
    );
  });

  test("fails strict check when retention saturation trend summary firstCapturedAt type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptRetentionSaturationTrendSummary:[\s\S]*?firstCapturedAt:[\s\S]*?type:\s*)string/,
          "$1integer",
          "retention saturation trend summary firstCapturedAt type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptRetentionSaturationTrendSummary firstCapturedAt schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptRetentionSaturationTrendSummary.firstCapturedAt type expected string got integer"
        );
      }
    );
  });

  test("fails strict check when retention saturation trend summary lastCapturedAt type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptRetentionSaturationTrendSummary:[\s\S]*?lastCapturedAt:[\s\S]*?type:\s*)string/,
          "$1boolean",
          "retention saturation trend summary lastCapturedAt type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptRetentionSaturationTrendSummary lastCapturedAt schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptRetentionSaturationTrendSummary.lastCapturedAt type expected string got boolean"
        );
      }
    );
  });

  test("fails strict check when retention saturation trend summary minUtilizationPercent type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptRetentionSaturationTrendSummary:[\s\S]*?minUtilizationPercent:[\s\S]*?type:\s*)number/,
          "$1string",
          "retention saturation trend summary minUtilizationPercent type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptRetentionSaturationTrendSummary minUtilizationPercent schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptRetentionSaturationTrendSummary.minUtilizationPercent type expected number got string"
        );
      }
    );
  });

  test("fails strict check when retention saturation trend summary maxUtilizationPercent type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptRetentionSaturationTrendSummary:[\s\S]*?maxUtilizationPercent:[\s\S]*?type:\s*)number/,
          "$1string",
          "retention saturation trend summary maxUtilizationPercent type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptRetentionSaturationTrendSummary maxUtilizationPercent schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptRetentionSaturationTrendSummary.maxUtilizationPercent type expected number got string"
        );
      }
    );
  });

  test("fails strict check when retention saturation trend summary avgUtilizationPercent type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptRetentionSaturationTrendSummary:[\s\S]*?avgUtilizationPercent:[\s\S]*?type:\s*)number/,
          "$1boolean",
          "retention saturation trend summary avgUtilizationPercent type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptRetentionSaturationTrendSummary avgUtilizationPercent schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptRetentionSaturationTrendSummary.avgUtilizationPercent type expected number got boolean"
        );
      }
    );
  });

  test("fails strict check when retention saturation trend summary latestUtilizationPercent type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptRetentionSaturationTrendSummary:[\s\S]*?latestUtilizationPercent:[\s\S]*?type:\s*)number/,
          "$1string",
          "retention saturation trend summary latestUtilizationPercent type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptRetentionSaturationTrendSummary latestUtilizationPercent schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptRetentionSaturationTrendSummary.latestUtilizationPercent type expected number got string"
        );
      }
    );
  });

  test("fails strict check when retention saturation trend summary latestAlertLevel type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptRetentionSaturationTrendSummary:[\s\S]*?latestAlertLevel:[\s\S]*?type:\s*)string/,
          "$1integer",
          "retention saturation trend summary latestAlertLevel type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptRetentionSaturationTrendSummary latestAlertLevel schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptRetentionSaturationTrendSummary.latestAlertLevel type expected string got integer"
        );
      }
    );
  });

  test("fails strict check when retention saturation trend summary trendDirection type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptRetentionSaturationTrendSummary:[\s\S]*?trendDirection:[\s\S]*?type:\s*)string/,
          "$1boolean",
          "retention saturation trend summary trendDirection type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptRetentionSaturationTrendSummary trendDirection schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptRetentionSaturationTrendSummary.trendDirection type expected string got boolean"
        );
      }
    );
  });

  test("fails strict check when retention saturation trend summary anomalies type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptRetentionSaturationTrendSummary:[\s\S]*?anomalies:[\s\S]*?type:\s*)array/,
          "$1boolean",
          "retention saturation trend summary anomalies type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptRetentionSaturationTrendSummary anomalies schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptRetentionSaturationTrendSummary.anomalies type expected array got boolean"
        );
      }
    );
  });

  test("fails strict check when retention saturation trend summary highestAnomalySeverity type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptRetentionSaturationTrendSummary:[\s\S]*?highestAnomalySeverity:[\s\S]*?type:\s*)string/,
          "$1integer",
          "retention saturation trend summary highestAnomalySeverity type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptRetentionSaturationTrendSummary highestAnomalySeverity schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptRetentionSaturationTrendSummary.highestAnomalySeverity type expected string got integer"
        );
      }
    );
  });

  test("fails strict check when retention saturation trend summary anomalyTracking property is removed", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptRetentionSaturationTrendSummary:[\s\S]*?)\n\s{8}anomalyTracking:\n\s{10}\$ref:\s*"#\/components\/schemas\/MessagingFaultManifestVerifyAttemptAnomalyTrackingSummary"/,
          "$1",
          "retention saturation trend summary anomalyTracking property"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptRetentionSaturationTrendSummary anomalyTracking schema property contract"
        );
        expect(output).toContain(
          "missing schema property MessagingFaultManifestVerifyAttemptRetentionSaturationTrendSummary.anomalyTracking"
        );
      }
    );
  });

  test("fails strict check when retention saturation trend summary escalation property is removed", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptRetentionSaturationTrendSummary:[\s\S]*?)\n\s{8}escalation:\n\s{10}\$ref:\s*"#\/components\/schemas\/MessagingFaultManifestVerifyAttemptEscalationTelemetry"/,
          "$1",
          "retention saturation trend summary escalation property"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptRetentionSaturationTrendSummary escalation schema property contract"
        );
        expect(output).toContain(
          "missing schema property MessagingFaultManifestVerifyAttemptRetentionSaturationTrendSummary.escalation"
        );
      }
    );
  });

  test("fails strict check when retention saturation trend summary recentlyClosedCount type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptRetentionSaturationTrendSummary:[\s\S]*?recentlyClosedCount:[\s\S]*?type:\s*)integer/,
          "$1string",
          "retention saturation trend summary recentlyClosedCount type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptRetentionSaturationTrendSummary recentlyClosedCount schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptRetentionSaturationTrendSummary.recentlyClosedCount type expected integer got string"
        );
      }
    );
  });

  test("fails strict check when retention saturation anomaly key type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptRetentionSaturationAnomaly:[\s\S]*?key:[\s\S]*?type:\s*)string/,
          "$1integer",
          "retention saturation anomaly key type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptRetentionSaturationAnomaly key schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptRetentionSaturationAnomaly.key type expected string got integer"
        );
      }
    );
  });

  test("fails strict check when retention saturation anomaly severity type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptRetentionSaturationAnomaly:[\s\S]*?severity:[\s\S]*?type:\s*)string/,
          "$1boolean",
          "retention saturation anomaly severity type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptRetentionSaturationAnomaly severity schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptRetentionSaturationAnomaly.severity type expected string got boolean"
        );
      }
    );
  });

  test("fails strict check when retention saturation anomaly recommendedAction type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptRetentionSaturationAnomaly:[\s\S]*?recommendedAction:[\s\S]*?type:\s*)string/,
          "$1integer",
          "retention saturation anomaly recommendedAction type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptRetentionSaturationAnomaly recommendedAction schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptRetentionSaturationAnomaly.recommendedAction type expected string got integer"
        );
      }
    );
  });

  test("fails strict check when retention saturation anomaly evidence type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptRetentionSaturationAnomaly:[\s\S]*?evidence:[\s\S]*?type:\s*)object/,
          "$1string",
          "retention saturation anomaly evidence type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptRetentionSaturationAnomaly evidence schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptRetentionSaturationAnomaly.evidence type expected object got string"
        );
      }
    );
  });

  test("fails strict check when retention saturation anomaly anomalyInstanceId type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptRetentionSaturationAnomaly:[\s\S]*?anomalyInstanceId:[\s\S]*?type:\s*)string/,
          "$1boolean",
          "retention saturation anomaly anomalyInstanceId type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptRetentionSaturationAnomaly anomalyInstanceId schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptRetentionSaturationAnomaly.anomalyInstanceId type expected string got boolean"
        );
      }
    );
  });

  test("fails strict check when retention saturation anomaly status type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptRetentionSaturationAnomaly:[\s\S]*?status:[\s\S]*?type:\s*)string/,
          "$1boolean",
          "retention saturation anomaly status type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptRetentionSaturationAnomaly status schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptRetentionSaturationAnomaly.status type expected string got boolean"
        );
      }
    );
  });

  test("fails strict check when retention saturation anomaly firstDetectedAt type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptRetentionSaturationAnomaly:[\s\S]*?firstDetectedAt:[\s\S]*?type:\s*)string/,
          "$1integer",
          "retention saturation anomaly firstDetectedAt type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptRetentionSaturationAnomaly firstDetectedAt schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptRetentionSaturationAnomaly.firstDetectedAt type expected string got integer"
        );
      }
    );
  });

  test("fails strict check when retention saturation anomaly lastDetectedAt type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptRetentionSaturationAnomaly:[\s\S]*?lastDetectedAt:[\s\S]*?type:\s*)string/,
          "$1boolean",
          "retention saturation anomaly lastDetectedAt type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptRetentionSaturationAnomaly lastDetectedAt schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptRetentionSaturationAnomaly.lastDetectedAt type expected string got boolean"
        );
      }
    );
  });

  test("fails strict check when retention saturation anomaly triage property is removed", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptRetentionSaturationAnomaly:[\s\S]*?)\n\s{8}triage:\n\s{10}\$ref:\s*"#\/components\/schemas\/MessagingFaultManifestVerifyAttemptAnomalyTriageState"/,
          "$1",
          "retention saturation anomaly triage property"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptRetentionSaturationAnomaly triage schema property contract"
        );
        expect(output).toContain(
          "missing schema property MessagingFaultManifestVerifyAttemptRetentionSaturationAnomaly.triage"
        );
      }
    );
  });

  test("fails strict check when retention saturation anomaly closedAt type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptRetentionSaturationAnomaly:[\s\S]*?closedAt:[\s\S]*?type:\s*)string/,
          "$1number",
          "retention saturation anomaly closedAt type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptRetentionSaturationAnomaly closedAt schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptRetentionSaturationAnomaly.closedAt type expected string got number"
        );
      }
    );
  });

  test("fails strict check when retention saturation anomaly closedReason type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptRetentionSaturationAnomaly:[\s\S]*?closedReason:[\s\S]*?type:\s*)string/,
          "$1boolean",
          "retention saturation anomaly closedReason type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptRetentionSaturationAnomaly closedReason schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptRetentionSaturationAnomaly.closedReason type expected string got boolean"
        );
      }
    );
  });

  test("fails strict check when retention saturation anomaly clearanceEvidence type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptRetentionSaturationAnomaly:[\s\S]*?clearanceEvidence:[\s\S]*?type:\s*)object/,
          "$1string",
          "retention saturation anomaly clearanceEvidence type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptRetentionSaturationAnomaly clearanceEvidence schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptRetentionSaturationAnomaly.clearanceEvidence type expected object got string"
        );
      }
    );
  });

  test("fails strict check when retention saturation anomaly closureHistory type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptRetentionSaturationAnomaly:[\s\S]*?closureHistory:[\s\S]*?type:\s*)array/,
          "$1object",
          "retention saturation anomaly closureHistory type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptRetentionSaturationAnomaly closureHistory schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptRetentionSaturationAnomaly.closureHistory type expected array got object"
        );
      }
    );
  });

  test("fails strict check when retention saturation anomaly escalation property is removed", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptRetentionSaturationAnomaly:[\s\S]*?)\n\s{8}escalation:\n\s{10}\$ref:\s*"#\/components\/schemas\/MessagingFaultManifestVerifyAttemptAnomalyEscalationState"/,
          "$1",
          "retention saturation anomaly escalation property"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptRetentionSaturationAnomaly escalation schema property contract"
        );
        expect(output).toContain(
          "missing schema property MessagingFaultManifestVerifyAttemptRetentionSaturationAnomaly.escalation"
        );
      }
    );
  });

  test("fails strict check when anomaly closure record closedAt type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptAnomalyClosureRecord:[\s\S]*?closedAt:[\s\S]*?type:\s*)string/,
          "$1number",
          "anomaly closure record closedAt type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptAnomalyClosureRecord closedAt schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptAnomalyClosureRecord.closedAt type expected string got number"
        );
      }
    );
  });

  test("fails strict check when anomaly closure record closedReason type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptAnomalyClosureRecord:[\s\S]*?closedReason:[\s\S]*?type:\s*)string/,
          "$1boolean",
          "anomaly closure record closedReason type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptAnomalyClosureRecord closedReason schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptAnomalyClosureRecord.closedReason type expected string got boolean"
        );
      }
    );
  });

  test("fails strict check when anomaly closure record clearanceEvidence type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptAnomalyClosureRecord:[\s\S]*?clearanceEvidence:[\s\S]*?type:\s*)object/,
          "$1string",
          "anomaly closure record clearanceEvidence type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptAnomalyClosureRecord clearanceEvidence schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptAnomalyClosureRecord.clearanceEvidence type expected object got string"
        );
      }
    );
  });

  test("fails strict check when anomaly escalation state state type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptAnomalyEscalationState:[\s\S]*?state:[\s\S]*?type:\s*)string/,
          "$1integer",
          "anomaly escalation state state type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptAnomalyEscalationState state schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptAnomalyEscalationState.state type expected string got integer"
        );
      }
    );
  });

  test("fails strict check when anomaly escalation state severity type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptAnomalyEscalationState:[\s\S]*?severity:[\s\S]*?type:\s*)string/,
          "$1boolean",
          "anomaly escalation state severity type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptAnomalyEscalationState severity schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptAnomalyEscalationState.severity type expected string got boolean"
        );
      }
    );
  });

  test("fails strict check when anomaly escalation state trigger type drifts", () => {
    withMutatedNotificationSpec(
      (source) =>
        replaceOneOrThrow(
          source,
          /(MessagingFaultManifestVerifyAttemptAnomalyEscalationState:[\s\S]*?trigger:[\s\S]*?type:\s*)string/,
          "$1integer",
          "anomaly escalation state trigger type"
        ),
      (result, output) => {
        expect(result.status).toBe(1);
        expect(output).toContain("Parameter contract failures");
        expect(output).toContain(
          "notification-service MessagingFaultManifestVerifyAttemptAnomalyEscalationState trigger schema property contract"
        );
        expect(output).toContain(
          "schema property MessagingFaultManifestVerifyAttemptAnomalyEscalationState.trigger type expected string got integer"
        );
      }
    );
  });
});
