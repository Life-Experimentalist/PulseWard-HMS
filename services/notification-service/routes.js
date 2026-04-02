var express = require("express");
var randomUUID = require("crypto").randomUUID;
var sendNotificationWithRouting =
  require("./integrations/send-notification-with-routing").sendNotificationWithRouting;
var loadTenantIntegrationConfig =
  require("../../packages/shared-utils/load-tenant-integration-config").loadTenantIntegrationConfig;
var resolveSecretRef =
  require("../../packages/shared-utils/resolve-secret-ref").resolveSecretRef;

var router = express.Router();
var notifications = [];
var appointmentEventReceipts = [];

var supportedAppointmentEventTypes = [
  "appointment.created",
  "appointment.status-updated",
  "appointment.rescheduled",
  "appointment.cancelled",
];

function findMessagingProvider(config, providerKey) {
  if (!config || !Array.isArray(config.messagingProviders)) {
    return null;
  }

  for (var index = 0; index < config.messagingProviders.length; index += 1) {
    if (config.messagingProviders[index].key === providerKey) {
      return config.messagingProviders[index];
    }
  }

  return null;
}

function getProviderSecretStatus(provider, defaultSecretKey) {
  var secretKey =
    provider && provider.credentialsRef
      ? provider.credentialsRef.secretKey
      : defaultSecretKey;
  var parsed = resolveSecretRef({
    secretKey: secretKey,
  });

  return {
    secretKey: secretKey,
    parsed: parsed,
  };
}

function findAppointmentReceiptByCorrelationId(correlationId) {
  if (!correlationId) {
    return null;
  }

  for (var index = 0; index < appointmentEventReceipts.length; index += 1) {
    if (appointmentEventReceipts[index].correlationId === correlationId) {
      return appointmentEventReceipts[index];
    }
  }

  return null;
}

function findAppointmentReceiptById(receiptId) {
  for (var index = 0; index < appointmentEventReceipts.length; index += 1) {
    if (appointmentEventReceipts[index].id === receiptId) {
      return appointmentEventReceipts[index];
    }
  }

  return null;
}

function validateAppointmentEventPayload(payload) {
  var failures = [];

  if (!payload.tenantKey) {
    failures.push("tenantKey is required");
  }

  if (!payload.appointmentId) {
    failures.push("appointmentId is required");
  }

  if (!payload.eventType) {
    failures.push("eventType is required");
  }

  if (!payload.correlationId) {
    failures.push("correlationId is required");
  }

  if (!payload.message) {
    failures.push("message is required");
  }

  if (!payload.recipient) {
    failures.push("recipient is required");
  }

  if (payload.eventType && supportedAppointmentEventTypes.indexOf(payload.eventType) === -1) {
    failures.push("eventType is unsupported");
  }

  return failures;
}

router.get("/notifications", function (_req, res) {
  res.json(notifications);
});

router.post("/notifications", function (req, res) {
  var payload = req.body || {};
  var item = {
    id: randomUUID(),
    message: payload.message || "",
    recipient: payload.recipient || "",
    timestamp: new Date().toISOString(),
  };

  notifications.push(item);
  res.status(201).json(item);
});

