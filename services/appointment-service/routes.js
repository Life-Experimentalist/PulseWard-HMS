var express = require("express");
var randomUUID = require("crypto").randomUUID;
var bookAppointmentWithRouting =
  require("./integrations/book-with-provider-routing").bookAppointmentWithRouting;
var loadTenantIntegrationConfig =
  require("../../packages/shared-utils/load-tenant-integration-config").loadTenantIntegrationConfig;

var router = express.Router();
var appointments = [];
var opdEntries = [];
var clinicianAvailabilityBlocks = [];
var notificationDispatchEvents = [];
var notificationDeadLetterEvents = [];

var appointmentStatusValues = [
  "pending-triage",
  "scheduled",
  "checked-in",
  "in-consultation",
  "completed",
  "cancelled",
  "no-show",
];
var slotOccupancyStatuses = ["scheduled", "checked-in", "in-consultation"];
var statusTransitionMatrix = {
  "pending-triage": ["scheduled", "cancelled"],
  scheduled: ["checked-in", "cancelled", "no-show"],
  "checked-in": ["in-consultation", "cancelled"],
  "in-consultation": ["completed", "cancelled"],
  completed: [],
  cancelled: [],
  "no-show": [],
};
var triageLevels = ["low", "medium", "high", "critical"];
var opdVisitTypes = ["walk-in", "follow-up", "referred"];
var appointmentAccessMatrix = {
  "appointment.create": ["admin", "frontdesk", "doctor", "nurse", "operations", "patient"],
  "appointment.update": ["admin", "frontdesk", "doctor", "nurse", "operations"],
  "appointment.cancel": ["admin", "frontdesk", "operations"],
  "opd.entry.create": ["admin", "frontdesk", "doctor", "nurse"],
  "clinician.availability.block": ["admin", "frontdesk", "doctor", "nurse", "operations"],
};

var MIN_DURATION_MINUTES = 5;
var MAX_DURATION_MINUTES = 240;
var NOTIFICATION_DISPATCH_MAX_ATTEMPTS = 3;
var NOTIFICATION_DISPATCH_TIMEOUT_MS = 1500;
var NOTIFICATION_LATE_THRESHOLD_MS = 2 * 60 * 1000;
var NOTIFICATION_DEAD_LETTER_MAX_EVENTS = 500;
var reminderLifecycleEvents = [
  "appointment.created",
  "appointment.rescheduled",
  "appointment.status-updated",
];

function normalizeRoleKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function getActorRole(req, payload) {
  var headerRole = req.headers["x-actor-role"];
  return normalizeRoleKey(headerRole || payload.actorRole || "");
}

function getTenantKey(req, payload) {
  var queryTenant = req.query ? req.query.tenantKey : "";
  return String(payload.tenantKey || queryTenant || "default").trim() || "default";
}

function isValidIsoDateTime(value) {
  if (!value) {
    return false;
  }

  return Number.isFinite(Date.parse(String(value)));
}

function normalizeTriageLevel(value) {
  var normalized = String(value || "medium")
    .trim()
    .toLowerCase();
  if (triageLevels.indexOf(normalized) === -1) {
    return "medium";
  }

  return normalized;
}

function normalizeVisitType(value) {
  var normalized = String(value || "walk-in")
    .trim()
    .toLowerCase();
  if (opdVisitTypes.indexOf(normalized) === -1) {
    return "walk-in";
  }

  return normalized;
}

function normalizeAppointmentStatus(value, fallbackStatus) {
  var fallback = fallbackStatus || "scheduled";
  var normalized = String(value || fallback)
    .trim()
    .toLowerCase();
  if (appointmentStatusValues.indexOf(normalized) === -1) {
    return "";
  }

  return normalized;
}

function normalizeDurationMinutes(value, fallbackMinutes) {
  var fallback = Number(fallbackMinutes || 30);
  var numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return Math.min(MAX_DURATION_MINUTES, Math.max(MIN_DURATION_MINUTES, fallback));
  }

  var rounded = Math.round(numeric);
  return Math.min(MAX_DURATION_MINUTES, Math.max(MIN_DURATION_MINUTES, rounded));
}

function isSlotOccupancyStatus(status) {
  return (
    slotOccupancyStatuses.indexOf(
      String(status || "")
        .trim()
        .toLowerCase()
    ) >= 0
  );
}

function canTransitionStatus(currentStatus, nextStatus) {
  if (currentStatus === nextStatus) {
    return true;
  }

  var allowedTransitions = statusTransitionMatrix[currentStatus] || [];
  return allowedTransitions.indexOf(nextStatus) >= 0;
}

function getAllowedTransitions(currentStatus) {
  return statusTransitionMatrix[currentStatus] || [];
}

function getAppointmentWindowRange(appointmentDate, durationMinutes) {
  var startMs = Date.parse(String(appointmentDate || ""));
  if (!Number.isFinite(startMs)) {
    return null;
  }

  var duration = normalizeDurationMinutes(durationMinutes, 30);
  var endMs = startMs + duration * 60 * 1000;
  return {
    startMs: startMs,
    endMs: endMs,
  };
}

function toUtcDateToken(value) {
  var date = new Date(String(value || ""));
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toISOString().slice(0, 10);
}

function isValidDateToken(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "").trim());
}

function resolveAvailabilityWindow(payload) {
  var blockDate = String((payload && payload.blockDate) || "").trim();
  if (blockDate) {
    if (!isValidDateToken(blockDate)) {
      return {
        ok: false,
        message: "blockDate must be in YYYY-MM-DD format",
      };
    }

    var startIso = blockDate + "T00:00:00.000Z";
    var startMs = Date.parse(startIso);
    if (!Number.isFinite(startMs)) {
      return {
        ok: false,
        message: "blockDate could not be parsed as UTC date",
      };
    }

    var endMs = startMs + 24 * 60 * 60 * 1000;
    return {
      ok: true,
      scope: "day",
      blockDate: blockDate,
      startDateTime: new Date(startMs).toISOString(),
      endDateTime: new Date(endMs).toISOString(),
    };
  }

  var startDateTime = String((payload && payload.startDateTime) || "").trim();
  var endDateTime = String((payload && payload.endDateTime) || "").trim();

  if (!startDateTime || !endDateTime) {
    return {
      ok: false,
      message: "Provide blockDate or both startDateTime and endDateTime",
    };
  }

  if (!isValidIsoDateTime(startDateTime) || !isValidIsoDateTime(endDateTime)) {
    return {
      ok: false,
      message: "startDateTime and endDateTime must be valid ISO date-times",
    };
  }

  var startMsWindow = Date.parse(startDateTime);
  var endMsWindow = Date.parse(endDateTime);
  if (
    !Number.isFinite(startMsWindow) ||
    !Number.isFinite(endMsWindow) ||
    endMsWindow <= startMsWindow
  ) {
    return {
      ok: false,
      message: "endDateTime must be greater than startDateTime",
    };
  }

  return {
    ok: true,
    scope: "window",
    blockDate: "",
    startDateTime: new Date(startMsWindow).toISOString(),
    endDateTime: new Date(endMsWindow).toISOString(),
  };
}

