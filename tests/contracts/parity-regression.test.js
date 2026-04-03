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
      "PASS: notification-service POST /integrations/messaging/fault-injection/manifest/verify/attempts/retention/anomalies/{anomalyInstanceId}/triage request schema mitigationApplied anchor"
    );
    expect(output).toContain(
      "PASS: notification-service POST /integrations/messaging/fault-injection/manifest/verify/attempts/retention/anomalies/{anomalyInstanceId}/triage request schema note anchor"
    );
    expect(output).toContain(
      "PASS: notification-service POST /integrations/messaging/fault-injection/manifest/verify/attempts/retention/anomalies/{anomalyInstanceId}/triage request schema noteType anchor"
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
});
