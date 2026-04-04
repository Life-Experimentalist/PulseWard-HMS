import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const workspaceRoot = process.cwd();
const configPath = path.resolve(workspaceRoot, "config/performance/m8-load-profiles.json");
const runbookPath = path.resolve(workspaceRoot, "docs/runbooks/m8-load-validation.md");
const templatePath = path.resolve(
  workspaceRoot,
  "docs/runbooks/templates/m8-load-summary-template.md"
);

const requiredProfileKeys = [
  "auth-login",
  "appointment-booking",
  "notification-dispatch",
  "patient-read",
  "patient-write",
];

const requiredRunbookSections = [
  "## Auth Login Path",
  "## Appointment Booking Path",
  "## Notification Dispatch Path",
  "## Patient Read Path",
  "## Patient Write Path",
  "## Evidence Capture",
  "## Bottleneck Review Checklist",
];

const failures = [];

if (!existsSync(configPath)) {
  failures.push("Missing config file: config/performance/m8-load-profiles.json");
}

if (!existsSync(runbookPath)) {
  failures.push("Missing runbook: docs/runbooks/m8-load-validation.md");
}

if (!existsSync(templatePath)) {
  failures.push("Missing template: docs/runbooks/templates/m8-load-summary-template.md");
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
  if (!Array.isArray(config.profiles)) {
    failures.push("config.profiles must be an array");
  } else {
    const profileByKey = new Map(config.profiles.map((profile) => [profile.key, profile]));

    for (const key of requiredProfileKeys) {
      if (!profileByKey.has(key)) {
        failures.push(`Missing required load profile: ${key}`);
      }
    }

    for (const profile of config.profiles) {
      if (!profile.key || typeof profile.key !== "string") {
        failures.push("Load profile has invalid key");
      }

      if (!profile.service || typeof profile.service !== "string") {
        failures.push(`Load profile ${profile.key || "<unknown>"} has invalid service`);
      }

      if (!profile.method || typeof profile.method !== "string") {
        failures.push(`Load profile ${profile.key || "<unknown>"} has invalid method`);
      }

      if (!profile.path || typeof profile.path !== "string") {
        failures.push(`Load profile ${profile.key || "<unknown>"} has invalid path`);
      }

      const workload = profile.workload || {};
      if (!Number.isInteger(workload.virtualUsers) || workload.virtualUsers <= 0) {
        failures.push(
          `Load profile ${profile.key || "<unknown>"} has invalid workload.virtualUsers`
        );
      }
      if (!Number.isInteger(workload.durationSeconds) || workload.durationSeconds <= 0) {
        failures.push(
          `Load profile ${profile.key || "<unknown>"} has invalid workload.durationSeconds`
        );
      }
      if (!Number.isInteger(workload.rampUpSeconds) || workload.rampUpSeconds < 0) {
        failures.push(
          `Load profile ${profile.key || "<unknown>"} has invalid workload.rampUpSeconds`
        );
      }

      const thresholds = profile.thresholds || {};
      if (!Number.isInteger(thresholds.p95LatencyMs) || thresholds.p95LatencyMs <= 0) {
        failures.push(
          `Load profile ${profile.key || "<unknown>"} has invalid thresholds.p95LatencyMs`
        );
      }
      if (typeof thresholds.errorRatePercent !== "number") {
        failures.push(
          `Load profile ${profile.key || "<unknown>"} has invalid thresholds.errorRatePercent`
        );
      }
      if (thresholds.errorRatePercent < 0 || thresholds.errorRatePercent > 100) {
        failures.push(
          `Load profile ${profile.key || "<unknown>"} has out-of-range thresholds.errorRatePercent`
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
  console.error("M8 load baseline check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("M8 load baseline check passed.");
console.log(
  `Validated ${requiredProfileKeys.length} required load profiles and ${requiredRunbookSections.length} runbook sections.`
);
