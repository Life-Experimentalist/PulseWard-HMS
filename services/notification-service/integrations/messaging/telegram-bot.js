class TelegramBotProvider {
  constructor(providerConfig) {
    this.key = "telegram-bot";
    this.providerConfig = providerConfig;
  }

  async send(_request) {
    return {
      provider: this.key,
      accepted: true,
      detail:
        "Telegram adapter ready. Admin must complete bot token setup and endpoint validation.",
    };
  }
}

module.exports = {
  TelegramBotProvider,
};
