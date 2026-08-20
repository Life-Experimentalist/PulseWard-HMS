import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

// Vuln 2 — a weak or placeholder JWT signing key must abort startup in
// production. app.js resolves the secret at module-evaluation time, calling
// process.exit(1) when the key is insecure and NODE_ENV=production. We verify
// that by importing app.js in a clean child process with a controlled env.

const appUrl = new URL("../../services/api-gateway/app.js", import.meta.url).href;

// Dynamically import the app; print a marker if evaluation completes. If the
// secret guard fires, process.exit(1) runs before the marker is printed.
const BOOT =
  "import(process.env.APP_URL).then(()=>{console.log('BOOT_OK')},e=>{console.error('IMPORT_ERR',e&&e.message);process.exit(3)})";

function boot({ nodeEnv, secret }) {
  const env = {
    ...process.env,
    NODE_ENV: nodeEnv,
    APP_URL: appUrl,
    // Point the (lazy, unused) DB at a throwaway path so nothing touches the repo.
    DB_PATH: join(tmpdir(), `pw-jwtboot-${randomBytes(6).toString("hex")}.db`),
  };
  if (secret === undefined) delete env.JWT_SECRET;
  else env.JWT_SECRET = secret;
  try {
    const stdout = execFileSync(process.execPath, ["--input-type=module", "-e", BOOT], {
      env,
      // A directory with no .env so app.js's loadEnvFile() is a harmless no-op.
      cwd: tmpdir(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, stdout, stderr: "" };
  } catch (e) {
    return {
      code: e.status ?? 1,
      stdout: (e.stdout || "").toString(),
      stderr: (e.stderr || "").toString(),
    };
  }
}

describe("production JWT secret guard", () => {
  test("a known placeholder secret aborts startup with a fatal error", () => {
    const r = boot({ nodeEnv: "production", secret: "change_me_jwt_secret_min_32_chars_random" });
    expect(r.code).toBe(1);
    expect(r.stdout).not.toContain("BOOT_OK");
    expect(r.stderr).toMatch(/FATAL/i);
    expect(r.stderr).toMatch(/JWT_SECRET/);
  });

  test("a too-short secret aborts startup", () => {
    const r = boot({ nodeEnv: "production", secret: "short-secret" });
    expect(r.code).toBe(1);
    expect(r.stdout).not.toContain("BOOT_OK");
  });

  test("a missing secret aborts startup", () => {
    const r = boot({ nodeEnv: "production", secret: undefined });
    expect(r.code).toBe(1);
    expect(r.stdout).not.toContain("BOOT_OK");
  });

  test("a strong 64-hex secret boots cleanly in production", () => {
    const strong = randomBytes(32).toString("hex"); // 64 chars
    const r = boot({ nodeEnv: "production", secret: strong });
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("BOOT_OK");
  });
});
