#!/usr/bin/env node
// pnpm run help  —  prints all available scripts with descriptions

const GROUPS = [
  {
    title: "Development",
    scripts: [
      ["dev", "Start API gateway + all 4 portals with HMR (recommended for local dev)"],
      ["start", "Start only the API gateway on :8787 (production / Docker entry point)"],
    ],
  },
  {
    title: "Build",
    scripts: [
      ["build", "Build all 4 React portals for production (output to apps/*/dist)"],
      ["build:apps:ci", "Same as build but installs each app separately (used in CI)"],
      [
        "build:docs",
        "Build the VitePress documentation site (output to docs/site/.vitepress/dist)",
      ],
    ],
  },
  {
    title: "Test",
    scripts: [
      ["test", "Run all tests with coverage report (Jest, slow)"],
      ["test:quick", "Run all tests without coverage (faster)"],
      ["test:contracts", "Check OpenAPI spec ↔ runtime route parity (strict mode)"],
    ],
  },
  {
    title: "Code Quality",
    scripts: [
      ["lint", "ESLint check on all .js/.mjs files"],
      ["lint:fix", "ESLint check + auto-fix"],
      ["format", "Prettier auto-format (modifies files)"],
      ["format:check", "Prettier check only (no modifications)"],
      ["build:types", "TypeScript type-check without emitting (uses tsconfig.json)"],
    ],
  },
  {
    title: "Verify (CI Gates)",
    scripts: [
      ["quality:check", "Lint + format check + contract parity (strict)"],
      ["contracts:check", "Verify the OpenAPI spec and runtime routes are in full parity"],
      ["verify", "Full quality gate: lint + format:check + test:quick + contracts:check"],
    ],
  },
  {
    title: "Release",
    scripts: [
      [
        "release",
        "Full pipeline: quality gate → bump version → changelog → build → zip → docker → checksums → commit → tag → push",
      ],
      [
        "release:prepare",
        "Steps 1–3 only: quality gate + version bump + changelog update (no build/publish)",
      ],
      [
        "release:artifacts",
        "Steps 4–6 only: build + zip + docker + checksums (requires prepared version)",
      ],
      [
        "release:publish",
        "Step 7 only: git commit + tag + push (triggers CI to push to GHCR + GitHub Releases)",
      ],
    ],
  },
  {
    title: "Utilities",
    scripts: [
      ["jwt:generate", "Generate a secure random JWT_SECRET and print it (copy into .env)"],
      ["env:check", "Check that all required environment variables are present"],
      ["audit", "Run pnpm audit for security vulnerabilities (moderate+)"],
      ["help", "Show this help"],
    ],
  },
];

const COL_W = 26;
const reset = "\x1b[0m";
const bold = "\x1b[1m";
const cyan = "\x1b[36m";
const yellow = "\x1b[33m";
const grey = "\x1b[90m";

console.log(`\n${bold}PulseWard HMS — Available Scripts${reset}\n`);
console.log(`${grey}Run any script with: ${reset}${cyan}pnpm run <name>${reset}\n`);

for (const group of GROUPS) {
  console.log(`${yellow}${bold}${group.title}${reset}`);
  for (const [name, desc] of group.scripts) {
    const pad = " ".repeat(Math.max(1, COL_W - name.length));
    console.log(`  ${cyan}${name}${reset}${pad}${grey}${desc}${reset}`);
  }
  console.log();
}

console.log(
  `${grey}For full docs: docs/site/  or  https://life-experimentalist.github.io/PulseWard-HMS/docs/${reset}\n`
);
