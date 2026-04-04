import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const workspaceRoot = process.cwd();
const failures = [];

const requiredFiles = [
  "config/operations/m9-pilot-cutover-checklist.json",
  "config/operations/m9-cutover-rehearsal-pack.json",
  "config/operations/m9-go-live-acceptance-pack.json",
  "docs/runbooks/m9-pilot-cutover-readiness.md",
  "docs/runbooks/m9-cutover-rehearsal.md",
  "docs/runbooks/m9-go-live-acceptance.md",
  "docs/runbooks/m9-production-readiness.md",
  "scripts/check-m9-pilot-readiness.mjs",
  "scripts/check-m9-cutover-rehearsal-readiness.mjs",
  "scripts/check-m9-go-live-readiness.mjs",
  "scripts/check-m9-pilot-evidence-presence.mjs",
  "scripts/check-m9-cutover-rehearsal-evidence-presence.mjs",
  "scripts/check-m9-go-live-evidence-presence.mjs",
];

const nestedChecks = [
  { label: "m9-pilot-evidence-presence", command: "pnpm run pilot:m9:evidence:check" },
  {
    label: "m9-cutover-rehearsal-evidence-presence",
    command: "pnpm run pilot:m9:rehearsal:evidence:check",
  },
  { label: "m9-go-live-evidence-presence", command: "pnpm run pilot:m9:golive:evidence:check" },
  { label: "m9-pilot-readiness", command: "pnpm run pilot:m9:check" },
  { label: "m9-cutover-rehearsal-readiness", command: "pnpm run pilot:m9:rehearsal:check" },
  { label: "m9-go-live-readiness", command: "pnpm run pilot:m9:golive:check" },
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
  const evidenceFiles = readdirSync(evidenceDir);

  const expected = [
    {
      prefix: /^m9-pilot-cutover-\d{4}-\d{2}-\d{2}-.+\.md$/i,
      anchor: "# M9 Pilot and Cutover Evidence",
      label: "pilot",
    },
    {
      prefix: /^m9-cutover-rehearsal-\d{4}-\d{2}-\d{2}-.+\.md$/i,
      anchor: "# M9 Cutover Rehearsal Evidence",
      label: "rehearsal",
    },
    {
      prefix: /^m9-go-live-acceptance-\d{4}-\d{2}-\d{2}-.+\.md$/i,
      anchor: "# M9 Go-Live Acceptance Evidence",
      label: "go-live",
    },
  ];

  for (const item of expected) {
    const matches = evidenceFiles.filter((name) => item.prefix.test(name));
    if (matches.length === 0) {
      failures.push(`Missing M9 ${item.label} evidence file under docs/runbooks/evidence`);
      continue;
    }

    const latest = matches.sort().at(-1);
    const content = readFileSync(path.join(evidenceDir, latest), "utf8");
    if (!content.includes(item.anchor)) {
      failures.push(`Latest M9 ${item.label} evidence missing title anchor: ${latest}`);
    }
    if (!content.includes("- Status: pass")) {
      failures.push(`Latest M9 ${item.label} evidence is not pass status: ${latest}`);
    }
  }
}

if (failures.length > 0) {
  console.error("M9 production readiness check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("M9 production readiness check passed.");
console.log(
  `Validated ${nestedChecks.length} nested checks plus pilot, rehearsal, and go-live evidence pass markers.`
);
