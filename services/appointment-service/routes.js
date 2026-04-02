var express = require("express");
var randomUUID = require("crypto").randomUUID;
var bookAppointmentWithRouting =
  require("./integrations/book-with-provider-routing").bookAppointmentWithRouting;
var loadTenantIntegrationConfig =
  require("../../packages/shared-utils/load-tenant-integration-config").loadTenantIntegrationConfig;

var router = express.Router();
var appointments = [];
var opdEntries = [];

var appointmentStatusValues = ["scheduled", "completed", "cancelled", "pending-triage"];
var triageLevels = ["low", "medium", "high", "critical"];
var opdVisitTypes = ["walk-in", "follow-up", "referred"];
var appointmentAccessMatrix = {
  "appointment.create": ["admin", "frontdesk", "doctor", "nurse", "operations", "patient"],
  "appointment.update": ["admin", "frontdesk", "doctor", "nurse", "operations"],
  "appointment.cancel": ["admin", "frontdesk", "operations"],
  "opd.entry.create": ["admin", "frontdesk", "doctor", "nurse"],
};

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
  var normalized = String(value || "medium").trim().toLowerCase();
  if (triageLevels.indexOf(normalized) === -1) {
    return "medium";
  }

  return normalized;
}

function normalizeVisitType(value) {
  var normalized = String(value || "walk-in").trim().toLowerCase();
  if (opdVisitTypes.indexOf(normalized) === -1) {
    return "walk-in";
  }

  return normalized;
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

  if (payload.status && appointmentStatusValues.indexOf(String(payload.status)) === -1) {
    return "status is unsupported";
  }

  return "";
}

router.get("/appointments", function (_req, res) {
  res.json(appointments);
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

  var item = {
    id: payload.id || randomUUID(),
    tenantKey: tenantKey,
    patientId: payload.patientId || "",
    clinicianId: payload.clinicianId || "",
    appointmentDate: payload.appointmentDate || new Date().toISOString(),
    status: payload.status || "scheduled",
    source: payload.source || "standard",
    opdEntryId: payload.opdEntryId || null,
    createdByRole: access.actorRole,
  };

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

  if (payload.status && appointmentStatusValues.indexOf(String(payload.status)) === -1) {
    res.status(400).json({
      message: "status is unsupported",
      code: "APPOINTMENT_PAYLOAD_INVALID",
    });
    return;
  }

  var updated = {
    id: appointments[index].id,
    tenantKey: appointments[index].tenantKey,
    patientId: payload.patientId || appointments[index].patientId,
    clinicianId: payload.clinicianId || appointments[index].clinicianId,
    appointmentDate: payload.appointmentDate || appointments[index].appointmentDate,
    status: payload.status || appointments[index].status,
    source: payload.source || appointments[index].source || "standard",
    opdEntryId:
      Object.prototype.hasOwnProperty.call(payload, "opdEntryId")
        ? payload.opdEntryId
        : appointments[index].opdEntryId || null,
    createdByRole: appointments[index].createdByRole,
    updatedByRole: access.actorRole,
  };

  var extraFields = Object.assign({}, appointments[index], payload);
  for (var key in extraFields) {
    if (!Object.prototype.hasOwnProperty.call(updated, key)) {
      updated[key] = extraFields[key];
    }
  }

  appointments[index] = updated;
  res.json(updated);
});

router.delete("/appointments/:id", function (req, res) {
  if (!requireAccessForAction(req, res, {}, "appointment.cancel")) {
    return;
  }

  var index = appointments.findIndex(function (item) {
    return item.id === req.params.id;
  });
  if (index < 0) {
    res.status(404).json({ message: "Appointment not found" });
    return;
  }

  appointments.splice(index, 1);
  res.status(204).send();
});

router.get("/opd/entries", function (req, res) {
  var tenantKey = String(req.query.tenantKey || "").trim();
  var status = String(req.query.status || "").trim();
  var triageLevel = String(req.query.triageLevel || "").trim().toLowerCase();
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
    appointmentDraft = {
      id: randomUUID(),
      tenantKey: tenantKey,
      patientId: payload.patientId,
      clinicianId: payload.clinicianId || "",
      appointmentDate: payload.requestedDateTime,
      status: "pending-triage",
      source: "opd",
      opdEntryId: entry.id,
      createdByRole: access.actorRole,
    };

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
