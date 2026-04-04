const userAgent = process.env.npm_config_user_agent || "";

if (!userAgent.includes("pnpm")) {
  console.error("This repository is pnpm-only.");
  console.error("Run these commands and retry:");
  console.error("  corepack enable");
  console.error("  corepack prepare pnpm@9.15.0 --activate");
  console.error("  pnpm install --frozen-lockfile");
  process.exit(1);
}
