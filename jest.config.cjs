module.exports = {
  testEnvironment: "node",
  testMatch: ["**/tests/**/*.test.js"],
  collectCoverageFrom: [
    "services/**/*.js",
    "packages/shared-utils/**/*.js",
    "scripts/**/*.mjs",
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
