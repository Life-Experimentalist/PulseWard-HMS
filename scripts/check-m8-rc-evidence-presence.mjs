import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const workspaceRoot = process.cwd();
const evidenceDir = path.resolve(workspaceRoot, "docs/runbooks/evidence");
const failures = [];

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

    const requiredAnchors = [
      "# M8 Release Candidate Gate Evidence",
      "- Status: pass",
      "## Nested Check Coverage",
      "- rc-evidence-presence (skipped during evidence generation)",
      "- contracts-strict",
      "- route-load",
      "- adapter-regressions",
      "- portal-build",
    ];

    for (const anchor of requiredAnchors) {
      if (!evidenceContent.includes(anchor)) {
        failures.push(`Latest M8 RC evidence missing anchor (${anchor}): ${latestEvidence}`);
      }
    }
  }
}

if (failures.length > 0) {
  console.error("M8 RC evidence presence check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("M8 RC evidence presence check passed.");
console.log("Validated latest M8 RC evidence artifact status and nested-check anchors.");
