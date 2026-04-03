const {
  createCalendarProvider,
  findCalendarProviderConfig,
} = require("../../services/appointment-service/integrations/calendar");

describe("appointment calendar provider adapters", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  test("creates bookings through all supported calendar providers", async () => {
    const providers = [
      { key: "google-calendar", displayName: "Google Calendar" },
      { key: "apple-calendar", displayName: "Apple Calendar" },
      { key: "outlook-calendar", displayName: "Outlook Calendar" },
      { key: "ics-calendar", displayName: "ICS Calendar" },
      { key: "internal-calendar", displayName: "Internal Calendar" },
    ];

    const request = { appointmentId: "apt-cal-1" };

    for (const providerConfig of providers) {
      const provider = createCalendarProvider(providerConfig);
      const booking = await provider.createBooking(request);

      expect(booking.provider).toBe(providerConfig.key);
      expect(booking.accepted).toBe(true);
      expect(booking.externalEventId).toContain("apt-cal-1");
    }
  });

  test("supports live google booking when dryRun is disabled and credentials are present", async () => {
    const provider = createCalendarProvider({ key: "google-calendar", displayName: "Google" });

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "google-live-2001" }),
    });

    const booking = await provider.createBooking({
      appointmentId: "apt-live-1",
      clinicianId: "cln-1",
      patientId: "pat-1",
      startTime: "2026-04-02T09:00:00Z",
      endTime: "2026-04-02T09:30:00Z",
      dryRun: false,
      credentialsOverride: {
        accessToken: "token",
        calendarId: "primary",
      },
    });

    expect(booking.accepted).toBe(true);
    expect(booking.externalEventId).toBe("google-live-2001");
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test("throws for unsupported provider and config lookup errors", () => {
    expect(() => createCalendarProvider({ key: "unknown-calendar" })).toThrow(
      "Unsupported calendar provider"
    );

    const providerConfigs = [
      { key: "google-calendar", enabled: true },
      { key: "outlook-calendar", enabled: false },
    ];

    expect(findCalendarProviderConfig(providerConfigs, "google-calendar").key).toBe(
      "google-calendar"
    );

    expect(() => findCalendarProviderConfig(providerConfigs, "apple-calendar")).toThrow(
      "Calendar provider not configured"
    );

    expect(() => findCalendarProviderConfig(providerConfigs, "outlook-calendar")).toThrow(
      "Calendar provider is disabled"
    );
  });
});
