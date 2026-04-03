const { GoogleCalendarProvider } = require("./google-calendar");
const { AppleCalendarProvider } = require("./apple-calendar");
const { OutlookCalendarProvider } = require("./outlook-calendar");
const { IcsCalendarProvider } = require("./ics-calendar");
const { InternalCalendarProvider } = require("./internal-calendar");

function createCalendarProvider(providerConfig) {
  switch (providerConfig.key) {
    case "google-calendar":
      return new GoogleCalendarProvider(providerConfig);
    case "apple-calendar":
      return new AppleCalendarProvider(providerConfig);
    case "outlook-calendar":
      return new OutlookCalendarProvider(providerConfig);
    case "ics-calendar":
      return new IcsCalendarProvider(providerConfig);
    case "internal-calendar":
      return new InternalCalendarProvider(providerConfig);
    default:
      throw new Error(`Unsupported calendar provider: ${providerConfig.key}`);
  }
}

function findCalendarProviderConfig(providerConfigs, key) {
  const match = providerConfigs.find((provider) => provider.key === key);
  if (!match) {
    throw new Error(`Calendar provider not configured: ${key}`);
  }

  if (!match.enabled) {
    throw new Error(`Calendar provider is disabled: ${key}`);
  }

  return match;
}

module.exports = {
  createCalendarProvider,
  findCalendarProviderConfig,
};