function getAvailabilityBlockWindowRange(block) {
  if (!block) {
    return null;
  }

  var startMs = Date.parse(String(block.startDateTime || ""));
  var endMs = Date.parse(String(block.endDateTime || ""));
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return null;
  }

  return {
    startMs: startMs,
    endMs: endMs,
  };
}

function findClinicianAvailabilityBlockConflict(
  tenantKey,
  clinicianId,
  appointmentDate,
  durationMinutes
) {
  if (!tenantKey || !clinicianId) {
    return null;
  }

  var appointmentWindow = getAppointmentWindowRange(appointmentDate, durationMinutes);
  if (!appointmentWindow) {
    return null;
  }

  for (var index = 0; index < clinicianAvailabilityBlocks.length; index += 1) {
    var block = clinicianAvailabilityBlocks[index];
    if (!block) {
      continue;
    }

    if (block.tenantKey !== tenantKey || block.clinicianId !== clinicianId) {
      continue;
    }

    var blockWindow = getAvailabilityBlockWindowRange(block);
    if (!blockWindow) {
      continue;
    }

    if (windowsOverlap(appointmentWindow, blockWindow)) {
      return block;
    }
  }

  return null;
}

function windowsOverlap(first, second) {
  if (!first || !second) {
    return false;
  }

  return first.startMs < second.endMs && second.startMs < first.endMs;
}

function findConflictingAppointment(
  tenantKey,
  clinicianId,
  appointmentDate,
  durationMinutes,
  excludeId
) {
  if (!clinicianId) {
    return null;
  }

  var candidateWindow = getAppointmentWindowRange(appointmentDate, durationMinutes);
  if (!candidateWindow) {
    return null;
  }

  for (var index = 0; index < appointments.length; index += 1) {
    var existing = appointments[index];

    if (excludeId && existing.id === excludeId) {
      continue;
    }

    if (existing.tenantKey !== tenantKey || existing.clinicianId !== clinicianId) {
      continue;
    }

    if (!isSlotOccupancyStatus(existing.status)) {
      continue;
    }

    var existingWindow = getAppointmentWindowRange(
      existing.appointmentDate,
      existing.durationMinutes
    );
    if (windowsOverlap(candidateWindow, existingWindow)) {
      return {
        appointment: existing,
        candidateWindow: candidateWindow,
        existingWindow: existingWindow,
      };
    }
  }

  return null;
}

function appendStatusHistory(appointment, eventType, actorRole, fromStatus, toStatus, details) {
  if (!Array.isArray(appointment.statusHistory)) {
    appointment.statusHistory = [];
  }

  appointment.statusHistory.push({
    eventId: randomUUID(),
    eventType: eventType,
    actorRole: actorRole,
    fromStatus: fromStatus,
    toStatus: toStatus,
    occurredAt: new Date().toISOString(),
    details: details || {},
  });
}

function findAppointmentByClientRequestId(tenantKey, clientRequestId) {
  if (!clientRequestId) {
    return null;
  }

  var normalizedRequestId = String(clientRequestId).trim();
  for (var index = 0; index < appointments.length; index += 1) {
    var appointment = appointments[index];
    if (
      appointment.tenantKey === tenantKey &&
      appointment.clientRequestId === normalizedRequestId
    ) {
      return appointment;
    }
  }

  return null;
}

function getNotificationDispatchEndpoint() {
  return String(
    process.env.APPOINTMENT_NOTIFICATION_EVENT_ENDPOINT ||
      process.env.APPOINTMENT_NOTIFICATION_ENDPOINT ||
      ""
  ).trim();
}

function getNotificationDispatchMaxAttempts() {
  var parsed = Number(
    process.env.APPOINTMENT_NOTIFICATION_MAX_RETRIES || NOTIFICATION_DISPATCH_MAX_ATTEMPTS
  );
  if (!Number.isFinite(parsed) || parsed < 1) {
    return NOTIFICATION_DISPATCH_MAX_ATTEMPTS;
  }

  return Math.min(6, Math.max(1, Math.floor(parsed)));
}

function getNotificationDispatchTimeoutMs() {
  var parsed = Number(
    process.env.APPOINTMENT_NOTIFICATION_TIMEOUT_MS || NOTIFICATION_DISPATCH_TIMEOUT_MS
  );
  if (!Number.isFinite(parsed) || parsed < 200) {
    return NOTIFICATION_DISPATCH_TIMEOUT_MS;
  }

  return Math.min(10_000, Math.max(200, Math.floor(parsed)));
}

function getNotificationLateThresholdMs() {
  var parsed = Number(
    process.env.APPOINTMENT_NOTIFICATION_LATE_THRESHOLD_MS || NOTIFICATION_LATE_THRESHOLD_MS
  );
  if (!Number.isFinite(parsed) || parsed < 50) {
    return NOTIFICATION_LATE_THRESHOLD_MS;
  }

  return Math.min(24 * 60 * 60 * 1000, Math.max(50, Math.floor(parsed)));
}

function getNotificationDeadLetterMaxEvents() {
  var parsed = Number(
    process.env.APPOINTMENT_NOTIFICATION_DEAD_LETTER_MAX || NOTIFICATION_DEAD_LETTER_MAX_EVENTS
  );
  if (!Number.isFinite(parsed) || parsed < 10) {
    return NOTIFICATION_DEAD_LETTER_MAX_EVENTS;
  }

  return Math.min(5000, Math.max(10, Math.floor(parsed)));
}

function isReminderLifecycleEvent(eventType) {
  var normalized = String(eventType || "")
    .trim()
    .toLowerCase();
  return reminderLifecycleEvents.indexOf(normalized) >= 0;
}

function calculateDispatchLatencyMs(dispatchRecord) {
  if (!dispatchRecord) {
    return null;
  }

  var createdMs = Date.parse(String(dispatchRecord.createdAt || ""));
  var updatedMs = Date.parse(String(dispatchRecord.updatedAt || ""));
  if (!Number.isFinite(createdMs) || !Number.isFinite(updatedMs) || updatedMs < createdMs) {
    return null;
  }

  return updatedMs - createdMs;
}

function isDelayedReminderDispatch(dispatchRecord, lateThresholdMs) {
  if (!dispatchRecord || dispatchRecord.status !== "delivered") {
    return false;
  }

  if (!isReminderLifecycleEvent(dispatchRecord.eventType)) {
    return false;
  }

  var latencyMs = calculateDispatchLatencyMs(dispatchRecord);
  if (!Number.isFinite(latencyMs)) {
    return false;
  }

  return latencyMs > lateThresholdMs;
}

