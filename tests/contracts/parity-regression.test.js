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
      "PASS: notification-service GET /integrations/messaging/fault-injection/manifest/verify/attempts/retention/escalations/export parameters"
    );
    expect(output).toContain(
      "PASS: notification-service GET /integrations/messaging/fault-injection/manifest/verify/attempts/retention/escalations/export boolean filter parameter contract"
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
      "PASS: notification-service POST /integrations/messaging/fault-injection/manifest/verify/attempts/retention/apply request schema pruneNow anchor"
    );
    expect(output).toContain(
      "PASS: notification-service POST /integrations/messaging/fault-injection/manifest/verify/attempts/retention/apply request schema dryRun anchor"
    );
    expect(output).toContain(
      "PASS: notification-service POST /integrations/messaging/fault-injection/manifest/verify/attempts/retention/apply request schema escalation policy autoDeescalateOnMitigation anchor"
    );
    expect(output).toContain(
      "PASS: notification-service POST /integrations/messaging/fault-injection/manifest/verify/attempts/retention/apply request schema escalation export policy includeRecentlyClosedByDefault anchor"
    );
    expect(output).toContain(
      "PASS: notification-service POST /integrations/messaging/fault-injection/manifest/verify/attempts/retention/apply request schema escalation export policy defaultFormat anchor"
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
      "PASS: notification-service GET /integrations/messaging/fault-injection/manifest/verify/attempts/retention/escalations/export response media-type contract"
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
});
