import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const workspaceRoot = process.cwd();
const failures = [];

const requiredFiles = [
  "config/observability/default-alert-rules.json",
  "config/operations/oncall-escalation-map.json",
  "config/operations/incident-severity-matrix.json",
  "packages/shared-utils/request-context.js",
  "docs/runbooks/observability-alerting-baseline.md",
  "docs/runbooks/on-call.md",
  "docs/runbooks/backup-recovery.md",
  "docs/runbooks/trace-correlation-baseline.md",
  "docs/runbooks/incident-response.md",
  "docs/runbooks/m7-operability-readiness.md",
];

const nestedChecks = [
  {
    label: "observability",
    scriptPath: "scripts/check-observability-baseline.mjs",
  },
  {
    label: "on-call",
    scriptPath: "scripts/check-oncall-coverage.mjs",
  },
  {
    label: "trace-correlation",
    scriptPath: "scripts/check-trace-correlation-baseline.mjs",
  },
  {
    label: "incident-readiness",
    scriptPath: "scripts/check-incident-readiness.mjs",
  },
];

for (const relativePath of requiredFiles) {
  if (!existsSync(path.resolve(workspaceRoot, relativePath))) {
    failures.push(`Missing required file: ${relativePath}`);
  }
}

for (const check of nestedChecks) {
  const absoluteScriptPath = path.resolve(workspaceRoot, check.scriptPath);
  if (!existsSync(absoluteScriptPath)) {
    failures.push(`Missing nested check script: ${check.scriptPath}`);
    continue;
  }

  try {
    execFileSync(process.execPath, [absoluteScriptPath], {
      cwd: workspaceRoot,
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8",
    });
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
  const evidenceFiles = readdirSync(evidenceDir);
  const backupEvidence = evidenceFiles.filter((name) =>
    /^backup-drill-\d{4}-\d{2}-\d{2}-.+\.md$/i.test(name)
  );
  const restoreEvidence = evidenceFiles.filter((name) =>
    /^restore-isolation-\d{4}-\d{2}-\d{2}-.+\.md$/i.test(name)
  );

  if (backupEvidence.length === 0) {
    failures.push("Missing backup drill evidence file under docs/runbooks/evidence");
  }

  if (restoreEvidence.length === 0) {
    failures.push("Missing restore isolation evidence file under docs/runbooks/evidence");
  }

  if (restoreEvidence.length > 0) {
    const latestRestore = restoreEvidence.sort().at(-1);
    const latestRestoreContent = readFileSync(path.join(evidenceDir, latestRestore), "utf8");
    if (!latestRestoreContent.includes("Verification status: pass")) {
      failures.push(`Latest restore isolation evidence is not passing: ${latestRestore}`);
    }
  }
}

if (failures.length > 0) {
  console.error("M7 operability readiness check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("M7 operability readiness check passed.");
console.log(
  `Validated ${nestedChecks.length} nested baseline checks plus backup/restore evidence artifacts.`
);
