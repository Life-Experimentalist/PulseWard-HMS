const nodemailer = require("nodemailer");

const {
  TelegramBotProvider,
} = require("../../services/notification-service/integrations/messaging/telegram-bot");
const {
  EmailSmtpProvider,
} = require("../../services/notification-service/integrations/messaging/email-smtp");
const {
  GenericWebhookMessagingProvider,
} = require("../../services/notification-service/integrations/messaging/generic-webhook");
const {
  WhatsAppCloudApiProvider,
} = require("../../services/notification-service/integrations/messaging/whatsapp-cloud-api");
const {
  createMessagingProvider,
  findMessagingProviderConfig,
} = require("../../services/notification-service/integrations/messaging");

jest.mock("nodemailer", () => ({
  createTransport: jest.fn(),
}));

describe("notification messaging provider adapters", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  test("selects and validates provider configs", () => {
    const configs = [
      { key: "telegram-bot", enabled: true },
      { key: "email-smtp", enabled: false },
    ];

    const found = findMessagingProviderConfig(configs, "telegram-bot");
    expect(found.key).toBe("telegram-bot");

    expect(() => findMessagingProviderConfig(configs, "missing-provider")).toThrow(
      "Messaging provider not configured"
    );
    expect(() => findMessagingProviderConfig(configs, "email-smtp")).toThrow(
      "Messaging provider is disabled"
    );
  });

  test("creates supported providers and rejects unsupported keys", () => {
    expect(createMessagingProvider({ key: "telegram-bot" }).key).toBe("telegram-bot");
    expect(createMessagingProvider({ key: "email-smtp" }).key).toBe("email-smtp");
    expect(createMessagingProvider({ key: "generic-webhook" }).key).toBe("generic-webhook");
    expect(createMessagingProvider({ key: "whatsapp-cloud-api" }).key).toBe("whatsapp-cloud-api");

    expect(() => createMessagingProvider({ key: "unknown-provider" })).toThrow(
      "Unsupported messaging provider"
    );
  });

  test("generic webhook provider handles endpoint configured and not configured paths", async () => {
    const withoutEndpoint = new GenericWebhookMessagingProvider({ key: "generic-webhook" });
    const pending = await withoutEndpoint.send({ message: "hello" });

    expect(pending.accepted).toBe(true);
    expect(pending.detail).toContain("configure endpoint");

    const withEndpoint = new GenericWebhookMessagingProvider({
      key: "generic-webhook",
      endpoint: "https://example.com/hook",
    });
    const ready = await withEndpoint.send({ message: "hello" });

    expect(ready.accepted).toBe(true);
    expect(ready.detail).toContain("routable");
  });

  test("whatsapp cloud provider returns operational readiness payload", async () => {
    const provider = new WhatsAppCloudApiProvider({ key: "whatsapp-cloud-api" });
    const result = await provider.send({ message: "hello" });

    expect(result.provider).toBe("whatsapp-cloud-api");
    expect(result.accepted).toBe(true);
    expect(result.detail).toContain("paid provider onboarding");
  });

  test("telegram provider handles dry-run, missing chat id, failure, and success", async () => {
    const provider = new TelegramBotProvider({ key: "telegram-bot" });

    const dryRun = await provider.send({ dryRun: true, message: "hello" });
    expect(dryRun.accepted).toBe(true);
    expect(dryRun.detail).toContain("dry-run");

    const missingChatId = await provider.send({
      message: "hello",
      credentialsOverride: { botToken: "token-only" },
    });
    expect(missingChatId.accepted).toBe(false);
    expect(missingChatId.detail).toContain("Missing Telegram chatId");

    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ ok: false, error_code: 400 }),
    });

    const failed = await provider.send({
      message: "hello",
      recipient: "chat-123",
      credentialsOverride: { botToken: "bot-token" },
    });
    expect(failed.accepted).toBe(false);
    expect(failed.detail).toContain("delivery failed");

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, result: { message_id: 987 } }),
    });

    const success = await provider.send({
      message: "hello",
      recipient: "chat-999",
      credentialsOverride: { botToken: "bot-token" },
    });

    expect(success.accepted).toBe(true);
    expect(success.externalMessageId).toBe("987");
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test("email smtp provider handles dry-run, invalid creds, and successful send", async () => {
    const provider = new EmailSmtpProvider({ key: "email-smtp" });

    const dryRun = await provider.send({
      dryRun: true,
      recipient: "demo@example.com",
      message: "test",
    });

    expect(dryRun.accepted).toBe(true);
    expect(dryRun.preview.to).toBe("demo@example.com");

    const invalidCreds = await provider.send({
      recipient: "demo@example.com",
      message: "test",
      credentialsOverride: {
        host: "smtp.example.com",
      },
    });

    expect(invalidCreds.accepted).toBe(false);
    expect(invalidCreds.detail).toContain("incomplete");

    const sendMail = jest.fn().mockResolvedValue({ messageId: "msg-123" });
    nodemailer.createTransport.mockReturnValue({ sendMail });

    const success = await provider.send({
      recipient: "demo@example.com",
      message: "test",
      credentialsOverride: {
        host: "smtp.example.com",
        port: 587,
        user: "user",
        pass: "pass",
        from: "ops@example.com",
      },
    });

    expect(success.accepted).toBe(true);
    expect(success.externalMessageId).toBe("msg-123");
    expect(nodemailer.createTransport).toHaveBeenCalledTimes(1);
    expect(sendMail).toHaveBeenCalledTimes(1);
  });
});
