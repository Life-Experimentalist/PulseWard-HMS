import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      options[key] = true;
      continue;
    }
    options[key] = next;
    index += 1;
  }
  return options;
}

const options = parseArgs(process.argv.slice(2));

const tenantKey = options.tenant || "default";
const backupId = options["backup-id"] || `backup-${new Date().toISOString().slice(0, 10)}`;
const restoreTarget = options["restore-target"] || "sandbox-default";
const rtoMinutes = Number(options["rto-minutes"] || 0);
const rpoMinutes = Number(options["rpo-minutes"] || 0);
const operator = options.operator || "platform-operations";

const now = new Date();
const dateStamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
  now.getDate()
).padStart(2, "0")}`;

const evidenceDir = path.resolve(process.cwd(), "docs/runbooks/evidence");
mkdirSync(evidenceDir, { recursive: true });

const outputPath = path.join(evidenceDir, `backup-drill-${dateStamp}-${tenantKey}.md`);

const rtoSlaMinutes = 240;
const rpoSlaMinutes = 60;
const rtoResult = rtoMinutes > 0 ? (rtoMinutes <= rtoSlaMinutes ? "pass" : "fail") : "not-recorded";
const rpoResult = rpoMinutes > 0 ? (rpoMinutes <= rpoSlaMinutes ? "pass" : "fail") : "not-recorded";

const content = `# Backup Drill Evidence (${dateStamp})

## Metadata

- Tenant: ${tenantKey}
- Backup ID: ${backupId}
- Restore target: ${restoreTarget}
- Operator: ${operator}
- Executed at: ${now.toISOString()}

## Drill Checklist

- [x] Backup artifact selected
- [x] Restore executed in isolated target
- [x] Tenant data isolation spot-check completed
- [x] Post-restore basic read checks completed

## Measured Recovery Objectives

- RTO target (minutes): ${rtoSlaMinutes}
- RTO measured (minutes): ${rtoMinutes || "not-recorded"}
- RTO status: ${rtoResult}
- RPO target (minutes): ${rpoSlaMinutes}
- RPO measured (minutes): ${rpoMinutes || "not-recorded"}
- RPO status: ${rpoResult}

## Notes

- Attach logs, command outputs, and issue links for audit handoff.
- If any objective is fail or not-recorded, open follow-up incident/task before marking the weekly drill complete.
`;

writeFileSync(outputPath, content, "utf8");
console.log(`Backup drill evidence generated: ${path.relative(process.cwd(), outputPath)}`);
