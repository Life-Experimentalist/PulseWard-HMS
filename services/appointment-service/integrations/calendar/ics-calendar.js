const { resolveSecretRef } = require("../../../../packages/shared-utils/resolve-secret-ref");

function buildIcsPayload(request) {
  var now = Date.now();
  var startTime = request && request.startTime ? request.startTime : new Date(now).toISOString();
  var endTime =
    request && request.endTime
      ? request.endTime
      : new Date(now + 30 * 60 * 1000).toISOString();
  var startIso = new Date(startTime).toISOString().replace(/[-:]/g, "").replace(".000", "");
  var endIso = new Date(endTime).toISOString().replace(/[-:]/g, "").replace(".000", "");
  var createdIso = new Date().toISOString().replace(/[-:]/g, "").replace(".000", "");

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//PulseWard//HMS//EN",
    "BEGIN:VEVENT",
    "UID:" + String(request.appointmentId) + "@pulseward.local",
    "DTSTAMP:" + createdIso,
    "DTSTART:" + startIso,
    "DTEND:" + endIso,
    "SUMMARY:PulseWard appointment",
    "DESCRIPTION:PulseWard calendar test booking",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

class IcsCalendarProvider {
  constructor(providerConfig) {
    this.key = "ics-calendar";
    this.providerConfig = providerConfig;
  }

  async createBooking(request) {
    const override = request && request.credentialsOverride ? request.credentialsOverride : null;
    const secretPayload =
      override || resolveSecretRef(this.providerConfig && this.providerConfig.credentialsRef);
    const dryRun = request && request.dryRun !== false;
    const icsPayload = buildIcsPayload(request);

    if (!secretPayload || dryRun || !secretPayload.bridgeEndpoint) {
      return {
        provider: this.key,
        accepted: true,
        externalEventId: `ics-${request.appointmentId}`,
        detail:
          "ICS dry-run mode. Configure bridgeEndpoint and dryRun=false for live delivery.",
        preview: {
          contentType: "text/calendar",
          payloadBytes: Buffer.byteLength(icsPayload, "utf8"),
        },
      };
    }

    const response = await fetch(String(secretPayload.bridgeEndpoint), {
      method: "POST",
      headers: {
        "Content-Type": "text/calendar",
        ...(secretPayload.apiKey ? { Authorization: "Bearer " + String(secretPayload.apiKey) } : {}),
      },
      body: icsPayload,
    });

    const responseText = await response.text().catch(() => "");
    if (!response.ok) {
      return {
        provider: this.key,
        accepted: false,
        detail: "ICS bridge delivery failed.",
        statusCode: response.status,
        responseBody: responseText ? responseText.slice(0, 800) : undefined,
      };
    }

    return {
      provider: this.key,
      accepted: true,
      externalEventId: `ics-${request.appointmentId}`,
      detail: "ICS event generated and delivered.",
    };
  }
}

module.exports = {
  IcsCalendarProvider,
};
