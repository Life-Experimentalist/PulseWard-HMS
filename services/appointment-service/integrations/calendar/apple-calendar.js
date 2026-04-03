const { resolveSecretRef } = require("../../../../packages/shared-utils/resolve-secret-ref");

class AppleCalendarProvider {
  constructor(providerConfig) {
    this.key = "apple-calendar";
    this.providerConfig = providerConfig;
  }

  async createBooking(request) {
    const override = request && request.credentialsOverride ? request.credentialsOverride : null;
    const secretPayload =
      override || resolveSecretRef(this.providerConfig && this.providerConfig.credentialsRef);
    const dryRun = request && request.dryRun !== false;

    if (!secretPayload || dryRun || !secretPayload.bridgeEndpoint) {
      return {
        provider: this.key,
        accepted: true,
        externalEventId: `apple-${request.appointmentId}`,
        detail:
          "Apple Calendar dry-run mode. Configure bridgeEndpoint and dryRun=false for live delivery.",
      };
    }

    const response = await fetch(String(secretPayload.bridgeEndpoint), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(secretPayload.apiKey ? { Authorization: "Bearer " + String(secretPayload.apiKey) } : {}),
      },
      body: JSON.stringify({
        provider: this.key,
        appointmentId: request.appointmentId,
        clinicianId: request.clinicianId,
        patientId: request.patientId,
        startTime: request.startTime,
        endTime: request.endTime,
      }),
    });
    const responseJson = await response.json().catch(() => null);
    if (!response.ok) {
      return {
        provider: this.key,
        accepted: false,
        detail: "Apple Calendar bridge delivery failed.",
        error: responseJson || { status: response.status, statusText: response.statusText },
      };
    }

    return {
      provider: this.key,
      accepted: true,
      externalEventId:
        responseJson && responseJson.eventId
          ? String(responseJson.eventId)
          : `apple-${request.appointmentId}`,
      detail: "Apple Calendar booking delivered via bridge.",
    };
  }
}

module.exports = {
  AppleCalendarProvider,
};
