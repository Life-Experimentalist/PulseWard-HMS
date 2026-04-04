import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const workspaceRoot = process.cwd();
const evidenceDir = path.resolve(workspaceRoot, "docs/runbooks/evidence");
const failures = [];

if (!existsSync(evidenceDir)) {
  failures.push("Missing evidence directory: docs/runbooks/evidence");
} else {
  const evidenceFiles = readdirSync(evidenceDir).filter((name) =>
    /^m9-cutover-rehearsal-\d{4}-\d{2}-\d{2}-.+\.md$/i.test(name)
  );

  if (evidenceFiles.length === 0) {
    failures.push("Missing M9 cutover rehearsal evidence file under docs/runbooks/evidence");
  } else {
    const latestEvidence = evidenceFiles.sort().at(-1);
    const latestEvidencePath = path.join(evidenceDir, latestEvidence);
    const evidenceContent = readFileSync(latestEvidencePath, "utf8");

    const requiredAnchors = [
      "# M9 Cutover Rehearsal Evidence",
      "- Status: pass",
      "## Rehearsal Step Coverage",
      "- communications-dry-run",
      "- traffic-shift-simulation",
      "- rollback-rehearsal",
      "- data-integrity-smoke-check",
      "- signoff-capture",
      "## Success Criteria Coverage",
      "- rehearsal-duration",
      "- rollback-rto",
      "- critical-incidents",
    ];

    for (const anchor of requiredAnchors) {
      if (!evidenceContent.includes(anchor)) {
        failures.push(
          `Latest M9 cutover rehearsal evidence missing anchor (${anchor}): ${latestEvidence}`
        );
      }
    }
  }
}

if (failures.length > 0) {
  console.error("M9 cutover rehearsal evidence presence check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("M9 cutover rehearsal evidence presence check passed.");
console.log("Validated latest M9 cutover rehearsal evidence artifact status and coverage anchors.");
