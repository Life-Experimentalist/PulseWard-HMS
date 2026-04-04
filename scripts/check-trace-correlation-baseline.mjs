import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const workspaceRoot = process.cwd();
const failures = [];

const requestContextUtilityPath = "packages/shared-utils/request-context.js";
const serviceBindings = [
  { service: "api-gateway", sourceFile: "services/api-gateway/src" },
  { service: "auth-service", sourceFile: "services/auth-service/src" },
  { service: "appointment-service", sourceFile: "services/appointment-service/src" },
  { service: "notification-service", sourceFile: "services/notification-service/src" },
  { service: "patient-service", sourceFile: "services/patient-service/src" },
  { service: "ehr-service", sourceFile: "services/ehr-service/src" },
  { service: "lab-service", sourceFile: "services/lab-service/src" },
  { service: "pharmacy-service", sourceFile: "services/pharmacy-service/src" },
  { service: "billing-service", sourceFile: "services/billing-service/src" },
];

const requiredRunbooks = [
  "docs/runbooks/trace-correlation-baseline.md",
  "docs/runbooks/incident-response.md",
  "docs/runbooks/on-call.md",
];

const utilityAbsolutePath = path.resolve(workspaceRoot, requestContextUtilityPath);
if (!existsSync(utilityAbsolutePath)) {
  failures.push(`Missing request context utility: ${requestContextUtilityPath}`);
} else {
  const utilityContent = readFileSync(utilityAbsolutePath, "utf8");
  const requiredUtilityAnchors = ["x-correlation-id", "x-request-id", "http_request_completed"];

  for (const anchor of requiredUtilityAnchors) {
    if (!utilityContent.includes(anchor)) {
      failures.push(`Request context utility missing anchor: ${anchor}`);
    }
  }
}

for (const binding of serviceBindings) {
  const absolutePath = path.resolve(workspaceRoot, binding.sourceFile);
  if (!existsSync(absolutePath)) {
    failures.push(`Missing service source file: ${binding.sourceFile}`);
    continue;
  }

  const content = readFileSync(absolutePath, "utf8");
  if (!content.includes("withRequestContext")) {
    failures.push(`Service source missing withRequestContext middleware: ${binding.sourceFile}`);
    continue;
  }

  if (
    !content.includes(`withRequestContext("${binding.service}")`) &&
    !content.includes(`withRequestContext('${binding.service}')`)
  ) {
    failures.push(
      `Service source missing scoped middleware binding for ${binding.service}: ${binding.sourceFile}`
    );
  }
}

for (const runbookPath of requiredRunbooks) {
  const absolutePath = path.resolve(workspaceRoot, runbookPath);
  if (!existsSync(absolutePath)) {
    failures.push(`Missing required runbook: ${runbookPath}`);
  }
}

if (failures.length > 0) {
  console.error("Trace correlation baseline check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Trace correlation baseline check passed.");
console.log(
  `Validated correlated logging baseline across ${serviceBindings.length} service runtimes.`
);