function appendDeadLetterDispatch(dispatchRecord, reason) {
  var deadLetterRecord = Object.assign({}, dispatchRecord, {
    deadLetterId: randomUUID(),
    deadLetterReason: reason || "unspecified",
    deadLetteredAt: new Date().toISOString(),
    latencyMs: calculateDispatchLatencyMs(dispatchRecord),
  });

  notificationDeadLetterEvents.push(deadLetterRecord);

  var maxEvents = getNotificationDeadLetterMaxEvents();
  if (notificationDeadLetterEvents.length > maxEvents) {
    notificationDeadLetterEvents.splice(0, notificationDeadLetterEvents.length - maxEvents);
  }

  return deadLetterRecord;
}

function parseWindowMinutes(value, fallbackMinutes) {
  var parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallbackMinutes;
  }

  return Math.min(7 * 24 * 60, Math.max(1, Math.floor(parsed)));
}

function isWithinWindow(isoDateTime, cutoffMs) {
  var dateMs = Date.parse(String(isoDateTime || ""));
  if (!Number.isFinite(dateMs)) {
    return false;
  }

  return dateMs >= cutoffMs;
}

function buildDispatchTelemetry(dispatchEvents, deadLetterEvents, lateThresholdMs) {
  var counters = {
    totalDispatches: 0,
    delivered: 0,
    failed: 0,
    skipped: 0,
    pending: 0,
    deadLettered: deadLetterEvents.length,
    missedReminders: 0,
    delayedReminders: 0,
  };
  var byEventType = {};

  dispatchEvents.forEach(function (eventItem) {
    var eventType = String(eventItem.eventType || "unknown");
    var status = String(eventItem.status || "pending")
      .trim()
      .toLowerCase();

    counters.totalDispatches += 1;
    if (Object.prototype.hasOwnProperty.call(counters, status)) {
      counters[status] += 1;
    }

    if (!byEventType[eventType]) {
      byEventType[eventType] = {
        totalDispatches: 0,
        delivered: 0,
        failed: 0,
        skipped: 0,
        pending: 0,
        deadLettered: 0,
        missedReminders: 0,
        delayedReminders: 0,
      };
    }

    byEventType[eventType].totalDispatches += 1;
    if (Object.prototype.hasOwnProperty.call(byEventType[eventType], status)) {
      byEventType[eventType][status] += 1;
    }

    if (isReminderLifecycleEvent(eventType) && (status === "failed" || status === "skipped")) {
      counters.missedReminders += 1;
      byEventType[eventType].missedReminders += 1;
    }

    if (isDelayedReminderDispatch(eventItem, lateThresholdMs)) {
      counters.delayedReminders += 1;
      byEventType[eventType].delayedReminders += 1;
    }
  });

  deadLetterEvents.forEach(function (deadLetterItem) {
    var eventType = String(deadLetterItem.eventType || "unknown");
    if (!byEventType[eventType]) {
      byEventType[eventType] = {
        totalDispatches: 0,
        delivered: 0,
        failed: 0,
        skipped: 0,
        pending: 0,
        deadLettered: 0,
        missedReminders: 0,
        delayedReminders: 0,
      };
    }

    byEventType[eventType].deadLettered += 1;
  });

  var deliveryRatePct =
    counters.totalDispatches > 0
      ? Number(((counters.delivered / counters.totalDispatches) * 100).toFixed(2))
      : 0;

  return {
    counters: counters,
    byEventType: byEventType,
    deliveryRatePct: deliveryRatePct,
  };
}

function buildLifecycleCorrelationId(req, payload, appointment, eventType) {
  var requested = String(
    req.headers["x-correlation-id"] || payload.correlationId || payload.clientRequestId || ""
  ).trim();
  if (requested) {
    return [requested, eventType, appointment.id].join(":");
  }

  return [
    "corr",
    appointment.tenantKey || "default",
    appointment.id,
    eventType,
    randomUUID().slice(0, 12),
  ].join("-");
}

function getAppointmentLifecycleMessage(eventType, appointment) {
  var patientRef = appointment.patientId || "patient";
  var dateTime = appointment.appointmentDate || "";

  if (eventType === "appointment.created") {
    return "Appointment created for " + patientRef + " at " + dateTime;
  }

  if (eventType === "appointment.rescheduled") {
    return "Appointment rescheduled for " + patientRef + " to " + dateTime;
  }

  if (eventType === "appointment.cancelled") {
    return "Appointment cancelled for " + patientRef;
  }

  return "Appointment status updated to " + appointment.status + " for " + patientRef;
}

function findProviderByKey(providerList, key) {
  if (!Array.isArray(providerList)) {
    return null;
  }

  for (var index = 0; index < providerList.length; index += 1) {
    if (providerList[index].key === key) {
      return providerList[index];
    }
  }

  return null;
}

function buildCalendarInteroperabilityDiagnostics(tenantConfig) {
  var calendarProviders = Array.isArray(tenantConfig.calendarProviders)
    ? tenantConfig.calendarProviders
    : [];
  var calendarRouting = tenantConfig.calendarRouting || {};
  var defaultProvider = String(calendarRouting.defaultProvider || "").trim();
  var fallbackProviders = Array.isArray(calendarRouting.fallbackProviders)
    ? calendarRouting.fallbackProviders.slice()
    : [];

  var routingOrder = [];
  if (defaultProvider) {
    routingOrder.push(defaultProvider);
  }
  fallbackProviders.forEach(function (providerKey) {
    if (routingOrder.indexOf(providerKey) < 0) {
      routingOrder.push(providerKey);
    }
  });

  var configuredProviders = calendarProviders.map(function (provider) {
    return {
      key: provider.key,
      displayName: provider.displayName || provider.key,
      enabled: Boolean(provider.enabled),
      billingModel:
        provider && provider.billing && provider.billing.model ? provider.billing.model : "free",
      adminActionRequired: Boolean(
        provider && provider.billing && provider.billing.adminActionRequired
      ),
      hasCredentialsRef: Boolean(
        provider && provider.credentialsRef && provider.credentialsRef.secretKey
      ),
    };
  });

  var enabledProviders = configuredProviders.filter(function (provider) {
    return provider.enabled;
  });
  var disabledProviders = configuredProviders.filter(function (provider) {
    return !provider.enabled;
  });

  var unresolvedRoutingProviders = routingOrder.filter(function (providerKey) {
    return !findProviderByKey(configuredProviders, providerKey);
  });
  var disabledRoutingProviders = routingOrder.filter(function (providerKey) {
    var match = findProviderByKey(configuredProviders, providerKey);
    return match && !match.enabled;
  });

  var defaultProviderConfig = findProviderByKey(configuredProviders, defaultProvider);
  var enabledFallbackProviders = fallbackProviders.filter(function (providerKey) {
    var provider = findProviderByKey(configuredProviders, providerKey);
    return provider && provider.enabled;
  });

  var status = "healthy";
  if (!defaultProviderConfig || !defaultProviderConfig.enabled) {
    status = "at-risk";
  } else if (enabledFallbackProviders.length === 0) {
    status = "degraded";
  }

  var interoperability = {
    status: status,
    defaultProviderReady: Boolean(defaultProviderConfig && defaultProviderConfig.enabled),
    fallbackCoverageCount: enabledFallbackProviders.length,
    crossProviderHandoffReady: enabledProviders.length >= 2,
    supportsIcsBridge: enabledProviders.some(function (provider) {
      return provider.key === "ics-calendar";
    }),
    supportsEnterpriseCalendars: enabledProviders.some(function (provider) {
      return (
        provider.key === "google-calendar" ||
        provider.key === "apple-calendar" ||
        provider.key === "outlook-calendar"
      );
    }),
  };

  return {
    routing: {
      defaultProvider: defaultProvider,
      fallbackProviders: fallbackProviders,
      routingOrder: routingOrder,
      unresolvedRoutingProviders: unresolvedRoutingProviders,
      disabledRoutingProviders: disabledRoutingProviders,
    },
    providers: {
      configured: configuredProviders,
      enabled: enabledProviders,
      disabled: disabledProviders,
    },
    interoperability: interoperability,
  };
}

