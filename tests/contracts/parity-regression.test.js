const { spawnSync } = require("child_process");
const path = require("path");

describe("M1 parity regression guard", () => {
  test("strict contract parity check passes", () => {
    const scriptPath = path.resolve(__dirname, "../../scripts/check-contract-coverage.mjs");
    const result = spawnSync("node", [scriptPath, "--strict"], {
      cwd: path.resolve(__dirname, "../.."),
      encoding: "utf8",
    });

    const combinedOutput = `${result.stdout || ""}\n${result.stderr || ""}`;

    expect(result.status).toBe(0);
    expect(combinedOutput).toContain("Mode: strict");
    expect(combinedOutput).toContain(
      "Schema check passed: critical request/response schema coverage is present."
    );
    expect(combinedOutput).toContain(
      "Contract check passed: presence, parity, and schema checks are within baseline."
    );
  });

  test("previously drifted services remain parity clean", () => {
    const scriptPath = path.resolve(__dirname, "../../scripts/check-contract-coverage.mjs");
    const result = spawnSync("node", [scriptPath, "--strict"], {
      cwd: path.resolve(__dirname, "../.."),
      encoding: "utf8",
    });

    const output = `${result.stdout || ""}\n${result.stderr || ""}`;

    expect(output).toContain("- api-gateway");
    expect(output).toContain("- ehr-service");
    expect(output).toContain("- lab-service");
    expect(output).toContain("- billing-service");

    expect(output).toContain("runtime-only (0): none");
    expect(output).toContain("spec-only (0): none");
  });

  test("critical endpoint schema checks stay covered", () => {
    const scriptPath = path.resolve(__dirname, "../../scripts/check-contract-coverage.mjs");
    const result = spawnSync("node", [scriptPath, "--strict"], {
      cwd: path.resolve(__dirname, "../.."),
      encoding: "utf8",
    });

    const output = `${result.stdout || ""}\n${result.stderr || ""}`;

    expect(output).toContain("Critical endpoint schema checks:");
    expect(output).toContain("PASS: auth-service POST /auth/login");
    expect(output).toContain("PASS: auth-service POST /auth/otp/request");
    expect(output).toContain("PASS: auth-service POST /auth/otp/verify");
    expect(output).toContain("PASS: auth-service GET /auth/session/events");
    expect(output).toContain("PASS: auth-service POST /auth/workflow-entry/check");
    expect(output).toContain("PASS: auth-service GET /auth/oauth/google/start");
    expect(output).toContain("PASS: auth-service POST /auth/oauth/google/callback");
    expect(output).toContain("PASS: auth-service GET /auth/oauth/clerk/start");
    expect(output).toContain("PASS: appointment-service POST /appointments");
    expect(output).toContain("PASS: appointment-service PUT /appointments/{id}");
    expect(output).toContain("PASS: appointment-service POST /opd/entries");
    expect(output).toContain("PASS: notification-service POST /integrations/messaging/test");
    expect(output).toContain("PASS: auth-service POST /admin/settings/auth-policy/validate");
    expect(output).toContain("PASS: auth-service PUT /admin/settings");
  });
});
