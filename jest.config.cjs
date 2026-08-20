module.exports = {
  testEnvironment: "node",
  testMatch: ["**/tests/**/*.test.mjs"],
  // Each suite seeds its own SQLite DB, and seeding hashes the demo accounts
  // with bcrypt (cost 10). Serialized under --runInBand, that real crypto work
  // in beforeAll hooks can exceed Jest's 5s default on a loaded machine, so we
  // give hooks and tests generous headroom.
  testTimeout: 30000,
  // Under ESM, jest-resolve@30 mishandles `node:sqlite` (Node 22.5+, imported
  // by db.js): it strips the `node:` prefix and then can't re-identify bare
  // `sqlite` as a builtin, so it tries to load it as a missing npm file.
  // Mapping `node:sqlite` here routes it to a shim; the mapping also makes
  // jest treat the specifier as a normal module (not core), which is what
  // forces the resolver down this path. The shim pulls the real builtin via
  // process.getBuiltinModule — a direct binding jest can't intercept, so the
  // mapping doesn't recurse.
  moduleNameMapper: {
    "^node:sqlite$": "<rootDir>/tests/support/sqlite-shim.cjs",
  },
  collectCoverageFrom: [
    "services/api-gateway/app.js",
    "services/api-gateway/db.js",
    "!**/node_modules/**",
    "!**/coverage/**",
    "!**/dist/**",
    "!**/build/**",
    "!**/tests/**",
  ],
  coverageDirectory: "coverage",
  coverageReporters: ["text", "text-summary", "json-summary", "lcov"],
  coverageThreshold: {
    global: {
      statements: 60,
      branches: 55,
      functions: 60,
      lines: 60,
    },
  },
};