function createNotificationDispatchRecord(eventPayload, endpoint) {
  return {
    dispatchId: randomUUID(),
    endpoint: endpoint || "",
    eventType: eventPayload.eventType,
    tenantKey: eventPayload.tenantKey,
    appointmentId: eventPayload.appointmentId,
    correlationId: eventPayload.correlationId,
    status: "pending",
    attempts: 0,
    responseStatus: null,
    lastError: "",
    latencyMs: null,
    deliveryClass: "pending",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

async function dispatchLifecycleNotificationEvent(eventPayload) {
  var endpoint = getNotificationDispatchEndpoint();
  var dispatchRecord = createNotificationDispatchRecord(eventPayload, endpoint);
  notificationDispatchEvents.push(dispatchRecord);

  if (!endpoint) {
    dispatchRecord.status = "skipped";
    dispatchRecord.lastError = "notification endpoint not configured";
    dispatchRecord.updatedAt = new Date().toISOString();
    dispatchRecord.latencyMs = calculateDispatchLatencyMs(dispatchRecord);
    dispatchRecord.deliveryClass = "missed";
    appendDeadLetterDispatch(dispatchRecord, "endpoint-not-configured");
    return dispatchRecord;
  }

  var maxAttempts = getNotificationDispatchMaxAttempts();
  var timeoutMs = getNotificationDispatchTimeoutMs();
  var lateThresholdMs = getNotificationLateThresholdMs();

  for (var attempt = 1; attempt <= maxAttempts; attempt += 1) {
    dispatchRecord.attempts = attempt;
    dispatchRecord.updatedAt = new Date().toISOString();

    var controller = new AbortController();
    var timeout = setTimeout(function () {
      controller.abort();
    }, timeoutMs);

    try {
      var response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-correlation-id": eventPayload.correlationId,
        },
        body: JSON.stringify(eventPayload),
        signal: controller.signal,
      });

      clearTimeout(timeout);
      dispatchRecord.responseStatus = response.status;

      if (response.ok) {
        var responseBody = await response.json().catch(function () {
          return {};
        });

        dispatchRecord.status = "delivered";
        dispatchRecord.remoteReceiptId = responseBody.receipt ? responseBody.receipt.id : null;
        dispatchRecord.updatedAt = new Date().toISOString();
        dispatchRecord.latencyMs = calculateDispatchLatencyMs(dispatchRecord);
        dispatchRecord.deliveryClass = "on-time";

        if (isDelayedReminderDispatch(dispatchRecord, lateThresholdMs)) {
          dispatchRecord.deliveryClass = "delayed";
          appendDeadLetterDispatch(dispatchRecord, "late-delivery");
        }

        return dispatchRecord;
      }

      dispatchRecord.lastError = "notification endpoint returned status " + response.status;
    } catch (error) {
      clearTimeout(timeout);
      dispatchRecord.lastError =
        error && error.message ? error.message : "notification dispatch error";
    }
  }

  dispatchRecord.status = "failed";
  dispatchRecord.updatedAt = new Date().toISOString();
  dispatchRecord.latencyMs = calculateDispatchLatencyMs(dispatchRecord);
  dispatchRecord.deliveryClass = "missed";
  appendDeadLetterDispatch(dispatchRecord, "retry-exhausted");
  return dispatchRecord;
}

async function emitAppointmentLifecycleEvent(
  req,
  payload,
  appointment,
  actorRole,
  eventType,
  details
) {
  var eventPayload = {
    tenantKey: appointment.tenantKey,
    appointmentId: appointment.id,
    patientId: appointment.patientId,
    clinicianId: appointment.clinicianId,
    appointmentDate: appointment.appointmentDate,
    status: appointment.status,
    actorRole: actorRole,
    sourceService: "appointment-service",
    eventType: eventType,
    correlationId: buildLifecycleCorrelationId(req, payload, appointment, eventType),
    occurredAt: new Date().toISOString(),
    channel: "appointment-lifecycle",
    recipient: appointment.patientId,
    message: getAppointmentLifecycleMessage(eventType, appointment),
    metadata: details || {},
  };

  return dispatchLifecycleNotificationEvent(eventPayload);
}

function getAllowedRoles(actionKey) {
  return appointmentAccessMatrix[actionKey] || [];
}

function requireAccessForAction(req, res, payload, actionKey) {
  var actorRole = getActorRole(req, payload);
  var allowedRoles = getAllowedRoles(actionKey);

  if (!actorRole) {
    res.status(400).json({
      message: "actorRole is required",
      code: "APPOINTMENT_ENTRY_ROLE_REQUIRED",
      details: {
        action: actionKey,
        allowedRoles: allowedRoles,
      },
    });
    return null;
  }

  if (allowedRoles.indexOf(actorRole) === -1) {
    res.status(403).json({
      message: "Appointment entry blocked for role",
      code: "APPOINTMENT_ENTRY_ROLE_BLOCKED",
      details: {
        role: actorRole,
        action: actionKey,
        allowedRoles: allowedRoles,
      },
    });
    return null;
  }

  return {
    actorRole: actorRole,
    allowedRoles: allowedRoles,
  };
}

function validateAppointmentPayload(payload, requireClinician) {
  if (!payload.patientId || !payload.appointmentDate) {
    return "patientId and appointmentDate are required";
  }

  if (requireClinician && !payload.clinicianId) {
    return "clinicianId is required";
  }

  if (!isValidIsoDateTime(payload.appointmentDate)) {
    return "appointmentDate must be a valid ISO date-time";
  }

  if (payload.status && !normalizeAppointmentStatus(payload.status, "")) {
    return "status is unsupported";
  }

  if (payload.durationMinutes !== undefined) {
    var parsedDuration = Number(payload.durationMinutes);
    if (!Number.isFinite(parsedDuration)) {
      return "durationMinutes must be numeric";
    }

    if (parsedDuration < MIN_DURATION_MINUTES || parsedDuration > MAX_DURATION_MINUTES) {
      return "durationMinutes must be between 5 and 240";
    }
  }

  var normalizedStatus = normalizeAppointmentStatus(payload.status || "scheduled", "scheduled");
  if (isSlotOccupancyStatus(normalizedStatus) && !payload.clinicianId) {
    return "clinicianId is required when appointment status occupies schedule slots";
  }

  return "";
}

