const { resolveSecretRef } = require("../../../../packages/shared-utils/resolve-secret-ref");

class GoogleCalendarProvider {
  constructor(providerConfig) {
    this.key = "google-calendar";
    this.providerConfig = providerConfig;
  }

  async createBooking(request) {
    const override = request && request.credentialsOverride ? request.credentialsOverride : null;
    const secretPayload =
      override || resolveSecretRef(this.providerConfig && this.providerConfig.credentialsRef);
    const dryRun = request && request.dryRun !== false;

    if (!secretPayload || dryRun || !secretPayload.accessToken || !secretPayload.calendarId) {
      return {
        provider: this.key,
        accepted: true,
        externalEventId: `google-${request.appointmentId}`,
        detail:
          "Google Calendar dry-run mode. Provide accessToken/calendarId and dryRun=false for live booking.",
      };
    }

    const endpoint =
      "https://www.googleapis.com/calendar/v3/calendars/" +
      encodeURIComponent(String(secretPayload.calendarId)) +
      "/events";
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + String(secretPayload.accessToken),
      },
      body: JSON.stringify({
        summary: request && request.subject ? request.subject : "PulseWard appointment",
        description:
          request && request.description ? request.description : "PulseWard calendar test booking",
        start: { dateTime: request.startTime },
        end: { dateTime: request.endTime },
      }),
    });
    const responseJson = await response.json().catch(() => null);
    if (!response.ok) {
      return {
        provider: this.key,
        accepted: false,
        detail: "Google Calendar booking failed.",
        error: responseJson || { status: response.status, statusText: response.statusText },
      };
    }

    return {
      provider: this.key,
      accepted: true,
      externalEventId:
        responseJson && responseJson.id
          ? String(responseJson.id)
          : `google-${request.appointmentId}`,
      detail: "Google Calendar booking created.",
    };
  }
}

module.exports = {
  GoogleCalendarProvider,
};
