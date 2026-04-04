import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const workspaceRoot = process.cwd();
const failures = [];

const configPath = path.resolve(workspaceRoot, "config/operations/m9-pilot-cutover-checklist.json");
const runbookPath = path.resolve(workspaceRoot, "docs/runbooks/m9-pilot-cutover-readiness.md");
const templatePath = path.resolve(
  workspaceRoot,
  "docs/runbooks/templates/m9-pilot-cutover-summary-template.md"
);

const requiredRunbookSections = [
  "## Pilot Cohort Scope",
  "## Acceptance Criteria",
  "## Automated Evidence Command",
  "## Evidence Presence Gate",
  "## Cutover Checklist",
  "## Hypercare Operating Model",
  "## Evidence Capture",
  "## Verification Command",
];

if (!existsSync(configPath)) {
  failures.push("Missing config file: config/operations/m9-pilot-cutover-checklist.json");
}

if (!existsSync(runbookPath)) {
  failures.push("Missing runbook: docs/runbooks/m9-pilot-cutover-readiness.md");
}

if (!existsSync(templatePath)) {
  failures.push("Missing template: docs/runbooks/templates/m9-pilot-cutover-summary-template.md");
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
  if (!config.pilot || typeof config.pilot !== "object") {
    failures.push("config.pilot must be an object");
  } else {
    if (!config.pilot.tenantKey || typeof config.pilot.tenantKey !== "string") {
      failures.push("config.pilot.tenantKey must be a non-empty string");
    }

    const activeUserRange = config.pilot.activeUserRange || {};
    if (!Number.isInteger(activeUserRange.min) || activeUserRange.min <= 0) {
      failures.push("config.pilot.activeUserRange.min must be a positive integer");
    }
    if (!Number.isInteger(activeUserRange.max) || activeUserRange.max <= 0) {
      failures.push("config.pilot.activeUserRange.max must be a positive integer");
    }
    if (
      Number.isInteger(activeUserRange.min) &&
      Number.isInteger(activeUserRange.max) &&
      activeUserRange.min > activeUserRange.max
    ) {
      failures.push("config.pilot.activeUserRange.min cannot be greater than max");
    }

    if (!Array.isArray(config.pilot.goNoGoOwners) || config.pilot.goNoGoOwners.length < 3) {
      failures.push(
        "config.pilot.goNoGoOwners must include product, engineering, and operations owners"
      );
    }
  }

  if (!Array.isArray(config.acceptanceCriteria) || config.acceptanceCriteria.length < 3) {
    failures.push("config.acceptanceCriteria must define at least 3 pilot criteria");
  } else {
    for (const criterion of config.acceptanceCriteria) {
      if (!criterion.key || typeof criterion.key !== "string") {
        failures.push("acceptanceCriteria entry has invalid key");
      }
      if (!criterion.metric || typeof criterion.metric !== "string") {
        failures.push(`acceptanceCriteria ${criterion.key || "<unknown>"} has invalid metric`);
      }
      if (typeof criterion.threshold !== "number" || Number.isNaN(criterion.threshold)) {
        failures.push(`acceptanceCriteria ${criterion.key || "<unknown>"} has invalid threshold`);
      }
    }
  }

  if (!Array.isArray(config.cutoverChecklist) || config.cutoverChecklist.length < 4) {
    failures.push("config.cutoverChecklist must define at least 4 required checklist items");
  } else {
    for (const item of config.cutoverChecklist) {
      if (!item.key || typeof item.key !== "string") {
        failures.push("cutoverChecklist entry has invalid key");
      }
      if (typeof item.required !== "boolean") {
        failures.push(`cutoverChecklist ${item.key || "<unknown>"} has invalid required flag`);
      }
    }
  }

  if (!config.hypercare || typeof config.hypercare !== "object") {
    failures.push("config.hypercare must be an object");
  } else {
    if (!Number.isInteger(config.hypercare.durationDays) || config.hypercare.durationDays <= 0) {
      failures.push("config.hypercare.durationDays must be a positive integer");
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
    "config/operations/m9-pilot-cutover-checklist.json",
    "docs/runbooks/templates/m9-pilot-cutover-summary-template.md",
  ];

  for (const anchor of requiredAnchors) {
    if (!runbook.includes(anchor)) {
      failures.push(`Runbook missing required anchor: ${anchor}`);
    }
  }

  const commandAnchorAlternatives = [
    ["pnpm run pilot:m9:check", "npm run pilot:m9:check"],
    ["pnpm run pilot:m9:evidence:check", "npm run pilot:m9:evidence:check"],
    ["pnpm run runbook:m9:pilot:evidence", "npm run runbook:m9:pilot:evidence"],
  ];

  for (const alternatives of commandAnchorAlternatives) {
    const found = alternatives.some((anchor) => runbook.includes(anchor));
    if (!found) {
      failures.push(`Runbook missing one of anchors: ${alternatives.join(" OR ")}`);
    }
  }
}

if (process.env.SKIP_M9_PILOT_EVIDENCE_CHECK !== "1") {
  try {
    runShellCommand("pnpm run pilot:m9:evidence:check");
  } catch (error) {
    const stderrText = String(error.stderr || "").trim();
    const stdoutText = String(error.stdout || "").trim();
    const output = stderrText || stdoutText || error.message;
    failures.push(`Nested check failed for m9-pilot-evidence-presence: ${output}`);
  }
}

if (failures.length > 0) {
  console.error("M9 pilot readiness check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("M9 pilot readiness check passed.");
console.log(
  "Validated pilot cohort, evidence presence, cutover checklist, hypercare controls, and runbook anchors."
);
