class GenericWebhookMessagingProvider {
  constructor(providerConfig) {
    this.key = "generic-webhook";
    this.providerConfig = providerConfig;
  }

  async send(_request) {
    if (!this.providerConfig.endpoint) {
      return {
        provider: this.key,
        accepted: true,
        detail: "Webhook adapter enabled; admin must configure endpoint before live delivery.",
      };
    }

    return {
      provider: this.key,
      accepted: true,
      detail: "Webhook adapter ready and routable.",
    };
  }
}

module.exports = {
  GenericWebhookMessagingProvider,
};
