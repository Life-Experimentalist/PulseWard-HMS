var express = require("express");
var randomUUID = require("crypto").randomUUID;

var router = express.Router();

var testCatalog = [];
var labOrders = [];

var allowedPriorities = ["routine", "urgent", "stat"];
var allowedStatuses = [
  "ordered",
  "sample-collected",
  "processing",
  "result-ready",
  "reported",
  "cancelled",
];

function normalizeRole(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function getActorRole(req, payload) {
  return normalizeRole(req.headers["x-actor-role"] || payload.actorRole || "");
}

function isValidIsoDateTime(value) {
  if (!value) {
    return false;
  }

  return Number.isFinite(Date.parse(String(value)));
}

function findOrder(orderId) {
  for (var index = 0; index < labOrders.length; index += 1) {
    if (labOrders[index].id === orderId) {
      return {
        index: index,
        order: labOrders[index],
      };
    }
  }

  return {
    index: -1,
    order: null,
  };
}

function appendHistory(order, eventType, actorRole, details) {
  var event = {
    eventId: randomUUID(),
    eventType: eventType,
    actorRole: actorRole,
    occurredAt: new Date().toISOString(),
    details: details || {},
  };

  order.history.push(event);
  return event;
}

function appendClinicalTrigger(order, triggerType, targetService, details) {
  var trigger = {
    triggerId: randomUUID(),
    triggerType: triggerType,
    targetService: targetService,
    status: "queued",
    correlationId: randomUUID(),
    createdAt: new Date().toISOString(),
    details: details || {},
  };

  order.clinicalTriggers.push(trigger);
  return trigger;
}

function requireActorRole(req, res, payload, action) {
  var actorRole = getActorRole(req, payload);
  if (!actorRole) {
    res.status(400).json({
      message: "actorRole is required",
      code: "LAB_ACTOR_ROLE_REQUIRED",
      details: {
        action: action,
      },
    });
    return "";
  }

  return actorRole;
}

router.get("/lab-tests", function (_req, res) {
  res.json(testCatalog);
});

router.post("/lab-tests", function (req, res) {
  var payload = req.body || {};
  if (!payload.name || !payload.description || payload.price === undefined) {
    res.status(400).json({
      message: "name, description, and price are required",
      code: "LAB_TEST_PAYLOAD_INVALID",
    });
    return;
  }

  var item = {
    id: payload.id || randomUUID(),
    code: payload.code || "lab-" + String(testCatalog.length + 1).padStart(3, "0"),
    name: payload.name,
    description: payload.description,
    price: Number(payload.price),
    turnaroundHours: Number(payload.turnaroundHours || 24),
  };

  testCatalog.push(item);
  res.status(201).json(item);
});

router.put("/lab-tests/:id", function (req, res) {
  var index = testCatalog.findIndex(function (item) {
    return item.id === req.params.id;
  });
  if (index < 0) {
    res.status(404).json({
      message: "Lab test not found",
      code: "LAB_TEST_NOT_FOUND",
    });
    return;
  }

  var payload = req.body || {};
  var current = testCatalog[index];
  testCatalog[index] = {
    id: current.id,
    code: payload.code || current.code,
    name: payload.name || current.name,
    description: payload.description || current.description,
    price: payload.price !== undefined ? Number(payload.price) : current.price,
    turnaroundHours:
      payload.turnaroundHours !== undefined
        ? Number(payload.turnaroundHours)
        : current.turnaroundHours,
  };

  res.json(testCatalog[index]);
});

router.delete("/lab-tests/:id", function (req, res) {
  var index = testCatalog.findIndex(function (item) {
    return item.id === req.params.id;
  });
  if (index < 0) {
    res.status(404).json({
      message: "Lab test not found",
      code: "LAB_TEST_NOT_FOUND",
    });
    return;
  }

  testCatalog.splice(index, 1);
  res.status(204).send();
});

router.get("/lab-tests/orders", function (req, res) {
  var tenantKey = String(req.query.tenantKey || "").trim();
  var patientId = String(req.query.patientId || "").trim();
  var status = String(req.query.status || "").trim().toLowerCase();

  var filtered = labOrders.filter(function (order) {
    if (tenantKey && order.tenantKey !== tenantKey) {
      return false;
    }

    if (patientId && order.patientId !== patientId) {
      return false;
    }

    if (status && order.status !== status) {
      return false;
    }

    return true;
  });

  res.json({
    orders: filtered,
    total: filtered.length,
  });
});

router.post("/lab-tests/orders", function (req, res) {
  var payload = req.body || {};
  var actorRole = requireActorRole(req, res, payload, "lab.order.create");
  if (!actorRole) {
    return;
  }

  if (!payload.patientId || !payload.testCode || !payload.orderedAt || !payload.requestedByClinicianId) {
    res.status(400).json({
      message: "patientId, testCode, orderedAt, and requestedByClinicianId are required",
      code: "LAB_ORDER_PAYLOAD_INVALID",
    });
    return;
  }

  if (!isValidIsoDateTime(payload.orderedAt)) {
    res.status(400).json({
      message: "orderedAt must be a valid ISO date-time",
      code: "LAB_ORDER_PAYLOAD_INVALID",
    });
    return;
  }

  var priority = String(payload.priority || "routine").trim().toLowerCase();
  if (allowedPriorities.indexOf(priority) === -1) {
    res.status(400).json({
      message: "priority is invalid",
      code: "LAB_ORDER_PAYLOAD_INVALID",
      details: {
        allowedPriorities: allowedPriorities,
      },
    });
    return;
  }

  var now = new Date().toISOString();
  var order = {
    id: payload.id || randomUUID(),
    tenantKey: String(payload.tenantKey || "default").trim() || "default",
    patientId: payload.patientId,
    ehrRecordId: payload.ehrRecordId || "",
    testCode: payload.testCode,
    requestedByClinicianId: payload.requestedByClinicianId,
    priority: priority,
    status: "ordered",
    orderedAt: payload.orderedAt,
    result: null,
    history: [],
    clinicalTriggers: [],
    createdAt: now,
    updatedAt: now,
  };

  appendHistory(order, "lab.order.created", actorRole, {
    status: order.status,
    testCode: order.testCode,
  });

  appendClinicalTrigger(order, "clinical.lab.order.created", "ehr-service", {
    ehrRecordId: order.ehrRecordId,
    orderId: order.id,
  });

  labOrders.push(order);
  res.status(201).json(order);
});

router.get("/lab-tests/orders/:id", function (req, res) {
  var lookup = findOrder(req.params.id);
  if (!lookup.order) {
    res.status(404).json({
      message: "Lab order not found",
      code: "LAB_ORDER_NOT_FOUND",
    });
    return;
  }

  res.json(lookup.order);
});

router.put("/lab-tests/orders/:id/status", function (req, res) {
  var payload = req.body || {};
  var actorRole = requireActorRole(req, res, payload, "lab.order.status");
  if (!actorRole) {
    return;
  }

  var nextStatus = String(payload.status || "").trim().toLowerCase();
  if (!nextStatus || allowedStatuses.indexOf(nextStatus) === -1) {
    res.status(400).json({
      message: "status is invalid",
      code: "LAB_ORDER_STATUS_INVALID",
      details: {
        allowedStatuses: allowedStatuses,
      },
    });
    return;
  }

  var lookup = findOrder(req.params.id);
  if (!lookup.order) {
    res.status(404).json({
      message: "Lab order not found",
      code: "LAB_ORDER_NOT_FOUND",
    });
    return;
  }

  if (lookup.order.status === "reported" && nextStatus !== "reported") {
    res.status(400).json({
      message: "Reported orders cannot transition to another status",
      code: "LAB_ORDER_STATUS_INVALID",
    });
    return;
  }

  lookup.order.status = nextStatus;
  lookup.order.updatedAt = new Date().toISOString();

  appendHistory(lookup.order, "lab.order.status-updated", actorRole, {
    status: nextStatus,
  });

  if (nextStatus === "result-ready") {
    appendClinicalTrigger(lookup.order, "clinical.lab.result.ready", "ehr-service", {
      ehrRecordId: lookup.order.ehrRecordId,
      orderId: lookup.order.id,
    });
  }

  labOrders[lookup.index] = lookup.order;
  res.json(lookup.order);
});

router.post("/lab-tests/orders/:id/result", function (req, res) {
  var payload = req.body || {};
  var actorRole = requireActorRole(req, res, payload, "lab.order.result");
  if (!actorRole) {
    return;
  }

  var lookup = findOrder(req.params.id);
  if (!lookup.order) {
    res.status(404).json({
      message: "Lab order not found",
      code: "LAB_ORDER_NOT_FOUND",
    });
    return;
  }

  if (!payload.summary || !payload.observedAt || !isValidIsoDateTime(payload.observedAt)) {
    res.status(400).json({
      message: "summary and valid observedAt are required",
      code: "LAB_RESULT_PAYLOAD_INVALID",
    });
    return;
  }

  lookup.order.result = {
    summary: payload.summary,
    values: payload.values || {},
    observedAt: payload.observedAt,
    reportedBy: payload.reportedBy || actorRole,
    attachments: Array.isArray(payload.attachments) ? payload.attachments : [],
  };
  lookup.order.status = "result-ready";
  lookup.order.updatedAt = new Date().toISOString();

  appendHistory(lookup.order, "lab.result.recorded", actorRole, {
    status: lookup.order.status,
  });

  appendClinicalTrigger(lookup.order, "clinical.lab.result.ready", "ehr-service", {
    ehrRecordId: lookup.order.ehrRecordId,
    orderId: lookup.order.id,
  });

  labOrders[lookup.index] = lookup.order;
  res.json(lookup.order);
});

router.post("/lab-tests/orders/:id/report", function (req, res) {
  var payload = req.body || {};
  var actorRole = requireActorRole(req, res, payload, "lab.order.report");
  if (!actorRole) {
    return;
  }

  var lookup = findOrder(req.params.id);
  if (!lookup.order) {
    res.status(404).json({
      message: "Lab order not found",
      code: "LAB_ORDER_NOT_FOUND",
    });
    return;
  }

  if (!lookup.order.result) {
    res.status(400).json({
      message: "Cannot report result before result payload is recorded",
      code: "LAB_RESULT_MISSING",
    });
    return;
  }

  lookup.order.status = "reported";
  lookup.order.updatedAt = new Date().toISOString();

  appendHistory(lookup.order, "lab.result.reported", actorRole, {
    status: lookup.order.status,
  });

  appendClinicalTrigger(lookup.order, "clinical.lab.result.reported", "ehr-service", {
    ehrRecordId: lookup.order.ehrRecordId,
    orderId: lookup.order.id,
  });

  appendClinicalTrigger(lookup.order, "clinical.lab.result.reported", "billing-service", {
    tenantKey: lookup.order.tenantKey,
    orderId: lookup.order.id,
    testCode: lookup.order.testCode,
  });

  labOrders[lookup.index] = lookup.order;
  res.json(lookup.order);
});

router.get("/lab-tests/orders/:id/triggers", function (req, res) {
  var lookup = findOrder(req.params.id);
  if (!lookup.order) {
    res.status(404).json({
      message: "Lab order not found",
      code: "LAB_ORDER_NOT_FOUND",
    });
    return;
  }

  res.json({
    orderId: lookup.order.id,
    total: lookup.order.clinicalTriggers.length,
    triggers: lookup.order.clinicalTriggers,
  });
});

module.exports = router;
