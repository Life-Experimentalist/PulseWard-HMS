const express = require("express");

const appointmentRoutes = require("../../services/appointment-service/routes");

describe("appointment calendar interoperability diagnostics", () => {
  let server;
  let baseUrl;

  async function requestJson(relativePath, options) {
    const response = await fetch(`${baseUrl}${relativePath}`, options);
    const body = await response.json().catch(() => ({}));
    return { status: response.status, body };
  }

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/v1", appointmentRoutes);

    server = await new Promise((resolve) => {
      const next = app.listen(0, () => resolve(next));
    });

    const address = server.address();
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  test("returns calendar routing diagnostics for default tenant", async () => {
    const diagnostics = await requestJson(
      "/api/v1/integrations/calendars/interoperability/diagnostics?tenantKey=default",
      {
        method: "GET",
      }
    );

    expect(diagnostics.status).toBe(200);
    expect(diagnostics.body.tenantKey).toBe("default");
    expect(diagnostics.body.routing.defaultProvider).toBe("google-calendar");
    expect(Array.isArray(diagnostics.body.routing.routingOrder)).toBe(true);
    expect(diagnostics.body.routing.routingOrder.length).toBeGreaterThan(0);
    expect(Array.isArray(diagnostics.body.routing.unresolvedRoutingProviders)).toBe(true);
    expect(diagnostics.body.routing.unresolvedRoutingProviders.length).toBe(0);

    expect(Array.isArray(diagnostics.body.providers.configured)).toBe(true);
    expect(diagnostics.body.providers.configured.length).toBeGreaterThan(0);
    expect(Array.isArray(diagnostics.body.providers.enabled)).toBe(true);
    expect(diagnostics.body.providers.enabled.length).toBeGreaterThan(1);

    expect(diagnostics.body.interoperability.status).toBe("healthy");
    expect(diagnostics.body.interoperability.defaultProviderReady).toBe(true);
    expect(diagnostics.body.interoperability.fallbackCoverageCount).toBeGreaterThanOrEqual(1);
    expect(diagnostics.body.interoperability.crossProviderHandoffReady).toBe(true);
    expect(diagnostics.body.interoperability.supportsIcsBridge).toBe(true);
    expect(diagnostics.body.interoperability.supportsEnterpriseCalendars).toBe(true);
  });

  test("returns tenant-specific diagnostics for configured hospital tenant", async () => {
    const diagnostics = await requestJson(
      "/api/v1/integrations/calendars/interoperability/diagnostics?tenantKey=citycare-hospital",
      {
        method: "GET",
      }
    );

    expect(diagnostics.status).toBe(200);
    expect(diagnostics.body.tenantKey).toBe("citycare-hospital");
    expect(diagnostics.body.routing.defaultProvider).toBe("google-calendar");
    expect(diagnostics.body.interoperability.status).toBe("healthy");
    expect(
      diagnostics.body.providers.disabled.some((item) => item.key === "outlook-calendar")
    ).toBe(true);
  });
});
