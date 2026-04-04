import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
const tenantKey = options.tenant;
const recordsFile = options["records-file"];
const operator = options.operator || "platform-operations";

if (!tenantKey) {
  console.error("Missing required --tenant argument.");
  process.exit(1);
}

if (!recordsFile) {
  console.error("Missing required --records-file argument.");
  process.exit(1);
}

const workspaceRoot = process.cwd();
const recordsPath = path.resolve(workspaceRoot, recordsFile);

if (!existsSync(recordsPath)) {
  console.error(`Records file not found: ${recordsFile}`);
  process.exit(1);
}

let records;
try {
  records = JSON.parse(readFileSync(recordsPath, "utf8"));
} catch (error) {
  console.error(`Unable to parse records file: ${error.message}`);
  process.exit(1);
}

if (!Array.isArray(records) || records.length === 0) {
  console.error("Records file must contain a non-empty JSON array.");
  process.exit(1);
}

const invalid = [];
for (const record of records) {
  if (!record || typeof record !== "object") {
    invalid.push({ reason: "record-not-object" });
    continue;
  }
  if (record.tenantKey !== tenantKey) {
    invalid.push({
      id: record.id || "unknown",
      tenantKey: record.tenantKey || "missing",
      reason: "tenant-mismatch",
    });
  }
}

const now = new Date();
const dateStamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
  now.getDate()
).padStart(2, "0")}`;

const evidenceDir = path.resolve(workspaceRoot, "docs/runbooks/evidence");
mkdirSync(evidenceDir, { recursive: true });

const outputPath = path.join(evidenceDir, `restore-isolation-${dateStamp}-${tenantKey}.md`);
const status = invalid.length === 0 ? "pass" : "fail";

const invalidLines =
  invalid.length === 0
    ? "- none"
    : invalid
        .map(
          (item) =>
            `- id=${item.id || "unknown"}, tenantKey=${item.tenantKey || "unknown"}, reason=${
              item.reason
            }`
        )
        .join("\n");

const content = `# Restore Tenant Isolation Verification (${dateStamp})

## Metadata

- Tenant target: ${tenantKey}
- Records source: ${recordsFile}
- Operator: ${operator}
- Executed at: ${now.toISOString()}

## Verification Summary

- Records scanned: ${records.length}
- Isolation violations: ${invalid.length}
- Verification status: ${status}

## Violations

${invalidLines}
`;

writeFileSync(outputPath, content, "utf8");

if (status === "fail") {
  console.error(
    `Restore tenant isolation verification failed. Evidence: ${path.relative(
      workspaceRoot,
      outputPath
    )}`
  );
  process.exit(1);
}

console.log(
  `Restore tenant isolation verification passed. Evidence: ${path.relative(
    workspaceRoot,
    outputPath
  )}`
);
