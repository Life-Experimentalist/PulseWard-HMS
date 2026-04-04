import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROADMAP_PATH = path.resolve(process.cwd(), "docs/ROADMAP-TODO.md");
const SNAPSHOT_START = "<!-- ROADMAP_AUTO_SNAPSHOT_START -->";
const SNAPSHOT_END = "<!-- ROADMAP_AUTO_SNAPSHOT_END -->";

const roadmap = readFileSync(ROADMAP_PATH, "utf8");

if (!roadmap.includes(SNAPSHOT_START) || !roadmap.includes(SNAPSHOT_END)) {
  throw new Error(
    "Roadmap snapshot markers are missing. Add ROADMAP_AUTO_SNAPSHOT_START/END markers first."
  );
}

function collectMilestoneStats(source) {
  const stats = new Map();
  const regex = /M(\d+)\.(\d+) completed:/g;
  let match;

  while ((match = regex.exec(source)) !== null) {
    const milestone = Number(match[1]);
    const slice = Number(match[2]);
    const current = stats.get(milestone) ?? { count: 0, max: 0 };
    current.count += 1;
    current.max = Math.max(current.max, slice);
    stats.set(milestone, current);
  }

  return stats;
}

function maxFromPattern(source, regex) {
  let max = 0;
  let match;

  while ((match = regex.exec(source)) !== null) {
    const value = Number(match[1]);
    if (!Number.isNaN(value)) {
      max = Math.max(max, value);
    }
  }

  return max;
}

const stats = collectMilestoneStats(roadmap);
const m6Max = stats.get(6)?.max ?? 0;
const m7Max = stats.get(7)?.max ?? 0;
const m8Max = stats.get(8)?.max ?? 0;
const m9Max = stats.get(9)?.max ?? 0;

const planned = {
  m6Closeout: 4,
  m7: 8,
  m8: 6,
  m9: 5,
};

const m6CloseoutDone = maxFromPattern(roadmap, /M6 closeout wave (\d+) completed:/gi);
const m6CloseoutRemaining = Math.max(0, planned.m6Closeout - m6CloseoutDone);
const m7Remaining = Math.max(0, planned.m7 - m7Max);
const m8Remaining = Math.max(0, planned.m8 - m8Max);
const m9Remaining = Math.max(0, planned.m9 - m9Max);
const totalRemaining = m6CloseoutRemaining + m7Remaining + m8Remaining + m9Remaining;

const hasExpoArtifacts = [
  "apps/mobile-notifications/app.json",
  "apps/mobile-app/app.json",
  "apps/mobile/app.json",
  "app.json",
  "eas.json",
].some((relativePath) => existsSync(path.resolve(process.cwd(), relativePath)));

const webEvidenceDone = /M6 web closeout evidence completed:/i.test(roadmap);
const mobileEvidenceDone = /M6 mobile notification evidence completed:/i.test(roadmap);
const now = new Date();
const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
  now.getDate()
).padStart(2, "0")}`;

const snapshotBlock = `${SNAPSHOT_START}
- Last auto-refresh: \`${today}\` via \`pnpm run roadmap:refresh\`.
- M6 contract stream completion: \`${m6Max}/228\` (remaining: \`${Math.max(0, 228 - m6Max)}\`).
- M6 milestone closeout waves: \`${m6CloseoutDone}/${
  planned.m6Closeout
}\` (remaining: \`${m6CloseoutRemaining}\`).
- M6 web closeout evidence status: ${webEvidenceDone ? "Completed" : "Pending"}.
- M6 mobile notification evidence status: ${mobileEvidenceDone ? "Completed" : "Pending"}.
- Expo artifact presence in repository: ${hasExpoArtifacts ? "Detected" : "Not detected"}.
- M7 grouped waves: \`${m7Max}/${planned.m7}\` (remaining: \`${m7Remaining}\`).
- M8 grouped waves: \`${m8Max}/${planned.m8}\` (remaining: \`${m8Remaining}\`).
- M9 grouped waves: \`${m9Max}/${planned.m9}\` (remaining: \`${m9Remaining}\`).
- Total grouped waves remaining (M6-M9): \`${totalRemaining}\`.

\`\`\`mermaid
flowchart LR
  A[M6 Contract Stream\\n${m6Max}/228] --> B[M6 Closeout Waves\\n${m6CloseoutDone}/${
  planned.m6Closeout
}]
  B --> C[Web Evidence\\n${webEvidenceDone ? "Done" : "Pending"}]
  B --> D[Mobile Evidence\\n${mobileEvidenceDone ? "Done" : "Pending"}]
  D --> E[Expo Artifacts\\n${hasExpoArtifacts ? "Detected" : "Missing"}]
  C --> F[M7\\n${m7Max}/${planned.m7}]
  E --> F
  F --> G[M8\\n${m8Max}/${planned.m8}]
  G --> H[M9\\n${m9Max}/${planned.m9}]
\`\`\`
${SNAPSHOT_END}`;

const escapedStart = SNAPSHOT_START.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const escapedEnd = SNAPSHOT_END.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const blockRegex = new RegExp(`${escapedStart}[\\s\\S]*?${escapedEnd}`);

const updated = roadmap.replace(blockRegex, snapshotBlock);
writeFileSync(ROADMAP_PATH, updated, "utf8");

console.log("Roadmap snapshot refreshed.");

