var crypto = require("crypto");
var express = require("express");
var randomUUID = crypto.randomUUID;
var sendNotificationWithRouting =
  require("./integrations/send-notification-with-routing").sendNotificationWithRouting;
var loadTenantIntegrationConfig =
  require("../../packages/shared-utils/load-tenant-integration-config").loadTenantIntegrationConfig;
var resolveSecretRef = require("../../packages/shared-utils/resolve-secret-ref").resolveSecretRef;

var router = express.Router();
var notifications = [];
var appointmentEventReceipts = [];
var messagingFaultInjectionEvents = [];
var maxMessagingFaultInjectionEvents = parseRetryInt(
  process.env.INTEGRATION_FAULT_INJECTION_RETENTION_MAX,
  200,
  10,
  5000
);
var messagingFaultRetentionSource = String(
  process.env.INTEGRATION_FAULT_INJECTION_RETENTION_MAX || ""
).trim()
  ? "env"
  : "default";

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
    provider && provider.credentialsRef ? provider.credentialsRef.secretKey : defaultSecretKey;
  var parsed = resolveSecretRef({
    secretKey: secretKey,
  });

  return {
    secretKey: secretKey,
    parsed: parsed,
  };
}

function getWebhookEndpoint(provider) {
  var override = String(process.env.INTEGRATION_WEBHOOK_ENDPOINT || "").trim();
  if (override) {
    return override;
  }

  return String((provider && provider.endpoint) || "").trim();
}

function isWebhookEndpointUrlValid(endpoint) {
  if (!endpoint) {
    return false;
  }

  try {
    var parsed = new URL(endpoint);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch (_error) {
    return false;
  }
}

function getWebhookChannelCoverage(config) {
  var coverage = {
    defaultChannels: [],
    fallbackChannels: [],
  };

  if (!config || !Array.isArray(config.messagingRouting)) {
    return coverage;
  }

  config.messagingRouting.forEach(function (route) {
    if (!route || !route.channel) {
      return;
    }

    if (route.defaultProvider === "generic-webhook") {
      coverage.defaultChannels.push(route.channel);
    }

    if (
      Array.isArray(route.fallbackProviders) &&
      route.fallbackProviders.indexOf("generic-webhook") >= 0
    ) {
      coverage.fallbackChannels.push(route.channel);
    }
  });

  return coverage;
}

function getWebhookReadinessStatus(providerEnabled, endpointConfigured, endpointUrlValid) {
  if (!providerEnabled) {
    return "disabled";
  }

  if (!endpointConfigured) {
    return "at-risk";
  }

  if (!endpointUrlValid) {
    return "degraded";
  }

  return "healthy";
}

function parseRetryInt(value, fallback, minimum, maximum) {
  var parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  var bounded = Math.trunc(parsed);
  if (bounded < minimum) {
    return minimum;
  }

  if (bounded > maximum) {
    return maximum;
  }

  return bounded;
}

function parseRetryBool(value, fallback) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return fallback;
  }

  var normalized = String(value).trim().toLowerCase();

  if (normalized === "true" || normalized === "1" || normalized === "yes") {
    return true;
  }

  if (normalized === "false" || normalized === "0" || normalized === "no") {
    return false;
  }

  return fallback;
}

function getProviderChannelCoverage(config, providerKey) {
  var coverage = {
    defaultChannels: [],
    fallbackChannels: [],
  };

  if (!config || !Array.isArray(config.messagingRouting)) {
    return coverage;
  }

  config.messagingRouting.forEach(function (route) {
    if (!route || !route.channel) {
      return;
    }

    if (route.defaultProvider === providerKey) {
      coverage.defaultChannels.push(route.channel);
    }

    if (
      Array.isArray(route.fallbackProviders) &&
      route.fallbackProviders.indexOf(providerKey) >= 0
    ) {
      coverage.fallbackChannels.push(route.channel);
    }
  });

  return coverage;
}

