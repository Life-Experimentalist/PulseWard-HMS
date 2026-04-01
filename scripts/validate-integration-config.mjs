import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  MESSAGING_PROVIDER_KEYS,
  CALENDAR_PROVIDER_KEYS,
  DELIVERY_CHANNELS,
} = require("../packages/shared-types/integrations");

const root = process.cwd();
const integrationsDir = path.join(root, "config", "integrations");

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function validateConfigObject(name, config) {
  const requiredTopLevel = [
    "tenantKey",
    "messagingProviders",
    "calendarProviders",
    "messagingRouting",
    "calendarRouting",
  ];

  for (const key of requiredTopLevel) {
    if (!(key in config)) {
      fail(`${name}: missing required key ${key}`);
    }
  }

  if (!isNonEmptyString(config.tenantKey)) {
    fail(`${name}: tenantKey must be a non-empty string`);
  }

  if (!Array.isArray(config.messagingProviders) || config.messagingProviders.length === 0) {
    fail(`${name}: messagingProviders must be a non-empty array`);
  }

  if (!Array.isArray(config.calendarProviders) || config.calendarProviders.length === 0) {
    fail(`${name}: calendarProviders must be a non-empty array`);
  }

  if (!Array.isArray(config.messagingRouting) || config.messagingRouting.length === 0) {
    fail(`${name}: messagingRouting must be a non-empty array`);
  }

  if (!config.calendarRouting || !isNonEmptyString(config.calendarRouting.defaultProvider)) {
    fail(`${name}: calendarRouting.defaultProvider is required`);
  }

  const messagingKeys = new Set(config.messagingProviders.map((item) => item.key));
  const calendarKeys = new Set(config.calendarProviders.map((item) => item.key));

  for (const provider of config.messagingProviders) {
    if (!MESSAGING_PROVIDER_KEYS.includes(provider.key)) {
      fail(`${name}: unsupported messaging provider key ${provider.key}`);
    }
  }

  for (const provider of config.calendarProviders) {
    if (!CALENDAR_PROVIDER_KEYS.includes(provider.key)) {
      fail(`${name}: unsupported calendar provider key ${provider.key}`);
    }
  }

  for (const route of config.messagingRouting) {
    if (!DELIVERY_CHANNELS.includes(route.channel)) {
      fail(`${name}: unsupported messaging channel ${route.channel}`);
    }

    if (!messagingKeys.has(route.defaultProvider)) {
      fail(`${name}: route defaultProvider not configured ${route.defaultProvider}`);
    }

    for (const fallback of route.fallbackProviders || []) {
      if (!messagingKeys.has(fallback)) {
        fail(`${name}: route fallback provider not configured ${fallback}`);
      }
    }
  }

  if (!calendarKeys.has(config.calendarRouting.defaultProvider)) {
    fail(
      `${name}: calendar defaultProvider not configured ${config.calendarRouting.defaultProvider}`
    );
  }

  for (const fallback of config.calendarRouting.fallbackProviders || []) {
    if (!calendarKeys.has(fallback)) {
      fail(`${name}: calendar fallback provider not configured ${fallback}`);
    }
  }
}

const files = readdirSync(integrationsDir)
  .filter((name) => name.endsWith(".json") && name !== "README.md")
  .map((name) => path.join(integrationsDir, name));

for (const filePath of files) {
  const content = readFileSync(filePath, "utf8");
  const config = JSON.parse(content);
  validateConfigObject(path.basename(filePath), config);
}

if (process.exitCode && process.exitCode !== 0) {
  console.error("Integration configuration validation failed.");
  process.exit(process.exitCode);
}

console.log(`Validated ${files.length} integration config file(s).`);
