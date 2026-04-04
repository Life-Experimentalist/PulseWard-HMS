import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const workspaceRoot = process.cwd();
const configPath = path.resolve(workspaceRoot, "config/observability/default-alert-rules.json");

const requiredAlertKeys = [
  "api-error-rate-high",
  "queue-backlog-high",
  "adapter-failure-rate-high",
  "p95-latency-high",
];

const requiredRunbooks = [
  "docs/runbooks/incident-response.md",
  "docs/runbooks/backup-recovery.md",
  "docs/runbooks/on-call.md",
  "docs/runbooks/integration-provider-operations.md",
  "docs/runbooks/observability-alerting-baseline.md",
];

const failures = [];

if (!existsSync(configPath)) {
  failures.push(`Missing config file: ${path.relative(workspaceRoot, configPath)}`);
} else {
  let config;
  try {
    config = JSON.parse(readFileSync(configPath, "utf8"));
  } catch (error) {
    failures.push(`Config parse failure: ${error.message}`);
  }

  if (config) {
    if (!Array.isArray(config.alerts)) {
      failures.push("config.alerts must be an array");
    }

    if (!Array.isArray(config.dashboards) || config.dashboards.length === 0) {
      failures.push("config.dashboards must be a non-empty array");
    }

    const alertByKey = new Map((config.alerts || []).map((alert) => [alert.key, alert]));

    for (const key of requiredAlertKeys) {
      if (!alertByKey.has(key)) {
        failures.push(`Missing required alert key: ${key}`);
      }
    }

    for (const alert of config.alerts || []) {
      if (!alert.key || typeof alert.key !== "string") {
        failures.push("Alert has invalid key");
      }
      if (!alert.metric || typeof alert.metric !== "string") {
        failures.push(`Alert ${alert.key || "<unknown>"} has invalid metric`);
      }
      if (typeof alert.threshold !== "number" || Number.isNaN(alert.threshold)) {
        failures.push(`Alert ${alert.key || "<unknown>"} has invalid threshold`);
      }
      if (!Number.isInteger(alert.windowMinutes) || alert.windowMinutes <= 0) {
        failures.push(`Alert ${alert.key || "<unknown>"} has invalid windowMinutes`);
      }
      if (!["warning", "critical"].includes(alert.severity)) {
        failures.push(`Alert ${alert.key || "<unknown>"} has invalid severity`);
      }
      if (!alert.runbook || typeof alert.runbook !== "string") {
        failures.push(`Alert ${alert.key || "<unknown>"} has invalid runbook path`);
      } else {
        const runbookPath = path.resolve(workspaceRoot, alert.runbook);
        if (!existsSync(runbookPath)) {
          failures.push(`Alert ${alert.key} references missing runbook: ${alert.runbook}`);
        }
      }
    }
  }
}

for (const runbook of requiredRunbooks) {
  const runbookPath = path.resolve(workspaceRoot, runbook);
  if (!existsSync(runbookPath)) {
    failures.push(`Missing required runbook: ${runbook}`);
  }
}

if (failures.length > 0) {
  console.error("Observability baseline check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Observability baseline check passed.");
console.log(
  `Validated ${requiredAlertKeys.length} required alert rules and ${requiredRunbooks.length} runbooks.`
);