router.get("/appointments", function (req, res) {
  var tenantKey = String(req.query.tenantKey || "").trim();
  var clinicianId = String(req.query.clinicianId || "").trim();
  var patientId = String(req.query.patientId || "").trim();
  var status = String(req.query.status || "")
    .trim()
    .toLowerCase();

  var filtered = appointments.filter(function (item) {
    if (tenantKey && item.tenantKey !== tenantKey) {
      return false;
    }

    if (clinicianId && item.clinicianId !== clinicianId) {
      return false;
    }

    if (patientId && item.patientId !== patientId) {
      return false;
    }

    if (status && item.status !== status) {
      return false;
    }

    return true;
  });

  res.json(filtered);
});

router.post("/appointments", async function (req, res) {
  var payload = req.body || {};
  var access = requireAccessForAction(req, res, payload, "appointment.create");
  if (!access) {
    return;
  }

  var validationError = validateAppointmentPayload(payload, payload.source !== "opd");
  if (validationError) {
    res.status(400).json({
      message: validationError,
      code: "APPOINTMENT_PAYLOAD_INVALID",
    });
    return;
  }

  var tenantKey = getTenantKey(req, payload);
  var clientRequestId = String(payload.clientRequestId || "").trim();

  if (clientRequestId) {
    var existingForClientRequest = findAppointmentByClientRequestId(tenantKey, clientRequestId);
    if (existingForClientRequest) {
      res.status(200).json(
        Object.assign({}, existingForClientRequest, {
          idempotentReplay: true,
        })
      );
      return;
    }
  }

  if (payload.opdEntryId) {
    var matchingOpdEntry = opdEntries.find(function (entry) {
      return entry.id === payload.opdEntryId;
    });

    if (!matchingOpdEntry) {
      res.status(400).json({
        message: "opdEntryId does not exist",
        code: "OPD_ENTRY_NOT_FOUND",
      });
      return;
    }
  }

  var normalizedStatus = normalizeAppointmentStatus(payload.status || "scheduled", "scheduled");
  var durationMinutes = normalizeDurationMinutes(payload.durationMinutes, 30);
  var conflict = findConflictingAppointment(
    tenantKey,
    payload.clinicianId || "",
    payload.appointmentDate,
    durationMinutes,
    ""
  );

  if (isSlotOccupancyStatus(normalizedStatus) && conflict) {
    res.status(409).json({
      message: "Appointment slot conflict detected",
      code: "APPOINTMENT_SLOT_CONFLICT",
      details: {
        conflictingAppointmentId: conflict.appointment.id,
        clinicianId: conflict.appointment.clinicianId,
        tenantKey: conflict.appointment.tenantKey,
      },
    });
    return;
  }

  if (isSlotOccupancyStatus(normalizedStatus)) {
    var blockedDuringCreate = findClinicianAvailabilityBlockConflict(
      tenantKey,
      payload.clinicianId || "",
      payload.appointmentDate,
      durationMinutes
    );

    if (blockedDuringCreate) {
      res.status(409).json({
        message: "Clinician is unavailable for the requested date-time",
        code: "APPOINTMENT_CLINICIAN_UNAVAILABLE",
        details: {
          availabilityBlockId: blockedDuringCreate.id,
          clinicianId: blockedDuringCreate.clinicianId,
          tenantKey: blockedDuringCreate.tenantKey,
          blockScope: blockedDuringCreate.scope,
          blockDate: blockedDuringCreate.blockDate || null,
          startDateTime: blockedDuringCreate.startDateTime,
          endDateTime: blockedDuringCreate.endDateTime,
          reason: blockedDuringCreate.reason || "",
        },
      });
      return;
    }
  }

  var item = {
    id: payload.id || randomUUID(),
    tenantKey: tenantKey,
    patientId: payload.patientId || "",
    clinicianId: payload.clinicianId || "",
    appointmentDate: payload.appointmentDate || new Date().toISOString(),
    durationMinutes: durationMinutes,
    status: normalizedStatus,
    source: payload.source || "standard",
    opdEntryId: payload.opdEntryId || null,
    createdByRole: access.actorRole,
    updatedByRole: null,
    version: 1,
    clientRequestId: clientRequestId || null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    statusHistory: [],
  };

  appendStatusHistory(item, "appointment.created", access.actorRole, "", item.status, {
    source: item.source,
  });

  appointments.push(item);

  await emitAppointmentLifecycleEvent(req, payload, item, access.actorRole, "appointment.created", {
    source: item.source,
    durationMinutes: item.durationMinutes,
  });

  res.status(201).json(item);
});

router.get("/appointments/:id", function (req, res) {
  var found = appointments.find(function (item) {
    return item.id === req.params.id;
  });
  if (!found) {
    res.status(404).json({ message: "Appointment not found" });
    return;
  }

  res.json(found);
});