router.post("/integrations/appointments/events", function (req, res) {
  var payload = req.body || {};
  var failures = validateAppointmentEventPayload(payload);
  if (failures.length > 0) {
    res.status(400).json({
      message: "appointment lifecycle event payload is invalid",
      code: "NOTIFICATION_APPOINTMENT_EVENT_INVALID",
      details: {
        failures: failures,
        supportedEventTypes: supportedAppointmentEventTypes,
      },
    });
    return;
  }

  var existingReceipt = findAppointmentReceiptByCorrelationId(payload.correlationId);
  if (existingReceipt) {
    var existingNotification = notifications.find(function (item) {
      return item.id === existingReceipt.notificationId;
    });

    res.status(200).json({
      duplicate: true,
      receipt: existingReceipt,
      notification: existingNotification || null,
    });
    return;
  }

  var notification = {
    id: randomUUID(),
    message: payload.message,
    recipient: payload.recipient,
    channel: payload.channel || "appointment-lifecycle",
    timestamp: new Date().toISOString(),
    correlationId: payload.correlationId,
    sourceService: payload.sourceService || "appointment-service",
    metadata: payload.metadata || {},
  };

  notifications.push(notification);

  var receipt = {
    id: randomUUID(),
    tenantKey: payload.tenantKey,
    appointmentId: payload.appointmentId,
    patientId: payload.patientId || "",
    clinicianId: payload.clinicianId || "",
    eventType: payload.eventType,
    correlationId: payload.correlationId,
    notificationId: notification.id,
    processingStatus: "accepted",
    attempts: Number(payload.attempt || 1),
    occurredAt: payload.occurredAt || new Date().toISOString(),
    receivedAt: new Date().toISOString(),
  };

  appointmentEventReceipts.push(receipt);

  res.status(201).json({
    duplicate: false,
    receipt: receipt,
    notification: notification,
  });
});

router.get("/integrations/appointments/events", function (req, res) {
  var tenantKey = String(req.query.tenantKey || "").trim();
  var appointmentId = String(req.query.appointmentId || "").trim();
  var eventType = String(req.query.eventType || "")
    .trim()
    .toLowerCase();
  var correlationId = String(req.query.correlationId || "").trim();

  var filtered = appointmentEventReceipts.filter(function (receipt) {
    if (tenantKey && receipt.tenantKey !== tenantKey) {
      return false;
    }

    if (appointmentId && receipt.appointmentId !== appointmentId) {
      return false;
    }

    if (eventType && String(receipt.eventType || "").toLowerCase() !== eventType) {
      return false;
    }

    if (correlationId && receipt.correlationId !== correlationId) {
      return false;
    }

    return true;
  });

  res.json({
    receipts: filtered,
    total: filtered.length,
  });
});

router.get("/integrations/appointments/events/:id", function (req, res) {
  var receipt = findAppointmentReceiptById(req.params.id);
  if (!receipt) {
    res.status(404).json({
      message: "Appointment event receipt not found",
      code: "NOTIFICATION_APPOINTMENT_EVENT_NOT_FOUND",
    });
    return;
  }

  res.json(receipt);
});

router.get("/notifications/:id", function (req, res) {
  var found = notifications.find(function (item) {
    return item.id === req.params.id;
  });
  if (!found) {
    res.status(404).json({ message: "Notification not found" });
    return;
  }

  res.json(found);
});

router.delete("/notifications/:id", function (req, res) {
  var index = notifications.findIndex(function (item) {
    return item.id === req.params.id;
  });
  if (index < 0) {
    res.status(404).json({ message: "Notification not found" });
    return;
  }

  notifications.splice(index, 1);
  res.status(204).send();
});

