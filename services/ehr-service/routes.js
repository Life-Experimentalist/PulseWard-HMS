var express = require("express");
var randomUUID = require("crypto").randomUUID;

var router = express.Router();

var recordsById = new Map();
var timelineByRecordId = new Map();
var prescriptionsByRecordId = new Map();

var updatableFields = [
  "clinicalSummary",
  "diagnosis",
  "notes",
  "medications",
  "allergies",
  "attachments",
  "encounterAt",
  "clinicianId",
  "encounterType",
];

function normalizeRole(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function getActorRole(req, payload) {
  var headerRole = req.headers["x-actor-role"];
  return normalizeRole(headerRole || payload.actorRole || "");
}

function isValidIsoDateTime(value) {
  if (!value) {
    return false;
  }

  return Number.isFinite(Date.parse(String(value)));
}

function cloneRecord(record) {
  return {
    id: record.id,
    tenantKey: record.tenantKey,
    patientId: record.patientId,
    clinicianId: record.clinicianId,
    encounterType: record.encounterType,
    encounterAt: record.encounterAt,
    clinicalSummary: record.clinicalSummary,
    diagnosis: record.diagnosis,
    notes: record.notes,
    medications: record.medications,
    allergies: record.allergies,
    attachments: record.attachments,
    status: record.status,
    version: record.version,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    deletedAt: record.deletedAt || null,
    createdByRole: record.createdByRole,
    updatedByRole: record.updatedByRole || null,
  };
}

function getTimeline(recordId) {
  return timelineByRecordId.get(recordId) || [];
}

function appendTimelineEvent(recordId, eventType, actorRole, details) {
  var currentTimeline = getTimeline(recordId);
  var nextEvent = {
    eventId: randomUUID(),
    sequence: currentTimeline.length + 1,
    eventType: eventType,
    actorRole: actorRole,
    occurredAt: new Date().toISOString(),
    details: details || {},
  };

  currentTimeline.push(nextEvent);
  timelineByRecordId.set(recordId, currentTimeline);

  return nextEvent;
}

function computeChangedFields(previousRecord, nextRecord) {
  var changes = [];
  for (var index = 0; index < updatableFields.length; index += 1) {
    var field = updatableFields[index];
    var previousValue = JSON.stringify(previousRecord[field] || null);
    var nextValue = JSON.stringify(nextRecord[field] || null);
    if (previousValue !== nextValue) {
      changes.push(field);
    }
  }

  return changes;
}

function requireActorRole(req, res, payload, action) {
  var actorRole = getActorRole(req, payload);
  if (!actorRole) {
    res.status(400).json({
      message: "actorRole is required",
      code: "EHR_ACTOR_ROLE_REQUIRED",
      details: {
        action: action,
      },
    });
    return "";
  }

  return actorRole;
}

function getRecord(recordId) {
  return recordsById.get(recordId) || null;
}

function getPrescriptionList(recordId) {
  return prescriptionsByRecordId.get(recordId) || [];
}

function savePrescriptionList(recordId, list) {
  prescriptionsByRecordId.set(recordId, list);
}

function getPrescriptionById(recordId, prescriptionId) {
  var list = getPrescriptionList(recordId);
  for (var index = 0; index < list.length; index += 1) {
    if (list[index].id === prescriptionId) {
      return { list: list, item: list[index], index: index };
    }
  }

  return { list: list, item: null, index: -1 };
}

router.get("/records", function (req, res) {
  var patientId = String(req.query.patientId || "").trim();
  var tenantKey = String(req.query.tenantKey || "").trim();
  var includeDeleted = String(req.query.includeDeleted || "false").trim() === "true";
  var limit = Number(req.query.limit || 50);
  var boundedLimit = Number.isFinite(limit) ? Math.max(1, Math.min(limit, 200)) : 50;

  var list = [];
  recordsById.forEach(function (record) {
    if (!includeDeleted && record.status === "deleted") {
      return;
    }

    if (patientId && record.patientId !== patientId) {
      return;
    }

    if (tenantKey && record.tenantKey !== tenantKey) {
      return;
    }

    list.push(cloneRecord(record));
  });

  list.sort(function (left, right) {
    return String(left.updatedAt || "").localeCompare(String(right.updatedAt || ""));
  });

  var result = list.slice(Math.max(0, list.length - boundedLimit));
  res.json({
    records: result,
    total: list.length,
    returned: result.length,
    limit: boundedLimit,
  });
});

router.post("/records", function (req, res) {
  var payload = req.body || {};
  var actorRole = requireActorRole(req, res, payload, "ehr.record.create");
  if (!actorRole) {
    return;
  }

  if (!payload.patientId || !payload.clinicalSummary || !payload.encounterAt) {
    res.status(400).json({
      message: "patientId, clinicalSummary, and encounterAt are required",
      code: "EHR_RECORD_PAYLOAD_INVALID",
    });
    return;
  }

  if (!isValidIsoDateTime(payload.encounterAt)) {
    res.status(400).json({
      message: "encounterAt must be a valid ISO date-time",
      code: "EHR_RECORD_PAYLOAD_INVALID",
    });
    return;
  }

  var recordId = payload.id || randomUUID();
  if (recordsById.has(recordId)) {
    res.status(409).json({
      message: "Record id already exists",
      code: "EHR_RECORD_ID_CONFLICT",
      details: {
        recordId: recordId,
      },
    });
    return;
  }

  var now = new Date().toISOString();
  var record = {
    id: recordId,
    tenantKey: String(payload.tenantKey || "default").trim() || "default",
    patientId: payload.patientId,
    clinicianId: payload.clinicianId || "",
    encounterType: payload.encounterType || "opd",
    encounterAt: payload.encounterAt,
    clinicalSummary: payload.clinicalSummary,
    diagnosis: payload.diagnosis || "",
    notes: payload.notes || "",
    medications: Array.isArray(payload.medications) ? payload.medications : [],
    allergies: Array.isArray(payload.allergies) ? payload.allergies : [],
    attachments: Array.isArray(payload.attachments) ? payload.attachments : [],
    status: "active",
    version: 1,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    createdByRole: actorRole,
    updatedByRole: actorRole,
  };

  recordsById.set(recordId, record);
  appendTimelineEvent(recordId, "ehr.record.created", actorRole, {
    version: record.version,
    patientId: record.patientId,
  });

  res.status(201).json(cloneRecord(record));
});

router.get("/records/:id", function (req, res) {
  var record = getRecord(req.params.id);
  if (!record) {
    res.status(404).json({
      message: "Record not found",
      code: "EHR_RECORD_NOT_FOUND",
    });
    return;
  }

  var includeDeleted = String(req.query.includeDeleted || "false").trim() === "true";
  if (!includeDeleted && record.status === "deleted") {
    res.status(404).json({
      message: "Record is deleted",
      code: "EHR_RECORD_DELETED",
      details: {
        recordId: record.id,
      },
    });
    return;
  }

  res.json(cloneRecord(record));
});

router.put("/records/:id", function (req, res) {
  var payload = req.body || {};
  var actorRole = requireActorRole(req, res, payload, "ehr.record.update");
  if (!actorRole) {
    return;
  }

  var record = getRecord(req.params.id);
  if (!record) {
    res.status(404).json({
      message: "Record not found",
      code: "EHR_RECORD_NOT_FOUND",
    });
    return;
  }

  if (record.status === "deleted") {
    res.status(409).json({
      message: "Deleted records cannot be updated",
      code: "EHR_RECORD_DELETED",
      details: {
        recordId: record.id,
      },
    });
    return;
  }

  var expectedVersion = Number(payload.expectedVersion);
  if (payload.expectedVersion !== undefined && expectedVersion !== record.version) {
    res.status(409).json({
      message: "Record version conflict",
      code: "EHR_RECORD_VERSION_CONFLICT",
      details: {
        recordId: record.id,
        expectedVersion: expectedVersion,
        currentVersion: record.version,
      },
    });
    return;
  }

  if (payload.encounterAt && !isValidIsoDateTime(payload.encounterAt)) {
    res.status(400).json({
      message: "encounterAt must be a valid ISO date-time",
      code: "EHR_RECORD_PAYLOAD_INVALID",
    });
    return;
  }

  var next = Object.assign({}, record);
  for (var index = 0; index < updatableFields.length; index += 1) {
    var field = updatableFields[index];
    if (Object.prototype.hasOwnProperty.call(payload, field)) {
      next[field] = payload[field];
    }
  }

  var changedFields = computeChangedFields(record, next);
  if (changedFields.length === 0) {
    res.status(400).json({
      message: "No updatable fields provided",
      code: "EHR_RECORD_PATCH_EMPTY",
      details: {
        updatableFields: updatableFields,
      },
    });
    return;
  }

  next.version = record.version + 1;
  next.updatedAt = new Date().toISOString();
  next.updatedByRole = actorRole;
  recordsById.set(record.id, next);

  appendTimelineEvent(record.id, "ehr.record.updated", actorRole, {
    previousVersion: record.version,
    nextVersion: next.version,
    changedFields: changedFields,
  });

  res.json(cloneRecord(next));
});

router.delete("/records/:id", function (req, res) {
  var payload = req.body || {};
  var actorRole = requireActorRole(req, res, payload, "ehr.record.delete");
  if (!actorRole) {
    return;
  }

  var record = getRecord(req.params.id);
  if (!record) {
    res.status(404).json({
      message: "Record not found",
      code: "EHR_RECORD_NOT_FOUND",
    });
    return;
  }

  if (record.status !== "deleted") {
    record.status = "deleted";
    record.version += 1;
    record.deletedAt = new Date().toISOString();
    record.updatedAt = record.deletedAt;
    record.updatedByRole = actorRole;
    recordsById.set(record.id, record);

    appendTimelineEvent(record.id, "ehr.record.deleted", actorRole, {
      version: record.version,
    });
  }

  res.status(204).send();
});

router.get("/records/:id/timeline", function (req, res) {
  var record = getRecord(req.params.id);
  if (!record) {
    res.status(404).json({
      message: "Record not found",
      code: "EHR_RECORD_NOT_FOUND",
    });
    return;
  }

  var events = getTimeline(record.id);
  res.json({
    recordId: record.id,
    totalEvents: events.length,
    events: events,
  });
});

router.get("/records/:id/prescriptions", function (req, res) {
  var record = getRecord(req.params.id);
  if (!record) {
    res.status(404).json({
      message: "Record not found",
      code: "EHR_RECORD_NOT_FOUND",
    });
    return;
  }

  var list = getPrescriptionList(record.id);
  res.json({
    recordId: record.id,
    total: list.length,
    prescriptions: list,
  });
});

router.post("/records/:id/prescriptions", function (req, res) {
  var payload = req.body || {};
  var actorRole = requireActorRole(req, res, payload, "ehr.prescription.create");
  if (!actorRole) {
    return;
  }

  var record = getRecord(req.params.id);
  if (!record) {
    res.status(404).json({
      message: "Record not found",
      code: "EHR_RECORD_NOT_FOUND",
    });
    return;
  }

  if (!payload.medicationName || !payload.dosage || !payload.frequency || !payload.durationDays) {
    res.status(400).json({
      message: "medicationName, dosage, frequency, and durationDays are required",
      code: "EHR_PRESCRIPTION_PAYLOAD_INVALID",
    });
    return;
  }

  var now = new Date().toISOString();
  var prescription = {
    id: payload.id || randomUUID(),
    recordId: record.id,
    tenantKey: record.tenantKey,
    patientId: record.patientId,
    clinicianId: payload.clinicianId || record.clinicianId || "",
    medicationName: payload.medicationName,
    dosage: payload.dosage,
    frequency: payload.frequency,
    durationDays: Number(payload.durationDays),
    notes: payload.notes || "",
    status: "drafted",
    handoff: {
      sent: false,
      target: null,
      referenceId: null,
      sentAt: null,
    },
    createdAt: now,
    updatedAt: now,
    createdByRole: actorRole,
    updatedByRole: actorRole,
  };

  var list = getPrescriptionList(record.id);
  list.push(prescription);
  savePrescriptionList(record.id, list);

  appendTimelineEvent(record.id, "ehr.prescription.created", actorRole, {
    prescriptionId: prescription.id,
    status: prescription.status,
    medicationName: prescription.medicationName,
  });

  res.status(201).json(prescription);
});

router.post("/records/:id/prescriptions/:prescriptionId/handoff", function (req, res) {
  var payload = req.body || {};
  var actorRole = requireActorRole(req, res, payload, "ehr.prescription.handoff");
  if (!actorRole) {
    return;
  }

  var record = getRecord(req.params.id);
  if (!record) {
    res.status(404).json({
      message: "Record not found",
      code: "EHR_RECORD_NOT_FOUND",
    });
    return;
  }

  var lookup = getPrescriptionById(record.id, req.params.prescriptionId);
  if (!lookup.item) {
    res.status(404).json({
      message: "Prescription not found",
      code: "EHR_PRESCRIPTION_NOT_FOUND",
      details: {
        prescriptionId: req.params.prescriptionId,
      },
    });
    return;
  }

  var target = payload.target || "pharmacy-service";
  var referenceId = payload.referenceId || randomUUID();
  lookup.item.status = "handed-off";
  lookup.item.handoff = {
    sent: true,
    target: target,
    referenceId: referenceId,
    sentAt: new Date().toISOString(),
  };
  lookup.item.updatedAt = lookup.item.handoff.sentAt;
  lookup.item.updatedByRole = actorRole;
  lookup.list[lookup.index] = lookup.item;
  savePrescriptionList(record.id, lookup.list);

  appendTimelineEvent(record.id, "ehr.prescription.handoff", actorRole, {
    prescriptionId: lookup.item.id,
    target: target,
    referenceId: referenceId,
  });

  res.json({
    prescription: lookup.item,
    handoffTouchpoint: {
      endpoint: "/api/pharmacy/prescriptions/handoff",
      referenceId: referenceId,
      target: target,
    },
  });
});

router.patch("/records/:id/prescriptions/:prescriptionId/status", function (req, res) {
  var payload = req.body || {};
  var actorRole = requireActorRole(req, res, payload, "ehr.prescription.status");
  if (!actorRole) {
    return;
  }

  var record = getRecord(req.params.id);
  if (!record) {
    res.status(404).json({
      message: "Record not found",
      code: "EHR_RECORD_NOT_FOUND",
    });
    return;
  }

  var status = String(payload.status || "").trim().toLowerCase();
  var allowedStatuses = [
    "drafted",
    "handed-off",
    "accepted",
    "dispensing",
    "fulfilled",
    "cancelled",
    "rejected",
  ];
  if (!status || allowedStatuses.indexOf(status) === -1) {
    res.status(400).json({
      message: "status is invalid",
      code: "EHR_PRESCRIPTION_STATUS_INVALID",
      details: {
        allowedStatuses: allowedStatuses,
      },
    });
    return;
  }

  var lookup = getPrescriptionById(record.id, req.params.prescriptionId);
  if (!lookup.item) {
    res.status(404).json({
      message: "Prescription not found",
      code: "EHR_PRESCRIPTION_NOT_FOUND",
      details: {
        prescriptionId: req.params.prescriptionId,
      },
    });
    return;
  }

  lookup.item.status = status;
  lookup.item.updatedAt = new Date().toISOString();
  lookup.item.updatedByRole = actorRole;
  lookup.list[lookup.index] = lookup.item;
  savePrescriptionList(record.id, lookup.list);

  appendTimelineEvent(record.id, "ehr.prescription.status-updated", actorRole, {
    prescriptionId: lookup.item.id,
    status: status,
  });

  res.json(lookup.item);
});

module.exports = router;