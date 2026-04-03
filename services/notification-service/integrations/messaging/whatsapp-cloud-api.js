const { resolveSecretRef } = require("../../../../packages/shared-utils/resolve-secret-ref");

class WhatsAppCloudApiProvider {
  constructor(providerConfig) {
    this.key = "whatsapp-cloud-api";
    this.providerConfig = providerConfig;
  }

  async send(request) {
    const override = request && request.credentialsOverride ? request.credentialsOverride : null;
    const secretPayload =
      override || resolveSecretRef(this.providerConfig && this.providerConfig.credentialsRef);
    const dryRun = request && request.dryRun !== false;

    if (!secretPayload || dryRun) {
      return {
        provider: this.key,
        accepted: true,
        detail:
          "WhatsApp adapter dry-run mode. Complete provider onboarding and set accessToken/phoneNumberId for live delivery.",
        preview: {
          recipient: request && request.recipient ? request.recipient : null,
          message: request && request.message ? request.message : null,
        },
      };
    }

    if (!secretPayload.accessToken || !secretPayload.phoneNumberId) {
      return {
        provider: this.key,
        accepted: false,
        detail: "WhatsApp credentials are incomplete. accessToken and phoneNumberId are required.",
      };
    }

    const recipient = String(request && request.recipient ? request.recipient : "").trim();
    if (!recipient) {
      return {
        provider: this.key,
        accepted: false,
        detail: "Missing WhatsApp recipient phone number.",
      };
    }

    const endpoint =
      "https://graph.facebook.com/v21.0/" +
      encodeURIComponent(String(secretPayload.phoneNumberId)) +
      "/messages";

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + String(secretPayload.accessToken),
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: recipient,
        type: "text",
        text: {
          body: request && request.message ? request.message : "PulseWard test notification",
          preview_url: false,
        },
      }),
    });

    const responseJson = await response.json().catch(() => null);
    if (!response.ok) {
      return {
        provider: this.key,
        accepted: false,
        detail: "WhatsApp Cloud API delivery failed.",
        error: responseJson || { status: response.status, statusText: response.statusText },
      };
    }

    var externalMessageId;
    if (
      responseJson &&
      Array.isArray(responseJson.messages) &&
      responseJson.messages.length > 0 &&
      responseJson.messages[0].id
    ) {
      externalMessageId = String(responseJson.messages[0].id);
    }

    return {
      provider: this.key,
      accepted: true,
      detail: "WhatsApp message sent successfully.",
      externalMessageId: externalMessageId,
    };
  }
}

module.exports = {
  WhatsAppCloudApiProvider,
};