router.put("/appointments/:id", async function (req, res) {
  var payload = req.body || {};
  var access = requireAccessForAction(req, res, payload, "appointment.update");
  if (!access) {
    return;
  }

  var index = appointments.findIndex(function (item) {
    return item.id === req.params.id;
  });
  if (index < 0) {
    res.status(404).json({ message: "Appointment not found" });
    return;
  }

  if (payload.appointmentDate && !isValidIsoDateTime(payload.appointmentDate)) {
    res.status(400).json({
      message: "appointmentDate must be a valid ISO date-time",
      code: "APPOINTMENT_PAYLOAD_INVALID",
    });
    return;
  }

  if (payload.status && !normalizeAppointmentStatus(payload.status, "")) {
    res.status(400).json({
      message: "status is unsupported",
      code: "APPOINTMENT_PAYLOAD_INVALID",
    });
    return;
  }

  if (payload.durationMinutes !== undefined) {
    var parsedDuration = Number(payload.durationMinutes);
    if (
      !Number.isFinite(parsedDuration) ||
      parsedDuration < MIN_DURATION_MINUTES ||
      parsedDuration > MAX_DURATION_MINUTES
    ) {
      res.status(400).json({
        message: "durationMinutes must be between 5 and 240",
        code: "APPOINTMENT_PAYLOAD_INVALID",
      });
      return;
    }
  }

  if (payload.expectedVersion !== undefined) {
    var expectedVersion = Number(payload.expectedVersion);
    if (!Number.isInteger(expectedVersion)) {
      res.status(400).json({
        message: "expectedVersion must be an integer",
        code: "APPOINTMENT_PAYLOAD_INVALID",
      });
      return;
    }

    if (expectedVersion !== appointments[index].version) {
      res.status(409).json({
        message: "Appointment version conflict",
        code: "APPOINTMENT_VERSION_CONFLICT",
        details: {
          expectedVersion: expectedVersion,
          currentVersion: appointments[index].version,
        },
      });
      return;
    }
  }

  var currentStatus = appointments[index].status;
  var nextStatus = payload.status
    ? normalizeAppointmentStatus(payload.status, currentStatus)
    : currentStatus;

  if (!nextStatus) {
    res.status(400).json({
      message: "status is unsupported",
      code: "APPOINTMENT_PAYLOAD_INVALID",
    });
    return;
  }

  if (!canTransitionStatus(currentStatus, nextStatus)) {
    res.status(409).json({
      message: "Appointment status transition is not allowed",
      code: "APPOINTMENT_STATUS_TRANSITION_INVALID",
      details: {
        currentStatus: currentStatus,
        requestedStatus: nextStatus,
        allowedTransitions: getAllowedTransitions(currentStatus),
      },
    });
    return;
  }

  var nextClinicianId = payload.clinicianId || appointments[index].clinicianId;
  var nextAppointmentDate = payload.appointmentDate || appointments[index].appointmentDate;
  var nextDurationMinutes =
    payload.durationMinutes !== undefined
      ? normalizeDurationMinutes(payload.durationMinutes, appointments[index].durationMinutes || 30)
      : appointments[index].durationMinutes || 30;

  if (isSlotOccupancyStatus(nextStatus) && !nextClinicianId) {
    res.status(400).json({
      message: "clinicianId is required when appointment status occupies schedule slots",
      code: "APPOINTMENT_PAYLOAD_INVALID",
    });
    return;
  }

  if (isSlotOccupancyStatus(nextStatus)) {
    var conflict = findConflictingAppointment(
      appointments[index].tenantKey,
      nextClinicianId,
      nextAppointmentDate,
      nextDurationMinutes,
      appointments[index].id
    );

    if (conflict) {
      res.status(409).json({
        message: "Appointment slot conflict detected",
        code: "APPOINTMENT_SLOT_CONFLICT",
        details: {
          conflictingAppointmentId: conflict.appointment.id,
          clinicianId: conflict.appointment.clinicianId,
          tenantKey: conflict.appointment.tenantKey,
        },
      });
      return;
    }

    var blockedDuringUpdate = findClinicianAvailabilityBlockConflict(
      appointments[index].tenantKey,
      nextClinicianId,
      nextAppointmentDate,
      nextDurationMinutes
    );

    if (blockedDuringUpdate) {
      res.status(409).json({
        message: "Clinician is unavailable for the requested date-time",
        code: "APPOINTMENT_CLINICIAN_UNAVAILABLE",
        details: {
          availabilityBlockId: blockedDuringUpdate.id,
          clinicianId: blockedDuringUpdate.clinicianId,
          tenantKey: blockedDuringUpdate.tenantKey,
          blockScope: blockedDuringUpdate.scope,
          blockDate: blockedDuringUpdate.blockDate || null,
          startDateTime: blockedDuringUpdate.startDateTime,
          endDateTime: blockedDuringUpdate.endDateTime,
          reason: blockedDuringUpdate.reason || "",
        },
      });
      return;
    }
  }

  var updated = {
    id: appointments[index].id,
    tenantKey: appointments[index].tenantKey,
    patientId: payload.patientId || appointments[index].patientId,
    clinicianId: nextClinicianId,
    appointmentDate: nextAppointmentDate,
    durationMinutes: nextDurationMinutes,
    status: nextStatus,
    source: payload.source || appointments[index].source || "standard",
    opdEntryId: Object.prototype.hasOwnProperty.call(payload, "opdEntryId")
      ? payload.opdEntryId
      : appointments[index].opdEntryId || null,
    createdByRole: appointments[index].createdByRole,
    updatedByRole: access.actorRole,
    version: (appointments[index].version || 1) + 1,
    clientRequestId: appointments[index].clientRequestId || null,
    createdAt: appointments[index].createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    statusHistory: Array.isArray(appointments[index].statusHistory)
      ? appointments[index].statusHistory.slice()
      : [],
  };

  var extraFields = Object.assign({}, appointments[index], payload);
  for (var key in extraFields) {
    if (!Object.prototype.hasOwnProperty.call(updated, key)) {
      updated[key] = extraFields[key];
    }
  }

  if (currentStatus !== nextStatus) {
    appendStatusHistory(
      updated,
      "appointment.status-updated",
      access.actorRole,
      currentStatus,
      nextStatus,
      {
        previousDateTime: appointments[index].appointmentDate,
        nextDateTime: nextAppointmentDate,
      }
    );
  }

  if (
    appointments[index].appointmentDate !== nextAppointmentDate ||
    appointments[index].clinicianId !== nextClinicianId ||
    appointments[index].durationMinutes !== nextDurationMinutes
  ) {
    appendStatusHistory(
      updated,
      "appointment.rescheduled",
      access.actorRole,
      currentStatus,
      nextStatus,
      {
        previousDateTime: appointments[index].appointmentDate,
        nextDateTime: nextAppointmentDate,
        previousClinicianId: appointments[index].clinicianId,
        nextClinicianId: nextClinicianId,
        previousDurationMinutes: appointments[index].durationMinutes || 30,
        nextDurationMinutes: nextDurationMinutes,
      }
    );
  }

  if (currentStatus !== nextStatus) {
    await emitAppointmentLifecycleEvent(
      req,
      payload,
      updated,
      access.actorRole,
      "appointment.status-updated",
      {
        previousStatus: currentStatus,
        nextStatus: nextStatus,
      }
    );
  }

  if (
    appointments[index].appointmentDate !== nextAppointmentDate ||
    appointments[index].clinicianId !== nextClinicianId ||
    appointments[index].durationMinutes !== nextDurationMinutes
  ) {
    await emitAppointmentLifecycleEvent(
      req,
      payload,
      updated,
      access.actorRole,
      "appointment.rescheduled",
      {
        previousDateTime: appointments[index].appointmentDate,
        nextDateTime: nextAppointmentDate,
        previousClinicianId: appointments[index].clinicianId,
        nextClinicianId: nextClinicianId,
        previousDurationMinutes: appointments[index].durationMinutes || 30,
        nextDurationMinutes: nextDurationMinutes,
      }
    );
  }

  appointments[index] = updated;
  res.json(updated);
});

router.delete("/appointments/:id", async function (req, res) {
  var access = requireAccessForAction(req, res, {}, "appointment.cancel");
  if (!access) {
    return;
  }

  var index = appointments.findIndex(function (item) {
    return item.id === req.params.id;
  });
  if (index < 0) {
    res.status(404).json({ message: "Appointment not found" });
    return;
  }

  var currentStatus = appointments[index].status;
  if (currentStatus === "cancelled") {
    res.status(204).send();
    return;
  }

  if (!canTransitionStatus(currentStatus, "cancelled")) {
    res.status(409).json({
      message: "Appointment status transition is not allowed",
      code: "APPOINTMENT_STATUS_TRANSITION_INVALID",
      details: {
        currentStatus: currentStatus,
        requestedStatus: "cancelled",
        allowedTransitions: getAllowedTransitions(currentStatus),
      },
    });
    return;
  }

  appointments[index].status = "cancelled";
  appointments[index].updatedByRole = access.actorRole;
  appointments[index].updatedAt = new Date().toISOString();
  appointments[index].version = (appointments[index].version || 1) + 1;
  appendStatusHistory(
    appointments[index],
    "appointment.cancelled",
    access.actorRole,
    currentStatus,
    "cancelled",
    {}
  );

  await emitAppointmentLifecycleEvent(
    req,
    {},
    appointments[index],
    access.actorRole,
    "appointment.cancelled",
    {
      previousStatus: currentStatus,
      nextStatus: "cancelled",
    }
  );

  res.status(204).send();
});

