const { resolveCalendarProvider } = require("../../../packages/shared-utils/integration-routing");
const { createCalendarProvider, findCalendarProviderConfig } = require("./calendar");

async function bookAppointmentWithRouting(request, tenantConfig) {
  const selectedProviderKey = resolveCalendarProvider(tenantConfig, request.preferredProvider);

  const providerConfig = findCalendarProviderConfig(
    tenantConfig.calendarProviders,
    selectedProviderKey
  );

  const provider = createCalendarProvider(providerConfig);
  return provider.createBooking(request);
}

module.exports = {
  bookAppointmentWithRouting,
};
