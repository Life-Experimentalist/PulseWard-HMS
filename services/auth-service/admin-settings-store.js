var fs = require("fs");
var path = require("path");

var defaultStorePath = path.join(__dirname, "data", "admin-console-settings.json");

function resolveStorePath() {
  var overridePath = process.env.AUTH_ADMIN_SETTINGS_STORE_PATH;
  if (!overridePath || !String(overridePath).trim()) {
    return defaultStorePath;
  }

  var normalized = String(overridePath).trim();
  return path.isAbsolute(normalized)
    ? normalized
    : path.resolve(process.cwd(), normalized);
}

function ensureStore() {
  var storePath = resolveStorePath();
  var dir = path.dirname(storePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (!fs.existsSync(storePath)) {
    fs.writeFileSync(
      storePath,
      JSON.stringify(
        {
          tenants: {},
          updatedAt: null,
        },
        null,
        2
      ),
      "utf8"
    );
  }
}

function readStore() {
  var storePath = resolveStorePath();
  ensureStore();
  try {
    var raw = fs.readFileSync(storePath, "utf8");
    var parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return { tenants: {}, updatedAt: null };
    }

    if (!parsed.tenants || typeof parsed.tenants !== "object") {
      parsed.tenants = {};
    }

    return parsed;
  } catch (_error) {
    return { tenants: {}, updatedAt: null };
  }
}

function writeStore(store) {
  var storePath = resolveStorePath();
  ensureStore();
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2), "utf8");
}

function getTenantSettings(tenantKey) {
  var store = readStore();
  return store.tenants[tenantKey] || null;
}

function setTenantSettings(tenantKey, settings) {
  var store = readStore();
  var now = new Date().toISOString();

  store.tenants[tenantKey] = {
    settings: settings,
    updatedAt: now,
  };
  store.updatedAt = now;

  writeStore(store);

  return {
    tenantKey: tenantKey,
    settings: settings,
    updatedAt: now,
  };
}

function getStorageMetadata() {
  var store = readStore();
  return {
    source: "auth-service-json-store",
    path: resolveStorePath(),
    tenantCount: Object.keys(store.tenants || {}).length,
    updatedAt: store.updatedAt,
  };
}

module.exports = {
  getTenantSettings: getTenantSettings,
  setTenantSettings: setTenantSettings,
  getStorageMetadata: getStorageMetadata,
};
