import { createRequire } from "node:module";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);

const config = require("../config/integrations/default-integration-config.json");
const {
  resolveMessagingProvider,
  resolveCalendarProvider,
} = require("../packages/shared-utils/integration-routing");
const {
  sendNotificationWithRouting,
} = require("../services/notification-service/integrations/send-notification-with-routing");
const {
  bookAppointmentWithRouting,
} = require("../services/appointment-service/integrations/book-with-provider-routing");
const {
  resolveTenantDomain,
  isOriginAllowed,
} = require("../packages/shared-utils/load-domain-config");

async function run() {
  const messagingProvider = resolveMessagingProvider(config, "patient-notification");
  const calendarProvider = resolveCalendarProvider(config);

  assert.ok(messagingProvider, "Messaging provider should resolve");
  assert.ok(calendarProvider, "Calendar provider should resolve");

  const messageResult = await sendNotificationWithRouting(
    {
      tenantKey: "default",
      channel: "patient-notification",
      recipient: "demo@example.com",
      message: "Smoke test notification",
      dryRun: true,
    },
    config
  );

  assert.equal(messageResult.accepted, true, "Message delivery should be accepted in dry-run");

  const bookingResult = await bookAppointmentWithRouting(
    {
      tenantKey: "default",
      appointmentId: "apt-smoke-1",
      clinicianId: "doc-1",
      patientId: "pat-1",
      startTime: new Date().toISOString(),
      endTime: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    },
    config
  );

  assert.equal(bookingResult.accepted, true, "Calendar booking should be accepted");

  const domain = resolveTenantDomain("default");
  assert.ok(domain.tenant, "Tenant domain should resolve");
  assert.equal(
    isOriginAllowed("default", "https://life-experimentalist.github.io"),
    true,
    "Default origin must be allowed"
  );

  console.log("Platform smoke tests passed.");
}

run();
