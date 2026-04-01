const fs = require("fs");
const path = require("path");

function resolveTenantConfigPath(tenantKey) {
  const fileName =
    tenantKey === "default" ? "default-integration-config.json" : `${tenantKey}.integration.json`;
  return path.resolve(__dirname, "../../config/integrations", fileName);
}

function loadTenantIntegrationConfig(tenantKey = "default") {
  const tenantPath = resolveTenantConfigPath(tenantKey);

  if (fs.existsSync(tenantPath)) {
    return JSON.parse(fs.readFileSync(tenantPath, "utf8"));
  }

  const defaultPath = resolveTenantConfigPath("default");
  return JSON.parse(fs.readFileSync(defaultPath, "utf8"));
}

module.exports = {
  loadTenantIntegrationConfig,
};
