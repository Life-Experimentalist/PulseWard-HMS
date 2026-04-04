import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const workspaceRoot = process.cwd();
const configPath = path.resolve(workspaceRoot, "config/operations/oncall-escalation-map.json");
const requiredRunbooks = [
  "docs/runbooks/on-call.md",
  "docs/runbooks/incident-response.md",
  "docs/runbooks/backup-recovery.md",
];
const requiredServices = [
  "api-gateway",
  "auth-service",
  "appointment-service",
  "notification-service",
  "patient-service",
  "ehr-service",
  "lab-service",
  "pharmacy-service",
  "billing-service",
];
const requiredLevels = [1, 2, 3];

const failures = [];

if (!existsSync(configPath)) {
  failures.push("Missing on-call map config: config/operations/oncall-escalation-map.json");
} else {
  let config;
  try {
    config = JSON.parse(readFileSync(configPath, "utf8"));
  } catch (error) {
    failures.push(`Failed to parse on-call map: ${error.message}`);
  }

  if (config) {
    const roles = new Set((config.roles || []).map((item) => item.key));

    if (!config.communicationChannels?.primary || !config.communicationChannels?.secondary) {
      failures.push(
        "communicationChannels.primary and communicationChannels.secondary are required"
      );
    }

    const levels = new Map((config.escalationLevels || []).map((item) => [item.level, item]));

    for (const level of requiredLevels) {
      if (!levels.has(level)) {
        failures.push(`Missing escalation level ${level}`);
      }
    }

    for (const [level, definition] of levels) {
      if (!Array.isArray(definition.targetRoles) || definition.targetRoles.length === 0) {
        failures.push(`Escalation level ${level} has no targetRoles`);
      }
      if (
        !Number.isInteger(definition.targetResponseMinutes) ||
        definition.targetResponseMinutes <= 0
      ) {
        failures.push(`Escalation level ${level} has invalid targetResponseMinutes`);
      }
      for (const role of definition.targetRoles || []) {
        if (!roles.has(role)) {
          failures.push(`Escalation level ${level} references undefined role ${role}`);
        }
      }
    }

    const ownership = new Map((config.serviceOwnership || []).map((item) => [item.service, item]));

    for (const service of requiredServices) {
      const definition = ownership.get(service);
      if (!definition) {
        failures.push(`Missing service ownership mapping for ${service}`);
        continue;
      }
      if (!roles.has(definition.ownerRole)) {
        failures.push(`Service ${service} references undefined ownerRole ${definition.ownerRole}`);
      }
    }
  }
}

for (const runbook of requiredRunbooks) {
  if (!existsSync(path.resolve(workspaceRoot, runbook))) {
    failures.push(`Missing required runbook: ${runbook}`);
  }
}

if (failures.length > 0) {
  console.error("On-call coverage check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("On-call coverage check passed.");
console.log(
  `Validated ${requiredLevels.length} escalation levels and ${requiredServices.length} service ownership mappings.`
);
