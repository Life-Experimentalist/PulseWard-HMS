class WhatsAppCloudApiProvider {
  constructor(providerConfig) {
    this.key = "whatsapp-cloud-api";
    this.providerConfig = providerConfig;
  }

  async send(_request) {
    return {
      provider: this.key,
      accepted: true,
      detail:
        "WhatsApp adapter ready. Admin must complete paid provider onboarding and billing in Meta.",
    };
  }
}

module.exports = {
  WhatsAppCloudApiProvider,
};
