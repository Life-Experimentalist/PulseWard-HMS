const { resolveSecretRef } = require("../../../../packages/shared-utils/resolve-secret-ref");

class TelegramBotProvider {
  constructor(providerConfig) {
    this.key = "telegram-bot";
    this.providerConfig = providerConfig;
  }

  async send(request) {
    const override = request && request.credentialsOverride ? request.credentialsOverride : null;
    const secretPayload =
      override || resolveSecretRef(this.providerConfig && this.providerConfig.credentialsRef);
    const dryRun = request && request.dryRun === true;

    if (!secretPayload || !secretPayload.botToken || dryRun) {
      return {
        provider: this.key,
        accepted: true,
        detail: "Telegram adapter dry-run mode. Provide botToken/chatId for live delivery test.",
      };
    }

    const chatId = request.recipient || secretPayload.chatId;
    if (!chatId) {
      return {
        provider: this.key,
        accepted: false,
        detail: "Missing Telegram chatId. Provide recipient or chatId in credentials.",
      };
    }

    const response = await fetch(
      `https://api.telegram.org/bot${encodeURIComponent(secretPayload.botToken)}/sendMessage`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: request.message || "PulseWard test notification",
          disable_web_page_preview: true,
        }),
      }
    );

    const responseJson = await response.json().catch(() => null);
    if (!response.ok || !responseJson || responseJson.ok !== true) {
      return {
        provider: this.key,
        accepted: false,
        detail: "Telegram API delivery failed.",
        error: responseJson,
      };
    }

    return {
      provider: this.key,
      accepted: true,
      detail: "Telegram message sent successfully.",
      externalMessageId:
        responseJson && responseJson.result && responseJson.result.message_id
          ? String(responseJson.result.message_id)
          : undefined,
    };
  }
}

module.exports = {
  TelegramBotProvider,
};
