import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const workspaceRoot = process.cwd();
const failures = [];

const requiredFiles = [
  "config/performance/m8-load-profiles.json",
  "config/performance/m8-resilience-drills.json",
  "docs/runbooks/m8-load-validation.md",
  "docs/runbooks/m8-resilience-drills.md",
  "docs/runbooks/m8-release-candidate-gate.md",
  "docs/runbooks/templates/m8-release-candidate-summary-template.md",
];

const requiredRunbookSections = [
  "## Contract Regression Gate",
  "## Portal Build Gate",
  "## Adapter Regression Gate",
  "## Evidence Capture",
  "## Rollback Verification",
  "## Verification Command",
];

const nestedChecks = [
  { label: "m8-load-baseline", command: "npm run perf:m8:check" },
  { label: "m8-resilience-baseline", command: "npm run perf:m8:resilience:check" },
  {
    label: "rc-evidence-presence",
    command: "npm run perf:m8:rc:evidence:check",
    skipWhenEnv: "SKIP_M8_RC_EVIDENCE_CHECK",
  },
  { label: "contracts-strict", command: "npm run contracts:check -- --strict" },
  { label: "route-load", command: "npm run test:routes" },
  {
    label: "adapter-regressions",
    command:
      "npm run test:quick -- tests/appointment/calendar-providers.test.js tests/appointment/calendar-interoperability-diagnostics.test.js tests/notification/messaging-providers.test.js tests/notification/messaging-connector-diagnostics.test.js tests/notification/webhook-delivery-diagnostics.test.js",
  },
  { label: "portal-build", command: "npm run build:apps" },
];

function runShellCommand(command) {
  execSync(command, {
    cwd: workspaceRoot,
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
  });
}

for (const relativePath of requiredFiles) {
  if (!existsSync(path.resolve(workspaceRoot, relativePath))) {
    failures.push(`Missing required file: ${relativePath}`);
  }
}

const runbookPath = path.resolve(workspaceRoot, "docs/runbooks/m8-release-candidate-gate.md");
if (existsSync(runbookPath)) {
  const runbook = readFileSync(runbookPath, "utf8");
  for (const section of requiredRunbookSections) {
    if (!runbook.includes(section)) {
      failures.push(`Runbook missing required section: ${section}`);
    }
  }
}

for (const check of nestedChecks) {
  if (check.skipWhenEnv && process.env[check.skipWhenEnv] === "1") {
    continue;
  }

  try {
    runShellCommand(check.command);
  } catch (error) {
    const stderrText = String(error.stderr || "").trim();
    const stdoutText = String(error.stdout || "").trim();
    const output = stderrText || stdoutText || error.message;
    failures.push(`Nested check failed for ${check.label}: ${output}`);
  }
}

if (failures.length > 0) {
  console.error("M8 release-candidate gate check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("M8 release-candidate gate check passed.");
console.log(
  `Validated ${
    nestedChecks.filter((check) => !(check.skipWhenEnv && process.env[check.skipWhenEnv] === "1"))
      .length
  } nested checks across evidence presence, contracts, route loading, adapter regressions, and portal builds.`
);
