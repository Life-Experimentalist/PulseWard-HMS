const {
  loadTenantIntegrationConfig,
} = require("../../packages/shared-utils/load-tenant-integration-config");
const {
  bookAppointmentWithRouting,
} = require("../../services/appointment-service/integrations/book-with-provider-routing");
const {
  sendNotificationWithRouting,
} = require("../../services/notification-service/integrations/send-notification-with-routing");

describe("provider routing wrappers", () => {
  test("books appointment using selected calendar provider route", async () => {
    const tenantConfig = loadTenantIntegrationConfig("default");

    const result = await bookAppointmentWithRouting(
      {
        appointmentId: "apt-routing-1",
        preferredProvider: "ics-calendar",
      },
      tenantConfig
    );

    expect(result.provider).toBe("ics-calendar");
    expect(result.accepted).toBe(true);
    expect(result.externalEventId).toContain("apt-routing-1");
  });

  test("sends notification using configured messaging route", async () => {
    const tenantConfig = loadTenantIntegrationConfig("default");

    const result = await sendNotificationWithRouting(
      {
        channel: "website-hook",
        recipient: "ops@pulseward.example.com",
        message: "Provider routing validation",
      },
      tenantConfig
    );

    expect(result.provider).toBe("generic-webhook");
    expect(result.accepted).toBe(true);
  });

  test("throws when messaging route is not configured", async () => {
    const tenantConfig = loadTenantIntegrationConfig("default");

    await expect(
      sendNotificationWithRouting(
        {
          channel: "missing-channel",
          recipient: "ops@pulseward.example.com",
          message: "should fail",
        },
        tenantConfig
      )
    ).rejects.toThrow("Messaging route not configured");
  });
});
