class AppleCalendarProvider {
  constructor(providerConfig) {
    this.key = "apple-calendar";
    this.providerConfig = providerConfig;
  }

  async createBooking(request) {
    return {
      provider: this.key,
      accepted: true,
      externalEventId: `apple-${request.appointmentId}`,
      detail:
        "Apple Calendar adapter ready. Admin should complete CalDAV/ICS bridge configuration.",
    };
  }
}

module.exports = {
  AppleCalendarProvider,
};
