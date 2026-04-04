import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const workspaceRoot = process.cwd();
const configPath = path.resolve(workspaceRoot, "config/performance/m8-resilience-drills.json");
const runbookPath = path.resolve(workspaceRoot, "docs/runbooks/m8-resilience-drills.md");
const templatePath = path.resolve(
  workspaceRoot,
  "docs/runbooks/templates/m8-resilience-summary-template.md"
);

const requiredDrillKeys = [
  "appointment-service-degradation",
  "notification-provider-outage",
  "retry-storm-prevention",
];

const requiredRunbookSections = [
  "## Appointment Service Degradation Drill",
  "## Notification Provider Outage Drill",
  "## Retry Storm Prevention Drill",
  "## Evidence Capture",
  "## Rollback Verification",
  "## Verification Command",
];

const failures = [];

if (!existsSync(configPath)) {
  failures.push("Missing config file: config/performance/m8-resilience-drills.json");
}

if (!existsSync(runbookPath)) {
  failures.push("Missing runbook: docs/runbooks/m8-resilience-drills.md");
}

if (!existsSync(templatePath)) {
  failures.push("Missing template: docs/runbooks/templates/m8-resilience-summary-template.md");
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
  if (!Array.isArray(config.drills)) {
    failures.push("config.drills must be an array");
  } else {
    const drillByKey = new Map(config.drills.map((drill) => [drill.key, drill]));

    for (const key of requiredDrillKeys) {
      if (!drillByKey.has(key)) {
        failures.push(`Missing required resilience drill: ${key}`);
      }
    }

    for (const drill of config.drills) {
      if (!drill.key || typeof drill.key !== "string") {
        failures.push("Resilience drill has invalid key");
      }

      if (!drill.scenario || typeof drill.scenario !== "string") {
        failures.push(`Resilience drill ${drill.key || "<unknown>"} has invalid scenario`);
      }

      if (!drill.trigger || typeof drill.trigger !== "string") {
        failures.push(`Resilience drill ${drill.key || "<unknown>"} has invalid trigger`);
      }

      if (!Array.isArray(drill.expectedBehavior) || drill.expectedBehavior.length === 0) {
        failures.push(
          `Resilience drill ${drill.key || "<unknown>"} must define expectedBehavior entries`
        );
      }

      const guardrails = drill.guardrails || {};
      if (
        !Number.isInteger(guardrails.maxAllowedErrorRatePercent) ||
        guardrails.maxAllowedErrorRatePercent <= 0 ||
        guardrails.maxAllowedErrorRatePercent > 100
      ) {
        failures.push(
          `Resilience drill ${
            drill.key || "<unknown>"
          } has invalid guardrails.maxAllowedErrorRatePercent`
        );
      }

      if (guardrails.maxQueueBacklog !== undefined) {
        if (!Number.isInteger(guardrails.maxQueueBacklog) || guardrails.maxQueueBacklog <= 0) {
          failures.push(
            `Resilience drill ${drill.key || "<unknown>"} has invalid guardrails.maxQueueBacklog`
          );
        }
      }

      if (guardrails.maxSustainedP95LatencyMs !== undefined) {
        if (
          !Number.isInteger(guardrails.maxSustainedP95LatencyMs) ||
          guardrails.maxSustainedP95LatencyMs <= 0
        ) {
          failures.push(
            `Resilience drill ${
              drill.key || "<unknown>"
            } has invalid guardrails.maxSustainedP95LatencyMs`
          );
        }
      }

      if (!Number.isInteger(guardrails.maxRetryAttempts) || guardrails.maxRetryAttempts < 0) {
        failures.push(
          `Resilience drill ${drill.key || "<unknown>"} has invalid guardrails.maxRetryAttempts`
        );
      }
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
}

if (failures.length > 0) {
  console.error("M8 resilience baseline check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("M8 resilience baseline check passed.");
console.log(
  `Validated ${requiredDrillKeys.length} required resilience drills and ${requiredRunbookSections.length} runbook sections.`
);
