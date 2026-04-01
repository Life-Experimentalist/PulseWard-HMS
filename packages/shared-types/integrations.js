const MESSAGING_PROVIDER_KEYS = Object.freeze([
  "whatsapp-cloud-api",
  "telegram-bot",
  "generic-webhook",
  "email-smtp",
  "sms-gateway",
]);

const CALENDAR_PROVIDER_KEYS = Object.freeze([
  "google-calendar",
  "apple-calendar",
  "outlook-calendar",
  "ics-calendar",
  "internal-calendar",
]);

const DELIVERY_CHANNELS = Object.freeze([
  "patient-notification",
  "staff-notification",
  "website-hook",
]);

module.exports = {
  MESSAGING_PROVIDER_KEYS,
  CALENDAR_PROVIDER_KEYS,
  DELIVERY_CHANNELS,
};
