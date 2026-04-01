class GoogleCalendarProvider {
  constructor(providerConfig) {
    this.key = "google-calendar";
    this.providerConfig = providerConfig;
  }

  async createBooking(request) {
    return {
      provider: this.key,
      accepted: true,
      externalEventId: `google-${request.appointmentId}`,
      detail: this.providerConfig.displayName,
    };
  }
}

module.exports = {
  GoogleCalendarProvider,
};
