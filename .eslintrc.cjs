module.exports = {
  root: true,
  env: {
    es2021: true,
    node: true,
  },
  parserOptions: {
    ecmaVersion: 2022,
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
    "no-empty": ["error", { allowEmptyCatch: true }],
  },
  overrides: [
    {
      files: ["tests/**/*.js", "tests/**/*.mjs"],
      env: {
        node: true,
        jest: true,
      },
    },
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
      files: [
        "apps/admin-console/src/**/*.js",
        "apps/admin-console/src/**/*.jsx",
        "apps/clinician-portal/src/**/*.js",
        "apps/clinician-portal/src/**/*.jsx",
        "apps/operations-dashboard/src/**/*.js",
        "apps/operations-dashboard/src/**/*.jsx",
        "apps/patient-portal/src/**/*.js",
        "apps/patient-portal/src/**/*.jsx",
      ],
      env: {
        browser: true,
        node: false,
      },
      parserOptions: {
        ecmaVersion: 12,
        sourceType: "module",
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    {
      files: [
        "apps/admin-console/vite.config.js",
        "apps/clinician-portal/vite.config.js",
        "apps/operations-dashboard/vite.config.js",
        "apps/patient-portal/vite.config.js",
      ],
      env: {
        node: true,
      },
      parserOptions: {
        ecmaVersion: 12,
        sourceType: "module",
      },
    },
    {
      files: ["services/**/*.js", "packages/**/*.js", "scripts/**/*.js", "scripts/**/*.mjs"],
      env: {
        node: true,
      },
      parserOptions: {
        sourceType: "module",
      },
    },
  ],
};
