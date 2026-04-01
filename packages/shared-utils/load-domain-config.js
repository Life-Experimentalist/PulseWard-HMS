const fs = require("fs");
const path = require("path");

const configPath = path.resolve(__dirname, "../../config/domains/default-domain-config.json");

function loadDomainConfig() {
  return JSON.parse(fs.readFileSync(configPath, "utf8"));
}

function resolveTenantDomain(tenantKey) {
  const config = loadDomainConfig();
  const tenant =
    config.tenants.find((item) => item.tenantKey === tenantKey) ||
    config.tenants.find((item) => item.tenantKey === "default");

  return {
    platform: config.platform,
    tenant,
  };
}

function isOriginAllowed(tenantKey, origin) {
  const resolved = resolveTenantDomain(tenantKey);
  return (resolved.tenant.allowedOrigins || []).includes(origin);
}

module.exports = {
  loadDomainConfig,
  resolveTenantDomain,
  isOriginAllowed,
};
