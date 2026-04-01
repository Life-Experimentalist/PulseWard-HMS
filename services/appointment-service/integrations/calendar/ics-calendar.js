class IcsCalendarProvider {
  constructor(providerConfig) {
    this.key = "ics-calendar";
    this.providerConfig = providerConfig;
  }

  async createBooking(request) {
    return {
      provider: this.key,
      accepted: true,
      externalEventId: `ics-${request.appointmentId}`,
      detail: this.providerConfig.displayName,
    };
  }
}

module.exports = {
  IcsCalendarProvider,
};
