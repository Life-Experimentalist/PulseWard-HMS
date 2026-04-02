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
      "Contract check passed: presence and parity checks are within baseline."
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
});
