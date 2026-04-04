import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, "..");

const templatePath = path.resolve(
  workspaceRoot,
  "docs/runbooks/templates/m9-go-live-acceptance-summary-template.md"
);
const evidenceDir = path.resolve(workspaceRoot, "docs/runbooks/evidence");

function getArgValue(flag) {
  const arg = process.argv.find((entry) => entry.startsWith(`${flag}=`));
  if (!arg) {
    return undefined;
  }
  return arg.slice(flag.length + 1).trim();
}

function normalizeEnvironment(value) {
  return value.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
}

function getDefaultDate() {
  return new Date().toISOString().slice(0, 10);
}

const dateInput = getArgValue("--date") || getDefaultDate();
if (!/^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
  console.error("Invalid --date value. Expected format: YYYY-MM-DD");
  process.exit(1);
}

const rawEnvironment = getArgValue("--environment") || "staging";
const environment = normalizeEnvironment(rawEnvironment);
if (!environment) {
  console.error("Invalid --environment value. Provide at least one alphanumeric character.");
  process.exit(1);
}

if (!existsSync(templatePath)) {
  console.error("Missing template: docs/runbooks/templates/m9-go-live-acceptance-summary-template.md");
  process.exit(1);
}

const template = readFileSync(templatePath, "utf8");
const fileName = `m9-go-live-acceptance-${dateInput}-${environment}.md`;
const targetPath = path.resolve(evidenceDir, fileName);

if (!existsSync(evidenceDir)) {
  mkdirSync(evidenceDir, { recursive: true });
}

const prefilled = template
  .replace("Date: YYYY-MM-DD", `Date: ${dateInput}`)
  .replace("Environment: staging", `Environment: ${environment}`);

writeFileSync(targetPath, prefilled, "utf8");

try {
  execSync("npm run pilot:m9:golive:check", {
    cwd: workspaceRoot,
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
    env: {
      ...process.env,
      SKIP_M9_GOLIVE_EVIDENCE_CHECK: "1",
    },
  });
} catch (error) {
  const stderrText = String(error.stderr || "").trim();
  const stdoutText = String(error.stdout || "").trim();
  const output = stderrText || stdoutText || error.message;
  console.error("M9 go-live readiness validation failed while generating evidence:");
  console.error(output);
  process.exit(1);
}

console.log(`Generated M9 go-live acceptance evidence: ${path.relative(workspaceRoot, targetPath)}`);