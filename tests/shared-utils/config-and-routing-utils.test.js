const {
  resolveMessagingProvider,
  resolveCalendarProvider,
} = require("../../packages/shared-utils/integration-routing");
const {
  loadTenantIntegrationConfig,
} = require("../../packages/shared-utils/load-tenant-integration-config");
const {
  loadDomainConfig,
  resolveTenantDomain,
  isOriginAllowed,
} = require("../../packages/shared-utils/load-domain-config");
const { resolveSecretRef } = require("../../packages/shared-utils/resolve-secret-ref");

describe("shared-utils routing and config", () => {
  afterEach(() => {
    delete process.env.TEST_SECRET_JSON;
    delete process.env.TEST_SECRET_RAW;
  });

  test("loads tenant integration config with fallback to default", () => {
    const defaultConfig = loadTenantIntegrationConfig("default");
    const citycareConfig = loadTenantIntegrationConfig("citycare-hospital");
    const unknownConfig = loadTenantIntegrationConfig("tenant-does-not-exist");

    expect(defaultConfig.tenantKey).toBe("default");
    expect(citycareConfig.tenantKey).toBe("citycare-hospital");
    expect(unknownConfig.tenantKey).toBe("default");
  });

  test("loads and resolves domain config with tenant fallback and origin checks", () => {
    const config = loadDomainConfig();
    expect(config.platform).toBeTruthy();
    expect(Array.isArray(config.tenants)).toBe(true);

    const citycare = resolveTenantDomain("citycare-hospital");
    const fallback = resolveTenantDomain("unknown-tenant");

    expect(citycare.tenant.tenantKey).toBe("citycare-hospital");
    expect(fallback.tenant.tenantKey).toBe("default");
    expect(isOriginAllowed("citycare-hospital", "https://citycare.example.com")).toBe(true);
    expect(isOriginAllowed("citycare-hospital", "https://not-allowed.example.com")).toBe(false);
  });

  test("resolves secret refs for missing, JSON, and raw payload values", () => {
    expect(resolveSecretRef(null)).toBeNull();
    expect(resolveSecretRef({ secretKey: "TEST_SECRET_JSON" })).toBeNull();

    process.env.TEST_SECRET_JSON = JSON.stringify({ token: "abc-123" });
    expect(resolveSecretRef({ secretKey: "TEST_SECRET_JSON" })).toEqual({ token: "abc-123" });

    process.env.TEST_SECRET_RAW = "plain-token";
    expect(resolveSecretRef({ secretKey: "TEST_SECRET_RAW" })).toEqual({ raw: "plain-token" });
  });

  test("resolves messaging providers across preferred, default, fallback, and error paths", () => {
    const baseConfig = loadTenantIntegrationConfig("default");

    expect(resolveMessagingProvider(baseConfig, "patient-notification", "telegram-bot")).toBe(
      "telegram-bot"
    );
    expect(resolveMessagingProvider(baseConfig, "patient-notification")).toBe("telegram-bot");

    const fallbackConfig = JSON.parse(JSON.stringify(baseConfig));
    fallbackConfig.messagingProviders = fallbackConfig.messagingProviders.map((provider) =>
      provider.key === "telegram-bot" ? { ...provider, enabled: false } : provider
    );
    expect(resolveMessagingProvider(fallbackConfig, "patient-notification")).toBe("email-smtp");

    expect(() => resolveMessagingProvider(baseConfig, "unknown-channel")).toThrow(
      "Messaging route not configured"
    );

    const noEnabledConfig = JSON.parse(JSON.stringify(baseConfig));
    noEnabledConfig.messagingProviders = noEnabledConfig.messagingProviders.map((provider) => ({
      ...provider,
      enabled: false,
    }));
    expect(() => resolveMessagingProvider(noEnabledConfig, "patient-notification")).toThrow(
      "No enabled messaging provider available"
    );
  });

  test("resolves calendar providers across preferred, default, fallback, and error paths", () => {
    const baseConfig = loadTenantIntegrationConfig("default");

    expect(resolveCalendarProvider(baseConfig, "ics-calendar")).toBe("ics-calendar");
    expect(resolveCalendarProvider(baseConfig)).toBe("google-calendar");

    const fallbackConfig = JSON.parse(JSON.stringify(baseConfig));
    fallbackConfig.calendarProviders = fallbackConfig.calendarProviders.map((provider) =>
      provider.key === "google-calendar" ? { ...provider, enabled: false } : provider
    );
    expect(resolveCalendarProvider(fallbackConfig)).toBe("apple-calendar");

    const noEnabledConfig = JSON.parse(JSON.stringify(baseConfig));
    noEnabledConfig.calendarProviders = noEnabledConfig.calendarProviders.map((provider) => ({
      ...provider,
      enabled: false,
    }));
    expect(() => resolveCalendarProvider(noEnabledConfig)).toThrow(
      "No enabled calendar provider available"
    );
  });
});
