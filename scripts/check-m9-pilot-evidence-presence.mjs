import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const workspaceRoot = process.cwd();
const evidenceDir = path.resolve(workspaceRoot, "docs/runbooks/evidence");
const failures = [];

if (!existsSync(evidenceDir)) {
  failures.push("Missing evidence directory: docs/runbooks/evidence");
} else {
  const evidenceFiles = readdirSync(evidenceDir).filter((name) =>
    /^m9-pilot-cutover-\d{4}-\d{2}-\d{2}-.+\.md$/i.test(name)
  );

  if (evidenceFiles.length === 0) {
    failures.push("Missing M9 pilot/cutover evidence file under docs/runbooks/evidence");
  } else {
    const latestEvidence = evidenceFiles.sort().at(-1);
    const latestEvidencePath = path.join(evidenceDir, latestEvidence);
    const evidenceContent = readFileSync(latestEvidencePath, "utf8");

    const requiredAnchors = [
      "# M9 Pilot and Cutover Evidence",
      "- Status: pass",
      "## Acceptance Criteria Coverage",
      "- api-p95-latency",
      "- api-error-rate",
      "- notification-delivery-success",
      "## Cutover Checklist Coverage",
      "- communications-approved",
      "- rollback-window-confirmed",
      "- runbook-links-validated",
      "- support-escalation-ready",
    ];

    for (const anchor of requiredAnchors) {
      if (!evidenceContent.includes(anchor)) {
        failures.push(`Latest M9 pilot evidence missing anchor (${anchor}): ${latestEvidence}`);
      }
    }
  }
}

if (failures.length > 0) {
  console.error("M9 pilot evidence presence check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("M9 pilot evidence presence check passed.");
console.log("Validated latest M9 pilot/cutover evidence artifact status and coverage anchors.");
