const { WhatsAppCloudApiProvider } = require("./whatsapp-cloud-api");
const { TelegramBotProvider } = require("./telegram-bot");
const { GenericWebhookMessagingProvider } = require("./generic-webhook");
const { EmailSmtpProvider } = require("./email-smtp");
const { SmsGatewayProvider } = require("./sms-gateway");

function createMessagingProvider(providerConfig) {
  switch (providerConfig.key) {
    case "whatsapp-cloud-api":
      return new WhatsAppCloudApiProvider(providerConfig);
    case "telegram-bot":
      return new TelegramBotProvider(providerConfig);
    case "generic-webhook":
      return new GenericWebhookMessagingProvider(providerConfig);
    case "email-smtp":
      return new EmailSmtpProvider(providerConfig);
    case "sms-gateway":
      return new SmsGatewayProvider(providerConfig);
    default:
      throw new Error(`Unsupported messaging provider: ${providerConfig.key}`);
  }
}

function findMessagingProviderConfig(providerConfigs, key) {
  const match = providerConfigs.find((provider) => provider.key === key);
  if (!match) {
    throw new Error(`Messaging provider not configured: ${key}`);
  }

  if (!match.enabled) {
    throw new Error(`Messaging provider is disabled: ${key}`);
  }

  return match;
}

module.exports = {
  createMessagingProvider,
  findMessagingProviderConfig,
};
