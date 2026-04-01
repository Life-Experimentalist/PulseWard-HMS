var express = require("express");
var randomUUID = require("crypto").randomUUID;
var bookAppointmentWithRouting =
  require("./integrations/book-with-provider-routing").bookAppointmentWithRouting;
var loadTenantIntegrationConfig =
  require("../../packages/shared-utils/load-tenant-integration-config").loadTenantIntegrationConfig;

var router = express.Router();
var appointments = [];

router.get("/appointments", function (_req, res) {
  res.json(appointments);
});

router.post("/appointments", function (req, res) {
  var payload = req.body || {};
  var item = {
    id: payload.id || randomUUID(),
    patientId: payload.patientId || "",
    clinicianId: payload.clinicianId || "",
    appointmentDate: payload.appointmentDate || new Date().toISOString(),
    status: payload.status || "scheduled",
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
  var index = appointments.findIndex(function (item) {
    return item.id === req.params.id;
  });
  if (index < 0) {
    res.status(404).json({ message: "Appointment not found" });
    return;
  }

  var updated = {
    id: appointments[index].id,
    patientId: req.body.patientId || appointments[index].patientId,
    clinicianId: req.body.clinicianId || appointments[index].clinicianId,
    appointmentDate: req.body.appointmentDate || appointments[index].appointmentDate,
    status: req.body.status || appointments[index].status,
  };

  var extraFields = Object.assign({}, appointments[index], req.body);
  for (var key in extraFields) {
    if (!Object.prototype.hasOwnProperty.call(updated, key)) {
      updated[key] = extraFields[key];
    }
  }

  appointments[index] = updated;
  res.json(updated);
});

router.delete("/appointments/:id", function (req, res) {
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
