import { existsSync, readdirSync, readFileSync } from "node:fs";
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
  "docs/runbooks/m8-performance-readiness.md",
  "scripts/check-m8-load-baseline.mjs",
  "scripts/check-m8-resilience-baseline.mjs",
  "scripts/check-m8-rc-evidence-presence.mjs",
  "scripts/check-m8-release-candidate-gate.mjs",
];

const nestedChecks = [
  { label: "m8-load-baseline", command: "pnpm run perf:m8:check" },
  { label: "m8-resilience-baseline", command: "pnpm run perf:m8:resilience:check" },
  { label: "m8-rc-evidence-presence", command: "pnpm run perf:m8:rc:evidence:check" },
  { label: "m8-release-candidate-gate", command: "pnpm run perf:m8:rc:check" },
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

for (const check of nestedChecks) {
  try {
    runShellCommand(check.command);
  } catch (error) {
    const stderrText = String(error.stderr || "").trim();
    const stdoutText = String(error.stdout || "").trim();
    const output = stderrText || stdoutText || error.message;
    failures.push(`Nested check failed for ${check.label}: ${output}`);
  }
}

const evidenceDir = path.resolve(workspaceRoot, "docs/runbooks/evidence");
if (!existsSync(evidenceDir)) {
  failures.push("Missing evidence directory: docs/runbooks/evidence");
} else {
  const evidenceFiles = readdirSync(evidenceDir).filter((name) =>
    /^m8-rc-gate-\d{4}-\d{2}-\d{2}-.+\.md$/i.test(name)
  );

  if (evidenceFiles.length === 0) {
    failures.push("Missing M8 RC gate evidence file under docs/runbooks/evidence");
  } else {
    const latestEvidence = evidenceFiles.sort().at(-1);
    const latestEvidencePath = path.join(evidenceDir, latestEvidence);
    const evidenceContent = readFileSync(latestEvidencePath, "utf8");

    if (!evidenceContent.includes("- Status: pass")) {
      failures.push(`Latest M8 RC evidence is not passing: ${latestEvidence}`);
    }

    if (!evidenceContent.includes("- rc-evidence-presence (skipped during evidence generation)")) {
      failures.push(
        `Latest M8 RC evidence is missing evidence-presence coverage marker: ${latestEvidence}`
      );
    }
  }
}

if (failures.length > 0) {
  console.error("M8 performance readiness check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("M8 performance readiness check passed.");
console.log(
  `Validated ${nestedChecks.length} nested checks plus RC evidence artifact coverage for milestone closeout.`
);

