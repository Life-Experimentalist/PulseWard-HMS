import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const workspaceRoot = process.cwd();
const evidenceDir = path.resolve(workspaceRoot, "docs/runbooks/evidence");
const failures = [];

if (!existsSync(evidenceDir)) {
  failures.push("Missing evidence directory: docs/runbooks/evidence");
} else {
  const evidenceFiles = readdirSync(evidenceDir).filter((name) =>
    /^m9-go-live-acceptance-\d{4}-\d{2}-\d{2}-.+\.md$/i.test(name)
  );

  if (evidenceFiles.length === 0) {
    failures.push("Missing M9 go-live acceptance evidence file under docs/runbooks/evidence");
  } else {
    const latestEvidence = evidenceFiles.sort().at(-1);
    const latestEvidencePath = path.join(evidenceDir, latestEvidence);
    const evidenceContent = readFileSync(latestEvidencePath, "utf8");

    const requiredAnchors = [
      "# M9 Go-Live Acceptance Evidence",
      "- Status: pass",
      "## Acceptance Check Coverage",
      "- pilot-stability-confirmed",
      "- cutover-rehearsal-confirmed",
      "- incident-command-ready",
      "- rollback-approval-confirmed",
      "- stakeholder-signoff-captured",
      "## Operational Guardrail Coverage",
      "- api-error-rate",
      "- notification-delivery-success",
      "- critical-incidents",
    ];

    for (const anchor of requiredAnchors) {
      if (!evidenceContent.includes(anchor)) {
        failures.push(`Latest M9 go-live evidence missing anchor (${anchor}): ${latestEvidence}`);
      }
    }
  }
}

if (failures.length > 0) {
  console.error("M9 go-live evidence presence check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("M9 go-live evidence presence check passed.");
console.log("Validated latest M9 go-live evidence artifact status and coverage anchors.");