function getMessagingRetryPolicy() {
  var mode = String(process.env.INTEGRATION_RETRY_POLICY || "exponential-backoff").trim();
  if (!mode) {
    mode = "exponential-backoff";
  }

  var maxAttempts = parseRetryInt(process.env.INTEGRATION_RETRY_MAX_ATTEMPTS, 3, 1, 10);
  var baseDelayMs = parseRetryInt(process.env.INTEGRATION_RETRY_BASE_DELAY_MS, 500, 100, 60000);
  var maxDelayMs = parseRetryInt(process.env.INTEGRATION_RETRY_MAX_DELAY_MS, 5000, 100, 120000);

  return {
    mode: mode,
    maxAttempts: maxAttempts,
    baseDelayMs: Math.min(baseDelayMs, maxDelayMs),
    maxDelayMs: maxDelayMs,
    jitterEnabled: parseRetryBool(process.env.INTEGRATION_RETRY_JITTER, true),
    retryOn: ["network-error", "timeout", "429", "5xx"],
    nonRetryable: ["400", "401", "403", "404", "validation-error"],
  };
}

function normalizeFaultScenario(input) {
  var normalized = String(input || "network-timeout")
    .trim()
    .toLowerCase();
  var supported = [
    "happy-path",
    "network-timeout",
    "rate-limit",
    "provider-5xx",
    "invalid-signature",
  ];

  if (supported.indexOf(normalized) < 0) {
    return "network-timeout";
  }

  return normalized;
}

function buildFaultSimulationResult(scenario, policy, providerEnabled) {
  var result = {
    scenario: scenario,
    classification: "retryable",
    injectedStatus: "timeout",
    expectedAction: "retry-then-fallback",
    expectedHttpStatus: 0,
    recommendation: "Validate retry caps and fallback routing before enabling live traffic",
  };

  if (scenario === "happy-path") {
    result.classification = "none";
    result.injectedStatus = "delivered";
    result.expectedAction = "deliver";
    result.expectedHttpStatus = 200;
    result.recommendation = "No fault injected; baseline provider path is healthy";
  } else if (scenario === "rate-limit") {
    result.injectedStatus = "rate-limited";
    result.expectedHttpStatus = 429;
  } else if (scenario === "provider-5xx") {
    result.injectedStatus = "provider-error";
    result.expectedHttpStatus = 503;
  } else if (scenario === "invalid-signature") {
    result.classification = "non-retryable";
    result.injectedStatus = "signature-invalid";
    result.expectedAction = "block-and-escalate";
    result.expectedHttpStatus = 400;
    result.recommendation =
      "Rotate signing secret and validate webhook signature contract before retry";
  }

  if (!providerEnabled) {
    result.classification = "disabled";
    result.injectedStatus = "provider-disabled";
    result.expectedAction = "switch-to-enabled-provider";
    result.expectedHttpStatus = 503;
    result.recommendation =
      "Enable provider or route default traffic to configured fallback provider";
  }

  result.recommendedMaxAttempts = policy.maxAttempts;
  return result;
}

function recordMessagingFaultInjectionEvent(entry) {
  var event = {
    eventId: randomUUID(),
    occurredAt: new Date().toISOString(),
    tenantKey: entry.tenantKey || "default",
    providerKey: entry.providerKey || "generic-webhook",
    scenario: entry.scenario || "network-timeout",
    classification: entry.classification || "retryable",
    injectedStatus: entry.injectedStatus || "timeout",
    expectedAction: entry.expectedAction || "retry-then-fallback",
    expectedHttpStatus: Number(entry.expectedHttpStatus) || 0,
    recommendedMaxAttempts: Number(entry.recommendedMaxAttempts) || 0,
  };

  messagingFaultInjectionEvents.push(event);
  if (messagingFaultInjectionEvents.length > maxMessagingFaultInjectionEvents) {
    messagingFaultInjectionEvents.shift();
  }

  return event;
}

function summarizeFaultInjectionEvents(events) {
  var retryableCount = 0;
  var nonRetryableCount = 0;
  var disabledCount = 0;

  events.forEach(function (event) {
    if (event.classification === "retryable") {
      retryableCount += 1;
    } else if (event.classification === "non-retryable") {
      nonRetryableCount += 1;
    } else if (event.classification === "disabled") {
      disabledCount += 1;
    }
  });

  return {
    totalCount: events.length,
    retryableCount: retryableCount,
    nonRetryableCount: nonRetryableCount,
    disabledCount: disabledCount,
    lastOccurredAt: events.length > 0 ? events[events.length - 1].occurredAt : null,
  };
}