router.get("/integrations/notifications/dispatch-events", function (req, res) {
  var tenantKey = String(req.query.tenantKey || "").trim();
  var appointmentId = String(req.query.appointmentId || "").trim();
  var eventType = String(req.query.eventType || "")
    .trim()
    .toLowerCase();
  var status = String(req.query.status || "")
    .trim()
    .toLowerCase();
  var correlationId = String(req.query.correlationId || "").trim();

  var filtered = notificationDispatchEvents.filter(function (eventItem) {
    if (tenantKey && eventItem.tenantKey !== tenantKey) {
      return false;
    }

    if (appointmentId && eventItem.appointmentId !== appointmentId) {
      return false;
    }

    if (eventType && String(eventItem.eventType || "").toLowerCase() !== eventType) {
      return false;
    }

    if (status && String(eventItem.status || "").toLowerCase() !== status) {
      return false;
    }

    if (correlationId && eventItem.correlationId !== correlationId) {
      return false;
    }

    return true;
  });

  res.json({
    events: filtered,
    total: filtered.length,
  });
});

router.get("/integrations/notifications/dead-letter", function (req, res) {
  var tenantKey = String(req.query.tenantKey || "").trim();
  var appointmentId = String(req.query.appointmentId || "").trim();
  var eventType = String(req.query.eventType || "")
    .trim()
    .toLowerCase();
  var status = String(req.query.status || "")
    .trim()
    .toLowerCase();
  var correlationId = String(req.query.correlationId || "").trim();
  var reason = String(req.query.reason || "")
    .trim()
    .toLowerCase();
  var limit = Number(req.query.limit || 50);

  var filtered = notificationDeadLetterEvents.filter(function (eventItem) {
    if (tenantKey && eventItem.tenantKey !== tenantKey) {
      return false;
    }

    if (appointmentId && eventItem.appointmentId !== appointmentId) {
      return false;
    }

    if (eventType && String(eventItem.eventType || "").toLowerCase() !== eventType) {
      return false;
    }

    if (status && String(eventItem.status || "").toLowerCase() !== status) {
      return false;
    }

    if (correlationId && eventItem.correlationId !== correlationId) {
      return false;
    }

    if (reason && String(eventItem.deadLetterReason || "").toLowerCase() !== reason) {
      return false;
    }

    return true;
  });

  var boundedLimit = Number.isFinite(limit) ? Math.max(1, Math.min(Math.floor(limit), 200)) : 50;
  var events = filtered.slice(Math.max(0, filtered.length - boundedLimit));

  res.json({
    events: events,
    total: filtered.length,
    returned: events.length,
    limit: boundedLimit,
  });
});

router.get("/integrations/notifications/dispatch-telemetry", function (req, res) {
  var tenantKey = String(req.query.tenantKey || "").trim();
  var eventType = String(req.query.eventType || "")
    .trim()
    .toLowerCase();
  var windowMinutes = parseWindowMinutes(req.query.windowMinutes, 24 * 60);
  var lateThresholdCandidate = Number(req.query.lateThresholdMs);
  var lateThresholdMs = Number.isFinite(lateThresholdCandidate)
    ? Math.max(50, Math.min(Math.floor(lateThresholdCandidate), 24 * 60 * 60 * 1000))
    : getNotificationLateThresholdMs();
  var cutoffMs = Date.now() - windowMinutes * 60 * 1000;

  var dispatchEvents = notificationDispatchEvents.filter(function (eventItem) {
    if (tenantKey && eventItem.tenantKey !== tenantKey) {
      return false;
    }

    if (eventType && String(eventItem.eventType || "").toLowerCase() !== eventType) {
      return false;
    }

    return isWithinWindow(eventItem.createdAt, cutoffMs);
  });

  var deadLetterEvents = notificationDeadLetterEvents.filter(function (eventItem) {
    if (tenantKey && eventItem.tenantKey !== tenantKey) {
      return false;
    }

    if (eventType && String(eventItem.eventType || "").toLowerCase() !== eventType) {
      return false;
    }

    return isWithinWindow(eventItem.deadLetteredAt, cutoffMs);
  });

  var telemetry = buildDispatchTelemetry(dispatchEvents, deadLetterEvents, lateThresholdMs);

  res.json({
    generatedAt: new Date().toISOString(),
    windowMinutes: windowMinutes,
    lateThresholdMs: lateThresholdMs,
    counters: telemetry.counters,
    byEventType: telemetry.byEventType,
    deliveryRatePct: telemetry.deliveryRatePct,
  });
});

router.get("/opd/entries", function (req, res) {
  var tenantKey = String(req.query.tenantKey || "").trim();
  var status = String(req.query.status || "").trim();
  var triageLevel = String(req.query.triageLevel || "")
    .trim()
    .toLowerCase();
  var limit = Number(req.query.limit || 50);
  var boundedLimit = Number.isFinite(limit) ? Math.max(1, Math.min(limit, 200)) : 50;

  var filtered = opdEntries.filter(function (entry) {
    if (tenantKey && entry.tenantKey !== tenantKey) {
      return false;
    }

    if (status && entry.status !== status) {
      return false;
    }

    if (triageLevel && entry.triageLevel !== triageLevel) {
      return false;
    }

    return true;
  });

  var result = filtered.slice(Math.max(0, filtered.length - boundedLimit));

  res.json({
    entries: result,
    total: filtered.length,
    returned: result.length,
    limit: boundedLimit,
  });
});

router.get("/clinicians/:clinicianId/availability/blocks", function (req, res) {
  var tenantKey = String(req.query.tenantKey || "").trim();
  var clinicianId = String(req.params.clinicianId || "").trim();
  var date = String(req.query.date || "").trim();

  if (!tenantKey) {
    res.status(400).json({
      message: "tenantKey is required",
      code: "CLINICIAN_AVAILABILITY_TENANT_REQUIRED",
    });
    return;
  }

  if (!clinicianId) {
    res.status(400).json({
      message: "clinicianId is required",
      code: "CLINICIAN_AVAILABILITY_CLINICIAN_REQUIRED",
    });
    return;
  }

  var filtered = clinicianAvailabilityBlocks.filter(function (block) {
    if (block.tenantKey !== tenantKey || block.clinicianId !== clinicianId) {
      return false;
    }

    if (date && isValidDateToken(date)) {
      var dayToken = toUtcDateToken(block.startDateTime);
      if (dayToken !== date) {
        return false;
      }
    }

    return true;
  });

  filtered.sort(function (left, right) {
    return (
      Date.parse(String(left.startDateTime || "")) - Date.parse(String(right.startDateTime || ""))
    );
  });

  res.json({
    tenantKey: tenantKey,
    clinicianId: clinicianId,
    blocks: filtered,
    total: filtered.length,
  });
});

