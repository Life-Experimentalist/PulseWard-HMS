#!/usr/bin/env node
/**
 * PulseWard HMS Release Script
 *
 * Usage:
 *   pnpm run release -- --version 1.4.0          # full pipeline
 *   pnpm run release -- --version 1.4.0 --dry-run # preview without changes
 *   pnpm run release:prepare -- --version 1.4.0   # lint+test+bump+changelog only
 *   pnpm run release:artifacts                     # build+zip current version
 *   pnpm run release:publish                       # commit+tag+push current version
 */

import { execSync, spawnSync } from "node:child_process";
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const archiver = require("archiver");

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, "..");

// ─── CLI ARGS ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const arg = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};

const DRY_RUN = flag("--dry-run");
const PREPARE_ONLY = flag("--prepare-only");
const ARTIFACTS_ONLY = flag("--artifacts-only");
const PUBLISH_ONLY = flag("--publish-only");
const VERSION_ARG = arg("--version");

// ─── HELPERS ──────────────────────────────────────────────────────────────────

const SEMVER_RE = /^\d+\.\d+\.\d+$/;

function log(msg, level = "info") {
  const prefix =
    {
      info: "\x1b[36m→\x1b[0m",
      ok: "\x1b[32m✓\x1b[0m",
      warn: "\x1b[33m⚠\x1b[0m",
      err: "\x1b[31m✗\x1b[0m",
    }[level] || "•";
  console.log(`  ${prefix} ${msg}`);
}

/** Run a shell command string — only used for trusted, fully static commands with no user input. */
function run(cmd, opts = {}) {
  if (DRY_RUN && !opts.always) {
    log(`[dry-run] ${cmd}`, "warn");
    return "";
  }
  try {
    return execSync(cmd, { cwd: ROOT, stdio: opts.silent ? "pipe" : "inherit", encoding: "utf8" });
  } catch (e) {
    if (opts.optional) {
      log(`Optional step failed: ${cmd}`, "warn");
      return "";
    }
    console.error(`\n  \x1b[31m✗ Command failed:\x1b[0m ${cmd}`);
    process.exit(1);
  }
}

/** Safe spawn — user-controlled values must go through this, never interpolated into shell strings. */
function spawn(file, args, opts = {}) {
  if (DRY_RUN && !opts.always) {
    log(`[dry-run] ${file} ${args.join(" ")}`, "warn");
    return;
  }
  const result = spawnSync(file, args, {
    cwd: ROOT,
    stdio: opts.silent ? "pipe" : "inherit",
    encoding: "utf8",
  });
  if (result.status !== 0) {
    if (opts.optional) {
      log(`Optional step failed: ${file} ${args[0]}`, "warn");
      return result;
    }
    console.error(`\n  \x1b[31m✗ Command failed:\x1b[0m ${file} ${args.join(" ")}`);
    process.exit(1);
  }
  return result;
}

function readJson(p) {
  return JSON.parse(readFileSync(join(ROOT, p), "utf8"));
}
function writeJson(p, data) {
  if (DRY_RUN) {
    log(`[dry-run] write ${p}`, "warn");
    return;
  }
  writeFileSync(join(ROOT, p), JSON.stringify(data, null, 2) + "\n");
}

async function sha256File(p) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    createReadStream(p)
      .on("data", (d) => hash.update(d))
      .on("end", () => resolve(hash.digest("hex")))
      .on("error", reject);
  });
}

function zipDir(srcDir, outZip, label) {
  return new Promise((resolve, reject) => {
    if (!existsSync(srcDir)) {
      log(`Skipping ${label} — dist not found`, "warn");
      resolve();
      return;
    }
    const out = createWriteStream(outZip);
    const archive = archiver("zip", { zlib: { level: 9 } });
    out.on("close", () => {
      log(`${label} → ${Math.round(archive.pointer() / 1024)}KB`, "ok");
      resolve();
    });
    archive.on("error", reject);
    archive.pipe(out);
    archive.directory(srcDir, false);
    archive.finalize();
  });
}

// ─── STEPS ────────────────────────────────────────────────────────────────────

function getVersion() {
  if (VERSION_ARG) return VERSION_ARG;
  const pkg = readJson("package.json");
  return pkg.version;
}

function assertCleanGit() {
  const status = execSync("git status --porcelain", { cwd: ROOT, encoding: "utf8" });
  if (status.trim() && !DRY_RUN) {
    console.error("\n  \x1b[31m✗ Uncommitted changes detected. Stash or commit first.\x1b[0m\n");
    console.error(status);
    process.exit(1);
  }
  log("Working tree clean", "ok");
}

function runGate() {
  log("Running lint…");
  run("pnpm run lint");
  log("Running format check…");
  run("pnpm run format:check");
  log("Running tests…");
  run("pnpm run test:quick");
  log("Gate passed", "ok");
}

