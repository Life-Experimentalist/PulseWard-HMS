const crypto = require("crypto");
const { resolveSecretRef } = require("../../../../packages/shared-utils/resolve-secret-ref");

function serializePayload(payload) {
  if (typeof payload === "string") {
    return payload;
  }

  try {
    return JSON.stringify(payload || {});
  } catch (_error) {
    return "{}";
  }
}

function buildSignature(payloadString, signingSecret) {
  return (
    "sha256=" +
    crypto.createHmac("sha256", String(signingSecret || "")).update(payloadString, "utf8").digest("hex")
  );
}

class GenericWebhookMessagingProvider {
  constructor(providerConfig) {
    this.key = "generic-webhook";
    this.providerConfig = providerConfig;
  }

  async send(request) {
    if (!this.providerConfig.endpoint) {
      return {
        provider: this.key,
        accepted: true,
        detail: "Webhook adapter enabled; admin must configure endpoint before live delivery.",
      };
    }

    const override = request && request.credentialsOverride ? request.credentialsOverride : null;
    const secretPayload =
      override || resolveSecretRef(this.providerConfig && this.providerConfig.credentialsRef);
    const signingSecret = secretPayload
      ? secretPayload.signingSecret || secretPayload.secret || null
      : null;
    const dryRun = request && request.dryRun !== false;

    if (!signingSecret || dryRun) {
      return {
        provider: this.key,
        accepted: true,
        detail:
          "Webhook adapter dry-run mode. Configure signingSecret and set dryRun=false for live signed delivery.",
        endpoint: this.providerConfig.endpoint,
      };
    }

    const payload = {
      eventType: "notification.dispatch.test",
      tenantKey: request && request.tenantKey ? request.tenantKey : "default",
      channel: request && request.channel ? request.channel : "website-hook",
      recipient: request && request.recipient ? request.recipient : null,
      message: request && request.message ? request.message : "PulseWard test notification",
      occurredAt: new Date().toISOString(),
    };
    const payloadString = serializePayload(payload);
    const signature = buildSignature(payloadString, signingSecret);

    const response = await fetch(String(this.providerConfig.endpoint), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-pulseward-signature": signature,
      },
      body: payloadString,
    });

    const responseText = await response.text().catch(() => "");
    if (!response.ok) {
      return {
        provider: this.key,
        accepted: false,
        detail: "Webhook delivery failed.",
        statusCode: response.status,
        responseBody: responseText ? responseText.slice(0, 800) : undefined,
      };
    }

    return {
      provider: this.key,
      accepted: true,
      detail: "Webhook message sent successfully.",
      endpoint: this.providerConfig.endpoint,
    };
  }
}

module.exports = {
  GenericWebhookMessagingProvider,
};