function collectFaultInjectionEvents(tenantKey, providerKey, scenario) {
  return messagingFaultInjectionEvents.filter(function (event) {
    if (tenantKey && event.tenantKey !== tenantKey) {
      return false;
    }

    if (providerKey && event.providerKey !== providerKey) {
      return false;
    }

    if (scenario && event.scenario !== scenario) {
      return false;
    }

    return true;
  });
}

function escapeCsvValue(value) {
  if (value === undefined || value === null) {
    return "";
  }

  var output = String(value);
  if (output.indexOf('"') >= 0) {
    output = output.replace(/"/g, '""');
  }

  if (output.indexOf(",") >= 0 || output.indexOf("\n") >= 0 || output.indexOf("\r") >= 0) {
    return '"' + output + '"';
  }

  return output;
}

function buildFaultInjectionCsv(events) {
  var lines = [
    "eventId,occurredAt,tenantKey,providerKey,scenario,classification,injectedStatus,expectedAction,expectedHttpStatus,recommendedMaxAttempts",
  ];

  events.forEach(function (event) {
    lines.push(
      [
        escapeCsvValue(event.eventId),
        escapeCsvValue(event.occurredAt),
        escapeCsvValue(event.tenantKey),
        escapeCsvValue(event.providerKey),
        escapeCsvValue(event.scenario),
        escapeCsvValue(event.classification),
        escapeCsvValue(event.injectedStatus),
        escapeCsvValue(event.expectedAction),
        escapeCsvValue(event.expectedHttpStatus),
        escapeCsvValue(event.recommendedMaxAttempts),
      ].join(",")
    );
  });

  return lines.join("\n");
}

function applyFaultInjectionRetention(maxEvents, pruneNow) {
  var previousMaxEvents = maxMessagingFaultInjectionEvents;
  var nextMaxEvents = parseRetryInt(maxEvents, previousMaxEvents, 10, 5000);
  var prunedCount = 0;

  maxMessagingFaultInjectionEvents = nextMaxEvents;
  messagingFaultRetentionSource = "api";

  if (pruneNow) {
    while (messagingFaultInjectionEvents.length > maxMessagingFaultInjectionEvents) {
      messagingFaultInjectionEvents.shift();
      prunedCount += 1;
    }
  }

  return {
    previousMaxEvents: previousMaxEvents,
    maxEvents: maxMessagingFaultInjectionEvents,
    pruneNow: pruneNow,
    prunedCount: prunedCount,
    totalRecorded: messagingFaultInjectionEvents.length,
    source: messagingFaultRetentionSource,
  };
}

function getFaultEvidenceSigningMaterial() {
  var primaryKey = "INTEGRATION_FAULT_EVIDENCE_SIGNING_SECRET";
  var fallbackKey = "INTEGRATION_WEBHOOK_SIGNING_SECRET";

  var primary = resolveSecretRef({
    secretKey: primaryKey,
  });
  var primarySecret = String(primary.signingSecret || primary.secret || primary.raw || "").trim();

  if (primarySecret) {
    return {
      configured: true,
      source: primaryKey,
      secret: primarySecret,
    };
  }

  var fallback = resolveSecretRef({
    secretKey: fallbackKey,
  });
  var fallbackSecret = String(fallback.signingSecret || fallback.secret || fallback.raw || "").trim();

  if (fallbackSecret) {
    return {
      configured: true,
      source: fallbackKey,
      secret: fallbackSecret,
    };
  }

  return {
    configured: false,
    source: null,
    secret: "",
  };
}

function buildFaultManifestPayload(filters, events, totalMatched) {
  return {
    generatedAt: new Date().toISOString(),
    filters: {
      tenantKey: filters.tenantKey || null,
      providerKey: filters.providerKey || null,
      scenario: filters.scenario || null,
      limit: filters.limit,
    },
    totalMatched: totalMatched,
    returned: events.length,
    summary: summarizeFaultInjectionEvents(events),
    retention: {
      maxEvents: maxMessagingFaultInjectionEvents,
      source: messagingFaultRetentionSource,
      pruneStrategy: "drop-oldest",
    },
    eventDigests: events.map(function (event) {
      return {
        eventId: event.eventId,
        occurredAt: event.occurredAt,
        scenario: event.scenario,
        classification: event.classification,
        expectedHttpStatus: event.expectedHttpStatus,
      };
    }),
  };
}

function hasWebhookSigningSecret(parsedSecret) {
  if (!parsedSecret) {
    return false;
  }

  return Boolean(parsedSecret.signingSecret || parsedSecret.secret || parsedSecret.raw);
}

function getWebhookSigningSecret(parsedSecret) {
  if (!parsedSecret) {
    return "";
  }

  return String(parsedSecret.signingSecret || parsedSecret.secret || parsedSecret.raw || "").trim();
}

function normalizeWebhookSignatureInput(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function serializeWebhookPayload(payload) {
  if (payload === undefined || payload === null) {
    return "";
  }

  if (typeof payload === "string") {
    return payload;
  }

  try {
    return JSON.stringify(payload);
  } catch (_error) {
    return "";
  }
}

function buildWebhookSignature(payloadString, signingSecret) {
  return (
    "sha256=" +
    crypto.createHmac("sha256", signingSecret).update(payloadString, "utf8").digest("hex")
  );
}

function areWebhookSignaturesEqual(actualSignature, expectedSignature) {
  var actual = normalizeWebhookSignatureInput(actualSignature);
  var expected = normalizeWebhookSignatureInput(expectedSignature);

  if (!actual || !expected) {
    return false;
  }

  var actualBuffer = Buffer.from(actual, "utf8");
  var expectedBuffer = Buffer.from(expected, "utf8");
  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(actualBuffer, expectedBuffer);
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

router.get("/integrations/messaging/webhook/diagnostics", function (req, res) {
  var tenantKey = req.query.tenantKey || "default";
  var config = loadTenantIntegrationConfig(tenantKey);
  var provider = findMessagingProvider(config, "generic-webhook");
  var endpoint = getWebhookEndpoint(provider);
  var endpointConfigured = Boolean(endpoint);
  var endpointUrlValid = isWebhookEndpointUrlValid(endpoint);
  var channelCoverage = getWebhookChannelCoverage(config);

  var signingSecretStatus = getProviderSecretStatus(provider, "INTEGRATION_WEBHOOK_SIGNING_SECRET");
  var readinessStatus = getWebhookReadinessStatus(
    Boolean(provider && provider.enabled),
    endpointConfigured,
    endpointUrlValid
  );

  res.json({
    tenantKey: tenantKey,
    providerEnabled: Boolean(provider && provider.enabled),
    endpoint: endpoint,
    endpointConfigured: endpointConfigured,
    endpointUrlValid: endpointUrlValid,
    readinessStatus: readinessStatus,
    routeCoverage: {
      defaultChannels: channelCoverage.defaultChannels,
      fallbackChannels: channelCoverage.fallbackChannels,
      defaultChannelCount: channelCoverage.defaultChannels.length,
      fallbackChannelCount: channelCoverage.fallbackChannels.length,
    },
    signingSecret: {
      secretKey: signingSecretStatus.secretKey,
      configured: hasWebhookSigningSecret(signingSecretStatus.parsed),
    },
    deliveryTest: {
      endpoint: "POST /api/v1/integrations/messaging/test",
      recommendedPayload: {
        tenantKey: tenantKey,
        channel: "website-hook",
        dryRun: false,
      },
    },
    signatureVerification: {
      endpoint: "POST /api/v1/integrations/messaging/webhook/signature/verify",
      signatureHeader: "x-pulseward-signature",
      signatureFormat: "sha256=<hex-hmac>",
      samplePayload: {
        eventType: "appointment.created",
        appointmentId: "apt-1001",
      },
    },
  });
});

router.get("/integrations/messaging/retry-policy", function (req, res) {
  var tenantKey = req.query.tenantKey || "default";
  var providerKey = String(req.query.providerKey || "generic-webhook")
    .trim()
    .toLowerCase();
  var config = loadTenantIntegrationConfig(tenantKey);
  var provider = findMessagingProvider(config, providerKey);
  var channelCoverage = getProviderChannelCoverage(config, providerKey);

  res.json({
    tenantKey: tenantKey,
    providerKey: providerKey,
    providerEnabled: Boolean(provider && provider.enabled),
    readinessStatus: provider && provider.enabled ? "ready" : "disabled",
    policy: getMessagingRetryPolicy(),
    channelCoverage: {
      defaultChannels: channelCoverage.defaultChannels,
      fallbackChannels: channelCoverage.fallbackChannels,
      defaultChannelCount: channelCoverage.defaultChannels.length,
      fallbackChannelCount: channelCoverage.fallbackChannels.length,
    },
    guidance: {
      deliveryTestEndpoint: "POST /api/v1/integrations/messaging/test",
      recommendation:
        "Verify retry settings for each enabled provider before switching from dry-run to live delivery",
    },
  });
});

router.get("/integrations/messaging/fault-injection/simulate", function (req, res) {
  var tenantKey = req.query.tenantKey || "default";
  var providerKey = String(req.query.providerKey || "generic-webhook")
    .trim()
    .toLowerCase();
  var scenario = normalizeFaultScenario(req.query.scenario);
  var config = loadTenantIntegrationConfig(tenantKey);
  var provider = findMessagingProvider(config, providerKey);
  var policy = getMessagingRetryPolicy();
  var channelCoverage = getProviderChannelCoverage(config, providerKey);
  var simulation = buildFaultSimulationResult(
    scenario,
    policy,
    Boolean(provider && provider.enabled)
  );
  var event = recordMessagingFaultInjectionEvent({
    tenantKey: tenantKey,
    providerKey: providerKey,
    scenario: simulation.scenario,
    classification: simulation.classification,
    injectedStatus: simulation.injectedStatus,
    expectedAction: simulation.expectedAction,
    expectedHttpStatus: simulation.expectedHttpStatus,
    recommendedMaxAttempts: simulation.recommendedMaxAttempts,
  });

  res.json({
    simulationId: event.eventId,
    tenantKey: tenantKey,
    providerKey: providerKey,
    providerEnabled: Boolean(provider && provider.enabled),
    scenario: simulation.scenario,
    simulation: simulation,
    retryPolicy: policy,
    channelCoverage: {
      defaultChannels: channelCoverage.defaultChannels,
      fallbackChannels: channelCoverage.fallbackChannels,
      defaultChannelCount: channelCoverage.defaultChannels.length,
      fallbackChannelCount: channelCoverage.fallbackChannels.length,
    },
    diagnostics: {
      retryPolicyEndpoint: "GET /api/v1/integrations/messaging/retry-policy",
      eventsEndpoint: "GET /api/v1/integrations/messaging/fault-injection/events",
      exportEndpoint: "GET /api/v1/integrations/messaging/fault-injection/export",
      retentionEndpoint: "GET /api/v1/integrations/messaging/fault-injection/retention",
      manifestEndpoint: "GET /api/v1/integrations/messaging/fault-injection/manifest",
      deliveryTestEndpoint: "POST /api/v1/integrations/messaging/test",
    },
  });
});

router.get("/integrations/messaging/fault-injection/events", function (req, res) {
  var tenantKey = String(req.query.tenantKey || "").trim();
  var providerKey = String(req.query.providerKey || "")
    .trim()
    .toLowerCase();
  var scenario = String(req.query.scenario || "")
    .trim()
    .toLowerCase();
  var limit = Number(req.query.limit || 20);
  var boundedLimit = Number.isFinite(limit) ? Math.max(1, Math.min(limit, 100)) : 20;

  var filtered = collectFaultInjectionEvents(tenantKey, providerKey, scenario);

  var items = filtered.slice(-boundedLimit).reverse();

  res.json({
    totalRecorded: messagingFaultInjectionEvents.length,
    returned: items.length,
    filters: {
      tenantKey: tenantKey || null,
      providerKey: providerKey || null,
      scenario: scenario || null,
    },
    summary: summarizeFaultInjectionEvents(filtered),
    retention: {
      maxEvents: maxMessagingFaultInjectionEvents,
      source: messagingFaultRetentionSource,
      pruneStrategy: "drop-oldest",
    },
    diagnostics: {
      exportEndpoint: "GET /api/v1/integrations/messaging/fault-injection/export",
      retentionEndpoint: "GET /api/v1/integrations/messaging/fault-injection/retention",
      retentionApplyEndpoint: "POST /api/v1/integrations/messaging/fault-injection/retention/apply",
      manifestEndpoint: "GET /api/v1/integrations/messaging/fault-injection/manifest",
    },
    events: items,
  });
});

router.get("/integrations/messaging/fault-injection/export", function (req, res) {
  var tenantKey = String(req.query.tenantKey || "").trim();
  var providerKey = String(req.query.providerKey || "")
    .trim()
    .toLowerCase();
  var scenario = String(req.query.scenario || "")
    .trim()
    .toLowerCase();
  var format = String(req.query.format || "json")
    .trim()
    .toLowerCase();
  var limit = parseRetryInt(req.query.limit, 500, 1, 2000);
  var filtered = collectFaultInjectionEvents(tenantKey, providerKey, scenario);
  var items = filtered.slice(-limit);

  if (format === "csv") {
    var csvBody = buildFaultInjectionCsv(items);
    res.set("Cache-Control", "no-store");
    res.attachment("messaging-fault-injection-export.csv");
    res.type("text/csv");
    res.send(csvBody);
    return;
  }

  res.set("Cache-Control", "no-store");
  res.json({
    exportedAt: new Date().toISOString(),
    format: "json",
    totalMatched: filtered.length,
    returned: items.length,
    retention: {
      maxEvents: maxMessagingFaultInjectionEvents,
      source: messagingFaultRetentionSource,
      pruneStrategy: "drop-oldest",
    },
    filters: {
      tenantKey: tenantKey || null,
      providerKey: providerKey || null,
      scenario: scenario || null,
      limit: limit,
    },
    summary: summarizeFaultInjectionEvents(filtered),
    diagnostics: {
      eventsEndpoint: "GET /api/v1/integrations/messaging/fault-injection/events",
      retentionEndpoint: "GET /api/v1/integrations/messaging/fault-injection/retention",
      manifestEndpoint: "GET /api/v1/integrations/messaging/fault-injection/manifest",
    },
    events: items,
  });
});

router.get("/integrations/messaging/fault-injection/manifest", function (req, res) {
  var tenantKey = String(req.query.tenantKey || "").trim();
  var providerKey = String(req.query.providerKey || "")
    .trim()
    .toLowerCase();
  var scenario = String(req.query.scenario || "")
    .trim()
    .toLowerCase();
  var limit = parseRetryInt(req.query.limit, 100, 1, 1000);
  var includeEvents = parseRetryBool(req.query.includeEvents, false);

  var filtered = collectFaultInjectionEvents(tenantKey, providerKey, scenario);
  var items = filtered.slice(-limit);
  var payload = buildFaultManifestPayload(
    {
      tenantKey: tenantKey,
      providerKey: providerKey,
      scenario: scenario,
      limit: limit,
    },
    items,
    filtered.length
  );
  var serializedPayload = JSON.stringify(payload);
  var digestHex = crypto.createHash("sha256").update(serializedPayload, "utf8").digest("hex");
  var signing = getFaultEvidenceSigningMaterial();

  var signature = null;
  if (signing.configured) {
    signature = "sha256=" + crypto.createHmac("sha256", signing.secret).update(digestHex, "utf8").digest("hex");
  }

  res.set("Cache-Control", "no-store");
  res.json({
    manifestId: randomUUID(),
    manifestVersion: "m5.7.v1",
    generatedAt: payload.generatedAt,
    signatureStatus: signing.configured ? "signed" : "unsigned",
    signature: signature,
    digest: {
      algorithm: "sha256",
      value: digestHex,
      payloadBytes: Buffer.byteLength(serializedPayload, "utf8"),
    },
    signer: {
      algorithm: signing.configured ? "hmac-sha256" : "unsigned",
      secretSource: signing.source,
    },
    evidence: {
      filters: payload.filters,
      totalMatched: payload.totalMatched,
      returned: payload.returned,
      summary: payload.summary,
      retention: payload.retention,
      eventIds: payload.eventDigests.map(function (item) {
        return item.eventId;
      }),
    },
    eventDigests: payload.eventDigests,
    events: includeEvents ? items : undefined,
    diagnostics: {
      exportEndpoint: "GET /api/v1/integrations/messaging/fault-injection/export",
      eventsEndpoint: "GET /api/v1/integrations/messaging/fault-injection/events",
      retentionEndpoint: "GET /api/v1/integrations/messaging/fault-injection/retention",
      handoffGuide:
        "Share manifest signature, digest, and filters with incident stakeholders; verify signature with shared secret before acceptance",
    },
  });
});

router.get("/integrations/messaging/fault-injection/retention", function (_req, res) {
  var totalRecorded = messagingFaultInjectionEvents.length;

  res.json({
    retention: {
      maxEvents: maxMessagingFaultInjectionEvents,
      minAllowed: 10,
      maxAllowed: 5000,
      source: messagingFaultRetentionSource,
      pruneStrategy: "drop-oldest",
    },
    telemetry: {
      totalRecorded: totalRecorded,
      oldestOccurredAt: totalRecorded > 0 ? messagingFaultInjectionEvents[0].occurredAt : null,
      latestOccurredAt:
        totalRecorded > 0 ? messagingFaultInjectionEvents[totalRecorded - 1].occurredAt : null,
    },
    diagnostics: {
      exportEndpoint: "GET /api/v1/integrations/messaging/fault-injection/export",
      applyEndpoint: "POST /api/v1/integrations/messaging/fault-injection/retention/apply",
      manifestEndpoint: "GET /api/v1/integrations/messaging/fault-injection/manifest",
    },
  });
});

router.post("/integrations/messaging/fault-injection/retention/apply", function (req, res) {
  var payload = req.body || {};

  if (payload.maxEvents === undefined || payload.maxEvents === null) {
    res.status(400).json({
      message: "maxEvents is required",
      code: "NOTIFICATION_FAULT_RETENTION_MAX_REQUIRED",
    });
    return;
  }

  var pruneNow = parseRetryBool(payload.pruneNow, true);
  var applied = applyFaultInjectionRetention(payload.maxEvents, pruneNow);

  res.json({
    appliedAt: new Date().toISOString(),
    retention: {
      previousMaxEvents: applied.previousMaxEvents,
      maxEvents: applied.maxEvents,
      pruneNow: applied.pruneNow,
      prunedCount: applied.prunedCount,
      source: applied.source,
      pruneStrategy: "drop-oldest",
    },
    telemetry: {
      totalRecorded: applied.totalRecorded,
    },
    diagnostics: {
      statusEndpoint: "GET /api/v1/integrations/messaging/fault-injection/retention",
      eventsEndpoint: "GET /api/v1/integrations/messaging/fault-injection/events",
    },
  });
});

router.post("/integrations/messaging/webhook/signature/verify", function (req, res) {
  var payload = req.body || {};
  var tenantKey = payload.tenantKey || "default";
  var config = loadTenantIntegrationConfig(tenantKey);
  var provider = findMessagingProvider(config, "generic-webhook");
  var signingSecretStatus = getProviderSecretStatus(provider, "INTEGRATION_WEBHOOK_SIGNING_SECRET");
  var signingSecret = getWebhookSigningSecret(signingSecretStatus.parsed);

  if (!signingSecret) {
    res.status(400).json({
      valid: false,
      tenantKey: tenantKey,
      providerEnabled: Boolean(provider && provider.enabled),
      secretKey: signingSecretStatus.secretKey,
      detail: "Webhook signing secret is not configured",
    });
    return;
  }

  var providedSignature =
    payload.signature || req.headers["x-pulseward-signature"] || req.headers["x-webhook-signature"];
  if (!String(providedSignature || "").trim()) {
    res.status(400).json({
      valid: false,
      tenantKey: tenantKey,
      providerEnabled: Boolean(provider && provider.enabled),
      secretKey: signingSecretStatus.secretKey,
      detail: "signature is required in body.signature or x-pulseward-signature header",
    });
    return;
  }

  var serializedPayload = serializeWebhookPayload(payload.payload);
  var expectedSignature = buildWebhookSignature(serializedPayload, signingSecret);
  var valid = areWebhookSignaturesEqual(providedSignature, expectedSignature);

  res.json({
    valid: valid,
    tenantKey: tenantKey,
    providerEnabled: Boolean(provider && provider.enabled),
    secretKey: signingSecretStatus.secretKey,
    algorithm: "sha256",
    signatureHeader: "x-pulseward-signature",
    payloadBytes: Buffer.byteLength(serializedPayload, "utf8"),
    expectedSignature: expectedSignature,
    providedSignature: String(providedSignature),
    detail: valid
      ? "Signature is valid for configured webhook signing secret"
      : "Signature verification failed",
  });
});

module.exports = router;
