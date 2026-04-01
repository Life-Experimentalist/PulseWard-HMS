module.exports = {
  root: true,
  env: {
    es2021: true,
    node: true,
  },
  parserOptions: {
    ecmaVersion: 12,
    sourceType: "script",
  },
  extends: ["eslint:recommended"],
  ignorePatterns: ["node_modules/", "dist/", "build/", "coverage/", "*.min.js"],
  rules: {
    "no-console": "off",
    "no-unused-vars": [
      "warn",
      {
        argsIgnorePattern: "^_",
      },
    ],
    "no-prototype-builtins": "off",
  },
  overrides: [
    {
      files: ["**/*.mjs"],
      parserOptions: {
        sourceType: "module",
      },
    },
    {
      files: ["apps/landing-page/**/*.js"],
      env: {
        browser: true,
        node: false,
      },
    },
    {
      files: ["services/**/*.js", "packages/**/*.js", "scripts/**/*.js", "scripts/**/*.mjs"],
      env: {
        node: true,
      },
    },
  ],
};