router.post("/clinicians/:clinicianId/availability/blocks", function (req, res) {
  var payload = req.body || {};
  var access = requireAccessForAction(req, res, payload, "clinician.availability.block");
  if (!access) {
    return;
  }

  var tenantKey = getTenantKey(req, payload);
  var clinicianId = String(req.params.clinicianId || payload.clinicianId || "").trim();
  if (!clinicianId) {
    res.status(400).json({
      message: "clinicianId is required",
      code: "CLINICIAN_AVAILABILITY_CLINICIAN_REQUIRED",
    });
    return;
  }

  var window = resolveAvailabilityWindow(payload);
  if (!window.ok) {
    res.status(400).json({
      message: window.message,
      code: "CLINICIAN_AVAILABILITY_PAYLOAD_INVALID",
    });
    return;
  }

  var reason = String(payload.reason || "").trim();
  var block = {
    id: payload.id || randomUUID(),
    tenantKey: tenantKey,
    clinicianId: clinicianId,
    scope: window.scope,
    blockDate: window.blockDate,
    startDateTime: window.startDateTime,
    endDateTime: window.endDateTime,
    reason: reason,
    createdAt: new Date().toISOString(),
    createdByRole: access.actorRole,
    createdBy: String(payload.createdBy || "").trim() || null,
  };

  clinicianAvailabilityBlocks.push(block);

  res.status(201).json(block);
});

router.delete("/clinicians/:clinicianId/availability/blocks/:blockId", function (req, res) {
  var access = requireAccessForAction(req, res, {}, "clinician.availability.block");
  if (!access) {
    return;
  }

  var tenantKey = String(req.query.tenantKey || "").trim();
  var clinicianId = String(req.params.clinicianId || "").trim();
  var blockId = String(req.params.blockId || "").trim();

  if (!tenantKey) {
    res.status(400).json({
      message: "tenantKey is required",
      code: "CLINICIAN_AVAILABILITY_TENANT_REQUIRED",
    });
    return;
  }

  var index = clinicianAvailabilityBlocks.findIndex(function (block) {
    return (
      block.id === blockId && block.tenantKey === tenantKey && block.clinicianId === clinicianId
    );
  });

  if (index < 0) {
    res.status(404).json({
      message: "Availability block not found",
      code: "CLINICIAN_AVAILABILITY_BLOCK_NOT_FOUND",
    });
    return;
  }

  clinicianAvailabilityBlocks.splice(index, 1);
  res.status(204).send();
});

router.post("/opd/entries", function (req, res) {
  var payload = req.body || {};
  var access = requireAccessForAction(req, res, payload, "opd.entry.create");
  if (!access) {
    return;
  }

  if (!payload.patientId || !payload.visitReason || !payload.requestedDateTime) {
    res.status(400).json({
      message: "patientId, visitReason, and requestedDateTime are required",
      code: "OPD_ENTRY_PAYLOAD_INVALID",
    });
    return;
  }

  if (!isValidIsoDateTime(payload.requestedDateTime)) {
    res.status(400).json({
      message: "requestedDateTime must be a valid ISO date-time",
      code: "OPD_ENTRY_PAYLOAD_INVALID",
    });
    return;
  }

  var tenantKey = getTenantKey(req, payload);
  var entry = {
    id: payload.id || randomUUID(),
    tenantKey: tenantKey,
    patientId: payload.patientId,
    visitReason: payload.visitReason,
    triageLevel: normalizeTriageLevel(payload.triageLevel),
    visitType: normalizeVisitType(payload.visitType),
    requestedDateTime: payload.requestedDateTime,
    status: "intake-recorded",
    notes: payload.notes || "",
    createdAt: new Date().toISOString(),
    createdByRole: access.actorRole,
  };

  opdEntries.push(entry);

  var appointmentDraft = null;
  if (payload.createAppointment === true) {
    var now = new Date().toISOString();
    appointmentDraft = {
      id: randomUUID(),
      tenantKey: tenantKey,
      patientId: payload.patientId,
      clinicianId: payload.clinicianId || "",
      appointmentDate: payload.requestedDateTime,
      durationMinutes: normalizeDurationMinutes(payload.durationMinutes, 30),
      status: "pending-triage",
      source: "opd",
      opdEntryId: entry.id,
      createdByRole: access.actorRole,
      updatedByRole: null,
      version: 1,
      clientRequestId: null,
      createdAt: now,
      updatedAt: now,
      statusHistory: [],
    };

    appendStatusHistory(
      appointmentDraft,
      "appointment.created",
      access.actorRole,
      "",
      "pending-triage",
      {
        source: "opd",
      }
    );

    appointments.push(appointmentDraft);
  }

  res.status(201).json({
    opdEntry: entry,
    appointmentDraft: appointmentDraft,
  });
});

router.get("/integrations/calendars/providers", function (req, res) {
  var tenantKey = req.query.tenantKey || "default";
  var config = loadTenantIntegrationConfig(tenantKey);

  var providers = config.calendarProviders.map(function (provider) {
    return {
      key: provider.key,
      displayName: provider.displayName,
      enabled: provider.enabled,
      billing: provider.billing || {
        model: "free",
        adminActionRequired: false,
      },
    };
  });

  res.json(providers);
});

router.post("/integrations/calendars/test", function (req, res) {
  var payload = req.body || {};
  var tenantKey = payload.tenantKey || "default";
  var config = loadTenantIntegrationConfig(tenantKey);
  var dryRun = true;

  if (typeof payload.dryRun === "string") {
    dryRun = payload.dryRun.toLowerCase() !== "false";
  } else if (payload.dryRun === false) {
    dryRun = false;
  }

  bookAppointmentWithRouting(
    {
      tenantKey: tenantKey,
      appointmentId: payload.appointmentId || randomUUID(),
      clinicianId: payload.clinicianId || "demo-clinician",
      patientId: payload.patientId || "demo-patient",
      startTime: payload.startTime || new Date().toISOString(),
      endTime: payload.endTime || new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      preferredProvider: payload.providerKey,
      credentialsOverride: payload.credentialsOverride || null,
      dryRun: dryRun,
    },
    config
  )
    .then(function (result) {
      res.json(result);
    })
    .catch(function (error) {
      res.status(400).json({
        accepted: false,
        detail: error.message,
      });
    });
});

router.get("/integrations/calendars/interoperability/diagnostics", function (req, res) {
  var tenantKey = req.query.tenantKey || "default";
  var config = loadTenantIntegrationConfig(tenantKey);
  var diagnostics = buildCalendarInteroperabilityDiagnostics(config);

  res.json({
    tenantKey: tenantKey,
    generatedAt: new Date().toISOString(),
    routing: diagnostics.routing,
    providers: diagnostics.providers,
    interoperability: diagnostics.interoperability,
  });
});

module.exports = router;