function bumpVersion(version) {
  log(`Bumping version to ${version}…`);
  const appDirs = [
    "apps/patient-portal",
    "apps/clinician-portal",
    "apps/admin-console",
    "apps/operations-dashboard",
  ];
  const rootPkg = readJson("package.json");
  rootPkg.version = version;
  writeJson("package.json", rootPkg);
  for (const dir of appDirs) {
    const pkgPath = `${dir}/package.json`;
    if (existsSync(join(ROOT, pkgPath))) {
      const pkg = readJson(pkgPath);
      pkg.version = version;
      writeJson(pkgPath, pkg);
    }
  }
  log(`Version bumped to ${version}`, "ok");
}

function updateChangelog(version) {
  log("Updating CHANGELOG.md…");
  const changelogPath = join(ROOT, "CHANGELOG.md");
  const relNotesPath = join(ROOT, `docs/releases/v${version}.md`);
  const today = new Date().toISOString().split("T")[0];

  let releaseBody = "";
  if (existsSync(relNotesPath)) {
    const raw = readFileSync(relNotesPath, "utf8");
    releaseBody = raw
      .replace(/^#.*\n/, "")
      .replace(/^Status:.*\n/gm, "")
      .trim();
  } else {
    const commits = execSync(
      `git log --oneline $(git describe --tags --abbrev=0 2>/dev/null || git rev-list --max-parents=0 HEAD)..HEAD`,
      { cwd: ROOT, encoding: "utf8", stdio: "pipe" }
    ).trim();
    releaseBody = commits
      ? `### Changed\n${commits
          .split("\n")
          .map((l) => `- ${l}`)
          .join("\n")}`
      : "### Changed\n- See git log for details";
  }

  const newEntry = `## [v${version}] — ${today}\n\n${releaseBody}\n`;
  const existing = readFileSync(changelogPath, "utf8");
  const insertAt = existing.indexOf("\n## [");
  const updated =
    insertAt >= 0
      ? existing.slice(0, insertAt + 1) + newEntry + "\n" + existing.slice(insertAt + 1)
      : existing.replace("## [Unreleased]", `## [Unreleased]\n\n${newEntry}`);

  // Update comparison links at bottom
  const withLinks = updated.replace(
    /\[Unreleased\]: https:\/\/.*compare\/.*\.\.\.HEAD/,
    `[Unreleased]: https://github.com/Life-Experimentalist/PulseWard-HMS/compare/v${version}...HEAD`
  );

  if (!DRY_RUN) writeFileSync(changelogPath, withLinks);
  log("CHANGELOG.md updated", "ok");
}

async function buildArtifacts(version) {
  log("Building frontend apps…");
  run("pnpm run build:apps");

  const relDir = join(ROOT, "releases", `v${version}`);
  if (!DRY_RUN) mkdirSync(relDir, { recursive: true });
  log(`Artifacts directory: releases/v${version}/`, "ok");

  const apps = [
    { name: "patient-portal", dir: "apps/patient-portal/dist" },
    { name: "clinician-portal", dir: "apps/clinician-portal/dist" },
    { name: "admin-console", dir: "apps/admin-console/dist" },
    { name: "ops-dashboard", dir: "apps/operations-dashboard/dist" },
  ];

  log("Zipping frontend dists…");
  if (!DRY_RUN) {
    for (const app of apps) {
      await zipDir(join(ROOT, app.dir), join(relDir, `${app.name}.zip`), app.name);
    }
  }

  log("Creating source archive…");
  const EXCLUDE = ["node_modules", ".git", "releases", "coverage", ".pnpm-store"];
  if (!DRY_RUN) {
    await new Promise((resolve, reject) => {
      const out = createWriteStream(join(relDir, `pulseward-hms-v${version}-src.zip`));
      const archive = archiver("zip", { zlib: { level: 6 } });
      out.on("close", () => {
        log(`source archive → ${Math.round((archive.pointer() / 1024 / 1024) * 10) / 10}MB`, "ok");
        resolve();
      });
      archive.on("error", reject);
      archive.pipe(out);
      archive.glob("**/*", {
        cwd: ROOT,
        ignore: EXCLUDE.map((e) => `${e}/**`)
          .concat(EXCLUDE)
          .concat(["releases/**/*.zip", "releases/**/*.tar", "*.db", "*.db-shm", "*.db-wal"]),
        dot: true,
      });
      archive.finalize();
    });
  }

  log("Building Docker image…");
  const dockerTag = `pulseward-hms:v${version}`;
  const tarPath = join(relDir, `api-gateway-v${version}.tar`);
  // Use spawn so version string is passed as an argument, not interpolated into a shell command
  const dockerBuild = spawn(
    "docker",
    ["build", "-f", "services/api-gateway/Dockerfile", "-t", dockerTag, "."],
    { optional: true }
  );
  if (dockerBuild && dockerBuild.status === 0) {
    spawn("docker", ["save", dockerTag, "-o", tarPath], { optional: true });
  } else if (DRY_RUN) {
    log("[dry-run] docker build + save skipped", "warn");
  }

  log("Computing checksums…");
  if (!DRY_RUN) {
    const files = [
      ...apps.map((a) => `${a.name}.zip`),
      `pulseward-hms-v${version}-src.zip`,
      `api-gateway-v${version}.tar`,
    ]
      .map((f) => join(relDir, f))
      .filter(existsSync);

    const lines = await Promise.all(
      files.map(async (f) => {
        const hash = await sha256File(f);
        return `${hash}  ${f.split(/[\\/]/).slice(-1)[0]}`;
      })
    );
    writeFileSync(join(relDir, "checksums.sha256"), lines.join("\n") + "\n");
    log("checksums.sha256 written", "ok");
  }

  log("Copying release notes…");
  const relNotesPath = join(ROOT, `docs/releases/v${version}.md`);
  if (!DRY_RUN) {
    if (existsSync(relNotesPath)) {
      writeFileSync(join(relDir, "RELEASE-NOTES.md"), readFileSync(relNotesPath));
    } else {
      writeFileSync(
        join(relDir, "RELEASE-NOTES.md"),
        `# PulseWard HMS v${version}\n\nSee CHANGELOG.md for details.\n`
      );
    }
  }
  log("Artifacts complete", "ok");
}

function gitCommitAndTag(version) {
  log("Staging release files…");
  // Safe: version validated as /^\d+\.\d+\.\d+$/ — only digits and dots
  const filesToStage = [
    "package.json",
    "CHANGELOG.md",
    `releases/v${version}/RELEASE-NOTES.md`,
    `releases/v${version}/checksums.sha256`,
    "apps/patient-portal/package.json",
    "apps/clinician-portal/package.json",
    "apps/admin-console/package.json",
    "apps/operations-dashboard/package.json",
  ].filter((f) => existsSync(join(ROOT, f)));
  spawn("git", ["add", ...filesToStage]);

  log(`Committing v${version}…`);
  // spawn so the commit message is passed as a separate argument, not interpolated into shell
  spawn("git", ["commit", "-m", `chore(release): v${version}`]);

  log(`Tagging v${version}…`);
  const relNotesPath = join(ROOT, `docs/releases/v${version}.md`);
  const tagMsg = existsSync(relNotesPath)
    ? readFileSync(relNotesPath, "utf8").split("\n").slice(0, 15).join("\n")
    : `Release v${version}`;
  // spawn so tag name and message body are separate args — no shell interpolation
  spawn("git", ["tag", "-a", `v${version}`, "-m", tagMsg]);

  log("Pushing to origin…");
  run("git push");
  spawn("git", ["push", "origin", `v${version}`]);
  log(`v${version} tagged and pushed`, "ok");
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n\x1b[1m\x1b[36m  PulseWard HMS Release\x1b[0m\n");

  if (PUBLISH_ONLY) {
    const version = getVersion();
    console.log(`  Publishing current version: \x1b[1m${version}\x1b[0m\n`);
    gitCommitAndTag(version);
    console.log(`\n  \x1b[32m✓ v${version} released\x1b[0m\n`);
    return;
  }

  if (ARTIFACTS_ONLY) {
    const version = getVersion();
    console.log(`  Building artifacts for: \x1b[1m${version}\x1b[0m\n`);
    await buildArtifacts(version);
    console.log(`\n  \x1b[32m✓ Artifacts ready in releases/v${version}/\x1b[0m\n`);
    return;
  }

  if (!VERSION_ARG) {
    console.error(
      "  \x1b[31m✗ --version required. Example: pnpm run release -- --version 1.4.0\x1b[0m\n"
    );
    process.exit(1);
  }

  if (!SEMVER_RE.test(VERSION_ARG)) {
    console.error(
      `  \x1b[31m✗ Invalid version format: "${VERSION_ARG}". Must be X.Y.Z (semver)\x1b[0m\n`
    );
    process.exit(1);
  }

  const version = VERSION_ARG;
  console.log(
    `  Target version: \x1b[1m${version}\x1b[0m${DRY_RUN ? "  \x1b[33m(dry run)\x1b[0m" : ""}\n`
  );

  // Step 1: Gate
  console.log("  \x1b[1mStep 1/5 — Pre-flight checks\x1b[0m");
  if (!PREPARE_ONLY) assertCleanGit();
  runGate();

  // Step 2: Bump + Changelog
  console.log("\n  \x1b[1mStep 2/5 — Version bump & CHANGELOG\x1b[0m");
  bumpVersion(version);
  updateChangelog(version);

  if (PREPARE_ONLY) {
    console.log(`\n  \x1b[32m✓ Prepared v${version} (no artifacts built, no git changes)\x1b[0m\n`);
    return;
  }

  // Step 3: Build artifacts
  console.log("\n  \x1b[1mStep 3/5 — Build & package artifacts\x1b[0m");
  await buildArtifacts(version);

  // Step 4: Commit + Tag + Push
  console.log("\n  \x1b[1mStep 4/5 — Git commit, tag & push\x1b[0m");
  gitCommitAndTag(version);

  console.log(
    `\n  \x1b[32m✓ v${version} released — CI will now push to GHCR and attach artifacts to GitHub Releases\x1b[0m\n`
  );
}

main().catch((e) => {
  console.error("\n  \x1b[31m✗\x1b[0m", e.message);
  process.exit(1);
});
