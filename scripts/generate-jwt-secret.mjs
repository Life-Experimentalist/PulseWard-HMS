import { randomBytes } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

function parseArgs(argv) {
  const result = {
    bytes: 48,
    format: "base64url",
    apply: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--bytes") {
      const next = Number.parseInt(argv[index + 1], 10);
      if (!Number.isInteger(next) || next < 32 || next > 128) {
        throw new Error("--bytes must be an integer between 32 and 128.");
      }
      result.bytes = next;
      index += 1;
      continue;
    }

    if (arg === "--format") {
      const next = String(argv[index + 1] || "").toLowerCase();
      if (next !== "base64url" && next !== "hex") {
        throw new Error('--format must be either "base64url" or "hex".');
      }
      result.format = next;
      index += 1;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      result.help = true;
      continue;
    }

    if (arg === "--apply") {
      result.apply = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return result;
}

function printHelp() {
  console.log("Generate a secure JWT secret for PulseWard.");
  console.log("");
  console.log("Usage:");
  console.log("  pnpm run jwt:generate");
  console.log("  pnpm run jwt:generate -- --bytes 64 --format hex");
  console.log("  pnpm run jwt:generate -- --apply");
  console.log("");
  console.log("Defaults:");
  console.log("  --bytes 48");
  console.log("  --format base64url");
  console.log("  --apply false (interactive prompt in terminal)");
}

function updateEnvKey(filePath, key, value) {
  const line = `${key}=${value}`;

  if (!existsSync(filePath)) {
    writeFileSync(filePath, `${line}\n`, "utf8");
    return;
  }

  const content = readFileSync(filePath, "utf8");
  const pattern = new RegExp(`^${key}=.*$`, "m");
  if (pattern.test(content)) {
    writeFileSync(filePath, content.replace(pattern, line), "utf8");
    return;
  }

  const suffix = content.endsWith("\n") ? "" : "\n";
  writeFileSync(filePath, `${content}${suffix}${line}\n`, "utf8");
}

async function shouldApplyToEnv(args) {
  if (args.apply) {
    return true;
  }

  if (!input.isTTY) {
    return false;
  }

  const rl = createInterface({ input, output });
  try {
    const answer = await rl.question("Replace JWT_SECRET in .env now? [y/N]: ");
    const normalized = String(answer || "").trim().toLowerCase();
    return normalized === "y" || normalized === "yes";
  } finally {
    rl.close();
  }
}

try {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  const buffer = randomBytes(args.bytes);
  const secret = args.format === "hex" ? buffer.toString("hex") : buffer.toString("base64url");

  console.log("Generated JWT secret:");
  console.log(secret);

  const apply = await shouldApplyToEnv(args);
  if (apply) {
    const envPath = path.join(process.cwd(), ".env");
    updateEnvKey(envPath, "JWT_SECRET", secret);
    console.log("Updated JWT_SECRET in .env");
  } else {
    console.log("Skipped .env update");
  }

} catch (error) {
  console.error(error.message);
  process.exit(1);
}
