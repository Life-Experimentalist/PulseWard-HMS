const { resolveMessagingProvider } = require("../../../packages/shared-utils/integration-routing");
const { createMessagingProvider, findMessagingProviderConfig } = require("./messaging");

async function sendNotificationWithRouting(request, tenantConfig) {
  const selectedProviderKey = resolveMessagingProvider(
    tenantConfig,
    request.channel,
    request.preferredProvider
  );

  const providerConfig = findMessagingProviderConfig(
    tenantConfig.messagingProviders,
    selectedProviderKey
  );

  const provider = createMessagingProvider(providerConfig);
  return provider.send(request);
}

module.exports = {
  sendNotificationWithRouting,
};
