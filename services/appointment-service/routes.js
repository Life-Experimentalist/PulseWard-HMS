var express = require("express");
var randomUUID = require("crypto").randomUUID;
var bookAppointmentWithRouting =
  require("./integrations/book-with-provider-routing").bookAppointmentWithRouting;
var loadTenantIntegrationConfig =
  require("../../packages/shared-utils/load-tenant-integration-config").loadTenantIntegrationConfig;

var router = express.Router();
var appointments = [];
var opdEntries = [];

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
};

var MIN_DURATION_MINUTES = 5;
var MAX_DURATION_MINUTES = 240;

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

router.post("/appointments", function (req, res) {
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

router.put("/appointments/:id", function (req, res) {
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

  appointments[index] = updated;
  res.json(updated);
});

router.delete("/appointments/:id", function (req, res) {
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

  res.status(204).send();
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

  bookAppointmentWithRouting(
    {
      tenantKey: tenantKey,
      appointmentId: payload.appointmentId || randomUUID(),
      clinicianId: payload.clinicianId || "demo-clinician",
      patientId: payload.patientId || "demo-patient",
      startTime: payload.startTime || new Date().toISOString(),
      endTime: payload.endTime || new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      preferredProvider: payload.providerKey,
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

module.exports = router;
