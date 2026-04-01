const nodemailer = require("nodemailer");
const { resolveSecretRef } = require("../../../../packages/shared-utils/resolve-secret-ref");

class EmailSmtpProvider {
  constructor(providerConfig) {
    this.key = "email-smtp";
    this.providerConfig = providerConfig;
  }

  async send(request) {
    const secretPayload = resolveSecretRef(this.providerConfig.credentialsRef);
    const dryRun = request.dryRun === true;

    if (!secretPayload || dryRun) {
      return {
        provider: this.key,
        accepted: true,
        detail: "SMTP adapter dry-run mode. Admin can add credentials reference for live delivery.",
        preview: {
          to: request.recipient,
          subject: "PulseWard Notification",
        },
      };
    }

    const transporter = nodemailer.createTransport({
      host: secretPayload.host,
      port: Number(secretPayload.port || 587),
      secure: Boolean(secretPayload.secure || false),
      auth: {
        user: secretPayload.user,
        pass: secretPayload.pass,
      },
    });

    const info = await transporter.sendMail({
      from: secretPayload.from || "pulseward@localhost",
      to: request.recipient,
      subject: "PulseWard Notification",
      text: request.message,
    });

    return {
      provider: this.key,
      accepted: true,
      detail: "SMTP email sent successfully.",
      externalMessageId: info && info.messageId ? info.messageId : undefined,
    };
  }
}

module.exports = {
  EmailSmtpProvider,
};
