import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const workspaceRoot = process.cwd();
const failures = [];

const configPath = path.resolve(workspaceRoot, "config/operations/m9-cutover-rehearsal-pack.json");
const runbookPath = path.resolve(workspaceRoot, "docs/runbooks/m9-cutover-rehearsal.md");
const templatePath = path.resolve(
  workspaceRoot,
  "docs/runbooks/templates/m9-cutover-rehearsal-summary-template.md"
);

const requiredRunbookSections = [
  "## Pilot Gate Dependency",
  "## Rehearsal Steps",
  "## Success Criteria",
  "## Automated Evidence Command",
  "## Evidence Presence Gate",
  "## Evidence Capture",
  "## Verification Command",
];

if (!existsSync(configPath)) {
  failures.push("Missing config file: config/operations/m9-cutover-rehearsal-pack.json");
}

if (!existsSync(runbookPath)) {
  failures.push("Missing runbook: docs/runbooks/m9-cutover-rehearsal.md");
}

if (!existsSync(templatePath)) {
  failures.push(
    "Missing template: docs/runbooks/templates/m9-cutover-rehearsal-summary-template.md"
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
  if (!config.rehearsal || typeof config.rehearsal !== "object") {
    failures.push("config.rehearsal must be an object");
  } else {
    if (!config.rehearsal.environment || typeof config.rehearsal.environment !== "string") {
      failures.push("config.rehearsal.environment must be a non-empty string");
    }
    if (!config.rehearsal.window || typeof config.rehearsal.window !== "string") {
      failures.push("config.rehearsal.window must be a non-empty string");
    }
    if (
      !Number.isInteger(config.rehearsal.maxDurationMinutes) ||
      config.rehearsal.maxDurationMinutes <= 0
    ) {
      failures.push("config.rehearsal.maxDurationMinutes must be a positive integer");
    }
    if (!Array.isArray(config.rehearsal.participants) || config.rehearsal.participants.length < 4) {
      failures.push("config.rehearsal.participants must include required rehearsal roles");
    }
  }

  if (!Array.isArray(config.rehearsalSteps) || config.rehearsalSteps.length < 5) {
    failures.push("config.rehearsalSteps must define at least 5 required rehearsal steps");
  } else {
    for (const step of config.rehearsalSteps) {
      if (!step.key || typeof step.key !== "string") {
        failures.push("rehearsalSteps entry has invalid key");
      }
      if (typeof step.required !== "boolean") {
        failures.push(`rehearsalSteps ${step.key || "<unknown>"} has invalid required flag`);
      }
    }
  }

  if (!Array.isArray(config.successCriteria) || config.successCriteria.length < 3) {
    failures.push("config.successCriteria must define at least 3 rehearsal criteria");
  } else {
    for (const criterion of config.successCriteria) {
      if (!criterion.key || typeof criterion.key !== "string") {
        failures.push("successCriteria entry has invalid key");
      }
      if (!criterion.metric || typeof criterion.metric !== "string") {
        failures.push(`successCriteria ${criterion.key || "<unknown>"} has invalid metric`);
      }
      if (typeof criterion.threshold !== "number" || Number.isNaN(criterion.threshold)) {
        failures.push(`successCriteria ${criterion.key || "<unknown>"} has invalid threshold`);
      }
    }
  }

  if (!config.riskControls || typeof config.riskControls !== "object") {
    failures.push("config.riskControls must be an object");
  } else {
    if (
      !Number.isInteger(config.riskControls.rollbackTargetMinutes) ||
      config.riskControls.rollbackTargetMinutes <= 0
    ) {
      failures.push("config.riskControls.rollbackTargetMinutes must be a positive integer");
    }
    if (
      !Number.isInteger(config.riskControls.maxCriticalIncidents) ||
      config.riskControls.maxCriticalIncidents < 0
    ) {
      failures.push("config.riskControls.maxCriticalIncidents must be a non-negative integer");
    }
    if (
      !config.riskControls.evidenceLogPath ||
      typeof config.riskControls.evidenceLogPath !== "string"
    ) {
      failures.push("config.riskControls.evidenceLogPath must be a non-empty string");
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
    "config/operations/m9-cutover-rehearsal-pack.json",
    "docs/runbooks/templates/m9-cutover-rehearsal-summary-template.md",
  ];

  for (const anchor of requiredAnchors) {
    if (!runbook.includes(anchor)) {
      failures.push(`Runbook missing required anchor: ${anchor}`);
    }
  }

  const commandAnchorAlternatives = [
    ["pnpm run pilot:m9:rehearsal:check", "npm run pilot:m9:rehearsal:check"],
    ["pnpm run pilot:m9:rehearsal:evidence:check", "npm run pilot:m9:rehearsal:evidence:check"],
    ["pnpm run runbook:m9:rehearsal:evidence", "npm run runbook:m9:rehearsal:evidence"],
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

if (process.env.SKIP_M9_CUTOVER_REHEARSAL_EVIDENCE_CHECK !== "1") {
  try {
    runShellCommand("pnpm run pilot:m9:rehearsal:evidence:check");
  } catch (error) {
    const stderrText = String(error.stderr || "").trim();
    const stdoutText = String(error.stdout || "").trim();
    const output = stderrText || stdoutText || error.message;
    failures.push(`Nested check failed for m9-cutover-rehearsal-evidence-presence: ${output}`);
  }
}

if (failures.length > 0) {
  console.error("M9 cutover rehearsal readiness check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("M9 cutover rehearsal readiness check passed.");
console.log(
  "Validated pilot readiness dependency, rehearsal pack controls, and strict rehearsal evidence coverage."
);
