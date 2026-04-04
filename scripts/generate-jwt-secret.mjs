import { randomBytes } from "node:crypto";

function parseArgs(argv) {
  const result = {
    bytes: 48,
    format: "base64url",
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
  console.log("");
  console.log("Defaults:");
  console.log("  --bytes 48");
  console.log("  --format base64url");
}

try {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  const buffer = randomBytes(args.bytes);
  const secret = args.format === "hex" ? buffer.toString("hex") : buffer.toString("base64url");

  process.stdout.write(`${secret}\n`);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
