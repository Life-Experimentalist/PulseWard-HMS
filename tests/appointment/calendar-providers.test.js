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

  test("handles Apple live bridge failure and status fallback payloads", async () => {
    const provider = createCalendarProvider({ key: "apple-calendar", displayName: "Apple" });

    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
      json: async () => {
        throw new Error("invalid json");
      },
    });

    const failed = await provider.createBooking({
      appointmentId: "apt-apple-live-1",
      clinicianId: "cln-1",
      patientId: "pat-1",
      startTime: "2026-04-03T10:00:00Z",
      endTime: "2026-04-03T10:30:00Z",
      dryRun: false,
      credentialsOverride: {
        bridgeEndpoint: "https://apple.bridge.test/bookings",
        apiKey: "apple-key",
      },
    });

    expect(failed.accepted).toBe(false);
    expect(failed.detail).toContain("bridge delivery failed");
    expect(failed.error).toEqual({
      status: 503,
      statusText: "Service Unavailable",
    });
  });

  test("uses Apple fallback externalEventId when bridge response omits eventId", async () => {
    const provider = createCalendarProvider({ key: "apple-calendar", displayName: "Apple" });

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });

    const booking = await provider.createBooking({
      appointmentId: "apt-apple-live-2",
      clinicianId: "cln-2",
      patientId: "pat-2",
      startTime: "2026-04-03T11:00:00Z",
      endTime: "2026-04-03T11:30:00Z",
      dryRun: false,
      credentialsOverride: {
        bridgeEndpoint: "https://apple.bridge.test/bookings",
        apiKey: "apple-key",
      },
    });

    expect(booking.accepted).toBe(true);
    expect(booking.externalEventId).toBe("apple-apt-apple-live-2");
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch.mock.calls[0][1].headers.Authorization).toBe("Bearer apple-key");
  });

  test("keeps Outlook in dry-run acceptance mode when live credentials are incomplete", async () => {
    const provider = createCalendarProvider({ key: "outlook-calendar", displayName: "Outlook" });

    const booking = await provider.createBooking({
      appointmentId: "apt-outlook-live-1",
      startTime: "2026-04-03T12:00:00Z",
      endTime: "2026-04-03T12:30:00Z",
      dryRun: false,
      credentialsOverride: {
        accessToken: "token-only",
      },
    });

    expect(booking.accepted).toBe(true);
    expect(booking.detail).toContain("dry-run mode");
  });

  test("handles Outlook live success fallback id and failure payload", async () => {
    const provider = createCalendarProvider({ key: "outlook-calendar", displayName: "Outlook" });

    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true }),
    });

    const successFallback = await provider.createBooking({
      appointmentId: "apt-outlook-live-2",
      startTime: "2026-04-03T13:00:00Z",
      endTime: "2026-04-03T13:30:00Z",
      dryRun: false,
      credentialsOverride: {
        accessToken: "outlook-token",
        userId: "clinician@pulseward.test",
      },
    });

    expect(successFallback.accepted).toBe(true);
    expect(successFallback.externalEventId).toBe("outlook-apt-outlook-live-2");

    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      json: async () => ({ error: { code: "InvalidAuthenticationToken" } }),
    });

    const failure = await provider.createBooking({
      appointmentId: "apt-outlook-live-3",
      startTime: "2026-04-03T14:00:00Z",
      endTime: "2026-04-03T14:30:00Z",
      dryRun: false,
      credentialsOverride: {
        accessToken: "outlook-token",
        userId: "clinician@pulseward.test",
      },
    });

    expect(failure.accepted).toBe(false);
    expect(failure.detail).toContain("booking failed");
    expect(failure.error).toEqual({ error: { code: "InvalidAuthenticationToken" } });
  });

  test("captures ICS live bridge failure with bounded response body", async () => {
    const provider = createCalendarProvider({ key: "ics-calendar", displayName: "ICS" });

    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 502,
      text: async () => "x".repeat(1200),
    });

    const failed = await provider.createBooking({
      appointmentId: "apt-ics-live-1",
      startTime: "2026-04-03T15:00:00Z",
      endTime: "2026-04-03T15:30:00Z",
      dryRun: false,
      credentialsOverride: {
        bridgeEndpoint: "https://ics.bridge.test/events",
        apiKey: "ics-key",
      },
    });

    expect(failed.accepted).toBe(false);
    expect(failed.statusCode).toBe(502);
    expect(failed.responseBody.length).toBe(800);
  });

  test("sends ICS live booking with text/calendar content type", async () => {
    const provider = createCalendarProvider({ key: "ics-calendar", displayName: "ICS" });

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => "accepted",
    });

    const booking = await provider.createBooking({
      appointmentId: "apt-ics-live-2",
      startTime: "2026-04-03T16:00:00Z",
      endTime: "2026-04-03T16:30:00Z",
      dryRun: false,
      credentialsOverride: {
        bridgeEndpoint: "https://ics.bridge.test/events",
        apiKey: "ics-key",
      },
    });

    expect(booking.accepted).toBe(true);
    expect(booking.externalEventId).toBe("ics-apt-ics-live-2");
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch.mock.calls[0][1].headers["Content-Type"]).toBe("text/calendar");
    expect(global.fetch.mock.calls[0][1].headers.Authorization).toBe("Bearer ics-key");
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
