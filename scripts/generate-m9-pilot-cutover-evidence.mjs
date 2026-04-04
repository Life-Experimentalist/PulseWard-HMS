import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

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

function sanitizeSlug(value, fallback) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (!normalized) {
    return fallback;
  }

  const slug = normalized.replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || fallback;
}

function tailLines(value, maxLines = 40) {
  const lines = String(value || "")
    .split(/\r?\n/)
    .filter((line) => line.length > 0);
  if (lines.length <= maxLines) {
    return lines.join("\n");
  }
  return lines.slice(-maxLines).join("\n");
}

const options = parseArgs(process.argv.slice(2));
const workspaceRoot = process.cwd();
const now = new Date();
const dateStamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
  now.getDate()
).padStart(2, "0")}`;

const environment = sanitizeSlug(options.environment, "staging");
const operator = options.operator || "platform-operations";
const tenant = options.tenant || "citycare-hospital";
const commitSha = options.commit || process.env.GIT_COMMIT || "not-specified";

const evidenceDir = path.resolve(workspaceRoot, "docs/runbooks/evidence");
mkdirSync(evidenceDir, { recursive: true });

const outputPath = path.join(evidenceDir, `m9-pilot-cutover-${dateStamp}-${environment}.md`);

let status = "pass";
let outputTail = "";

try {
  const stdout = execSync("npm run pilot:m9:check", {
    cwd: workspaceRoot,
    shell: true,
    env: {
      ...process.env,
      SKIP_M9_PILOT_EVIDENCE_CHECK: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
  });
  outputTail = tailLines(stdout, 60);
} catch (error) {
  status = "fail";
  outputTail = tailLines(`${String(error.stdout || "")}\n${String(error.stderr || "")}`, 80);
}

const content = `# M9 Pilot and Cutover Evidence (${dateStamp})

## Metadata

- Environment: ${environment}
- Tenant: ${tenant}
- Operator: ${operator}
- Commit SHA: ${commitSha}
- Executed at: ${now.toISOString()}
- Command: npm run pilot:m9:check

## Pilot Status

- Status: ${status}

## Acceptance Criteria Coverage

- api-p95-latency
- api-error-rate
- notification-delivery-success

## Cutover Checklist Coverage

- communications-approved
- rollback-window-confirmed
- runbook-links-validated
- support-escalation-ready

## Output Tail

\`\`\`text
${outputTail || "<no output captured>"}
\`\`\`

## Notes

- Regenerate this artifact whenever pilot acceptance criteria or cutover checklist inventory changes.
- If status is fail, attach issue link and mitigation plan before marking pilot checkpoint complete.
`;

writeFileSync(outputPath, content, "utf8");

if (status === "fail") {
  console.error(
    `M9 pilot evidence generated with failure status: ${path.relative(workspaceRoot, outputPath)}`
  );
  process.exit(1);
}

console.log(`M9 pilot evidence generated: ${path.relative(workspaceRoot, outputPath)}`);
