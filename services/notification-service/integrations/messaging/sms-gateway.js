const { resolveSecretRef } = require("../../../../packages/shared-utils/resolve-secret-ref");

class SmsGatewayProvider {
  constructor(providerConfig) {
    this.key = "sms-gateway";
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
        detail: "SMS gateway dry-run mode. Configure endpoint/apiKey and use dryRun=false for live delivery.",
        preview: {
          recipient: request && request.recipient ? request.recipient : null,
          message: request && request.message ? request.message : null,
        },
      };
    }

    if (!secretPayload.endpoint || !secretPayload.apiKey) {
      return {
        provider: this.key,
        accepted: false,
        detail: "SMS gateway credentials are incomplete. endpoint and apiKey are required.",
      };
    }

    const response = await fetch(String(secretPayload.endpoint), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + String(secretPayload.apiKey),
      },
      body: JSON.stringify({
        to: request.recipient,
        message: request.message || "PulseWard test notification",
        channel: request.channel || "patient-notification",
      }),
    });

    const responseJson = await response.json().catch(() => null);
    if (!response.ok) {
      return {
        provider: this.key,
        accepted: false,
        detail: "SMS gateway delivery failed.",
        error: responseJson || { status: response.status, statusText: response.statusText },
      };
    }

    return {
      provider: this.key,
      accepted: true,
      detail: "SMS message sent successfully.",
      externalMessageId:
        responseJson && responseJson.messageId ? String(responseJson.messageId) : undefined,
    };
  }
}

module.exports = {
  SmsGatewayProvider,
};