router.get("/integrations/messaging/providers", function (req, res) {
  var tenantKey = req.query.tenantKey || "default";
  var config = loadTenantIntegrationConfig(tenantKey);

  var providers = config.messagingProviders.map(function (provider) {
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

router.post("/integrations/messaging/test", function (req, res) {
  var payload = req.body || {};
  var tenantKey = payload.tenantKey || "default";
  var config = loadTenantIntegrationConfig(tenantKey);
  var dryRun = true;

  if (typeof payload.dryRun === "string") {
    dryRun = payload.dryRun.toLowerCase() !== "false";
  } else if (payload.dryRun === false) {
    dryRun = false;
  }

  sendNotificationWithRouting(
    {
      tenantKey: tenantKey,
      channel: payload.channel || "patient-notification",
      recipient: payload.recipient || "demo@example.com",
      message: payload.message || "PulseWard integration test message",
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

router.get("/integrations/messaging/telegram/setup", function (req, res) {
  var tenantKey = req.query.tenantKey || "default";
  var config = loadTenantIntegrationConfig(tenantKey);
  var provider = config.messagingProviders.find(function (item) {
    return item.key === "telegram-bot";
  });

  res.json({
    tenantKey: tenantKey,
    providerEnabled: Boolean(provider && provider.enabled),
    setupSteps: [
      "Open Telegram and start BotFather",
      "Create a bot and save bot token in secret manager",
      "Set INTEGRATION_TELEGRAM_CREDENTIALS reference",
      "Configure endpoint in tenant integration config",
      "Run POST /api/v1/integrations/messaging/test with providerKey=telegram-bot",
    ],
  });
});

router.get("/integrations/messaging/telegram/config-status", function (req, res) {
  var tenantKey = req.query.tenantKey || "default";
  var config = loadTenantIntegrationConfig(tenantKey);
  var provider = findMessagingProvider(config, "telegram-bot");
  var secretStatus = getProviderSecretStatus(provider, "INTEGRATION_TELEGRAM_CREDENTIALS");

  res.json({
    tenantKey: tenantKey,
    providerEnabled: Boolean(provider && provider.enabled),
    secretKey: secretStatus.secretKey,
    configured: Boolean(secretStatus.parsed && secretStatus.parsed.botToken),
    hasChatId: Boolean(secretStatus.parsed && secretStatus.parsed.chatId),
  });
});

router.get("/integrations/messaging/email/config-status", function (req, res) {
  var tenantKey = req.query.tenantKey || "default";
  var config = loadTenantIntegrationConfig(tenantKey);
  var provider = findMessagingProvider(config, "email-smtp");
  var secretStatus = getProviderSecretStatus(provider, "INTEGRATION_EMAIL_SMTP_CREDENTIALS");

  res.json({
    tenantKey: tenantKey,
    providerEnabled: Boolean(provider && provider.enabled),
    secretKey: secretStatus.secretKey,
    configured: Boolean(
      secretStatus.parsed &&
        secretStatus.parsed.host &&
        secretStatus.parsed.user &&
        secretStatus.parsed.pass
    ),
    hasFromAddress: Boolean(secretStatus.parsed && secretStatus.parsed.from),
  });
});

router.get("/integrations/messaging/whatsapp/setup", function (req, res) {
  var tenantKey = req.query.tenantKey || "default";
  var config = loadTenantIntegrationConfig(tenantKey);
  var provider = findMessagingProvider(config, "whatsapp-cloud-api");

  res.json({
    tenantKey: tenantKey,
    providerEnabled: Boolean(provider && provider.enabled),
    setupSteps: [
      "Provision WhatsApp business account in Meta Business Manager",
      "Complete billing and sender number onboarding",
      "Generate permanent access token for WhatsApp Cloud API",
      "Set INTEGRATION_WHATSAPP_CREDENTIALS secret reference",
      "Run POST /api/v1/integrations/messaging/test with providerKey=whatsapp-cloud-api",
    ],
  });
});

router.get("/integrations/messaging/whatsapp/config-status", function (req, res) {
  var tenantKey = req.query.tenantKey || "default";
  var config = loadTenantIntegrationConfig(tenantKey);
  var provider = findMessagingProvider(config, "whatsapp-cloud-api");
  var secretStatus = getProviderSecretStatus(provider, "INTEGRATION_WHATSAPP_CREDENTIALS");

  res.json({
    tenantKey: tenantKey,
    providerEnabled: Boolean(provider && provider.enabled),
    secretKey: secretStatus.secretKey,
    configured: Boolean(
      secretStatus.parsed &&
        secretStatus.parsed.accessToken &&
        (secretStatus.parsed.phoneNumberId || secretStatus.parsed.senderNumber)
    ),
    hasAccessToken: Boolean(secretStatus.parsed && secretStatus.parsed.accessToken),
    hasPhoneNumberId: Boolean(secretStatus.parsed && secretStatus.parsed.phoneNumberId),
    hasSenderNumber: Boolean(secretStatus.parsed && secretStatus.parsed.senderNumber),
  });
});

module.exports = router;
