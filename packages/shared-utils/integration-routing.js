function isMessagingProviderEnabled(config, key) {
  return config.messagingProviders.some((provider) => provider.key === key && provider.enabled);
}

function isCalendarProviderEnabled(config, key) {
  return config.calendarProviders.some((provider) => provider.key === key && provider.enabled);
}

function resolveMessagingProvider(config, channel, preferredProvider) {
  if (preferredProvider && isMessagingProviderEnabled(config, preferredProvider)) {
    return preferredProvider;
  }

  const route = config.messagingRouting.find((item) => item.channel === channel);
  if (!route) {
    throw new Error(`Messaging route not configured for channel: ${channel}`);
  }

  if (isMessagingProviderEnabled(config, route.defaultProvider)) {
    return route.defaultProvider;
  }

  const fallback = route.fallbackProviders.find((provider) =>
    isMessagingProviderEnabled(config, provider)
  );

  if (!fallback) {
    throw new Error(`No enabled messaging provider available for channel: ${channel}`);
  }

  return fallback;
}

function resolveCalendarProvider(config, preferredProvider) {
  if (preferredProvider && isCalendarProviderEnabled(config, preferredProvider)) {
    return preferredProvider;
  }

  if (isCalendarProviderEnabled(config, config.calendarRouting.defaultProvider)) {
    return config.calendarRouting.defaultProvider;
  }

  const fallback = config.calendarRouting.fallbackProviders.find((provider) =>
    isCalendarProviderEnabled(config, provider)
  );

  if (!fallback) {
    throw new Error("No enabled calendar provider available");
  }

  return fallback;
}

module.exports = {
  resolveMessagingProvider,
  resolveCalendarProvider,
};
