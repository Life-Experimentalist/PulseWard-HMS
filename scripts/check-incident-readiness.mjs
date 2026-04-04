import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const workspaceRoot = process.cwd();
const failures = [];

const configPath = "config/operations/incident-severity-matrix.json";
const runbookPath = "docs/runbooks/incident-response.md";
const requiredSeverityKeys = ["critical", "high", "medium", "low"];
const requiredRunbooks = [
  "docs/runbooks/incident-response.md",
  "docs/runbooks/on-call.md",
  "docs/runbooks/backup-recovery.md",
  "docs/runbooks/observability-alerting-baseline.md",
  "docs/runbooks/trace-correlation-baseline.md",
];
const requiredRunbookHeadings = [
  "## Incident Command Flow",
  "## Severity Objectives",
  "## Correlation and Trace Capture",
  "## Containment and Recovery Checklists",
  "## Post-Incident Review",
  "## Verification Command",
];

const configAbsolute = path.resolve(workspaceRoot, configPath);
if (!existsSync(configAbsolute)) {
  failures.push(`Missing incident severity config: ${configPath}`);
} else {
  let config;
  try {
    config = JSON.parse(readFileSync(configAbsolute, "utf8"));
  } catch (error) {
    failures.push(`Failed to parse incident severity config: ${error.message}`);
  }

  if (config) {
    if (!Array.isArray(config.severities)) {
      failures.push("incident severity config must define a severities array");
    }

    const severityMap = new Map((config.severities || []).map((item) => [item.key, item]));
    for (const key of requiredSeverityKeys) {
      if (!severityMap.has(key)) {
        failures.push(`Missing severity key in incident matrix: ${key}`);
      }
    }

    for (const severity of config.severities || []) {
      if (typeof severity.description !== "string" || !severity.description.trim()) {
        failures.push(`Severity ${severity.key || "<unknown>"} has invalid description`);
      }
      if (
        !Number.isInteger(severity.targetAcknowledgeMinutes) ||
        severity.targetAcknowledgeMinutes <= 0
      ) {
        failures.push(
          `Severity ${severity.key || "<unknown>"} has invalid targetAcknowledgeMinutes`
        );
      }
      if (
        !Number.isInteger(severity.targetMitigateMinutes) ||
        severity.targetMitigateMinutes <= 0
      ) {
        failures.push(`Severity ${severity.key || "<unknown>"} has invalid targetMitigateMinutes`);
      }
      if (
        !Number.isInteger(severity.targetStatusUpdateMinutes) ||
        severity.targetStatusUpdateMinutes <= 0
      ) {
        failures.push(
          `Severity ${severity.key || "<unknown>"} has invalid targetStatusUpdateMinutes`
        );
      }
      if (typeof severity.requiresLeadershipBridge !== "boolean") {
        failures.push(
          `Severity ${severity.key || "<unknown>"} has invalid requiresLeadershipBridge`
        );
      }
    }
  }
}

const runbookAbsolute = path.resolve(workspaceRoot, runbookPath);
if (!existsSync(runbookAbsolute)) {
  failures.push(`Missing incident runbook: ${runbookPath}`);
} else {
  const runbookContent = readFileSync(runbookAbsolute, "utf8");
  for (const heading of requiredRunbookHeadings) {
    if (!runbookContent.includes(heading)) {
      failures.push(`Incident runbook missing heading: ${heading}`);
    }
  }

  const requiredAnchors = [
    "config/operations/incident-severity-matrix.json",
    "npm run ops:incident:check",
    "npm run ops:oncall:check",
  ];

  for (const anchor of requiredAnchors) {
    if (!runbookContent.includes(anchor)) {
      failures.push(`Incident runbook missing anchor: ${anchor}`);
    }
  }
}

for (const requiredPath of requiredRunbooks) {
  if (!existsSync(path.resolve(workspaceRoot, requiredPath))) {
    failures.push(`Missing required runbook: ${requiredPath}`);
  }
}

if (failures.length > 0) {
  console.error("Incident readiness baseline check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Incident readiness baseline check passed.");
console.log(
  `Validated ${requiredSeverityKeys.length} severities and ${requiredRunbookHeadings.length} incident runbook headings.`
);
