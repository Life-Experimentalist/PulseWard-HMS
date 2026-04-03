const { resolveSecretRef } = require("../../../../packages/shared-utils/resolve-secret-ref");

class OutlookCalendarProvider {
  constructor(providerConfig) {
    this.key = "outlook-calendar";
    this.providerConfig = providerConfig;
  }

  async createBooking(request) {
    const override = request && request.credentialsOverride ? request.credentialsOverride : null;
    const secretPayload =
      override || resolveSecretRef(this.providerConfig && this.providerConfig.credentialsRef);
    const dryRun = request && request.dryRun !== false;

    if (!secretPayload || dryRun || !secretPayload.accessToken || !secretPayload.userId) {
      return {
        provider: this.key,
        accepted: true,
        externalEventId: `outlook-${request.appointmentId}`,
        detail:
          "Outlook Calendar dry-run mode. Provide accessToken/userId and dryRun=false for live booking.",
      };
    }

    const endpoint =
      "https://graph.microsoft.com/v1.0/users/" +
      encodeURIComponent(String(secretPayload.userId)) +
      "/events";
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + String(secretPayload.accessToken),
      },
      body: JSON.stringify({
        subject: request && request.subject ? request.subject : "PulseWard appointment",
        body: {
          contentType: "Text",
          content:
            request && request.description
              ? request.description
              : "PulseWard calendar test booking",
        },
        start: {
          dateTime: request.startTime,
          timeZone: "UTC",
        },
        end: {
          dateTime: request.endTime,
          timeZone: "UTC",
        },
      }),
    });
    const responseJson = await response.json().catch(() => null);
    if (!response.ok) {
      return {
        provider: this.key,
        accepted: false,
        detail: "Outlook Calendar booking failed.",
        error: responseJson || { status: response.status, statusText: response.statusText },
      };
    }

    return {
      provider: this.key,
      accepted: true,
      externalEventId:
        responseJson && responseJson.id
          ? String(responseJson.id)
          : `outlook-${request.appointmentId}`,
      detail: "Outlook Calendar booking created.",
    };
  }
}

module.exports = {
  OutlookCalendarProvider,
};
