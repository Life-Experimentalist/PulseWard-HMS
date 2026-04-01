class OutlookCalendarProvider {
  constructor(providerConfig) {
    this.key = "outlook-calendar";
    this.providerConfig = providerConfig;
  }

  async createBooking(request) {
    return {
      provider: this.key,
      accepted: true,
      externalEventId: `outlook-${request.appointmentId}`,
      detail: this.providerConfig.displayName,
    };
  }
}

module.exports = {
  OutlookCalendarProvider,
};
