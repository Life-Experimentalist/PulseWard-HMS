class InternalCalendarProvider {
  constructor(providerConfig) {
    this.key = "internal-calendar";
    this.providerConfig = providerConfig;
  }

  async createBooking(request) {
    return {
      provider: this.key,
      accepted: true,
      externalEventId: `internal-${request.appointmentId}`,
      detail: "Internal calendar booking recorded.",
    };
  }
}

module.exports = {
  InternalCalendarProvider,
};