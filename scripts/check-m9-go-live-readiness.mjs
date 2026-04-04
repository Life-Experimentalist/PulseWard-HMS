import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const workspaceRoot = process.cwd();
const failures = [];

const configPath = path.resolve(workspaceRoot, "config/operations/m9-go-live-acceptance-pack.json");
const runbookPath = path.resolve(workspaceRoot, "docs/runbooks/m9-go-live-acceptance.md");
const templatePath = path.resolve(
  workspaceRoot,
  "docs/runbooks/templates/m9-go-live-acceptance-summary-template.md"
);

const requiredRunbookSections = [
  "## Dependency Gates",
  "## Go-Live Acceptance Checks",
  "## Operational Guardrails",
  "## Hypercare Controls",
  "## Automated Evidence Command",
  "## Evidence Presence Gate",
  "## Verification Command",
];

if (!existsSync(configPath)) {
  failures.push("Missing config file: config/operations/m9-go-live-acceptance-pack.json");
}

if (!existsSync(runbookPath)) {
  failures.push("Missing runbook: docs/runbooks/m9-go-live-acceptance.md");
}

if (!existsSync(templatePath)) {
  failures.push(
    "Missing template: docs/runbooks/templates/m9-go-live-acceptance-summary-template.md"
  );
}

function runShellCommand(command) {
  execSync(command, {
    cwd: workspaceRoot,
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
  });
}

let config;
if (existsSync(configPath)) {
  try {
    config = JSON.parse(readFileSync(configPath, "utf8"));
  } catch (error) {
    failures.push(`Config parse failure: ${error.message}`);
  }
}

if (config) {
  if (!config.goLiveWindow || typeof config.goLiveWindow !== "object") {
    failures.push("config.goLiveWindow must be an object");
  } else {
    if (!config.goLiveWindow.environment || typeof config.goLiveWindow.environment !== "string") {
      failures.push("config.goLiveWindow.environment must be a non-empty string");
    }
    if (
      !Number.isInteger(config.goLiveWindow.changeFreezeHours) ||
      config.goLiveWindow.changeFreezeHours <= 0
    ) {
      failures.push("config.goLiveWindow.changeFreezeHours must be a positive integer");
    }
    if (
      !config.goLiveWindow.deploymentWindow ||
      typeof config.goLiveWindow.deploymentWindow !== "string"
    ) {
      failures.push("config.goLiveWindow.deploymentWindow must be a non-empty string");
    }
  }

  if (!Array.isArray(config.acceptanceChecks) || config.acceptanceChecks.length < 5) {
    failures.push("config.acceptanceChecks must define at least 5 go-live checks");
  } else {
    for (const check of config.acceptanceChecks) {
      if (!check.key || typeof check.key !== "string") {
        failures.push("acceptanceChecks entry has invalid key");
      }
      if (typeof check.required !== "boolean") {
        failures.push(`acceptanceChecks ${check.key || "<unknown>"} has invalid required flag`);
      }
    }
  }

  if (!Array.isArray(config.operationalGuardrails) || config.operationalGuardrails.length < 3) {
    failures.push("config.operationalGuardrails must define at least 3 guardrails");
  } else {
    for (const guardrail of config.operationalGuardrails) {
      if (!guardrail.key || typeof guardrail.key !== "string") {
        failures.push("operationalGuardrails entry has invalid key");
      }
      if (!guardrail.metric || typeof guardrail.metric !== "string") {
        failures.push(`operationalGuardrails ${guardrail.key || "<unknown>"} has invalid metric`);
      }
      if (typeof guardrail.threshold !== "number" || Number.isNaN(guardrail.threshold)) {
        failures.push(
          `operationalGuardrails ${guardrail.key || "<unknown>"} has invalid threshold`
        );
      }
    }
  }

  if (!config.hypercare || typeof config.hypercare !== "object") {
    failures.push("config.hypercare must be an object");
  } else {
    if (!Number.isInteger(config.hypercare.durationDays) || config.hypercare.durationDays <= 0) {
      failures.push("config.hypercare.durationDays must be a positive integer");
    }
    if (typeof config.hypercare.dailyStatusUpdateRequired !== "boolean") {
      failures.push("config.hypercare.dailyStatusUpdateRequired must be boolean");
    }
    if (
      !Number.isInteger(config.hypercare.triageSlaMinutes) ||
      config.hypercare.triageSlaMinutes <= 0
    ) {
      failures.push("config.hypercare.triageSlaMinutes must be a positive integer");
    }
    if (!config.hypercare.evidenceLogPath || typeof config.hypercare.evidenceLogPath !== "string") {
      failures.push("config.hypercare.evidenceLogPath must be a non-empty string");
    }
  }
}

if (existsSync(runbookPath)) {
  const runbook = readFileSync(runbookPath, "utf8");
  for (const section of requiredRunbookSections) {
    if (!runbook.includes(section)) {
      failures.push(`Runbook missing required section: ${section}`);
    }
  }

  const requiredAnchors = [
    "config/operations/m9-go-live-acceptance-pack.json",
    "docs/runbooks/templates/m9-go-live-acceptance-summary-template.md",
  ];

  for (const anchor of requiredAnchors) {
    if (!runbook.includes(anchor)) {
      failures.push(`Runbook missing required anchor: ${anchor}`);
    }
  }

  const commandAnchorAlternatives = [
    ["pnpm run pilot:m9:check", "npm run pilot:m9:check"],
    ["pnpm run pilot:m9:rehearsal:check", "npm run pilot:m9:rehearsal:check"],
    ["pnpm run pilot:m9:golive:check", "npm run pilot:m9:golive:check"],
    ["pnpm run pilot:m9:golive:evidence:check", "npm run pilot:m9:golive:evidence:check"],
    ["pnpm run runbook:m9:golive:evidence", "npm run runbook:m9:golive:evidence"],
  ];

  for (const alternatives of commandAnchorAlternatives) {
    const found = alternatives.some((anchor) => runbook.includes(anchor));
    if (!found) {
      failures.push(`Runbook missing one of anchors: ${alternatives.join(" OR ")}`);
    }
  }
}

try {
  runShellCommand("pnpm run pilot:m9:check");
} catch (error) {
  const stderrText = String(error.stderr || "").trim();
  const stdoutText = String(error.stdout || "").trim();
  const output = stderrText || stdoutText || error.message;
  failures.push(`Nested check failed for m9-pilot-readiness: ${output}`);
}

try {
  runShellCommand("pnpm run pilot:m9:rehearsal:check");
} catch (error) {
  const stderrText = String(error.stderr || "").trim();
  const stdoutText = String(error.stdout || "").trim();
  const output = stderrText || stdoutText || error.message;
  failures.push(`Nested check failed for m9-cutover-rehearsal-readiness: ${output}`);
}

if (process.env.SKIP_M9_GOLIVE_EVIDENCE_CHECK !== "1") {
  try {
    runShellCommand("pnpm run pilot:m9:golive:evidence:check");
  } catch (error) {
    const stderrText = String(error.stderr || "").trim();
    const stdoutText = String(error.stdout || "").trim();
    const output = stderrText || stdoutText || error.message;
    failures.push(`Nested check failed for m9-go-live-evidence-presence: ${output}`);
  }
}

if (failures.length > 0) {
  console.error("M9 go-live readiness check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("M9 go-live readiness check passed.");
console.log(
  "Validated pilot and rehearsal dependencies, go-live acceptance controls, and strict go-live evidence coverage."
);
