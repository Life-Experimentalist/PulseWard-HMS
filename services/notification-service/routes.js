var crypto = require("crypto");
var express = require("express");
var jwt = require("jsonwebtoken");
var randomUUID = crypto.randomUUID;
var sendNotificationWithRouting =
  require("./integrations/send-notification-with-routing").sendNotificationWithRouting;
var loadTenantIntegrationConfig =
  require("../../packages/shared-utils/load-tenant-integration-config").loadTenantIntegrationConfig;
var resolveSecretRef = require("../../packages/shared-utils/resolve-secret-ref").resolveSecretRef;

var router = express.Router();
var notifications = [];
var appointmentEventReceipts = [];
var mobilePushRegistrations = new Map();
var telegramUserChatBindings = new Map();
var telegramCommandOffsets = new Map();
var telegramCommandSetupApplied = new Map();
var telegramDoctorDailyAlarmSettings = new Map();
var telegramAutoPollTimer = null;
var telegramAutoPollInFlight = false;
var telegramAutoPollLastRunAt = "";
var telegramAutoPollLastError = "";
var telegramAutoPollLastSummary = [];
var TELEGRAM_COMMAND_MAX_RESPONSE_LINES = 8;
var TELEGRAM_DEFAULT_POLL_LIMIT = 25;
var TELEGRAM_MAX_POLL_LIMIT = 100;
var TELEGRAM_DEFAULT_DOCTOR_ALARM_UTC = "07:30";
var APPOINTMENT_SERVICE_BASE_URL_DEFAULT = "http://127.0.0.1:5103";
var TELEGRAM_TENANT_DEFAULT_TIMEZONE = "UTC";
var TELEGRAM_TENANT_DEFAULT_LOCALE = "en-IN";
var TELEGRAM_PUBLIC_NOTIFICATION_BASE_URL_DEFAULT = "http://localhost:5102";
var TELEGRAM_PUBLIC_AUTH_BASE_URL_DEFAULT = "http://localhost:5101";
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
var faultManifestVersion = "m5.9.v1";
var defaultFaultManifestMaxAgeSeconds = parseRetryInt(
  process.env.INTEGRATION_FAULT_MANIFEST_MAX_AGE_SECONDS,
  900,
  30,
  86400
);
var faultManifestAllowedClockSkewSeconds = parseRetryInt(
  process.env.INTEGRATION_FAULT_MANIFEST_CLOCK_SKEW_SECONDS,
  60,
  0,
  300
);
var faultManifestVerifyRetentionWindowEnvValue = String(
  process.env.INTEGRATION_FAULT_MANIFEST_VERIFY_ATTEMPT_RETENTION_WINDOW_SECONDS ||
    process.env.INTEGRATION_FAULT_MANIFEST_VERIFY_DEDUPE_WINDOW_SECONDS ||
    ""
).trim();
var faultManifestVerifyRetentionMaxEntriesEnvValue = String(
  process.env.INTEGRATION_FAULT_MANIFEST_VERIFY_ATTEMPT_RETENTION_MAX_ENTRIES ||
    process.env.INTEGRATION_FAULT_MANIFEST_VERIFY_DEDUPE_MAX_ENTRIES ||
    ""
).trim();
var faultManifestVerifyDedupeWindowSeconds = parseRetryInt(
  faultManifestVerifyRetentionWindowEnvValue,
  600,
  30,
  86400
);
var faultManifestVerifyDedupeMaxEntries = parseRetryInt(
  faultManifestVerifyRetentionMaxEntriesEnvValue,
  500,
  50,
  5000
);
var faultManifestVerifyRetentionSaturationWarningPercent = parseRetryInt(
  process.env.INTEGRATION_FAULT_MANIFEST_VERIFY_ATTEMPT_RETENTION_SATURATION_WARNING_PERCENT,
  75,
  1,
  99
);
var faultManifestVerifyRetentionSaturationCriticalPercent = parseRetryInt(
  process.env.INTEGRATION_FAULT_MANIFEST_VERIFY_ATTEMPT_RETENTION_SATURATION_CRITICAL_PERCENT,
  90,
  2,
  100
);
var faultManifestVerifyRetentionSaturationTrendMaxSnapshots = parseRetryInt(
  process.env.INTEGRATION_FAULT_MANIFEST_VERIFY_ATTEMPT_RETENTION_SATURATION_TREND_MAX_SNAPSHOTS,
  288,
  24,
  2880
);
var faultManifestVerifyRetentionSaturationTrendMinCaptureSeconds = parseRetryInt(
  process.env
    .INTEGRATION_FAULT_MANIFEST_VERIFY_ATTEMPT_RETENTION_SATURATION_TREND_MIN_CAPTURE_SECONDS,
  30,
  0,
  3600
);
var faultManifestVerifyRetentionAnomalySustainedWarningMinSnapshots = parseRetryInt(
  process.env
    .INTEGRATION_FAULT_MANIFEST_VERIFY_ATTEMPT_RETENTION_ANOMALY_SUSTAINED_WARNING_MIN_SNAPSHOTS,
  3,
  2,
  12
);
var faultManifestVerifyRetentionAnomalySustainedCriticalMinSnapshots = parseRetryInt(
  process.env
    .INTEGRATION_FAULT_MANIFEST_VERIFY_ATTEMPT_RETENTION_ANOMALY_SUSTAINED_CRITICAL_MIN_SNAPSHOTS,
  2,
  2,
  12
);
var faultManifestVerifyRetentionAnomalyAccelerationDeltaPercent = parseRetryInt(
  process.env
    .INTEGRATION_FAULT_MANIFEST_VERIFY_ATTEMPT_RETENTION_ANOMALY_ACCELERATION_DELTA_PERCENT,
  5,
  1,
  25
);
var faultManifestVerifyRetentionAnomalyInstanceMaxEntries = parseRetryInt(
  process.env.INTEGRATION_FAULT_MANIFEST_VERIFY_ATTEMPT_RETENTION_ANOMALY_INSTANCE_MAX,
  500,
  50,
  5000
);
var faultManifestVerifyRetentionAnomalyActionMaxEntries = parseRetryInt(
  process.env.INTEGRATION_FAULT_MANIFEST_VERIFY_ATTEMPT_RETENTION_ANOMALY_ACTION_MAX,
  1000,
  100,
  10000
);
var faultManifestVerifyRetentionAnomalyRetentionWindowSeconds = parseRetryInt(
  process.env.INTEGRATION_FAULT_MANIFEST_VERIFY_ATTEMPT_RETENTION_ANOMALY_RETENTION_WINDOW_SECONDS,
  86400,
  300,
  604800
);
var faultManifestVerifyRetentionAnomalyNoteMaxLength = parseRetryInt(
  process.env.INTEGRATION_FAULT_MANIFEST_VERIFY_ATTEMPT_RETENTION_ANOMALY_NOTE_MAX_LENGTH,
  1000,
  64,
  4000
);
var faultManifestVerifyRetentionAnomalyNotesPerInstanceMax = parseRetryInt(
  process.env.INTEGRATION_FAULT_MANIFEST_VERIFY_ATTEMPT_RETENTION_ANOMALY_NOTES_PER_INSTANCE_MAX,
  20,
  1,
  100
);
var faultManifestVerifyRetentionAnomalyClosureHistoryPerInstanceMax = parseRetryInt(
  process.env
    .INTEGRATION_FAULT_MANIFEST_VERIFY_ATTEMPT_RETENTION_ANOMALY_CLOSURE_HISTORY_PER_INSTANCE_MAX,
  5,
  1,
  25
);
var faultManifestVerifyRetentionAnomalyRecentlyClosedMaxEntries = parseRetryInt(
  process.env
    .INTEGRATION_FAULT_MANIFEST_VERIFY_ATTEMPT_RETENTION_ANOMALY_RECENTLY_CLOSED_MAX_ENTRIES,
  50,
  10,
  500
);
var faultManifestVerifyRetentionEscalationEnabled = parseRetryBool(
  process.env.INTEGRATION_FAULT_MANIFEST_VERIFY_ATTEMPT_RETENTION_ESCALATION_ENABLED,
  true
);
var faultManifestVerifyRetentionEscalationWarningUnacknowledgedAfterSeconds = parseRetryInt(
  process.env
    .INTEGRATION_FAULT_MANIFEST_VERIFY_ATTEMPT_RETENTION_ESCALATION_WARNING_UNACKNOWLEDGED_AFTER_SECONDS,
  600,
  0,
  86400
);
var faultManifestVerifyRetentionEscalationCriticalUnacknowledgedAfterSeconds = parseRetryInt(
  process.env
    .INTEGRATION_FAULT_MANIFEST_VERIFY_ATTEMPT_RETENTION_ESCALATION_CRITICAL_UNACKNOWLEDGED_AFTER_SECONDS,
  180,
  0,
  86400
);
var faultManifestVerifyRetentionEscalationCriticalUnmitigatedAfterSeconds = parseRetryInt(
  process.env
    .INTEGRATION_FAULT_MANIFEST_VERIFY_ATTEMPT_RETENTION_ESCALATION_CRITICAL_UNMITIGATED_AFTER_SECONDS,
  300,
  0,
  86400
);
var faultManifestVerifyRetentionEscalationAutoDeescalateOnMitigation = parseRetryBool(
  process.env
    .INTEGRATION_FAULT_MANIFEST_VERIFY_ATTEMPT_RETENTION_ESCALATION_AUTO_DEESCALATE_ON_MITIGATION,
  true
);
var faultManifestVerifyRetentionEscalationExportEnabled = parseRetryBool(
  process.env.INTEGRATION_FAULT_MANIFEST_VERIFY_ATTEMPT_RETENTION_ESCALATION_EXPORT_ENABLED,
  true
);
var faultManifestVerifyRetentionEscalationExportDefaultFormat =
  String(
    process.env
      .INTEGRATION_FAULT_MANIFEST_VERIFY_ATTEMPT_RETENTION_ESCALATION_EXPORT_DEFAULT_FORMAT ||
      "json"
  )
    .trim()
    .toLowerCase() === "csv"
    ? "csv"
    : "json";
var faultManifestVerifyRetentionEscalationExportMaxRows = parseRetryInt(
  process.env.INTEGRATION_FAULT_MANIFEST_VERIFY_ATTEMPT_RETENTION_ESCALATION_EXPORT_MAX_ROWS,
  1000,
  50,
  5000
);
var faultManifestVerifyRetentionEscalationExportIncludeRecentlyClosedByDefault = parseRetryBool(
  process.env
    .INTEGRATION_FAULT_MANIFEST_VERIFY_ATTEMPT_RETENTION_ESCALATION_EXPORT_INCLUDE_RECENTLY_CLOSED_BY_DEFAULT,
  false
);
var faultManifestVerifyRetentionEscalationMitigationNoteTypes = [
  "mitigation-plan",
  "mitigation-applied",
  "mitigation",
];
if (
  String(
    process.env
      .INTEGRATION_FAULT_MANIFEST_VERIFY_ATTEMPT_RETENTION_ESCALATION_MITIGATION_NOTE_TYPES || ""
  ).trim()
) {
  faultManifestVerifyRetentionEscalationMitigationNoteTypes = String(
    process.env.INTEGRATION_FAULT_MANIFEST_VERIFY_ATTEMPT_RETENTION_ESCALATION_MITIGATION_NOTE_TYPES
  )
    .split(",")
    .map(function (item) {
      return String(item || "")
        .trim()
        .toLowerCase();
    })
    .filter(function (item, index, items) {
      return item && items.indexOf(item) === index;
    });
  if (faultManifestVerifyRetentionEscalationMitigationNoteTypes.length === 0) {
    faultManifestVerifyRetentionEscalationMitigationNoteTypes = ["mitigation-plan"];
  }
}
if (
  faultManifestVerifyRetentionSaturationCriticalPercent <=
  faultManifestVerifyRetentionSaturationWarningPercent
) {
  faultManifestVerifyRetentionSaturationCriticalPercent = Math.min(
    100,
    faultManifestVerifyRetentionSaturationWarningPercent + 1
  );
}
var faultManifestVerifyRetentionSource =
  faultManifestVerifyRetentionWindowEnvValue || faultManifestVerifyRetentionMaxEntriesEnvValue
    ? "env"
    : "default";
var faultManifestVerifyAnomalyTriageEndpointTemplate =
  "POST /api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/retention/anomalies/{anomalyInstanceId}/triage";
var faultManifestVerifyEscalationExportEndpoint =
  "GET /api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/retention/escalations/export";
var faultManifestVerifyAttemptCache = [];
var faultManifestVerifyRetentionSaturationTrendSnapshots = [];
var faultManifestVerifyAnomalyInstances = [];
var faultManifestVerifyAnomalyActions = [];
var faultManifestVerifyRecentlyClosedAnomalies = [];

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

function normalizeTenantKey(value, fallback) {
  var normalized = String(value || "").trim();
  if (!normalized) {
    return String(fallback || "default").trim() || "default";
  }

  return normalized;
}

function extractBearerToken(req) {
  var headerValue = String((req.headers && req.headers.authorization) || "").trim();
  if (!headerValue) {
    return "";
  }

  var parts = headerValue.split(" ");
  if (parts.length !== 2 || String(parts[0] || "").toLowerCase() !== "bearer") {
    return "";
  }

  return String(parts[1] || "").trim();
}

function requireAuthenticatedSession(req, res) {
  var token = extractBearerToken(req);
  if (!token) {
    res.status(401).json({
      message: "Authorization bearer token is required",
      code: "AUTH_TOKEN_REQUIRED",
    });
    return null;
  }

  try {
    var decoded = jwt.verify(token, process.env.JWT_SECRET || "dev-secret");
    var subject = String((decoded && decoded.sub) || "").trim();
    var tenantKey = normalizeTenantKey(decoded && decoded.tenantKey, "default");

    if (!subject) {
      res.status(401).json({
        message: "Token subject is missing",
        code: "AUTH_TOKEN_INVALID",
      });
      return null;
    }

    return {
      subject: subject,
      tenantKey: tenantKey,
      role: String((decoded && decoded.role) || "")
        .trim()
        .toLowerCase(),
      provider: String((decoded && decoded.provider) || "").trim(),
    };
  } catch (_error) {
    res.status(401).json({
      message: "Authorization token is invalid or expired",
      code: "AUTH_TOKEN_INVALID",
    });
    return null;
  }
}

function enforceTenantScope(res, authSession, requestedTenantKey) {
  var effectiveTenantKey = normalizeTenantKey(
    requestedTenantKey || authSession.tenantKey,
    "default"
  );
  if (effectiveTenantKey !== authSession.tenantKey) {
    res.status(403).json({
      message: "Tenant mismatch between token and request",
      code: "AUTH_TENANT_MISMATCH",
      details: {
        tokenTenantKey: authSession.tenantKey,
        requestedTenantKey: effectiveTenantKey,
      },
    });
    return null;
  }

  return effectiveTenantKey;
}

function isExpoPushToken(value) {
  return /^ExponentPushToken\[[^\]]+\]$/.test(value) || /^ExpoPushToken\[[^\]]+\]$/.test(value);
}

function toPushRegistrationKey(tenantKey, subject) {
  return (
    String(tenantKey || "").trim() +
    "::" +
    String(subject || "")
      .trim()
      .toLowerCase()
  );
}

function toTelegramBindingKey(tenantKey, subject) {
  return (
    String(tenantKey || "").trim() +
    "::" +
    String(subject || "")
      .trim()
      .toLowerCase()
  );
}

function maskPushToken(pushToken) {
  var token = String(pushToken || "");
  if (token.length <= 16) {
    return token;
  }

  return token.slice(0, 12) + "..." + token.slice(-4);
}

function getTelegramBotToken(config) {
  var provider = findMessagingProvider(config, "telegram-bot");
  var secretStatus = getProviderSecretStatus(provider, "INTEGRATION_TELEGRAM_CREDENTIALS");
  if (!secretStatus || !secretStatus.parsed || !secretStatus.parsed.botToken) {
    return "";
  }

  return String(secretStatus.parsed.botToken).trim();
}

async function fetchTelegramChatCandidates(botToken) {
  var response = await fetch(
    "https://api.telegram.org/bot" + String(botToken).trim() + "/getUpdates"
  );
  var payload = await response.json().catch(function () {
    return null;
  });
  if (!response.ok || !payload || payload.ok !== true || !Array.isArray(payload.result)) {
    return [];
  }

  var candidates = [];
  var seen = {};

  payload.result.forEach(function (update) {
    var chat = null;
    if (update && update.message && update.message.chat) {
      chat = update.message.chat;
    } else if (update && update.channel_post && update.channel_post.chat) {
      chat = update.channel_post.chat;
    } else if (update && update.my_chat_member && update.my_chat_member.chat) {
      chat = update.my_chat_member.chat;
    }

    if (!chat || !chat.id) {
      return;
    }

    var chatId = String(chat.id);
    if (seen[chatId]) {
      return;
    }

    seen[chatId] = true;
    candidates.push({
      chatId: chatId,
      type: String(chat.type || ""),
      title: String(chat.title || ""),
      username: String(chat.username || ""),
      firstName: String(chat.first_name || ""),
      lastName: String(chat.last_name || ""),
    });
  });

  return candidates;
}

function getAppointmentServiceBaseUrl() {
  return String(process.env.APPOINTMENT_SERVICE_BASE_URL || APPOINTMENT_SERVICE_BASE_URL_DEFAULT)
    .trim()
    .replace(/\/+$/, "");
}

function normalizePublicBaseUrl(value, fallbackValue) {
  var candidate = String(value || "").trim();
  if (!candidate) {
    candidate = String(fallbackValue || "").trim();
  }

  if (!candidate) {
    return "";
  }

  if (!/^https?:\/\//i.test(candidate)) {
    candidate = "http://" + candidate;
  }

  return candidate.replace(/\/+$/, "");
}

function buildAbsoluteApiUrl(baseUrl, apiPath) {
  return normalizePublicBaseUrl(baseUrl, "") + String(apiPath || "");
}

function getTelegramPublicNotificationBaseUrl() {
  return normalizePublicBaseUrl(
    process.env.INTEGRATION_TELEGRAM_PUBLIC_API_BASE_URL ||
      process.env.PULSEWARD_PUBLIC_NOTIFICATION_BASE_URL,
    TELEGRAM_PUBLIC_NOTIFICATION_BASE_URL_DEFAULT
  );
}

function getTelegramPublicAuthBaseUrl() {
  return normalizePublicBaseUrl(
    process.env.INTEGRATION_TELEGRAM_PUBLIC_AUTH_BASE_URL ||
      process.env.PULSEWARD_PUBLIC_AUTH_BASE_URL,
    TELEGRAM_PUBLIC_AUTH_BASE_URL_DEFAULT
  );
}

function toTenantEnvKeySuffix(tenantKey) {
  return normalizeTenantKey(tenantKey, "default")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
}

function normalizeTenantTimeZone(value) {
  var candidate = String(value || "").trim();
  if (!candidate) {
    return "";
  }

  try {
    new Intl.DateTimeFormat("en-US", {
      timeZone: candidate,
    }).format(new Date());
    return candidate;
  } catch (_error) {
    return "";
  }
}

function getDateTokenForTimeZone(value, timeZone) {
  var date = value instanceof Date ? value : new Date(String(value || ""));
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  var safeTimeZone = normalizeTenantTimeZone(timeZone) || TELEGRAM_TENANT_DEFAULT_TIMEZONE;

  try {
    var parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: safeTimeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    var year = "";
    var month = "";
    var day = "";
    parts.forEach(function (part) {
      if (part.type === "year") {
        year = part.value;
      } else if (part.type === "month") {
        month = part.value;
      } else if (part.type === "day") {
        day = part.value;
      }
    });

    if (!year || !month || !day) {
      return "";
    }

    return year + "-" + month + "-" + day;
  } catch (_error) {
    return date.toISOString().slice(0, 10);
  }
}

function formatDateTimeForTenant(value, tenantPrefs) {
  var date = new Date(String(value || ""));
  if (Number.isNaN(date.getTime())) {
    return "n/a";
  }

  var prefs = tenantPrefs || {};
  var timeZone = normalizeTenantTimeZone(prefs.timeZone) || TELEGRAM_TENANT_DEFAULT_TIMEZONE;
  var locale = String(prefs.locale || TELEGRAM_TENANT_DEFAULT_LOCALE).trim() || "en-IN";

  try {
    return new Intl.DateTimeFormat(locale, {
      timeZone: timeZone,
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
      timeZoneName: "short",
    }).format(date);
  } catch (_error) {
    return date.toISOString().replace(".000", "");
  }
}

function getTenantTelegramPreferences(tenantKey) {
  var normalizedTenant = normalizeTenantKey(tenantKey, "default");
  var config = loadTenantIntegrationConfig(normalizedTenant) || {};
  var defaults =
    (config && config.telegramDefaults && typeof config.telegramDefaults === "object"
      ? config.telegramDefaults
      : {}) || {};
  var tenantSuffix = toTenantEnvKeySuffix(normalizedTenant);

  var timeZone =
    normalizeTenantTimeZone(
      process.env["INTEGRATION_TELEGRAM_TENANT_TIMEZONE_" + tenantSuffix] ||
        process.env.INTEGRATION_TELEGRAM_DEFAULT_TIMEZONE ||
        defaults.timeZone ||
        defaults.timezone
    ) || TELEGRAM_TENANT_DEFAULT_TIMEZONE;

  var locale =
    String(
      process.env["INTEGRATION_TELEGRAM_TENANT_LOCALE_" + tenantSuffix] ||
        process.env.INTEGRATION_TELEGRAM_DEFAULT_LOCALE ||
        defaults.locale ||
        TELEGRAM_TENANT_DEFAULT_LOCALE
    ).trim() || TELEGRAM_TENANT_DEFAULT_LOCALE;

  return {
    tenantKey: normalizedTenant,
    timeZone: timeZone,
    locale: locale,
  };
}

function toDisplayNameFromIdentifier(value) {
  var raw = String(value || "").trim();
  if (!raw) {
    return "Unknown patient";
  }

  var token = raw;
  if (token.indexOf("@") >= 0) {
    token = token.split("@")[0] || token;
  }

  return token
    .split(/[._\-\s]+/)
    .filter(function (part) {
      return Boolean(part);
    })
    .map(function (part) {
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ");
}

function resolvePatientDescriptor(item) {
  var record = item || {};
  var patientId = String(record.patientId || "").trim();
  var patientName =
    String(
      record.patientName ||
        record.patientDisplayName ||
        record.patientFullName ||
        record.name ||
        ""
    ).trim() || toDisplayNameFromIdentifier(patientId);

  var ageCandidate =
    record.patientAge !== undefined
      ? record.patientAge
      : record.age !== undefined
        ? record.age
        : record.patient && record.patient.age !== undefined
          ? record.patient.age
          : "";
  var numericAge = Number(ageCandidate);
  var ageText = Number.isFinite(numericAge) && numericAge > 0 ? String(Math.floor(numericAge)) : "";

  return {
    id: patientId,
    name: patientName || "Unknown patient",
    ageText: ageText,
  };
}

function buildTelegramOnboardingEndpoints(tenantKey, chatId) {
  var normalizedTenant = normalizeTenantKey(tenantKey, "default");
  var normalizedChatId = String(chatId || "").trim();
  var notificationBaseUrl = getTelegramPublicNotificationBaseUrl();
  var authBaseUrl = getTelegramPublicAuthBaseUrl();

  return {
    notificationBaseUrl: notificationBaseUrl,
    authBaseUrl: authBaseUrl,
    loginUrl: buildAbsoluteApiUrl(authBaseUrl, "/api/v1/auth/login"),
    linkUrl: buildAbsoluteApiUrl(notificationBaseUrl, "/api/v1/integrations/messaging/telegram/link"),
    commandSetupUrl: buildAbsoluteApiUrl(
      notificationBaseUrl,
      "/api/v1/integrations/messaging/telegram/commands/setup"
    ),
    bootstrapUrl:
      buildAbsoluteApiUrl(
        notificationBaseUrl,
        "/api/v1/integrations/messaging/telegram/link/bootstrap"
      ) +
      "?tenantKey=" +
      encodeURIComponent(normalizedTenant) +
      "&chatId=" +
      encodeURIComponent(normalizedChatId),
  };
}

function getTelegramCommandSetupFingerprint(botToken) {
  return crypto
    .createHash("sha256")
    .update(String(botToken || ""))
    .digest("hex")
    .slice(0, 16);
}

async function ensureTelegramCommandsConfigured(tenantKey, botToken) {
  var normalizedTenant = normalizeTenantKey(tenantKey, "default");
  var tokenFingerprint = getTelegramCommandSetupFingerprint(botToken);
  var existing = telegramCommandSetupApplied.get(normalizedTenant);

  if (existing && typeof existing === "object" && existing.tokenFingerprint === tokenFingerprint) {
    return {
      applied: false,
      reason: "already-configured",
    };
  }

  await setTelegramCommands(botToken, buildTelegramCommandDefinitions());
  telegramCommandSetupApplied.set(normalizedTenant, {
    tokenFingerprint: tokenFingerprint,
    updatedAt: new Date().toISOString(),
    commandCount: buildTelegramCommandDefinitions().length,
  });

  return {
    applied: true,
    reason: "configured",
  };
}

function buildTelegramCommandDefinitions() {
  return [
    { command: "start", description: "Show command menu" },
    { command: "help", description: "Show command menu" },
    { command: "whoami", description: "Show linked account" },
    { command: "agenda", description: "Doctor agenda for today" },
    { command: "patients", description: "Count todays patients" },
    { command: "myappointments", description: "List your appointments" },
    { command: "book", description: "Book: /book <doctor> <iso-date-time> [minutes]" },
    { command: "accept", description: "Accept: /accept <appointmentId>" },
    { command: "calendar", description: "Calendar links for appointment" },
    { command: "alarm", description: "Doctor daily reminder: /alarm HH:MM" },
  ];
}

function normalizeTelegramRole(role) {
  return String(role || "patient")
    .trim()
    .toLowerCase();
}

function buildTelegramCommandDefinitionsForRole(role) {
  var normalizedRole = normalizeTelegramRole(role);
  var commands = [
    { command: "start", description: "Show command menu" },
    { command: "help", description: "Show command menu" },
    { command: "whoami", description: "Show linked account" },
  ];

  if (["doctor", "nurse", "admin", "frontdesk", "operations"].indexOf(normalizedRole) >= 0) {
    commands.push({ command: "agenda", description: "Doctor agenda for today" });
    commands.push({ command: "patients", description: "Count todays patients" });
  }

  commands.push({ command: "myappointments", description: "List your appointments" });

  if (["patient", "frontdesk", "admin"].indexOf(normalizedRole) >= 0) {
    commands.push({
      command: "book",
      description: "Book: /book <doctor> <iso-date-time> [minutes]",
    });
  }

  if (["doctor", "nurse", "admin"].indexOf(normalizedRole) >= 0) {
    commands.push({ command: "accept", description: "Accept: /accept <appointmentId>" });
  }

  commands.push({ command: "calendar", description: "Calendar links for appointment" });

  if (normalizedRole === "doctor") {
    commands.push({ command: "alarm", description: "Daily reminder: /alarm HH:MM UTC" });
  }

  return commands;
}

function parseUtcTimeToMinutes(value) {
  var match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(value || "").trim());
  if (!match) {
    return null;
  }

  return Number(match[1]) * 60 + Number(match[2]);
}

function normalizeDoctorAlarmTimeUtc(value) {
  var normalized = String(value || "").trim();
  if (!normalized) {
    return "";
  }

  if (!Number.isFinite(parseUtcTimeToMinutes(normalized))) {
    return "";
  }

  return normalized;
}

function toDoctorAlarmKey(tenantKey, subject) {
  return toTelegramBindingKey(tenantKey, subject);
}

function buildDoctorAlarmSummaryLines(setting) {
  var safeSetting = setting || {};
  return [
    "Doctor daily reminder",
    "enabled: " + (safeSetting.enabled ? "yes" : "no"),
    "time (UTC): " + String(safeSetting.timeUtc || TELEGRAM_DEFAULT_DOCTOR_ALARM_UTC),
    "last sent day: " + String(safeSetting.lastSentDateToken || "never"),
  ];
}

function buildTelegramHelpMessageForRole(role) {
  var commands = buildTelegramCommandDefinitionsForRole(role);
  var usageMap = {
    whoami: "/whoami - show linked tenant/account",
    agenda: "/agenda [YYYY-MM-DD] - doctor agenda",
    patients: "/patients [YYYY-MM-DD] - patient count for agenda",
    myappointments: "/myappointments [YYYY-MM-DD] - your appointment list",
    book: "/book <doctorId> <YYYY-MM-DDTHH:mm:ssZ> [minutes] - request booking",
    accept: "/accept <appointmentId> - accept request (doctor/nurse/admin)",
    calendar: "/calendar <appointmentId> - calendar links",
    alarm: "/alarm <HH:MM>|off|status - doctor daily reminder (UTC)",
  };

  var lines = [
    "PulseWard Telegram Commands",
    "/start - show onboarding and command menu",
    "/help - show command menu",
  ];
  commands.forEach(function (item) {
    var commandName = normalizeTelegramCommandName(item && item.command);
    if (!commandName || commandName === "start" || commandName === "help") {
      return;
    }

    lines.push(usageMap[commandName] || "/" + commandName + " - " + String(item.description || ""));
  });

  return lines.join("\n");
}

function buildTelegramLinkedStartMessage(binding) {
  var tenantKey = normalizeTenantKey(binding && binding.tenantKey, "default");
  var subject = String((binding && binding.subject) || "").trim() || "unknown";
  var role = normalizeTelegramRole((binding && binding.role) || "patient");
  var tenantPrefs = getTenantTelegramPreferences(tenantKey);

  return [
    "Welcome to PulseWard Telegram Assistant.",
    "You are linked and ready.",
    "tenant: " + tenantKey,
    "subject: " + subject,
    "role: " + role,
    "timezone: " + tenantPrefs.timeZone,
    "",
    buildTelegramHelpMessageForRole(role),
  ].join("\n");
}

function buildTelegramUnlinkedMessage(tenantKey, chatId, commandName) {
  var normalizedTenant = normalizeTenantKey(tenantKey, "default");
  var normalizedChatId = String(chatId || "").trim() || "<chat_id>";
  var normalizedCommand = normalizeTelegramCommandName(commandName);
  var endpoints = buildTelegramOnboardingEndpoints(normalizedTenant, normalizedChatId);
  var lines = [
    "Welcome to PulseWard Telegram Assistant.",
    "This chat is not linked to an account yet.",
    "tenant: " + normalizedTenant,
    "chatId: " + normalizedChatId,
    "",
  ];

  if (normalizedCommand && normalizedCommand !== "start" && normalizedCommand !== "help") {
    lines.push("Received command: /" + normalizedCommand);
    lines.push("Run /start anytime to see this onboarding guide again.");
    lines.push("");
  }

  lines.push("Link flow:");
  lines.push("1) Login and copy your Bearer token:");
  lines.push(endpoints.loginUrl);
  lines.push("2) Link this chat from your authenticated session:");
  lines.push(endpoints.linkUrl);
  lines.push('Body: {"tenantKey":"' + normalizedTenant + '","chatId":"' + normalizedChatId + '"}');
  lines.push("");
  lines.push("Quick setup JSON guide URL:");
  lines.push(endpoints.bootstrapUrl);
  lines.push("");
  lines.push("PowerShell example:");
  lines.push(
    "Invoke-RestMethod -Method Post -Uri '" +
      endpoints.linkUrl +
      "' -Headers @{ Authorization = 'Bearer <token>' } -ContentType 'application/json' -Body (@{ tenantKey='" +
      normalizedTenant +
      "'; chatId='" +
      normalizedChatId +
      "' } | ConvertTo-Json)"
  );
  lines.push("");
  lines.push("If command menu is missing after linking, ask admin to run:");
  lines.push(endpoints.commandSetupUrl);
  lines.push("Then use /help for your command menu.");

  return lines.join("\n");
}

function normalizeTelegramCommandName(rawName) {
  var withoutSlash = String(rawName || "")
    .trim()
    .replace(/^\/+/, "");
  if (!withoutSlash) {
    return "";
  }

  var atIndex = withoutSlash.indexOf("@");
  var command = atIndex >= 0 ? withoutSlash.slice(0, atIndex) : withoutSlash;
  return command.trim().toLowerCase();
}

function parseTelegramCommandInput(text) {
  var normalized = String(text || "").trim();
  if (!normalized || normalized.charAt(0) !== "/") {
    return null;
  }

  var tokens = normalized.split(/\s+/);
  var command = normalizeTelegramCommandName(tokens[0]);
  if (!command) {
    return null;
  }

  return {
    raw: normalized,
    command: command,
    args: tokens.slice(1),
  };
}

function findTelegramBindingByChatId(tenantKey, chatId) {
  var normalizedTenant = normalizeTenantKey(tenantKey, "default");
  var normalizedChatId = String(chatId || "").trim();
  if (!normalizedChatId) {
    return null;
  }

  var iterator = telegramUserChatBindings.values();
  for (var item = iterator.next(); item && item.done !== true; item = iterator.next()) {
    var binding = item.value;
    if (!binding) {
      continue;
    }

    if (
      normalizeTenantKey(binding.tenantKey, "default") === normalizedTenant &&
      String(binding.chatId || "").trim() === normalizedChatId
    ) {
      return binding;
    }
  }

  return null;
}

function getTenantTelegramBindingCount(tenantKey) {
  var normalizedTenant = normalizeTenantKey(tenantKey, "default");
  var count = 0;
  var iterator = telegramUserChatBindings.values();
  for (var item = iterator.next(); item && item.done !== true; item = iterator.next()) {
    var binding = item.value;
    if (!binding) {
      continue;
    }

    if (normalizeTenantKey(binding.tenantKey, "default") === normalizedTenant) {
      count += 1;
    }
  }

  return count;
}

function toUtcDayToken(isoValue) {
  var date = new Date(String(isoValue || ""));
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toISOString().slice(0, 10);
}

function collectStatusCounts(items) {
  var counts = {};
  (Array.isArray(items) ? items : []).forEach(function (item) {
    var status = String((item && item.status) || "unknown")
      .trim()
      .toLowerCase();
    if (!counts[status]) {
      counts[status] = 0;
    }

    counts[status] += 1;
  });

  return counts;
}

function formatStatusCounts(counts) {
  var parts = [];
  Object.keys(counts || {})
    .sort()
    .forEach(function (status) {
      parts.push(status + ": " + counts[status]);
    });

  return parts.join(", ");
}

function formatAppointmentForTelegram(item, tenantPrefs, index) {
  var appointment = item || {};
  var whenText = formatDateTimeForTenant(appointment.appointmentDate, tenantPrefs);
  var patient = resolvePatientDescriptor(appointment);
  var status =
    String(appointment.status || "unknown")
      .trim()
      .toLowerCase() || "unknown";
  var triage =
    String(appointment.triageLevel || "")
      .trim()
      .toLowerCase() || "";
  var duration = Number(appointment.durationMinutes || 0);
  var ageSegment = patient.ageText ? " (age " + patient.ageText + ")" : "";
  var numberedPrefix = Number.isFinite(index) ? String(index + 1) + ". " : "- ";

  var segments = [
    numberedPrefix + whenText,
    patient.name + ageSegment,
    "status=" + status,
    "id=" + String(appointment.id || "n/a"),
  ];

  if (triage) {
    segments.push("triage=" + triage);
  }

  if (Number.isFinite(duration) && duration > 0) {
    segments.push("duration=" + String(Math.floor(duration)) + "m");
  }

  return segments.join(" | ");
}

function buildGoogleCalendarDateToken(value) {
  return String(value || "")
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

function buildCalendarLinksForAppointment(appointment) {
  var startDate = new Date(String((appointment && appointment.appointmentDate) || ""));
  if (Number.isNaN(startDate.getTime())) {
    return null;
  }

  var durationMinutes = Number((appointment && appointment.durationMinutes) || 30);
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    durationMinutes = 30;
  }

  var endDate = new Date(startDate.getTime() + durationMinutes * 60 * 1000);
  var title = "PulseWard Appointment";
  var details =
    "appointmentId=" +
    String((appointment && appointment.id) || "") +
    " patientId=" +
    String((appointment && appointment.patientId) || "") +
    " clinicianId=" +
    String((appointment && appointment.clinicianId) || "");

  var googleUrl =
    "https://calendar.google.com/calendar/render?action=TEMPLATE&text=" +
    encodeURIComponent(title) +
    "&dates=" +
    buildGoogleCalendarDateToken(startDate.toISOString()) +
    "/" +
    buildGoogleCalendarDateToken(endDate.toISOString()) +
    "&details=" +
    encodeURIComponent(details);

  var outlookUrl =
    "https://outlook.live.com/calendar/0/deeplink/compose?path=/calendar/action/compose&rru=addevent" +
    "&subject=" +
    encodeURIComponent(title) +
    "&startdt=" +
    encodeURIComponent(startDate.toISOString()) +
    "&enddt=" +
    encodeURIComponent(endDate.toISOString()) +
    "&body=" +
    encodeURIComponent(details);

  return {
    startIso: startDate.toISOString(),
    endIso: endDate.toISOString(),
    googleUrl: googleUrl,
    outlookUrl: outlookUrl,
  };
}

async function telegramApiPostJson(botToken, methodName, payload) {
  var endpoint =
    "https://api.telegram.org/bot" + String(botToken || "").trim() + "/" + String(methodName || "");
  var response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload || {}),
  });

  var body = await response.json().catch(function () {
    return null;
  });

  if (!response.ok || !body || body.ok !== true) {
    var detail =
      (body && body.description) ||
      (body && body.error_code ? "Telegram API error " + body.error_code : "Telegram API error");
    throw new Error(detail);
  }

  return body;
}

async function sendTelegramTextMessage(botToken, chatId, text) {
  return telegramApiPostJson(botToken, "sendMessage", {
    chat_id: String(chatId || "").trim(),
    text: String(text || "").slice(0, 4096),
    disable_web_page_preview: true,
  });
}

async function fetchTelegramUpdates(botToken, offset, limit) {
  var params = new URLSearchParams();
  if (Number.isFinite(offset) && offset > 0) {
    params.set("offset", String(Math.floor(offset)));
  }

  var boundedLimit = TELEGRAM_DEFAULT_POLL_LIMIT;
  if (Number.isFinite(limit)) {
    boundedLimit = Math.max(1, Math.min(TELEGRAM_MAX_POLL_LIMIT, Math.floor(limit)));
  }
  params.set("limit", String(boundedLimit));
  params.set("timeout", "0");

  var endpoint =
    "https://api.telegram.org/bot" +
    String(botToken || "").trim() +
    "/getUpdates?" +
    params.toString();
  var response = await fetch(endpoint);
  var payload = await response.json().catch(function () {
    return null;
  });

  if (!response.ok || !payload || payload.ok !== true || !Array.isArray(payload.result)) {
    throw new Error("Unable to fetch Telegram updates");
  }

  return payload.result;
}

async function setTelegramCommands(botToken, commandDefinitions, scope) {
  var payload = {
    commands: commandDefinitions,
  };

  if (scope && typeof scope === "object") {
    payload.scope = scope;
  }

  return telegramApiPostJson(botToken, "setMyCommands", payload);
}

async function syncTelegramCommandsForRoleChat(botToken, role, chatId) {
  var normalizedChatId = String(chatId || "").trim();
  if (!normalizedChatId) {
    return {
      accepted: false,
      reason: "chat-id-missing",
    };
  }

  await setTelegramCommands(botToken, buildTelegramCommandDefinitionsForRole(role), {
    type: "chat",
    chat_id: normalizedChatId,
  });

  return {
    accepted: true,
    role: normalizeTelegramRole(role),
    chatId: normalizedChatId,
    commandCount: buildTelegramCommandDefinitionsForRole(role).length,
  };
}

async function dispatchDoctorDailyAlarmsForTenant(tenantKey, botToken) {
  var normalizedTenant = normalizeTenantKey(tenantKey, "default");
  var now = new Date();
  var dateToken = now.toISOString().slice(0, 10);
  var nowMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  var summary = {
    evaluated: 0,
    sent: 0,
    skipped: 0,
    errors: 0,
  };

  var iterator = telegramUserChatBindings.values();
  for (var item = iterator.next(); item && item.done !== true; item = iterator.next()) {
    var binding = item.value;
    if (!binding) {
      continue;
    }

    if (normalizeTenantKey(binding.tenantKey, "default") !== normalizedTenant) {
      continue;
    }

    if (normalizeTelegramRole(binding.role) !== "doctor") {
      continue;
    }

    summary.evaluated += 1;
    var alarmKey = toDoctorAlarmKey(binding.tenantKey, binding.subject);
    var setting = telegramDoctorDailyAlarmSettings.get(alarmKey);
    if (!setting || !setting.enabled) {
      summary.skipped += 1;
      continue;
    }

    var alarmMinutes = parseUtcTimeToMinutes(setting.timeUtc);
    if (!Number.isFinite(alarmMinutes) || nowMinutes < alarmMinutes) {
      summary.skipped += 1;
      continue;
    }

    if (setting.lastSentDateToken === dateToken) {
      summary.skipped += 1;
      continue;
    }

    try {
      var appointments = await fetchAppointmentCollectionForCommand(normalizedTenant, {
        clinicianId: binding.subject,
      });
      var todayAgenda = filterAppointmentsByUtcDay(appointments, dateToken);
      var statusCounts = collectStatusCounts(todayAgenda.items);
      var uniquePatients = {};
      todayAgenda.items.forEach(function (record) {
        var patientId = String((record && record.patientId) || "").trim();
        if (patientId) {
          uniquePatients[patientId] = true;
        }
      });

      var reminderLines = [
        "Daily appointments reminder",
        "doctor: " + String(binding.subject || ""),
        "date (UTC): " + dateToken,
        "appointments: " + todayAgenda.items.length,
        "unique patients: " + Object.keys(uniquePatients).length,
        "status: " + (formatStatusCounts(statusCounts) || "n/a"),
        "Tip: use /agenda " + dateToken + " for details.",
      ];

      await sendTelegramTextMessage(botToken, binding.chatId, reminderLines.join("\n"));
      setting.lastSentDateToken = dateToken;
      setting.lastSentAt = now.toISOString();
      setting.chatId = String(binding.chatId || "").trim();
      telegramDoctorDailyAlarmSettings.set(alarmKey, setting);
      summary.sent += 1;
    } catch (_error) {
      summary.errors += 1;
    }
  }

  return summary;
}

async function fetchAppointmentCollectionForCommand(tenantKey, queryParams) {
  var baseUrl = getAppointmentServiceBaseUrl();
  var params = new URLSearchParams();
  params.set("tenantKey", normalizeTenantKey(tenantKey, "default"));

  Object.keys(queryParams || {}).forEach(function (key) {
    var value = queryParams[key];
    if (value === undefined || value === null || String(value).trim() === "") {
      return;
    }

    params.set(key, String(value));
  });

  var response = await fetch(baseUrl + "/api/v1/appointments?" + params.toString());
  var payload = await response.json().catch(function () {
    return null;
  });

  if (!response.ok || !Array.isArray(payload)) {
    throw new Error("Appointment service list endpoint returned an unexpected response");
  }

  return payload;
}

async function fetchAppointmentByIdForCommand(appointmentId) {
  var baseUrl = getAppointmentServiceBaseUrl();
  var response = await fetch(
    baseUrl + "/api/v1/appointments/" + encodeURIComponent(String(appointmentId || ""))
  );
  var payload = await response.json().catch(function () {
    return null;
  });

  if (!response.ok || !payload || typeof payload !== "object") {
    throw new Error("Appointment not found");
  }

  return payload;
}

async function createAppointmentForCommand(payload) {
  var baseUrl = getAppointmentServiceBaseUrl();
  var response = await fetch(baseUrl + "/api/v1/appointments", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload || {}),
  });
  var responseBody = await response.json().catch(function () {
    return null;
  });

  if (!response.ok || !responseBody || typeof responseBody !== "object") {
    throw new Error(
      (responseBody && responseBody.message) || "Appointment creation failed from Telegram command"
    );
  }

  return responseBody;
}

async function updateAppointmentForCommand(appointmentId, payload) {
  var baseUrl = getAppointmentServiceBaseUrl();
  var response = await fetch(
    baseUrl + "/api/v1/appointments/" + encodeURIComponent(String(appointmentId || "")),
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload || {}),
    }
  );
  var responseBody = await response.json().catch(function () {
    return null;
  });

  if (!response.ok || !responseBody || typeof responseBody !== "object") {
    throw new Error(
      (responseBody && responseBody.message) || "Appointment update failed from Telegram command"
    );
  }

  return responseBody;
}

function buildTelegramHelpMessage() {
  return buildTelegramHelpMessageForRole("patient");
}

function parseAgendaCommandArgs(args, defaultSubject) {
  var safeArgs = Array.isArray(args) ? args : [];
  var result = {
    clinicianId: String(defaultSubject || "").trim(),
    dateToken: "today",
  };

  if (safeArgs.length === 0) {
    return result;
  }

  var firstArg = String(safeArgs[0] || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(firstArg)) {
    result.dateToken = firstArg;
    return result;
  }

  result.clinicianId = firstArg || result.clinicianId;
  if (safeArgs[1] && /^\d{4}-\d{2}-\d{2}$/.test(String(safeArgs[1]).trim())) {
    result.dateToken = String(safeArgs[1]).trim();
  }

  return result;
}

function filterAppointmentsByUtcDay(items, dateToken, tenantPrefs) {
  var prefs = tenantPrefs || {};
  var timeZone = normalizeTenantTimeZone(prefs.timeZone) || TELEGRAM_TENANT_DEFAULT_TIMEZONE;
  var normalizedDateToken = String(dateToken || "today").trim();
  var expectedToken =
    normalizedDateToken.toLowerCase() === "today"
      ? getDateTokenForTimeZone(new Date(), timeZone)
      : normalizedDateToken;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(expectedToken)) {
    return {
      dateToken: "",
      items: [],
      valid: false,
    };
  }

  var filtered = (Array.isArray(items) ? items : []).filter(function (item) {
    return getDateTokenForTimeZone(item && item.appointmentDate, timeZone) === expectedToken;
  });

  return {
    dateToken: expectedToken,
    items: filtered,
    valid: true,
  };
}

function limitArray(items, maxItems) {
  var safeItems = Array.isArray(items) ? items : [];
  var boundedMax = Number.isFinite(maxItems) ? Math.max(1, Math.floor(maxItems)) : 5;
  if (safeItems.length <= boundedMax) {
    return safeItems;
  }

  return safeItems.slice(0, boundedMax);
}

async function executeTelegramCommandForBinding(binding, parsedCommand) {
  var tenantKey = normalizeTenantKey(binding && binding.tenantKey, "default");
  var subject = String((binding && binding.subject) || "").trim();
  var role = normalizeTelegramRole((binding && binding.role) || "patient");
  var tenantPrefs = getTenantTelegramPreferences(tenantKey);
  var command = parsedCommand && parsedCommand.command ? parsedCommand.command : "";
  var args = parsedCommand && Array.isArray(parsedCommand.args) ? parsedCommand.args : [];

  if (command === "start") {
    return buildTelegramLinkedStartMessage(binding);
  }

  if (command === "help") {
    return buildTelegramHelpMessageForRole(role);
  }

  if (command === "whoami") {
    return [
      "PulseWard account linkage",
      "tenant: " + tenantKey,
      "subject: " + subject,
      "role: " + role,
      "chatId: " + String((binding && binding.chatId) || ""),
      "timezone: " + tenantPrefs.timeZone,
    ].join("\n");
  }

  if (command === "agenda") {
    if (["doctor", "nurse", "admin", "frontdesk", "operations"].indexOf(role) < 0) {
      return "Access denied for /agenda. Allowed roles: doctor, nurse, admin, frontdesk, operations.";
    }

    var agendaArgs = parseAgendaCommandArgs(args, subject);
    var agendaAppointments = await fetchAppointmentCollectionForCommand(tenantKey, {
      clinicianId: agendaArgs.clinicianId,
    });
    var agendaDay = filterAppointmentsByUtcDay(agendaAppointments, agendaArgs.dateToken, tenantPrefs);
    if (!agendaDay.valid) {
      return "Invalid date format. Use YYYY-MM-DD or omit for today.";
    }

    var sortedAgenda = agendaDay.items.slice().sort(function (left, right) {
      return (
        Date.parse(String(left.appointmentDate || "")) -
        Date.parse(String(right.appointmentDate || ""))
      );
    });
    var counts = collectStatusCounts(sortedAgenda);
    var uniquePatients = {};
    sortedAgenda.forEach(function (item) {
      var descriptor = resolvePatientDescriptor(item);
      var key = descriptor.id || descriptor.name;
      if (key) {
        uniquePatients[key] = true;
      }
    });

    var lines = [
      "Agenda Summary",
      "doctor: " + agendaArgs.clinicianId,
      "date: " + agendaDay.dateToken + " (" + tenantPrefs.timeZone + ")",
      "appointments: " + sortedAgenda.length,
      "unique patients: " + Object.keys(uniquePatients).length,
      "status: " + (formatStatusCounts(counts) || "n/a"),
      "",
      "Appointments:",
    ];

    if (sortedAgenda.length === 0) {
      lines.push("No appointments found.");
      return lines.join("\n");
    }

    limitArray(sortedAgenda, TELEGRAM_COMMAND_MAX_RESPONSE_LINES).forEach(function (item, index) {
      lines.push(formatAppointmentForTelegram(item, tenantPrefs, index));
    });

    if (sortedAgenda.length > TELEGRAM_COMMAND_MAX_RESPONSE_LINES) {
      lines.push(
        "Showing first " + TELEGRAM_COMMAND_MAX_RESPONSE_LINES + " appointments."
      );
    }

    return lines.join("\n");
  }

  if (command === "patients") {
    if (["doctor", "nurse", "admin", "frontdesk", "operations"].indexOf(role) < 0) {
      return "Access denied for /patients. Allowed roles: doctor, nurse, admin, frontdesk, operations.";
    }

    var patientArgs = parseAgendaCommandArgs(args, subject);
    var patientAppointments = await fetchAppointmentCollectionForCommand(tenantKey, {
      clinicianId: patientArgs.clinicianId,
    });
    var patientDay = filterAppointmentsByUtcDay(patientAppointments, patientArgs.dateToken, tenantPrefs);
    if (!patientDay.valid) {
      return "Invalid date format. Use YYYY-MM-DD or omit for today.";
    }

    var uniquePatients = {};
    patientDay.items.forEach(function (item) {
      var descriptor = resolvePatientDescriptor(item);
      var key = descriptor.id || descriptor.name;
      if (!key) {
        return;
      }

      if (!uniquePatients[key]) {
        uniquePatients[key] = descriptor;
      }
    });

    var patientEntries = Object.keys(uniquePatients)
      .sort()
      .map(function (key) {
        return uniquePatients[key];
      });
    var responseLines = [
      "Patient Summary",
      "doctor: " + patientArgs.clinicianId,
      "date: " + patientDay.dateToken + " (" + tenantPrefs.timeZone + ")",
      "appointments: " + patientDay.items.length,
      "unique patients: " + patientEntries.length,
      "",
      "Patients:",
    ];

    limitArray(patientEntries, TELEGRAM_COMMAND_MAX_RESPONSE_LINES).forEach(function (entry, index) {
      var ageText = entry && entry.ageText ? " (age " + entry.ageText + ")" : "";
      responseLines.push(String(index + 1) + ". " + String((entry && entry.name) || "Unknown") + ageText);
    });

    if (patientEntries.length > TELEGRAM_COMMAND_MAX_RESPONSE_LINES) {
      responseLines.push("Showing first " + TELEGRAM_COMMAND_MAX_RESPONSE_LINES + " patients.");
    }

    return responseLines.join("\n");
  }

  if (command === "myappointments") {
    var myQuery = {};
    if (["doctor", "nurse"].indexOf(role) >= 0) {
      myQuery.clinicianId = subject;
    } else {
      myQuery.patientId = subject;
    }

    var myAppointments = await fetchAppointmentCollectionForCommand(tenantKey, myQuery);

    var myDateToken = args[0] ? String(args[0]).trim() : "";
    var filteredMyAppointments = myAppointments;
    var subtitle = "all available dates";

    if (myDateToken) {
      var myDay = filterAppointmentsByUtcDay(myAppointments, myDateToken, tenantPrefs);
      if (!myDay.valid) {
        return "Invalid date format. Use YYYY-MM-DD or omit for all appointments.";
      }

      filteredMyAppointments = myDay.items;
      subtitle = "on " + myDay.dateToken;
    }

    filteredMyAppointments.sort(function (left, right) {
      return (
        Date.parse(String(left.appointmentDate || "")) -
        Date.parse(String(right.appointmentDate || ""))
      );
    });

    var myCounts = collectStatusCounts(filteredMyAppointments);
    var myLines = [
      "My appointments " + subtitle,
      "timezone: " + tenantPrefs.timeZone,
      "total: " + filteredMyAppointments.length,
      "status: " + (formatStatusCounts(myCounts) || "n/a"),
    ];

    if (filteredMyAppointments.length === 0) {
      myLines.push("No appointments found.");
      return myLines.join("\n");
    }

    limitArray(filteredMyAppointments, TELEGRAM_COMMAND_MAX_RESPONSE_LINES).forEach(function (item, index) {
      myLines.push(formatAppointmentForTelegram(item, tenantPrefs, index));
    });

    if (filteredMyAppointments.length > TELEGRAM_COMMAND_MAX_RESPONSE_LINES) {
      myLines.push("Showing first " + TELEGRAM_COMMAND_MAX_RESPONSE_LINES + " items.");
    }

    return myLines.join("\n");
  }

  if (command === "alarm") {
    if (role !== "doctor") {
      return "Access denied for /alarm. Allowed roles: doctor.";
    }

    var alarmKey = toDoctorAlarmKey(tenantKey, subject);
    var existingAlarm = telegramDoctorDailyAlarmSettings.get(alarmKey) || {
      tenantKey: tenantKey,
      subject: subject,
      role: role,
      chatId: String((binding && binding.chatId) || "").trim(),
      enabled: false,
      timeUtc: TELEGRAM_DEFAULT_DOCTOR_ALARM_UTC,
      lastSentDateToken: "",
      lastSentAt: "",
      updatedAt: "",
    };

    var action = String(args[0] || "status")
      .trim()
      .toLowerCase();
    if (!action || action === "status") {
      var statusLines = buildDoctorAlarmSummaryLines(existingAlarm);
      statusLines.push("Usage: /alarm <HH:MM> or /alarm off");
      return statusLines.join("\n");
    }

    if (["off", "disable", "stop"].indexOf(action) >= 0) {
      existingAlarm.enabled = false;
      existingAlarm.updatedAt = new Date().toISOString();
      existingAlarm.chatId = String((binding && binding.chatId) || "").trim();
      telegramDoctorDailyAlarmSettings.set(alarmKey, existingAlarm);
      return buildDoctorAlarmSummaryLines(existingAlarm).join("\n");
    }

    var timeArg = action;
    if (["on", "set"].indexOf(action) >= 0) {
      timeArg = String(args[1] || TELEGRAM_DEFAULT_DOCTOR_ALARM_UTC).trim();
    }

    var normalizedTime = normalizeDoctorAlarmTimeUtc(timeArg);
    if (!normalizedTime) {
      return "Invalid alarm time. Use HH:MM in UTC, example: /alarm 07:30";
    }

    existingAlarm.enabled = true;
    existingAlarm.timeUtc = normalizedTime;
    existingAlarm.chatId = String((binding && binding.chatId) || "").trim();
    existingAlarm.updatedAt = new Date().toISOString();
    telegramDoctorDailyAlarmSettings.set(alarmKey, existingAlarm);

    var alarmLines = buildDoctorAlarmSummaryLines(existingAlarm);
    alarmLines.push("Reminder fires once per UTC day after the configured time.");
    return alarmLines.join("\n");
  }

  if (command === "book") {
    if (["patient", "frontdesk", "admin"].indexOf(role) < 0) {
      return "Access denied for /book. Allowed roles: patient, frontdesk, admin.";
    }

    if (args.length < 2) {
      return "Usage: /book <doctorId> <YYYY-MM-DDTHH:mm:ssZ> [minutes]";
    }

    var clinicianId = String(args[0] || "").trim();
    var appointmentDate = String(args[1] || "").trim();
    if (!clinicianId || !appointmentDate || !Number.isFinite(Date.parse(appointmentDate))) {
      return "Invalid booking input. doctorId and valid ISO date-time are required.";
    }

    var duration = Number(args[2] || 30);
    if (!Number.isFinite(duration) || duration < 5 || duration > 240) {
      duration = 30;
    }

    var created = await createAppointmentForCommand({
      tenantKey: tenantKey,
      patientId: subject,
      clinicianId: clinicianId,
      appointmentDate: appointmentDate,
      durationMinutes: Math.floor(duration),
      status: "pending-triage",
      source: "telegram-command",
      actorRole: role,
      clientRequestId: "tg-" + randomUUID(),
    });

    return [
      "Appointment request submitted.",
      "id: " + String(created.id || "n/a"),
      "status: " + String(created.status || "n/a"),
      "doctor: " + String(created.clinicianId || "n/a"),
      "time: " + formatDateTimeForTenant(created.appointmentDate, tenantPrefs),
      "Use /calendar " + String(created.id || "") + " after acceptance.",
    ].join("\n");
  }

  if (command === "accept") {
    if (["doctor", "nurse", "admin"].indexOf(role) < 0) {
      return "Access denied for /accept. Allowed roles: doctor, nurse, admin.";
    }

    var appointmentId = String(args[0] || "").trim();
    if (!appointmentId) {
      return "Usage: /accept <appointmentId>";
    }

    var existing = await fetchAppointmentByIdForCommand(appointmentId);
    if (normalizeTenantKey(existing.tenantKey, "default") !== tenantKey) {
      return "Appointment tenant mismatch. Cannot accept across tenants.";
    }

    if (role === "doctor" && existing.clinicianId && String(existing.clinicianId) !== subject) {
      return "Doctor access denied. This appointment belongs to another clinician.";
    }

    var updated = await updateAppointmentForCommand(appointmentId, {
      tenantKey: tenantKey,
      status: "scheduled",
      actorRole: role,
    });

    return [
      "Appointment accepted.",
      "id: " + String(updated.id || appointmentId),
      "status: " + String(updated.status || "scheduled"),
      "patient: " + resolvePatientDescriptor(updated).name,
      "time: " + formatDateTimeForTenant(updated.appointmentDate, tenantPrefs),
    ].join("\n");
  }

  if (command === "calendar") {
    var targetAppointmentId = String(args[0] || "").trim();
    if (!targetAppointmentId) {
      return "Usage: /calendar <appointmentId>";
    }

    var appointment = await fetchAppointmentByIdForCommand(targetAppointmentId);
    if (normalizeTenantKey(appointment.tenantKey, "default") !== tenantKey) {
      return "Appointment tenant mismatch. Cannot generate calendar links.";
    }

    if (role === "patient" && String(appointment.patientId || "") !== subject) {
      return "Patient access denied for this appointment.";
    }

    if (role === "doctor" && String(appointment.clinicianId || "") !== subject) {
      return "Doctor access denied for this appointment.";
    }

    var links = buildCalendarLinksForAppointment(appointment);
    if (!links) {
      return "Unable to build calendar links. Appointment date appears invalid.";
    }

    return [
      "Calendar links for appointment " + targetAppointmentId,
      "start: " + links.startIso,
      "end: " + links.endIso,
      "Google: " + links.googleUrl,
      "Outlook: " + links.outlookUrl,
    ].join("\n");
  }

  return "Unknown command. Use /help to see supported commands.";
}

function extractTelegramMessageUpdate(update) {
  if (update && update.message && update.message.chat) {
    return {
      updateId: Number(update.update_id),
      chatId: String(update.message.chat.id || "").trim(),
      text: String(update.message.text || "").trim(),
      messageId: Number(update.message.message_id || 0),
      fromUsername: String((update.message.from && update.message.from.username) || "").trim(),
    };
  }

  return null;
}

async function processTelegramCommandUpdate(tenantKey, botToken, update) {
  var messageUpdate = extractTelegramMessageUpdate(update);
  if (!messageUpdate || !messageUpdate.chatId || !messageUpdate.text) {
    return {
      handled: false,
      reason: "no-command-message",
      updateId: Number(update && update.update_id),
    };
  }

  var commandInput = parseTelegramCommandInput(messageUpdate.text);
  if (!commandInput) {
    return {
      handled: false,
      reason: "not-a-command",
      updateId: messageUpdate.updateId,
      chatId: messageUpdate.chatId,
    };
  }

  var binding = findTelegramBindingByChatId(tenantKey, messageUpdate.chatId);
  if (!binding) {
    await sendTelegramTextMessage(
      botToken,
      messageUpdate.chatId,
      buildTelegramUnlinkedMessage(tenantKey, messageUpdate.chatId, commandInput.command)
    );
    return {
      handled: true,
      reason: "unlinked-chat",
      command: commandInput.command,
      updateId: messageUpdate.updateId,
      chatId: messageUpdate.chatId,
    };
  }

  var responseText;
  try {
    responseText = await executeTelegramCommandForBinding(binding, commandInput);
  } catch (error) {
    responseText =
      "Command failed: " +
      (error && error.message
        ? error.message
        : "Unexpected error while processing Telegram command.");
  }

  await sendTelegramTextMessage(botToken, messageUpdate.chatId, responseText);
  return {
    handled: true,
    command: commandInput.command,
    updateId: messageUpdate.updateId,
    chatId: messageUpdate.chatId,
    subject: binding.subject,
    role: binding.role || "",
  };
}

function getTelegramAutoPollConfig() {
  var enabled = parseRetryBool(process.env.INTEGRATION_TELEGRAM_COMMAND_AUTOPOLL_ENABLED, true);
  var intervalMs = parseRetryInt(
    process.env.INTEGRATION_TELEGRAM_COMMAND_AUTOPOLL_INTERVAL_MS,
    5000,
    1000,
    60000
  );
  var limit = parseRetryInt(
    process.env.INTEGRATION_TELEGRAM_COMMAND_AUTOPOLL_LIMIT,
    TELEGRAM_DEFAULT_POLL_LIMIT,
    1,
    TELEGRAM_MAX_POLL_LIMIT
  );
  var ensureCommands = parseRetryBool(
    process.env.INTEGRATION_TELEGRAM_COMMAND_AUTOPOLL_SETUP_COMMANDS,
    true
  );

  return {
    enabled: enabled,
    intervalMs: intervalMs,
    limit: limit,
    ensureCommands: ensureCommands,
  };
}

function resolveTelegramAutoPollTenantKeys() {
  var rawConfigured = String(
    process.env.INTEGRATION_TELEGRAM_COMMAND_AUTOPOLL_TENANTS || ""
  ).trim();
  var tenants = [];

  if (rawConfigured) {
    rawConfigured.split(",").forEach(function (item) {
      var normalized = normalizeTenantKey(item, "");
      if (normalized && tenants.indexOf(normalized) < 0) {
        tenants.push(normalized);
      }
    });
  }

  var strictTenant = normalizeTenantKey(process.env.PULSEWARD_STRICT_TENANT_KEY, "");
  var defaultTenant = normalizeTenantKey(process.env.PLATFORM_DEFAULT_TENANT_KEY, "");

  if (strictTenant && tenants.indexOf(strictTenant) < 0) {
    tenants.push(strictTenant);
  }

  if (defaultTenant && tenants.indexOf(defaultTenant) < 0) {
    tenants.push(defaultTenant);
  }

  if (tenants.length === 0) {
    tenants.push("default");
  }

  return tenants;
}

async function pollTelegramCommandsForTenant(tenantKey, options) {
  var normalizedTenant = normalizeTenantKey(tenantKey, "default");
  var skipBacklogOnBoot = parseRetryBool(
    process.env.INTEGRATION_TELEGRAM_COMMAND_AUTOPOLL_SKIP_BACKLOG_ON_BOOT,
    true
  );
  var config = loadTenantIntegrationConfig(normalizedTenant);
  var provider = findMessagingProvider(config, "telegram-bot");
  if (!provider || !provider.enabled) {
    return {
      tenantKey: normalizedTenant,
      skipped: true,
      reason: "telegram-provider-disabled",
      fetchedUpdates: 0,
      handledCommands: 0,
      nextOffset: Number(telegramCommandOffsets.get(normalizedTenant) || 0),
    };
  }

  var botToken = getTelegramBotToken(config);
  if (!botToken) {
    return {
      tenantKey: normalizedTenant,
      skipped: true,
      reason: "telegram-bot-token-missing",
      fetchedUpdates: 0,
      handledCommands: 0,
      nextOffset: Number(telegramCommandOffsets.get(normalizedTenant) || 0),
    };
  }

  if (options.ensureCommands) {
    await ensureTelegramCommandsConfigured(normalizedTenant, botToken);
  }

  var offset = Number(telegramCommandOffsets.get(normalizedTenant) || 0);
  var hadStoredOffset = telegramCommandOffsets.has(normalizedTenant) && offset > 0;
  var updates = await fetchTelegramUpdates(botToken, offset, options.limit);
  var handledCommands = 0;
  var failedCommands = 0;
  var processed = [];
  var nextOffset = offset;

  if (!hadStoredOffset && skipBacklogOnBoot && updates.length > 0) {
    var highestUpdateId = offset;
    for (var scanIndex = 0; scanIndex < updates.length; scanIndex += 1) {
      var scanUpdateId = Number(updates[scanIndex] && updates[scanIndex].update_id);
      if (Number.isFinite(scanUpdateId) && scanUpdateId >= highestUpdateId) {
        highestUpdateId = scanUpdateId + 1;
      }
    }

    telegramCommandOffsets.set(normalizedTenant, highestUpdateId);
    var bootAlarmSummary = await dispatchDoctorDailyAlarmsForTenant(normalizedTenant, botToken);

    return {
      tenantKey: normalizedTenant,
      skipped: true,
      reason: "startup-backlog-skipped",
      fetchedUpdates: updates.length,
      handledCommands: 0,
      failedCommands: 0,
      doctorDailyAlarms: bootAlarmSummary,
      nextOffset: highestUpdateId,
      processed: [],
    };
  }

  for (var index = 0; index < updates.length; index += 1) {
    var update = updates[index];
    var updateId = Number(update && update.update_id);
    if (Number.isFinite(updateId) && updateId >= nextOffset) {
      nextOffset = updateId + 1;
    }

    try {
      var result = await processTelegramCommandUpdate(normalizedTenant, botToken, update);
      if (result && result.handled) {
        handledCommands += 1;
      }

      if (result) {
        processed.push(result);
      }
    } catch (updateError) {
      failedCommands += 1;
      processed.push({
        handled: false,
        reason: "update-processing-failed",
        updateId: Number.isFinite(updateId) ? updateId : Number(update && update.update_id),
        error:
          updateError && updateError.message
            ? updateError.message
            : "Unknown Telegram command processing error",
      });
    }
  }

  telegramCommandOffsets.set(normalizedTenant, nextOffset);
  var doctorAlarmSummary = await dispatchDoctorDailyAlarmsForTenant(normalizedTenant, botToken);

  return {
    tenantKey: normalizedTenant,
    skipped: false,
    reason: "",
    fetchedUpdates: updates.length,
    handledCommands: handledCommands,
    failedCommands: failedCommands,
    doctorDailyAlarms: doctorAlarmSummary,
    nextOffset: nextOffset,
    processed: processed,
  };
}

function getTelegramAutoPollRuntimeState() {
  var config = getTelegramAutoPollConfig();
  return {
    enabled: config.enabled,
    intervalMs: config.intervalMs,
    limit: config.limit,
    ensureCommands: config.ensureCommands,
    inFlight: telegramAutoPollInFlight,
    running: Boolean(telegramAutoPollTimer),
    lastRunAt: telegramAutoPollLastRunAt || null,
    lastError: telegramAutoPollLastError || null,
    tenants: resolveTelegramAutoPollTenantKeys(),
    doctorAlarmSettingsCount: telegramDoctorDailyAlarmSettings.size,
    lastSummary: telegramAutoPollLastSummary,
  };
}

function startTelegramCommandAutoPolling(options) {
  var logger = options && options.logger ? options.logger : console;

  if (telegramAutoPollTimer) {
    return {
      started: false,
      reason: "already-running",
      runtime: getTelegramAutoPollRuntimeState(),
    };
  }

  var config = getTelegramAutoPollConfig();
  if (!config.enabled) {
    if (logger && typeof logger.log === "function") {
      logger.log("Notification Service Telegram auto-polling disabled by config.");
    }

    return {
      started: false,
      reason: "disabled",
      runtime: getTelegramAutoPollRuntimeState(),
    };
  }

  var runCycle = async function () {
    if (telegramAutoPollInFlight) {
      return;
    }

    telegramAutoPollInFlight = true;
    telegramAutoPollLastError = "";

    try {
      var tenants = resolveTelegramAutoPollTenantKeys();
      var summary = [];

      for (var index = 0; index < tenants.length; index += 1) {
        var tenantKey = tenants[index];
        try {
          var tenantResult = await pollTelegramCommandsForTenant(tenantKey, config);
          summary.push(tenantResult);

          if (
            logger &&
            typeof logger.log === "function" &&
            tenantResult &&
            tenantResult.handledCommands > 0
          ) {
            logger.log(
              "Notification Service Telegram auto-poll handled " +
                tenantResult.handledCommands +
                " command(s) for tenant " +
                tenantResult.tenantKey +
                "."
            );
          }

          if (
            logger &&
            typeof logger.log === "function" &&
            tenantResult &&
            tenantResult.doctorDailyAlarms &&
            tenantResult.doctorDailyAlarms.sent > 0
          ) {
            logger.log(
              "Notification Service Telegram daily alarm sent " +
                tenantResult.doctorDailyAlarms.sent +
                " reminder(s) for tenant " +
                tenantResult.tenantKey +
                "."
            );
          }
        } catch (tenantError) {
          summary.push({
            tenantKey: tenantKey,
            skipped: true,
            reason: "tenant-poll-failed",
            error:
              tenantError && tenantError.message
                ? tenantError.message
                : "Unknown tenant poll error",
          });
        }
      }

      telegramAutoPollLastSummary = summary;
      telegramAutoPollLastRunAt = new Date().toISOString();
    } catch (error) {
      telegramAutoPollLastError =
        error && error.message ? error.message : "Unknown auto-poll error";
      telegramAutoPollLastRunAt = new Date().toISOString();
      if (logger && typeof logger.error === "function") {
        logger.error("Notification Service Telegram auto-poll failed", error);
      }
    } finally {
      telegramAutoPollInFlight = false;
    }
  };

  runCycle().catch(function () {
    return null;
  });

  telegramAutoPollTimer = setInterval(function () {
    runCycle().catch(function () {
      return null;
    });
  }, config.intervalMs);

  if (telegramAutoPollTimer && typeof telegramAutoPollTimer.unref === "function") {
    telegramAutoPollTimer.unref();
  }

  if (logger && typeof logger.log === "function") {
    logger.log(
      "Notification Service Telegram auto-polling started (interval=" +
        config.intervalMs +
        "ms, tenants=" +
        resolveTelegramAutoPollTenantKeys().join(",") +
        ")."
    );
  }

  return {
    started: true,
    reason: "started",
    runtime: getTelegramAutoPollRuntimeState(),
  };
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

function parseOptionalBoolQuery(value) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return null;
  }

  var normalized = String(value).trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes") {
    return true;
  }

  if (normalized === "false" || normalized === "0" || normalized === "no") {
    return false;
  }

  return null;
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
  var fallbackSecret = String(
    fallback.signingSecret || fallback.secret || fallback.raw || ""
  ).trim();

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

function getFaultManifestVerifyFingerprint(payload) {
  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        tenantKey: payload.tenantKey || null,
        providerKey: payload.providerKey || null,
        scenario: payload.scenario || null,
        limit: payload.limit,
        manifestVersion: payload.manifestVersion || null,
        issuedAt: payload.issuedAt || null,
        nonce: payload.nonce || null,
        expectedNonce: payload.expectedNonce || null,
        maxAgeSeconds: payload.maxAgeSeconds,
        digest: payload.digest || null,
        signature: payload.signature || null,
      }),
      "utf8"
    )
    .digest("hex");
}

function findFaultManifestVerifyAttempt(fingerprint) {
  for (var index = 0; index < faultManifestVerifyAttemptCache.length; index += 1) {
    if (faultManifestVerifyAttemptCache[index].fingerprint === fingerprint) {
      return {
        index: index,
        attempt: faultManifestVerifyAttemptCache[index],
      };
    }
  }

  return null;
}

function pruneFaultManifestVerifyAttempts(nowMs) {
  var windowMs = faultManifestVerifyDedupeWindowSeconds * 1000;
  var prunedByWindow = 0;

  faultManifestVerifyAttemptCache = faultManifestVerifyAttemptCache.filter(function (attempt) {
    var keep = nowMs - attempt.lastSeenAtMs <= windowMs;
    if (!keep) {
      prunedByWindow += 1;
    }

    return keep;
  });

  var prunedByMaxEntries = 0;
  while (faultManifestVerifyAttemptCache.length > faultManifestVerifyDedupeMaxEntries) {
    faultManifestVerifyAttemptCache.shift();
    prunedByMaxEntries += 1;
  }

  return {
    prunedByWindow: prunedByWindow,
    prunedByMaxEntries: prunedByMaxEntries,
    prunedCount: prunedByWindow + prunedByMaxEntries,
  };
}

function estimateFaultManifestVerifyAttemptPrune(nowMs, dedupeWindowSeconds, maxEntries) {
  var windowMs = Math.max(dedupeWindowSeconds, 0) * 1000;
  var retainedEntries = 0;
  var prunedByWindow = 0;

  faultManifestVerifyAttemptCache.forEach(function (attempt) {
    var keep = nowMs - attempt.lastSeenAtMs <= windowMs;
    if (keep) {
      retainedEntries += 1;
      return;
    }

    prunedByWindow += 1;
  });

  var prunedByMaxEntries = Math.max(retainedEntries - Math.max(maxEntries, 0), 0);

  return {
    prunedByWindow: prunedByWindow,
    prunedByMaxEntries: prunedByMaxEntries,
    prunedCount: prunedByWindow + prunedByMaxEntries,
  };
}

function buildFaultManifestVerifyAttemptSaturation(totalRecorded) {
  var maxEntries = Math.max(faultManifestVerifyDedupeMaxEntries, 1);
  var currentEntries = Math.max(totalRecorded, 0);
  var utilizationPercent = Number(((currentEntries / maxEntries) * 100).toFixed(1));
  var remainingEntries = Math.max(maxEntries - currentEntries, 0);
  var alertLevel = "normal";
  var recommendedAction =
    "Capacity healthy: continue monitoring telemetry.saturation during replay-heavy drills.";

  if (utilizationPercent >= faultManifestVerifyRetentionSaturationCriticalPercent) {
    alertLevel = "critical";
    recommendedAction =
      "Capacity critical: increase maxEntries or prune stale entries via retention apply immediately to preserve replay-attempt visibility.";
  } else if (utilizationPercent >= faultManifestVerifyRetentionSaturationWarningPercent) {
    alertLevel = "warning";
    recommendedAction =
      "Near capacity: increase maxEntries or prune stale entries via retention apply before sustained replay traffic.";
  }

  return {
    currentEntries: currentEntries,
    maxEntries: maxEntries,
    utilizationPercent: utilizationPercent,
    remainingEntries: remainingEntries,
    warningThresholdPercent: faultManifestVerifyRetentionSaturationWarningPercent,
    criticalThresholdPercent: faultManifestVerifyRetentionSaturationCriticalPercent,
    alertLevel: alertLevel,
    recommendedAction: recommendedAction,
  };
}

function appendFaultManifestVerifySaturationTrendSnapshot(trigger, saturation, capturedAtMs) {
  var snapshotTimeMs = capturedAtMs || Date.now();

  faultManifestVerifyRetentionSaturationTrendSnapshots.push({
    capturedAt: new Date(snapshotTimeMs).toISOString(),
    capturedAtMs: snapshotTimeMs,
    trigger: trigger,
    currentEntries: saturation.currentEntries,
    maxEntries: saturation.maxEntries,
    utilizationPercent: saturation.utilizationPercent,
    remainingEntries: saturation.remainingEntries,
    alertLevel: saturation.alertLevel,
  });

  while (
    faultManifestVerifyRetentionSaturationTrendSnapshots.length >
    faultManifestVerifyRetentionSaturationTrendMaxSnapshots
  ) {
    faultManifestVerifyRetentionSaturationTrendSnapshots.shift();
  }
}

function maybeCaptureFaultManifestVerifySaturationTrend(trigger, saturation, forceCapture) {
  var snapshotTimeMs = Date.now();
  var latestSnapshot =
    faultManifestVerifyRetentionSaturationTrendSnapshots.length > 0
      ? faultManifestVerifyRetentionSaturationTrendSnapshots[
          faultManifestVerifyRetentionSaturationTrendSnapshots.length - 1
        ]
      : null;

  if (forceCapture || !latestSnapshot) {
    appendFaultManifestVerifySaturationTrendSnapshot(trigger, saturation, snapshotTimeMs);
    return;
  }

  var elapsedSeconds = (snapshotTimeMs - latestSnapshot.capturedAtMs) / 1000;
  var utilizationDelta = Math.abs(
    saturation.utilizationPercent - latestSnapshot.utilizationPercent
  );
  var alertLevelChanged = saturation.alertLevel !== latestSnapshot.alertLevel;

  if (
    alertLevelChanged ||
    utilizationDelta >= 2 ||
    elapsedSeconds >= faultManifestVerifyRetentionSaturationTrendMinCaptureSeconds
  ) {
    appendFaultManifestVerifySaturationTrendSnapshot(trigger, saturation, snapshotTimeMs);
  }
}

function collectFaultManifestVerifyAttemptSaturationTrend(options) {
  var windowMinutes = parseRetryInt(options.windowMinutes, 60, 5, 1440);
  var requestedLimit = parseRetryInt(options.limit, 24, 1, 288);
  var nowMs = Date.now();
  var windowMs = windowMinutes * 60 * 1000;

  var snapshotsInWindow = faultManifestVerifyRetentionSaturationTrendSnapshots.filter(function (
    snapshot
  ) {
    return nowMs - snapshot.capturedAtMs <= windowMs;
  });

  var totalInWindow = snapshotsInWindow.length;
  var snapshots = snapshotsInWindow.slice(Math.max(totalInWindow - requestedLimit, 0));
  var hasMore = totalInWindow > snapshots.length;

  var summary = {
    windowMinutes: windowMinutes,
    requestedLimit: requestedLimit,
    totalInWindow: totalInWindow,
    returned: snapshots.length,
    hasMore: hasMore,
    firstCapturedAt: null,
    lastCapturedAt: null,
    minUtilizationPercent: null,
    maxUtilizationPercent: null,
    avgUtilizationPercent: null,
    latestUtilizationPercent: null,
    latestAlertLevel: null,
    trendDirection: "flat",
    anomalies: [],
    highestAnomalySeverity: null,
    anomalyTracking: null,
  };

  if (totalInWindow > 0) {
    var firstSnapshot = snapshotsInWindow[0];
    var lastSnapshot = snapshotsInWindow[totalInWindow - 1];
    var minUtilizationPercent = firstSnapshot.utilizationPercent;
    var maxUtilizationPercent = firstSnapshot.utilizationPercent;
    var totalUtilizationPercent = 0;

    snapshotsInWindow.forEach(function (snapshot) {
      totalUtilizationPercent += snapshot.utilizationPercent;

      if (snapshot.utilizationPercent < minUtilizationPercent) {
        minUtilizationPercent = snapshot.utilizationPercent;
      }

      if (snapshot.utilizationPercent > maxUtilizationPercent) {
        maxUtilizationPercent = snapshot.utilizationPercent;
      }
    });

    var utilizationDelta = lastSnapshot.utilizationPercent - firstSnapshot.utilizationPercent;
    var trendDirection = "flat";
    if (utilizationDelta > 0.1) {
      trendDirection = "up";
    } else if (utilizationDelta < -0.1) {
      trendDirection = "down";
    }

    summary.firstCapturedAt = firstSnapshot.capturedAt;
    summary.lastCapturedAt = lastSnapshot.capturedAt;
    summary.minUtilizationPercent = minUtilizationPercent;
    summary.maxUtilizationPercent = maxUtilizationPercent;
    summary.avgUtilizationPercent = Number((totalUtilizationPercent / totalInWindow).toFixed(1));
    summary.latestUtilizationPercent = lastSnapshot.utilizationPercent;
    summary.latestAlertLevel = lastSnapshot.alertLevel;
    summary.trendDirection = trendDirection;
  }

  var anomalies = evaluateFaultManifestVerifySaturationTrendAnomalies(summary, snapshotsInWindow);
  summary.anomalies = attachFaultManifestVerifyAnomalyTracking(summary, anomalies);
  summary.highestAnomalySeverity = getHighestFaultManifestVerifyAnomalySeverity(summary.anomalies);
  summary.anomalyTracking = buildFaultManifestVerifyAnomalyTrackingSummary();
  summary.escalation = buildFaultManifestVerifyAnomalyEscalationSummary();
  summary.recentlyClosedCount = faultManifestVerifyRecentlyClosedAnomalies.length;

  return {
    summary: summary,
    snapshots: snapshots.map(function (snapshot) {
      return {
        capturedAt: snapshot.capturedAt,
        trigger: snapshot.trigger,
        currentEntries: snapshot.currentEntries,
        maxEntries: snapshot.maxEntries,
        utilizationPercent: snapshot.utilizationPercent,
        remainingEntries: snapshot.remainingEntries,
        alertLevel: snapshot.alertLevel,
      };
    }),
  };
}

function getHighestFaultManifestVerifyAnomalySeverity(anomalies) {
  if (!Array.isArray(anomalies) || anomalies.length === 0) {
    return null;
  }

  var hasCritical = anomalies.some(function (anomaly) {
    return anomaly.severity === "critical";
  });

  if (hasCritical) {
    return "critical";
  }

  return "warning";
}

function evaluateFaultManifestVerifySaturationTrendAnomalies(summary, snapshots) {
  var anomalies = [];
  var totalSnapshots = snapshots.length;

  if (
    summary.latestAlertLevel === "warning" &&
    totalSnapshots >= faultManifestVerifyRetentionAnomalySustainedWarningMinSnapshots
  ) {
    var warningTail = snapshots.slice(
      -faultManifestVerifyRetentionAnomalySustainedWarningMinSnapshots
    );
    var sustainedWarning = warningTail.every(function (snapshot) {
      return snapshot.alertLevel === "warning";
    });

    if (sustainedWarning) {
      anomalies.push({
        key: "sustained-warning",
        severity: "warning",
        recommendedAction:
          "Sustained warning saturation detected. Increase maxEntries or apply prune before the next replay-heavy verification window.",
        evidence: {
          snapshotCount: warningTail.length,
          latestUtilizationPercent: summary.latestUtilizationPercent,
        },
      });
    }
  }

  if (
    summary.latestAlertLevel === "critical" &&
    totalSnapshots >= faultManifestVerifyRetentionAnomalySustainedCriticalMinSnapshots
  ) {
    var criticalTail = snapshots.slice(
      -faultManifestVerifyRetentionAnomalySustainedCriticalMinSnapshots
    );
    var sustainedCritical = criticalTail.every(function (snapshot) {
      return snapshot.alertLevel === "critical";
    });

    if (sustainedCritical) {
      anomalies.push({
        key: "sustained-critical",
        severity: "critical",
        recommendedAction:
          "Critical saturation persisted across recent snapshots. Apply retention correction immediately and capture before/after telemetry for incident evidence.",
        evidence: {
          snapshotCount: criticalTail.length,
          latestUtilizationPercent: summary.latestUtilizationPercent,
        },
      });
    }
  }

  if (summary.trendDirection === "up" && totalSnapshots >= 4) {
    var latestSnapshot = snapshots[totalSnapshots - 1];
    var previousSnapshot = snapshots[totalSnapshots - 2];
    var baselineSnapshot = snapshots[totalSnapshots - 3];
    var latestDelta = Number(
      (latestSnapshot.utilizationPercent - previousSnapshot.utilizationPercent).toFixed(1)
    );
    var previousDelta = Number(
      (previousSnapshot.utilizationPercent - baselineSnapshot.utilizationPercent).toFixed(1)
    );

    if (
      latestDelta > 0 &&
      latestDelta - previousDelta >= faultManifestVerifyRetentionAnomalyAccelerationDeltaPercent
    ) {
      anomalies.push({
        key: "accelerating-utilization",
        severity: "warning",
        recommendedAction:
          "Utilization growth is accelerating. Preemptively tune maxEntries or prune stale attempts before crossing sustained critical saturation.",
        evidence: {
          previousDeltaPercent: previousDelta,
          latestDeltaPercent: latestDelta,
        },
      });
    }
  }

  return anomalies;
}

function pruneFaultManifestVerifyAnomalyTracking(nowMs) {
  var retentionWindowMs = faultManifestVerifyRetentionAnomalyRetentionWindowSeconds * 1000;

  faultManifestVerifyAnomalyInstances = faultManifestVerifyAnomalyInstances.filter(function (item) {
    return nowMs - item.lastUpdatedAtMs <= retentionWindowMs;
  });

  faultManifestVerifyAnomalyInstances.sort(function (left, right) {
    return left.lastUpdatedAtMs - right.lastUpdatedAtMs;
  });

  while (
    faultManifestVerifyAnomalyInstances.length >
    faultManifestVerifyRetentionAnomalyInstanceMaxEntries
  ) {
    faultManifestVerifyAnomalyInstances.shift();
  }

  faultManifestVerifyAnomalyActions = faultManifestVerifyAnomalyActions.filter(function (item) {
    return nowMs - item.createdAtMs <= retentionWindowMs;
  });

  while (
    faultManifestVerifyAnomalyActions.length > faultManifestVerifyRetentionAnomalyActionMaxEntries
  ) {
    faultManifestVerifyAnomalyActions.shift();
  }

  faultManifestVerifyRecentlyClosedAnomalies = faultManifestVerifyRecentlyClosedAnomalies.filter(
    function (item) {
      return nowMs - Date.parse(item.closedAt || "") <= retentionWindowMs;
    }
  );

  while (
    faultManifestVerifyRecentlyClosedAnomalies.length >
    faultManifestVerifyRetentionAnomalyRecentlyClosedMaxEntries
  ) {
    faultManifestVerifyRecentlyClosedAnomalies.shift();
  }
}

function buildFaultManifestVerifyAnomalyTrackingSummary() {
  var activeCount = 0;
  var acknowledgedActiveCount = 0;
  var noteCount = 0;

  faultManifestVerifyAnomalyInstances.forEach(function (item) {
    noteCount += Array.isArray(item.notes) ? item.notes.length : 0;
    if (item.status !== "active") {
      return;
    }

    activeCount += 1;
    if (item.triage && item.triage.acknowledged) {
      acknowledgedActiveCount += 1;
    }
  });

  return {
    statePersistence: "memory-only",
    retainedAnomalyInstances: faultManifestVerifyAnomalyInstances.length,
    retainedActionEntries: faultManifestVerifyAnomalyActions.length,
    retainedRecentlyClosedEntries: faultManifestVerifyRecentlyClosedAnomalies.length,
    activeCount: activeCount,
    acknowledgedActiveCount: acknowledgedActiveCount,
    unacknowledgedActiveCount: Math.max(activeCount - acknowledgedActiveCount, 0),
    noteCount: noteCount,
    escalation: buildFaultManifestVerifyAnomalyEscalationSummary(),
  };
}

function findFaultManifestVerifyAnomalyInstanceByKey(key) {
  for (var index = 0; index < faultManifestVerifyAnomalyInstances.length; index += 1) {
    if (faultManifestVerifyAnomalyInstances[index].key === key) {
      return faultManifestVerifyAnomalyInstances[index];
    }
  }

  return null;
}

function findFaultManifestVerifyAnomalyInstanceById(anomalyInstanceId) {
  for (var index = 0; index < faultManifestVerifyAnomalyInstances.length; index += 1) {
    if (faultManifestVerifyAnomalyInstances[index].anomalyInstanceId === anomalyInstanceId) {
      return faultManifestVerifyAnomalyInstances[index];
    }
  }

  return null;
}

function buildFaultManifestVerifyAnomalyTriageSnapshot(instance) {
  return {
    acknowledged: Boolean(instance.triage && instance.triage.acknowledged),
    acknowledgedAt: instance.triage ? instance.triage.acknowledgedAt : null,
    acknowledgedBy: instance.triage ? instance.triage.acknowledgedBy : null,
    notesCount: Array.isArray(instance.notes) ? instance.notes.length : 0,
    latestNote:
      Array.isArray(instance.notes) && instance.notes.length > 0
        ? instance.notes[instance.notes.length - 1]
        : null,
  };
}

function getFaultManifestVerifyEscalationPolicy() {
  return {
    enabled: faultManifestVerifyRetentionEscalationEnabled,
    warningUnacknowledgedEscalateAfterSeconds:
      faultManifestVerifyRetentionEscalationWarningUnacknowledgedAfterSeconds,
    criticalUnacknowledgedEscalateAfterSeconds:
      faultManifestVerifyRetentionEscalationCriticalUnacknowledgedAfterSeconds,
    criticalUnmitigatedEscalateAfterSeconds:
      faultManifestVerifyRetentionEscalationCriticalUnmitigatedAfterSeconds,
    mitigationNoteTypes: faultManifestVerifyRetentionEscalationMitigationNoteTypes.slice(),
    autoDeescalateOnMitigation: faultManifestVerifyRetentionEscalationAutoDeescalateOnMitigation,
  };
}

function getFaultManifestVerifyEscalationExportPolicy() {
  return {
    enabled: faultManifestVerifyRetentionEscalationExportEnabled,
    defaultFormat: faultManifestVerifyRetentionEscalationExportDefaultFormat,
    maxExportRows: faultManifestVerifyRetentionEscalationExportMaxRows,
    includeRecentlyClosedByDefault:
      faultManifestVerifyRetentionEscalationExportIncludeRecentlyClosedByDefault,
  };
}

function applyFaultManifestVerifyEscalationExportPolicy(rawPolicy, options) {
  var shouldCommit = !options || options.commit !== false;

  if (rawPolicy === undefined || rawPolicy === null) {
    return {
      changed: false,
      previousPolicy: getFaultManifestVerifyEscalationExportPolicy(),
      policy: getFaultManifestVerifyEscalationExportPolicy(),
    };
  }

  if (typeof rawPolicy !== "object" || Array.isArray(rawPolicy)) {
    return {
      error: {
        status: 400,
        code: "NOTIFICATION_FAULT_MANIFEST_VERIFY_ESCALATION_EXPORT_POLICY_INVALID",
        message: "escalationExportPolicy must be an object",
      },
    };
  }

  var previousPolicy = getFaultManifestVerifyEscalationExportPolicy();
  var nextDefaultFormat =
    rawPolicy.defaultFormat !== undefined
      ? String(rawPolicy.defaultFormat || "")
          .trim()
          .toLowerCase()
      : previousPolicy.defaultFormat;
  if (nextDefaultFormat !== "json" && nextDefaultFormat !== "csv") {
    return {
      error: {
        status: 400,
        code: "NOTIFICATION_FAULT_MANIFEST_VERIFY_ESCALATION_EXPORT_POLICY_INVALID",
        message: "escalationExportPolicy.defaultFormat must be json or csv",
      },
    };
  }

  var nextPolicy = {
    enabled:
      rawPolicy.enabled !== undefined
        ? parseRetryBool(rawPolicy.enabled, previousPolicy.enabled)
        : previousPolicy.enabled,
    defaultFormat: nextDefaultFormat,
    maxExportRows:
      rawPolicy.maxExportRows !== undefined
        ? parseRetryInt(rawPolicy.maxExportRows, previousPolicy.maxExportRows, 50, 5000)
        : previousPolicy.maxExportRows,
    includeRecentlyClosedByDefault:
      rawPolicy.includeRecentlyClosedByDefault !== undefined
        ? parseRetryBool(
            rawPolicy.includeRecentlyClosedByDefault,
            previousPolicy.includeRecentlyClosedByDefault
          )
        : previousPolicy.includeRecentlyClosedByDefault,
  };

  if (shouldCommit) {
    faultManifestVerifyRetentionEscalationExportEnabled = nextPolicy.enabled;
    faultManifestVerifyRetentionEscalationExportDefaultFormat = nextPolicy.defaultFormat;
    faultManifestVerifyRetentionEscalationExportMaxRows = nextPolicy.maxExportRows;
    faultManifestVerifyRetentionEscalationExportIncludeRecentlyClosedByDefault =
      nextPolicy.includeRecentlyClosedByDefault;
  }

  return {
    changed: JSON.stringify(previousPolicy) !== JSON.stringify(nextPolicy),
    previousPolicy: previousPolicy,
    policy: nextPolicy,
  };
}

function buildFaultManifestVerifyAnomalyEscalationAcknowledgementSla(instance, nowMs) {
  if (!instance || instance.status !== "active") {
    return {
      status: "not-applicable",
      targetSeconds: null,
      elapsedSeconds: null,
      remainingSeconds: null,
      breached: false,
      breachSeconds: 0,
      measuredFrom: null,
      measuredUntil: null,
      acknowledged: Boolean(instance && instance.triage && instance.triage.acknowledged),
      acknowledgedAt: instance && instance.triage ? instance.triage.acknowledgedAt : null,
    };
  }

  var targetSeconds = null;
  if (instance.severity === "warning") {
    targetSeconds = faultManifestVerifyRetentionEscalationWarningUnacknowledgedAfterSeconds;
  } else if (instance.severity === "critical") {
    targetSeconds = faultManifestVerifyRetentionEscalationCriticalUnacknowledgedAfterSeconds;
  }

  if (targetSeconds === null) {
    return {
      status: "not-applicable",
      targetSeconds: null,
      elapsedSeconds: null,
      remainingSeconds: null,
      breached: false,
      breachSeconds: 0,
      measuredFrom: null,
      measuredUntil: null,
      acknowledged: Boolean(instance.triage && instance.triage.acknowledged),
      acknowledgedAt: instance.triage ? instance.triage.acknowledgedAt : null,
    };
  }

  var measuredFromMs = Date.parse(instance.firstDetectedAt || "") || nowMs;
  var measuredFrom = new Date(measuredFromMs).toISOString();
  var acknowledged = Boolean(instance.triage && instance.triage.acknowledged);
  var acknowledgedAt = instance.triage ? instance.triage.acknowledgedAt : null;
  var measuredUntilMs = acknowledged ? Date.parse(acknowledgedAt || "") || nowMs : nowMs;
  var measuredUntil = new Date(measuredUntilMs).toISOString();
  var elapsedSeconds = Math.max(0, Math.round((measuredUntilMs - measuredFromMs) / 1000));
  var breached = elapsedSeconds > targetSeconds;
  var remainingSeconds = Math.max(targetSeconds - elapsedSeconds, 0);
  var breachSeconds = breached ? elapsedSeconds - targetSeconds : 0;

  var status = "within-sla";
  if (acknowledged) {
    status = breached ? "acknowledged-breached" : "acknowledged-within-sla";
  } else if (breached) {
    status = "breached";
  }

  return {
    status: status,
    targetSeconds: targetSeconds,
    elapsedSeconds: elapsedSeconds,
    remainingSeconds: remainingSeconds,
    breached: breached,
    breachSeconds: breachSeconds,
    measuredFrom: measuredFrom,
    measuredUntil: measuredUntil,
    acknowledged: acknowledged,
    acknowledgedAt: acknowledgedAt,
  };
}

function getFaultManifestVerifyAnomalyLifecyclePolicy() {
  return {
    closureHistoryPerInstanceMax: faultManifestVerifyRetentionAnomalyClosureHistoryPerInstanceMax,
    recentlyClosedMaxEntries: faultManifestVerifyRetentionAnomalyRecentlyClosedMaxEntries,
    statePersistence: "memory-only",
  };
}

function normalizeFaultManifestVerifyMitigationNoteTypes(input, fallback) {
  var values = [];

  if (Array.isArray(input)) {
    values = input;
  } else if (typeof input === "string") {
    values = input.split(",");
  } else {
    return fallback.slice();
  }

  var normalized = values
    .map(function (item) {
      return String(item || "")
        .trim()
        .toLowerCase();
    })
    .filter(function (item, index, items) {
      return item && items.indexOf(item) === index;
    });

  if (normalized.length === 0) {
    return fallback.slice();
  }

  return normalized.slice(0, 12);
}

function applyFaultManifestVerifyEscalationPolicy(rawPolicy, options) {
  var shouldCommit = !options || options.commit !== false;

  if (rawPolicy === undefined || rawPolicy === null) {
    return {
      changed: false,
      previousPolicy: getFaultManifestVerifyEscalationPolicy(),
      policy: getFaultManifestVerifyEscalationPolicy(),
    };
  }

  if (typeof rawPolicy !== "object" || Array.isArray(rawPolicy)) {
    return {
      error: {
        status: 400,
        code: "NOTIFICATION_FAULT_MANIFEST_VERIFY_ESCALATION_POLICY_INVALID",
        message: "escalationPolicy must be an object",
      },
    };
  }

  var previousPolicy = getFaultManifestVerifyEscalationPolicy();
  var nextPolicy = {
    enabled:
      rawPolicy.enabled !== undefined
        ? parseRetryBool(rawPolicy.enabled, previousPolicy.enabled)
        : previousPolicy.enabled,
    warningUnacknowledgedEscalateAfterSeconds:
      rawPolicy.warningUnacknowledgedEscalateAfterSeconds !== undefined
        ? parseRetryInt(
            rawPolicy.warningUnacknowledgedEscalateAfterSeconds,
            previousPolicy.warningUnacknowledgedEscalateAfterSeconds,
            0,
            86400
          )
        : previousPolicy.warningUnacknowledgedEscalateAfterSeconds,
    criticalUnacknowledgedEscalateAfterSeconds:
      rawPolicy.criticalUnacknowledgedEscalateAfterSeconds !== undefined
        ? parseRetryInt(
            rawPolicy.criticalUnacknowledgedEscalateAfterSeconds,
            previousPolicy.criticalUnacknowledgedEscalateAfterSeconds,
            0,
            86400
          )
        : previousPolicy.criticalUnacknowledgedEscalateAfterSeconds,
    criticalUnmitigatedEscalateAfterSeconds:
      rawPolicy.criticalUnmitigatedEscalateAfterSeconds !== undefined
        ? parseRetryInt(
            rawPolicy.criticalUnmitigatedEscalateAfterSeconds,
            previousPolicy.criticalUnmitigatedEscalateAfterSeconds,
            0,
            86400
          )
        : previousPolicy.criticalUnmitigatedEscalateAfterSeconds,
    mitigationNoteTypes:
      rawPolicy.mitigationNoteTypes !== undefined
        ? normalizeFaultManifestVerifyMitigationNoteTypes(
            rawPolicy.mitigationNoteTypes,
            previousPolicy.mitigationNoteTypes
          )
        : previousPolicy.mitigationNoteTypes.slice(),
    autoDeescalateOnMitigation:
      rawPolicy.autoDeescalateOnMitigation !== undefined
        ? parseRetryBool(
            rawPolicy.autoDeescalateOnMitigation,
            previousPolicy.autoDeescalateOnMitigation
          )
        : previousPolicy.autoDeescalateOnMitigation,
  };

  if (
    nextPolicy.criticalUnacknowledgedEscalateAfterSeconds >
    nextPolicy.warningUnacknowledgedEscalateAfterSeconds
  ) {
    return {
      error: {
        status: 400,
        code: "NOTIFICATION_FAULT_MANIFEST_VERIFY_ESCALATION_POLICY_ORDER_INVALID",
        message:
          "criticalUnacknowledgedEscalateAfterSeconds must be less than or equal to warningUnacknowledgedEscalateAfterSeconds",
      },
    };
  }

  if (shouldCommit) {
    faultManifestVerifyRetentionEscalationEnabled = nextPolicy.enabled;
    faultManifestVerifyRetentionEscalationWarningUnacknowledgedAfterSeconds =
      nextPolicy.warningUnacknowledgedEscalateAfterSeconds;
    faultManifestVerifyRetentionEscalationCriticalUnacknowledgedAfterSeconds =
      nextPolicy.criticalUnacknowledgedEscalateAfterSeconds;
    faultManifestVerifyRetentionEscalationCriticalUnmitigatedAfterSeconds =
      nextPolicy.criticalUnmitigatedEscalateAfterSeconds;
    faultManifestVerifyRetentionEscalationMitigationNoteTypes =
      nextPolicy.mitigationNoteTypes.slice();
    faultManifestVerifyRetentionEscalationAutoDeescalateOnMitigation =
      nextPolicy.autoDeescalateOnMitigation;
  }

  return {
    changed: JSON.stringify(previousPolicy) !== JSON.stringify(nextPolicy),
    previousPolicy: previousPolicy,
    policy: nextPolicy,
  };
}

function hasFaultManifestVerifyMitigationEvidence(instance) {
  if (!Array.isArray(instance.notes) || instance.notes.length === 0) {
    return false;
  }

  return instance.notes.some(function (note) {
    var noteType = String((note && note.noteType) || "")
      .trim()
      .toLowerCase();
    return (
      Boolean(note && note.mitigationApplied) ||
      faultManifestVerifyRetentionEscalationMitigationNoteTypes.indexOf(noteType) >= 0
    );
  });
}

function buildFaultManifestVerifyAnomalyEscalationSnapshot(instance, nowMs) {
  var measuredNowMs = nowMs || Date.now();

  if (!instance || !instance.escalation) {
    return {
      state: "monitoring",
      severity: "none",
      trigger: "none",
      pendingSince: null,
      escalatedAt: null,
      resolvedAt: null,
      dueAt: null,
      actionRequired: false,
      acknowledgementSla: buildFaultManifestVerifyAnomalyEscalationAcknowledgementSla(
        instance,
        measuredNowMs
      ),
    };
  }

  return {
    state: instance.escalation.state,
    severity: instance.escalation.severity,
    trigger: instance.escalation.trigger,
    pendingSince: instance.escalation.pendingSince,
    escalatedAt: instance.escalation.escalatedAt,
    resolvedAt: instance.escalation.resolvedAt,
    dueAt: instance.escalation.dueAt,
    actionRequired: instance.escalation.actionRequired,
    acknowledgementSla: buildFaultManifestVerifyAnomalyEscalationAcknowledgementSla(
      instance,
      measuredNowMs
    ),
  };
}

function computeFaultManifestVerifyAnomalyEscalation(instance, nowMs) {
  var state = "monitoring";
  var severity = "none";
  var trigger = "none";
  var pendingSince = null;
  var dueAt = null;
  var actionRequired = false;

  if (instance.status !== "active") {
    return {
      state: "closed",
      severity: "none",
      trigger: "none",
      pendingSince: null,
      dueAt: null,
      actionRequired: false,
    };
  }

  if (!faultManifestVerifyRetentionEscalationEnabled) {
    return {
      state: state,
      severity: severity,
      trigger: trigger,
      pendingSince: pendingSince,
      dueAt: dueAt,
      actionRequired: actionRequired,
    };
  }

  var firstDetectedAtMs = Date.parse(instance.firstDetectedAt || "") || nowMs;
  var acknowledgedAtMs =
    instance.triage && instance.triage.acknowledgedAt
      ? Date.parse(instance.triage.acknowledgedAt) || firstDetectedAtMs
      : null;
  var acknowledged = Boolean(instance.triage && instance.triage.acknowledged);
  var mitigationPresent = hasFaultManifestVerifyMitigationEvidence(instance);

  if (instance.severity === "critical") {
    if (!acknowledged) {
      dueAt = new Date(
        firstDetectedAtMs +
          faultManifestVerifyRetentionEscalationCriticalUnacknowledgedAfterSeconds * 1000
      ).toISOString();
      pendingSince = instance.firstDetectedAt;
      if (nowMs >= Date.parse(dueAt)) {
        state = "escalated-critical-unacknowledged";
        severity = "critical";
        trigger = "unacknowledged-critical-timeout";
        actionRequired = true;
      }
    } else if (!mitigationPresent) {
      dueAt = new Date(
        acknowledgedAtMs +
          faultManifestVerifyRetentionEscalationCriticalUnmitigatedAfterSeconds * 1000
      ).toISOString();
      pendingSince = instance.triage.acknowledgedAt;
      if (nowMs >= Date.parse(dueAt)) {
        state = "escalated-critical-unmitigated";
        severity = "critical";
        trigger = "critical-unmitigated-timeout";
        actionRequired = true;
      }
    }
  } else if (instance.severity === "warning" && !acknowledged) {
    dueAt = new Date(
      firstDetectedAtMs +
        faultManifestVerifyRetentionEscalationWarningUnacknowledgedAfterSeconds * 1000
    ).toISOString();
    pendingSince = instance.firstDetectedAt;
    if (nowMs >= Date.parse(dueAt)) {
      state = "escalated-warning-unacknowledged";
      severity = "warning";
      trigger = "unacknowledged-warning-timeout";
      actionRequired = true;
    }
  }

  if (
    state.indexOf("escalated-") === 0 &&
    mitigationPresent &&
    faultManifestVerifyRetentionEscalationAutoDeescalateOnMitigation
  ) {
    state = "monitoring";
    severity = "none";
    trigger = "none";
    actionRequired = false;
    dueAt = null;
  }

  return {
    state: state,
    severity: severity,
    trigger: trigger,
    pendingSince: pendingSince,
    dueAt: dueAt,
    actionRequired: actionRequired,
  };
}

function transitionFaultManifestVerifyAnomalyEscalation(instance, escalationNext, nowIso) {
  var previous = buildFaultManifestVerifyAnomalyEscalationSnapshot(instance);
  var transition = "unchanged";
  var nextEscalatedAt = previous.escalatedAt;
  var nextResolvedAt = previous.resolvedAt;

  if (previous.state !== escalationNext.state) {
    if (escalationNext.state === "closed") {
      transition = "closed";
      if (previous.state.indexOf("escalated-") === 0) {
        nextResolvedAt = nowIso;
      }
    } else if (escalationNext.state.indexOf("escalated-") === 0) {
      transition = "escalated";
      nextEscalatedAt = nowIso;
      nextResolvedAt = null;
    } else if (
      previous.state.indexOf("escalated-") === 0 &&
      escalationNext.state === "monitoring"
    ) {
      transition = "deescalated";
      nextResolvedAt = nowIso;
    }
  }

  instance.escalation = {
    state: escalationNext.state,
    severity: escalationNext.severity,
    trigger: escalationNext.trigger,
    pendingSince: escalationNext.pendingSince,
    escalatedAt: nextEscalatedAt,
    resolvedAt: nextResolvedAt,
    dueAt: escalationNext.dueAt,
    actionRequired: escalationNext.actionRequired,
  };

  return transition;
}

function appendFaultManifestVerifyRecentlyClosedAnomaly(instance) {
  faultManifestVerifyRecentlyClosedAnomalies.push({
    anomalyInstanceId: instance.anomalyInstanceId,
    key: instance.key,
    severity: instance.severity,
    closedAt: instance.closedAt,
    closedReason: instance.closedReason,
    clearanceEvidence: instance.clearanceEvidence,
  });
}

function collectFaultManifestVerifyRecentlyClosedAnomalies() {
  return faultManifestVerifyRecentlyClosedAnomalies.slice().reverse();
}

function markFaultManifestVerifyAnomalyClosed(instance, summary, nowMs) {
  var nowIso = new Date(nowMs).toISOString();
  instance.status = "cleared";
  instance.closedAt = nowIso;
  instance.closedReason = "signal-cleared";
  instance.clearanceEvidence = {
    clearedAt: nowIso,
    priorSeverity: instance.severity,
    priorAlertLevel: instance.latestAlertLevel,
    trendDirectionAtClosure: summary.trendDirection,
    windowMinutes: summary.windowMinutes,
    clearedByEvaluator: true,
  };
  if (!Array.isArray(instance.closureHistory)) {
    instance.closureHistory = [];
  }
  instance.closureHistory.push({
    closedAt: instance.closedAt,
    closedReason: instance.closedReason,
    clearanceEvidence: instance.clearanceEvidence,
  });
  while (
    instance.closureHistory.length > faultManifestVerifyRetentionAnomalyClosureHistoryPerInstanceMax
  ) {
    instance.closureHistory.shift();
  }
  appendFaultManifestVerifyRecentlyClosedAnomaly(instance);
  transitionFaultManifestVerifyAnomalyEscalation(
    instance,
    {
      state: "closed",
      severity: "none",
      trigger: "none",
      pendingSince: null,
      dueAt: null,
      actionRequired: false,
    },
    nowIso
  );
  instance.lastUpdatedAtMs = nowMs;
}

function buildFaultManifestVerifyAnomalyEscalationSummary() {
  var byState = {};
  var activeEscalations = 0;
  var pendingEscalations = 0;
  var highestEscalationSeverity = null;
  var nowMs = Date.now();

  faultManifestVerifyAnomalyInstances.forEach(function (instance) {
    if (instance.status !== "active") {
      return;
    }

    var escalation = buildFaultManifestVerifyAnomalyEscalationSnapshot(instance, nowMs);
    byState[escalation.state] = (byState[escalation.state] || 0) + 1;

    if (escalation.state.indexOf("escalated-") === 0) {
      activeEscalations += 1;
      if (escalation.severity === "critical") {
        highestEscalationSeverity = "critical";
      } else if (!highestEscalationSeverity) {
        highestEscalationSeverity = "warning";
      }
    }

    if (
      escalation.state === "monitoring" &&
      escalation.dueAt &&
      Date.parse(escalation.dueAt) >= nowMs
    ) {
      pendingEscalations += 1;
    }
  });

  return {
    activeEscalations: activeEscalations,
    pendingEscalations: pendingEscalations,
    byState: byState,
    highestEscalationSeverity: highestEscalationSeverity,
    acknowledgementSla: buildFaultManifestVerifyAnomalyEscalationAcknowledgementSlaSummary(
      faultManifestVerifyAnomalyInstances,
      nowMs
    ),
  };
}

function buildFaultManifestVerifyAnomalyEscalationAcknowledgementSlaSummary(instances, nowMs) {
  var trackedCount = 0;
  var applicableCount = 0;
  var withinSlaCount = 0;
  var breachedCount = 0;
  var acknowledgedCount = 0;
  var acknowledgedWithinSlaCount = 0;
  var acknowledgedBreachedCount = 0;
  var openBreachCount = 0;
  var acknowledgedElapsed = [];

  instances.forEach(function (instance) {
    if (instance.status !== "active") {
      return;
    }

    trackedCount += 1;
    var sla = buildFaultManifestVerifyAnomalyEscalationAcknowledgementSla(instance, nowMs);
    if (sla.status === "not-applicable") {
      return;
    }

    applicableCount += 1;
    if (sla.status === "within-sla") {
      withinSlaCount += 1;
    }
    if (sla.status === "breached") {
      breachedCount += 1;
      openBreachCount += 1;
    }
    if (sla.status === "acknowledged-within-sla") {
      acknowledgedCount += 1;
      acknowledgedWithinSlaCount += 1;
      acknowledgedElapsed.push(sla.elapsedSeconds);
    }
    if (sla.status === "acknowledged-breached") {
      breachedCount += 1;
      acknowledgedCount += 1;
      acknowledgedBreachedCount += 1;
      acknowledgedElapsed.push(sla.elapsedSeconds);
    }
  });

  acknowledgedElapsed.sort(function (left, right) {
    return left - right;
  });
  var averageAcknowledgementSeconds = null;
  var p95AcknowledgementSeconds = null;
  if (acknowledgedElapsed.length > 0) {
    var total = acknowledgedElapsed.reduce(function (running, value) {
      return running + value;
    }, 0);
    averageAcknowledgementSeconds = Math.round(total / acknowledgedElapsed.length);
    var p95Index = Math.max(Math.ceil(acknowledgedElapsed.length * 0.95) - 1, 0);
    p95AcknowledgementSeconds = acknowledgedElapsed[p95Index];
  }

  return {
    trackedCount: trackedCount,
    applicableCount: applicableCount,
    withinSlaCount: withinSlaCount,
    breachedCount: breachedCount,
    acknowledgedCount: acknowledgedCount,
    acknowledgedWithinSlaCount: acknowledgedWithinSlaCount,
    acknowledgedBreachedCount: acknowledgedBreachedCount,
    openBreachCount: openBreachCount,
    averageAcknowledgementSeconds: averageAcknowledgementSeconds,
    p95AcknowledgementSeconds: p95AcknowledgementSeconds,
  };
}

function buildFaultManifestVerifyTrackedAnomaly(anomaly, instance) {
  return {
    key: anomaly.key,
    severity: anomaly.severity,
    recommendedAction: anomaly.recommendedAction,
    evidence: anomaly.evidence,
    anomalyInstanceId: instance.anomalyInstanceId,
    status: instance.status,
    firstDetectedAt: instance.firstDetectedAt,
    lastDetectedAt: instance.lastDetectedAt,
    triage: buildFaultManifestVerifyAnomalyTriageSnapshot(instance),
    closedAt: instance.closedAt || null,
    closedReason: instance.closedReason || null,
    clearanceEvidence: instance.clearanceEvidence || null,
    closureHistory: Array.isArray(instance.closureHistory) ? instance.closureHistory : [],
    escalation: buildFaultManifestVerifyAnomalyEscalationSnapshot(instance),
  };
}

function attachFaultManifestVerifyAnomalyTracking(summary, anomalies) {
  var nowMs = Date.now();
  var nowIso = new Date(nowMs).toISOString();
  pruneFaultManifestVerifyAnomalyTracking(nowMs);

  var activeKeys = {};
  var trackedAnomalies = anomalies.map(function (anomaly) {
    activeKeys[anomaly.key] = true;
    var existing = findFaultManifestVerifyAnomalyInstanceByKey(anomaly.key);

    if (!existing) {
      existing = {
        anomalyInstanceId: randomUUID(),
        key: anomaly.key,
        status: "active",
        firstDetectedAt: nowIso,
        lastDetectedAt: nowIso,
        lastUpdatedAtMs: nowMs,
        triage: {
          acknowledged: false,
          acknowledgedAt: null,
          acknowledgedBy: null,
        },
        notes: [],
        closedAt: null,
        closedReason: null,
        clearanceEvidence: null,
        closureHistory: [],
      };
      faultManifestVerifyAnomalyInstances.push(existing);
    } else if (existing.status === "cleared") {
      existing.status = "active";
      existing.firstDetectedAt = nowIso;
      existing.triage.acknowledged = false;
      existing.triage.acknowledgedAt = null;
      existing.triage.acknowledgedBy = null;
      existing.notes = [];
      existing.closedAt = null;
      existing.closedReason = null;
      existing.clearanceEvidence = null;
    }

    existing.severity = anomaly.severity;
    existing.recommendedAction = anomaly.recommendedAction;
    existing.evidence = anomaly.evidence;
    existing.latestAlertLevel = summary.latestAlertLevel;
    existing.trendDirection = summary.trendDirection;
    existing.windowMinutes = summary.windowMinutes;
    existing.lastDetectedAt = nowIso;
    existing.lastUpdatedAtMs = nowMs;
    transitionFaultManifestVerifyAnomalyEscalation(
      existing,
      computeFaultManifestVerifyAnomalyEscalation(existing, nowMs),
      nowIso
    );

    return buildFaultManifestVerifyTrackedAnomaly(anomaly, existing);
  });

  faultManifestVerifyAnomalyInstances.forEach(function (instance) {
    if (instance.status === "active" && !activeKeys[instance.key]) {
      markFaultManifestVerifyAnomalyClosed(instance, summary, nowMs);
    }
  });

  pruneFaultManifestVerifyAnomalyTracking(nowMs);
  return trackedAnomalies;
}

function recordFaultManifestVerifyAnomalyAction(actionType, anomalyInstanceId, actor, note) {
  var nowMs = Date.now();
  var entry = {
    actionId: randomUUID(),
    actionType: actionType,
    anomalyInstanceId: anomalyInstanceId,
    actor: actor || null,
    noteId: note ? note.noteId : null,
    createdAt: new Date(nowMs).toISOString(),
    createdAtMs: nowMs,
  };

  faultManifestVerifyAnomalyActions.push(entry);
  pruneFaultManifestVerifyAnomalyTracking(nowMs);
  return entry;
}

function applyFaultManifestVerifyAnomalyTriage(anomalyInstance, payload) {
  var acknowledge = parseRetryBool(payload.acknowledge, false);
  var acknowledgedBy = String(payload.acknowledgedBy || "").trim();
  var noteContent = String(payload.note || "").trim();
  var hasNote = noteContent.length > 0;
  var mitigationApplied = parseRetryBool(payload.mitigationApplied, false);
  var mitigationType = String(payload.mitigationType || "")
    .trim()
    .toLowerCase();
  var mitigationEvidenceRef = String(payload.mitigationEvidenceRef || "").trim();

  if (mitigationApplied && !hasNote) {
    return {
      error: {
        status: 400,
        code: "NOTIFICATION_FAULT_MANIFEST_VERIFY_ANOMALY_MITIGATION_NOTE_REQUIRED",
        message: "note is required when mitigationApplied=true",
      },
    };
  }

  if (!acknowledge && !hasNote) {
    return {
      error: {
        status: 400,
        code: "NOTIFICATION_FAULT_MANIFEST_VERIFY_ANOMALY_TRIAGE_REQUIRED",
        message: "acknowledge=true or note is required",
      },
    };
  }

  if (acknowledge && !acknowledgedBy) {
    return {
      error: {
        status: 400,
        code: "NOTIFICATION_FAULT_MANIFEST_VERIFY_ANOMALY_ACKNOWLEDGED_BY_REQUIRED",
        message: "acknowledgedBy is required when acknowledge=true",
      },
    };
  }

  if (hasNote && noteContent.length > faultManifestVerifyRetentionAnomalyNoteMaxLength) {
    return {
      error: {
        status: 400,
        code: "NOTIFICATION_FAULT_MANIFEST_VERIFY_ANOMALY_NOTE_TOO_LONG",
        message: "note exceeds maximum allowed length",
      },
    };
  }

  var nowMs = Date.now();
  var nowIso = new Date(nowMs).toISOString();
  var noteType = String(payload.noteType || "operator-note")
    .trim()
    .toLowerCase();

  if (!anomalyInstance.triage) {
    anomalyInstance.triage = {
      acknowledged: false,
      acknowledgedAt: null,
      acknowledgedBy: null,
    };
  }
  if (!Array.isArray(anomalyInstance.notes)) {
    anomalyInstance.notes = [];
  }

  var note = null;
  if (hasNote) {
    note = {
      noteId: randomUUID(),
      noteType: noteType || "operator-note",
      content: noteContent,
      createdAt: nowIso,
      author: acknowledgedBy || String(payload.noteAuthor || "").trim() || "unknown-operator",
      mitigationApplied: mitigationApplied,
      mitigationType: mitigationType || null,
      mitigationEvidenceRef: mitigationEvidenceRef || null,
    };
    anomalyInstance.notes.push(note);
    while (anomalyInstance.notes.length > faultManifestVerifyRetentionAnomalyNotesPerInstanceMax) {
      anomalyInstance.notes.shift();
    }
  }

  if (acknowledge) {
    anomalyInstance.triage.acknowledged = true;
    anomalyInstance.triage.acknowledgedAt = nowIso;
    anomalyInstance.triage.acknowledgedBy = acknowledgedBy;
  }

  anomalyInstance.lastUpdatedAtMs = nowMs;
  var escalationTransition = transitionFaultManifestVerifyAnomalyEscalation(
    anomalyInstance,
    computeFaultManifestVerifyAnomalyEscalation(anomalyInstance, nowMs),
    nowIso
  );
  pruneFaultManifestVerifyAnomalyTracking(nowMs);

  var actionType = "note-only";
  if (acknowledge && hasNote) {
    actionType = "acknowledge-and-note";
  } else if (acknowledge) {
    actionType = "acknowledge";
  }
  var action = recordFaultManifestVerifyAnomalyAction(
    actionType,
    anomalyInstance.anomalyInstanceId,
    acknowledgedBy || (note ? note.author : null),
    note
  );

  return {
    updatedAt: nowIso,
    action: action,
    escalationTransition: escalationTransition,
  };
}

function summarizeFaultManifestVerifyAttemptTelemetry() {
  var totalSuppressedEvents = 0;
  var duplicateSuppressedAttempts = 0;
  var latestLastVerifiedAt = null;
  var latestLastSeenAtMs = null;

  faultManifestVerifyAttemptCache.forEach(function (attempt) {
    totalSuppressedEvents += attempt.suppressCount;

    if (attempt.suppressCount > 0) {
      duplicateSuppressedAttempts += 1;
    }

    if (latestLastSeenAtMs === null || attempt.lastSeenAtMs > latestLastSeenAtMs) {
      latestLastSeenAtMs = attempt.lastSeenAtMs;
      latestLastVerifiedAt = attempt.lastVerifiedAt;
    }
  });

  return {
    totalRecorded: faultManifestVerifyAttemptCache.length,
    duplicateSuppressedAttempts: duplicateSuppressedAttempts,
    totalSuppressedEvents: totalSuppressedEvents,
    oldestFirstVerifiedAt:
      faultManifestVerifyAttemptCache.length > 0
        ? faultManifestVerifyAttemptCache[0].firstVerifiedAt
        : null,
    latestLastVerifiedAt: latestLastVerifiedAt,
    saturation: buildFaultManifestVerifyAttemptSaturation(faultManifestVerifyAttemptCache.length),
  };
}

function applyFaultManifestVerifyAttemptRetention(payload) {
  var previousWindow = faultManifestVerifyDedupeWindowSeconds;
  var previousMaxEntries = faultManifestVerifyDedupeMaxEntries;
  var previousSource = faultManifestVerifyRetentionSource;
  var previousEscalationPolicy = getFaultManifestVerifyEscalationPolicy();
  var previousEscalationExportPolicy = getFaultManifestVerifyEscalationExportPolicy();
  var hasWindow = payload.dedupeWindowSeconds !== undefined && payload.dedupeWindowSeconds !== null;
  var hasMaxEntries = payload.maxEntries !== undefined && payload.maxEntries !== null;
  var hasEscalationPolicy =
    payload.escalationPolicy !== undefined && payload.escalationPolicy !== null;
  var hasEscalationExportPolicy =
    payload.escalationExportPolicy !== undefined && payload.escalationExportPolicy !== null;

  if (!hasWindow && !hasMaxEntries && !hasEscalationPolicy && !hasEscalationExportPolicy) {
    return null;
  }

  var dryRun = parseRetryBool(payload.dryRun, false);
  var pruneNow = parseRetryBool(payload.pruneNow, true);
  var nextWindow = hasWindow
    ? parseRetryInt(payload.dedupeWindowSeconds, previousWindow, 30, 86400)
    : previousWindow;
  var nextMaxEntries = hasMaxEntries
    ? parseRetryInt(payload.maxEntries, previousMaxEntries, 50, 5000)
    : previousMaxEntries;

  var nowMs = Date.now();
  var pruneEstimate = pruneNow
    ? estimateFaultManifestVerifyAttemptPrune(nowMs, nextWindow, nextMaxEntries)
    : {
        prunedByWindow: 0,
        prunedByMaxEntries: 0,
        prunedCount: 0,
      };

  var escalationPolicyResult = applyFaultManifestVerifyEscalationPolicy(payload.escalationPolicy, {
    commit: false,
  });
  if (escalationPolicyResult.error) {
    return {
      error: escalationPolicyResult.error,
    };
  }

  var escalationExportPolicyResult = applyFaultManifestVerifyEscalationExportPolicy(
    payload.escalationExportPolicy,
    {
      commit: false,
    }
  );
  if (escalationExportPolicyResult.error) {
    return {
      error: escalationExportPolicyResult.error,
    };
  }

  if (!dryRun) {
    faultManifestVerifyDedupeWindowSeconds = nextWindow;
    faultManifestVerifyDedupeMaxEntries = nextMaxEntries;
    faultManifestVerifyRetentionEscalationEnabled = escalationPolicyResult.policy.enabled;
    faultManifestVerifyRetentionEscalationWarningUnacknowledgedAfterSeconds =
      escalationPolicyResult.policy.warningUnacknowledgedEscalateAfterSeconds;
    faultManifestVerifyRetentionEscalationCriticalUnacknowledgedAfterSeconds =
      escalationPolicyResult.policy.criticalUnacknowledgedEscalateAfterSeconds;
    faultManifestVerifyRetentionEscalationCriticalUnmitigatedAfterSeconds =
      escalationPolicyResult.policy.criticalUnmitigatedEscalateAfterSeconds;
    faultManifestVerifyRetentionEscalationMitigationNoteTypes =
      escalationPolicyResult.policy.mitigationNoteTypes.slice();
    faultManifestVerifyRetentionEscalationAutoDeescalateOnMitigation =
      escalationPolicyResult.policy.autoDeescalateOnMitigation;
    faultManifestVerifyRetentionEscalationExportEnabled =
      escalationExportPolicyResult.policy.enabled;
    faultManifestVerifyRetentionEscalationExportDefaultFormat =
      escalationExportPolicyResult.policy.defaultFormat;
    faultManifestVerifyRetentionEscalationExportMaxRows =
      escalationExportPolicyResult.policy.maxExportRows;
    faultManifestVerifyRetentionEscalationExportIncludeRecentlyClosedByDefault =
      escalationExportPolicyResult.policy.includeRecentlyClosedByDefault;
    faultManifestVerifyRetentionSource = "api";
  }

  var pruneResult = {
    prunedByWindow: 0,
    prunedByMaxEntries: 0,
    prunedCount: 0,
  };
  if (!dryRun && pruneNow) {
    pruneResult = pruneFaultManifestVerifyAttempts(nowMs);
  }

  var resolvedSource = dryRun ? previousSource : faultManifestVerifyRetentionSource;

  return {
    executionMode: dryRun ? "preview" : "applied",
    persisted: !dryRun,
    previousDedupeWindowSeconds: previousWindow,
    dedupeWindowSeconds: nextWindow,
    previousMaxEntries: previousMaxEntries,
    maxEntries: nextMaxEntries,
    previousEscalationPolicy: previousEscalationPolicy,
    escalationPolicy: escalationPolicyResult.policy,
    escalationPolicyChanged: escalationPolicyResult.changed,
    previousEscalationExportPolicy: previousEscalationExportPolicy,
    escalationExportPolicy: escalationExportPolicyResult.policy,
    escalationExportPolicyChanged: escalationExportPolicyResult.changed,
    pruneNow: pruneNow,
    prunedByWindow: pruneResult.prunedByWindow,
    prunedByMaxEntries: pruneResult.prunedByMaxEntries,
    prunedCount: pruneResult.prunedCount,
    source: resolvedSource,
    pruneStrategy: "drop-expired-then-oldest",
    changeImpact: {
      wouldUpdateDedupeWindowSeconds: nextWindow !== previousWindow,
      wouldUpdateMaxEntries: nextMaxEntries !== previousMaxEntries,
      wouldUpdateEscalationPolicy: escalationPolicyResult.changed,
      wouldUpdateEscalationExportPolicy: escalationExportPolicyResult.changed,
      wouldPrune: pruneNow && pruneEstimate.prunedCount > 0,
      estimatedPrunedByWindow: pruneEstimate.prunedByWindow,
      estimatedPrunedByMaxEntries: pruneEstimate.prunedByMaxEntries,
      estimatedPrunedCount: pruneEstimate.prunedCount,
    },
    telemetry: summarizeFaultManifestVerifyAttemptTelemetry(),
  };
}

function buildFaultManifestReplayAttemptMeta(attempt, duplicateSuppressed) {
  return {
    attemptId: attempt.attemptId,
    fingerprint: attempt.fingerprint,
    duplicateSuppressed: duplicateSuppressed,
    firstVerifiedAt: attempt.firstVerifiedAt,
    lastVerifiedAt: attempt.lastVerifiedAt,
    suppressCount: attempt.suppressCount,
    dedupeWindowSeconds: faultManifestVerifyDedupeWindowSeconds,
  };
}

function storeFaultManifestVerifyAttempt(fingerprint, responseBody, verifiedAtIso) {
  var nowMs = Date.now();
  pruneFaultManifestVerifyAttempts(nowMs);

  var existing = findFaultManifestVerifyAttempt(fingerprint);
  if (existing) {
    existing.attempt.lastSeenAtMs = nowMs;
    existing.attempt.lastVerifiedAt = verifiedAtIso;
    existing.attempt.suppressCount += 1;
    maybeCaptureFaultManifestVerifySaturationTrend(
      "verify-duplicate",
      buildFaultManifestVerifyAttemptSaturation(faultManifestVerifyAttemptCache.length),
      false
    );

    return {
      duplicateSuppressed: true,
      attempt: existing.attempt,
    };
  }

  var attempt = {
    attemptId: randomUUID(),
    fingerprint: fingerprint,
    firstSeenAtMs: nowMs,
    lastSeenAtMs: nowMs,
    firstVerifiedAt: verifiedAtIso,
    lastVerifiedAt: verifiedAtIso,
    suppressCount: 0,
    responseBody: responseBody,
  };

  faultManifestVerifyAttemptCache.push(attempt);
  pruneFaultManifestVerifyAttempts(nowMs);
  maybeCaptureFaultManifestVerifySaturationTrend(
    "verify-first-seen",
    buildFaultManifestVerifyAttemptSaturation(faultManifestVerifyAttemptCache.length),
    false
  );

  return {
    duplicateSuppressed: false,
    attempt: attempt,
  };
}

function buildFaultManifestVerifyAttemptAuditItem(attempt) {
  var responseBody = attempt.responseBody || {};
  var evidence = responseBody.evidence || {};
  var filters = evidence.filters || {};
  var replayDefense = responseBody.replayDefense || {};

  return {
    attemptId: attempt.attemptId,
    fingerprint: attempt.fingerprint,
    firstVerifiedAt: attempt.firstVerifiedAt,
    lastVerifiedAt: attempt.lastVerifiedAt,
    valid: Boolean(responseBody.valid),
    duplicateSuppressed: attempt.suppressCount > 0,
    suppressCount: attempt.suppressCount,
    dedupeWindowSeconds: faultManifestVerifyDedupeWindowSeconds,
    manifestVersion: responseBody.providedManifestVersion || null,
    tenantKey: filters.tenantKey || null,
    providerKey: filters.providerKey || null,
    scenario: filters.scenario || null,
    totalMatched: evidence.totalMatched,
    returned: evidence.returned,
    replayDefense: {
      issuedAt: replayDefense.issuedAt || null,
      freshnessMatch: replayDefense.freshnessMatch,
      nonce: replayDefense.nonce || null,
      expectedNonce: replayDefense.expectedNonce || null,
      nonceMatch: replayDefense.nonceMatch,
    },
  };
}

function collectFaultManifestVerifyAttemptAudit(options) {
  var tenantKey = String(options.tenantKey || "").trim();
  var providerKey = String(options.providerKey || "")
    .trim()
    .toLowerCase();
  var scenario = String(options.scenario || "")
    .trim()
    .toLowerCase();
  var fingerprint = normalizeManifestDigestInput(options.fingerprint || "");
  var validFilter = options.validFilter;
  var duplicateSuppressedFilter = options.duplicateSuppressedFilter;
  var limit = parseRetryInt(options.limit, options.limitFallback || 50, 1, options.limitMax || 500);

  pruneFaultManifestVerifyAttempts(Date.now());

  var attempts = faultManifestVerifyAttemptCache
    .slice()
    .reverse()
    .map(buildFaultManifestVerifyAttemptAuditItem)
    .filter(function (item) {
      if (tenantKey && item.tenantKey !== tenantKey) {
        return false;
      }

      if (providerKey && item.providerKey !== providerKey) {
        return false;
      }

      if (scenario && item.scenario !== scenario) {
        return false;
      }

      if (fingerprint && item.fingerprint !== fingerprint) {
        return false;
      }

      if (validFilter !== null && item.valid !== validFilter) {
        return false;
      }

      if (
        duplicateSuppressedFilter !== null &&
        item.duplicateSuppressed !== duplicateSuppressedFilter
      ) {
        return false;
      }

      return true;
    });

  var limited = attempts.slice(0, limit);
  var totalSuppressedEvents = 0;
  limited.forEach(function (item) {
    totalSuppressedEvents += item.suppressCount;
  });

  return {
    totalRecorded: faultManifestVerifyAttemptCache.length,
    totalMatched: attempts.length,
    returned: limited.length,
    dedupeWindowSeconds: faultManifestVerifyDedupeWindowSeconds,
    dedupeMaxEntries: faultManifestVerifyDedupeMaxEntries,
    summary: {
      duplicateSuppressedAttempts: limited.filter(function (item) {
        return item.duplicateSuppressed;
      }).length,
      totalSuppressedEvents: totalSuppressedEvents,
      validAttempts: limited.filter(function (item) {
        return item.valid;
      }).length,
      invalidAttempts: limited.filter(function (item) {
        return !item.valid;
      }).length,
    },
    filters: {
      tenantKey: tenantKey || null,
      providerKey: providerKey || null,
      scenario: scenario || null,
      fingerprint: fingerprint || null,
      valid: validFilter,
      duplicateSuppressed: duplicateSuppressedFilter,
      limit: limit,
    },
    attempts: limited,
  };
}

function buildFaultManifestVerifyAttemptCsv(attempts) {
  var lines = [
    "attemptId,fingerprint,firstVerifiedAt,lastVerifiedAt,valid,duplicateSuppressed,suppressCount,dedupeWindowSeconds,manifestVersion,tenantKey,providerKey,scenario,totalMatched,returned,replayIssuedAt,replayFreshnessMatch,replayNonce,replayExpectedNonce,replayNonceMatch",
  ];

  attempts.forEach(function (attempt) {
    var replayDefense = attempt.replayDefense || {};

    lines.push(
      [
        escapeCsvValue(attempt.attemptId),
        escapeCsvValue(attempt.fingerprint),
        escapeCsvValue(attempt.firstVerifiedAt),
        escapeCsvValue(attempt.lastVerifiedAt),
        escapeCsvValue(attempt.valid),
        escapeCsvValue(attempt.duplicateSuppressed),
        escapeCsvValue(attempt.suppressCount),
        escapeCsvValue(attempt.dedupeWindowSeconds),
        escapeCsvValue(attempt.manifestVersion),
        escapeCsvValue(attempt.tenantKey),
        escapeCsvValue(attempt.providerKey),
        escapeCsvValue(attempt.scenario),
        escapeCsvValue(attempt.totalMatched),
        escapeCsvValue(attempt.returned),
        escapeCsvValue(replayDefense.issuedAt),
        escapeCsvValue(replayDefense.freshnessMatch),
        escapeCsvValue(replayDefense.nonce),
        escapeCsvValue(replayDefense.expectedNonce),
        escapeCsvValue(replayDefense.nonceMatch),
      ].join(",")
    );
  });

  return lines.join("\n");
}

function parseFaultManifestVerifyEscalationExportListFilter(rawValue) {
  if (rawValue === undefined || rawValue === null) {
    return [];
  }

  return String(rawValue)
    .split(",")
    .map(function (item) {
      return String(item || "")
        .trim()
        .toLowerCase();
    })
    .filter(function (item, index, items) {
      return item && items.indexOf(item) === index;
    });
}

function parseFaultManifestVerifyEscalationExportQuery(query, policy) {
  var formatCandidate = String(query.format || policy.defaultFormat || "json")
    .trim()
    .toLowerCase();
  if (formatCandidate !== "json" && formatCandidate !== "csv") {
    return {
      error: {
        status: 400,
        code: "NOTIFICATION_FAULT_MANIFEST_VERIFY_ESCALATION_EXPORT_FILTER_INVALID",
        message: "format must be json or csv",
      },
    };
  }

  var stateFilter = parseFaultManifestVerifyEscalationExportListFilter(query.state);
  var stateAliases = {
    "escalated-warning": "escalated-warning-unacknowledged",
    "escalated-critical": "escalated-critical-unacknowledged",
  };
  stateFilter = stateFilter.map(function (state) {
    return stateAliases[state] || state;
  });
  var allowedStates = [
    "monitoring",
    "closed",
    "escalated-warning-unacknowledged",
    "escalated-critical-unacknowledged",
    "escalated-critical-unmitigated",
  ];
  var invalidState = stateFilter.find(function (item) {
    return allowedStates.indexOf(item) === -1;
  });
  if (invalidState) {
    return {
      error: {
        status: 400,
        code: "NOTIFICATION_FAULT_MANIFEST_VERIFY_ESCALATION_EXPORT_FILTER_INVALID",
        message:
          "state filter contains unsupported value: " +
          invalidState +
          ". Allowed values: " +
          allowedStates.join(", "),
      },
    };
  }

  var escalationSeverityFilter = parseFaultManifestVerifyEscalationExportListFilter(
    query.escalationSeverity
  );
  var allowedEscalationSeverity = ["none", "warning", "critical"];
  var invalidEscalationSeverity = escalationSeverityFilter.find(function (item) {
    return allowedEscalationSeverity.indexOf(item) === -1;
  });
  if (invalidEscalationSeverity) {
    return {
      error: {
        status: 400,
        code: "NOTIFICATION_FAULT_MANIFEST_VERIFY_ESCALATION_EXPORT_FILTER_INVALID",
        message:
          "escalationSeverity filter contains unsupported value: " +
          invalidEscalationSeverity +
          ". Allowed values: " +
          allowedEscalationSeverity.join(", "),
      },
    };
  }

  var acknowledgementSlaStatusFilter = parseFaultManifestVerifyEscalationExportListFilter(
    query.acknowledgementSlaStatus
  );
  var allowedAcknowledgementSlaStatuses = [
    "not-applicable",
    "within-sla",
    "breached",
    "acknowledged-within-sla",
    "acknowledged-breached",
  ];
  var invalidAcknowledgementSlaStatus = acknowledgementSlaStatusFilter.find(function (item) {
    return allowedAcknowledgementSlaStatuses.indexOf(item) === -1;
  });
  if (invalidAcknowledgementSlaStatus) {
    return {
      error: {
        status: 400,
        code: "NOTIFICATION_FAULT_MANIFEST_VERIFY_ESCALATION_EXPORT_FILTER_INVALID",
        message:
          "acknowledgementSlaStatus filter contains unsupported value: " +
          invalidAcknowledgementSlaStatus +
          ". Allowed values: " +
          allowedAcknowledgementSlaStatuses.join(", "),
      },
    };
  }

  var includeRecentlyClosed =
    parseOptionalBoolQuery(query.includeRecentlyClosed) !== null
      ? parseOptionalBoolQuery(query.includeRecentlyClosed)
      : policy.includeRecentlyClosedByDefault;
  var triageAcknowledged = parseOptionalBoolQuery(query.triageAcknowledged);
  var actionRequired = parseOptionalBoolQuery(query.actionRequired);
  var breached = parseOptionalBoolQuery(query.breached);
  var limit = parseRetryInt(query.limit, policy.maxExportRows, 1, policy.maxExportRows);

  return {
    format: formatCandidate,
    includeRecentlyClosed: includeRecentlyClosed,
    stateFilter: stateFilter,
    escalationSeverityFilter: escalationSeverityFilter,
    acknowledgementSlaStatusFilter: acknowledgementSlaStatusFilter,
    triageAcknowledged: triageAcknowledged,
    actionRequired: actionRequired,
    breached: breached,
    limit: limit,
    maxExportRows: policy.maxExportRows,
  };
}

function buildFaultManifestVerifyEscalationExportRows(filters, nowMs) {
  pruneFaultManifestVerifyAnomalyTracking(nowMs);

  var instances = faultManifestVerifyAnomalyInstances
    .slice()
    .filter(function (instance) {
      if (instance.status === "active") {
        return true;
      }
      return filters.includeRecentlyClosed;
    })
    .sort(function (left, right) {
      var leftDetected = Date.parse(left.lastDetectedAt || left.firstDetectedAt || "") || 0;
      var rightDetected = Date.parse(right.lastDetectedAt || right.firstDetectedAt || "") || 0;
      return rightDetected - leftDetected;
    });

  var filtered = [];
  for (var index = 0; index < instances.length; index += 1) {
    var instance = instances[index];
    var escalation = buildFaultManifestVerifyAnomalyEscalationSnapshot(instance, nowMs);
    var triage = buildFaultManifestVerifyAnomalyTriageSnapshot(instance);
    var acknowledgementSla = buildFaultManifestVerifyAnomalyEscalationAcknowledgementSla(
      instance,
      nowMs
    );

    if (filters.stateFilter.length > 0 && filters.stateFilter.indexOf(escalation.state) === -1) {
      continue;
    }
    if (
      filters.escalationSeverityFilter.length > 0 &&
      filters.escalationSeverityFilter.indexOf(escalation.severity) === -1
    ) {
      continue;
    }
    if (
      filters.acknowledgementSlaStatusFilter.length > 0 &&
      filters.acknowledgementSlaStatusFilter.indexOf(acknowledgementSla.status) === -1
    ) {
      continue;
    }
    if (
      filters.triageAcknowledged !== null &&
      Boolean(triage.acknowledged) !== filters.triageAcknowledged
    ) {
      continue;
    }
    if (
      filters.actionRequired !== null &&
      Boolean(escalation.actionRequired) !== filters.actionRequired
    ) {
      continue;
    }
    if (filters.breached !== null && Boolean(acknowledgementSla.breached) !== filters.breached) {
      continue;
    }

    filtered.push({
      anomalyInstanceId: instance.anomalyInstanceId,
      anomalyKey: instance.key,
      anomalySeverity: instance.severity,
      anomalyStatus: instance.status,
      recommendedAction: instance.recommendedAction,
      firstDetectedAt: instance.firstDetectedAt,
      lastDetectedAt: instance.lastDetectedAt,
      closedAt: instance.closedAt || null,
      closedReason: instance.closedReason || null,
      triageAcknowledged: Boolean(triage.acknowledged),
      triageAcknowledgedAt: triage.acknowledgedAt,
      triageAcknowledgedBy: triage.acknowledgedBy,
      triageNotesCount: triage.notesCount,
      escalationState: escalation.state,
      escalationSeverity: escalation.severity,
      escalationTrigger: escalation.trigger,
      escalationPendingSince: escalation.pendingSince,
      escalationEscalatedAt: escalation.escalatedAt,
      escalationResolvedAt: escalation.resolvedAt,
      escalationDueAt: escalation.dueAt,
      escalationActionRequired: escalation.actionRequired,
      acknowledgementSlaStatus: acknowledgementSla.status,
      acknowledgementSlaTargetSeconds: acknowledgementSla.targetSeconds,
      acknowledgementSlaElapsedSeconds: acknowledgementSla.elapsedSeconds,
      acknowledgementSlaRemainingSeconds: acknowledgementSla.remainingSeconds,
      acknowledgementSlaBreached: acknowledgementSla.breached,
      acknowledgementSlaBreachSeconds: acknowledgementSla.breachSeconds,
      diagnostics: {
        retentionEndpoint:
          "GET /api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/retention",
        retentionTrendEndpoint:
          "GET /api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/retention/saturation-trend",
        retentionAnomalyTriageEndpointTemplate: faultManifestVerifyAnomalyTriageEndpointTemplate,
        retentionEscalationExportEndpointTemplate: faultManifestVerifyEscalationExportEndpoint,
      },
    });

    if (filtered.length >= filters.limit) {
      break;
    }
  }

  return {
    totalTracked: instances.length,
    totalMatched: filtered.length,
    rows: filtered,
  };
}

function buildFaultManifestVerifyEscalationExportCsv(rows) {
  var lines = [
    "anomalyInstanceId,anomalyKey,anomalySeverity,anomalyStatus,recommendedAction,firstDetectedAt,lastDetectedAt,closedAt,closedReason,triageAcknowledged,triageAcknowledgedAt,triageAcknowledgedBy,triageNotesCount,escalationState,escalationSeverity,escalationTrigger,escalationPendingSince,escalationEscalatedAt,escalationResolvedAt,escalationDueAt,escalationActionRequired,acknowledgementSlaStatus,acknowledgementSlaTargetSeconds,acknowledgementSlaElapsedSeconds,acknowledgementSlaRemainingSeconds,acknowledgementSlaBreached,acknowledgementSlaBreachSeconds",
  ];

  rows.forEach(function (row) {
    lines.push(
      [
        escapeCsvValue(row.anomalyInstanceId),
        escapeCsvValue(row.anomalyKey),
        escapeCsvValue(row.anomalySeverity),
        escapeCsvValue(row.anomalyStatus),
        escapeCsvValue(row.recommendedAction),
        escapeCsvValue(row.firstDetectedAt),
        escapeCsvValue(row.lastDetectedAt),
        escapeCsvValue(row.closedAt),
        escapeCsvValue(row.closedReason),
        escapeCsvValue(row.triageAcknowledged),
        escapeCsvValue(row.triageAcknowledgedAt),
        escapeCsvValue(row.triageAcknowledgedBy),
        escapeCsvValue(row.triageNotesCount),
        escapeCsvValue(row.escalationState),
        escapeCsvValue(row.escalationSeverity),
        escapeCsvValue(row.escalationTrigger),
        escapeCsvValue(row.escalationPendingSince),
        escapeCsvValue(row.escalationEscalatedAt),
        escapeCsvValue(row.escalationResolvedAt),
        escapeCsvValue(row.escalationDueAt),
        escapeCsvValue(row.escalationActionRequired),
        escapeCsvValue(row.acknowledgementSlaStatus),
        escapeCsvValue(row.acknowledgementSlaTargetSeconds),
        escapeCsvValue(row.acknowledgementSlaElapsedSeconds),
        escapeCsvValue(row.acknowledgementSlaRemainingSeconds),
        escapeCsvValue(row.acknowledgementSlaBreached),
        escapeCsvValue(row.acknowledgementSlaBreachSeconds),
      ].join(",")
    );
  });

  return lines.join("\n");
}

function normalizeFaultManifestNonce(value) {
  return String(value || "").trim();
}

function parseFaultManifestIssuedAt(issuedAt) {
  var normalized = String(issuedAt || "").trim();
  if (!normalized) {
    return null;
  }

  var timestampMs = Date.parse(normalized);
  if (!Number.isFinite(timestampMs)) {
    return null;
  }

  return {
    raw: normalized,
    timestampMs: timestampMs,
  };
}

function evaluateFaultManifestFreshness(issuedAt, maxAgeSeconds) {
  var parsed = parseFaultManifestIssuedAt(issuedAt);
  if (!parsed) {
    return {
      provided: false,
      validFormat: false,
      freshnessMatch: false,
      issuedAt: null,
      ageSeconds: null,
      maxAgeSeconds: maxAgeSeconds,
    };
  }

  var ageSeconds = Math.floor((Date.now() - parsed.timestampMs) / 1000);
  var freshnessMatch =
    ageSeconds <= maxAgeSeconds && ageSeconds >= 0 - faultManifestAllowedClockSkewSeconds;

  return {
    provided: true,
    validFormat: true,
    freshnessMatch: freshnessMatch,
    issuedAt: parsed.raw,
    ageSeconds: ageSeconds,
    maxAgeSeconds: maxAgeSeconds,
  };
}

function areOpaqueTokensEqual(actualToken, expectedToken) {
  var actual = String(actualToken || "");
  var expected = String(expectedToken || "");

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

function buildFaultManifestDigestPayload(manifestPayload, replayDefense) {
  var issuedAt = replayDefense && replayDefense.issuedAt ? String(replayDefense.issuedAt) : null;
  var nonce =
    replayDefense && replayDefense.nonce ? normalizeFaultManifestNonce(replayDefense.nonce) : null;

  return {
    filters: manifestPayload.filters,
    totalMatched: manifestPayload.totalMatched,
    returned: manifestPayload.returned,
    summary: manifestPayload.summary,
    retention: manifestPayload.retention,
    eventDigests: manifestPayload.eventDigests,
    replayDefense: {
      issuedAt: issuedAt,
      nonce: nonce || null,
    },
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

function normalizeManifestDigestInput(value) {
  var normalized = normalizeWebhookSignatureInput(value);
  if (normalized.indexOf("sha256=") === 0) {
    return normalized.slice(7);
  }

  return normalized;
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

function areFaultManifestDigestsEqual(actualDigest, expectedDigest) {
  var actual = normalizeManifestDigestInput(actualDigest);
  var expected = normalizeManifestDigestInput(expectedDigest);

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
  var authSession = requireAuthenticatedSession(req, res);
  if (!authSession) {
    return;
  }

  var tenantKey = enforceTenantScope(res, authSession, req.query.tenantKey);
  if (!tenantKey) {
    return;
  }

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
  var authSession = requireAuthenticatedSession(req, res);
  if (!authSession) {
    return;
  }

  var payload = req.body || {};
  var tenantKey = enforceTenantScope(res, authSession, payload.tenantKey);
  if (!tenantKey) {
    return;
  }

  var config = loadTenantIntegrationConfig(tenantKey);
  var dryRun = true;
  var recipient = String(payload.recipient || "").trim();

  if (!recipient && payload.providerKey === "telegram-bot") {
    var bindingKey = toTelegramBindingKey(tenantKey, authSession.subject);
    var binding = telegramUserChatBindings.get(bindingKey);
    if (binding && binding.chatId) {
      recipient = String(binding.chatId);
    }
  }

  if (typeof payload.dryRun === "string") {
    dryRun = payload.dryRun.toLowerCase() !== "false";
  } else if (payload.dryRun === false) {
    dryRun = false;
  }

  sendNotificationWithRouting(
    {
      tenantKey: tenantKey,
      channel: payload.channel || "patient-notification",
      recipient: recipient || null,
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

router.get("/integrations/messaging/telegram/link/bootstrap", function (req, res) {
  var tenantKey = normalizeTenantKey(req.query.tenantKey || "default", "default");
  var chatId = String(req.query.chatId || "").trim();
  var endpoints = buildTelegramOnboardingEndpoints(tenantKey, chatId);

  res.json({
    accepted: true,
    tenantKey: tenantKey,
    chatId: chatId || "<chat_id>",
    endpoints: endpoints,
    steps: [
      "Call login endpoint and obtain bearer token for same tenant and user role",
      "Call link endpoint with bearer token and chatId from Telegram",
      "Admin/operations can publish command menu using commands/setup endpoint",
      "Use /start or /help in Telegram after linking",
    ],
    examples: {
      powershell:
        "Invoke-RestMethod -Method Post -Uri '" +
        endpoints.linkUrl +
        "' -Headers @{ Authorization = 'Bearer <token>' } -ContentType 'application/json' -Body (@{ tenantKey='" +
        tenantKey +
        "'; chatId='" +
        (chatId || "<chat_id>") +
        "' } | ConvertTo-Json)",
      bash:
        "curl -X POST '" +
        endpoints.linkUrl +
        "' -H 'Authorization: Bearer <token>' -H 'Content-Type: application/json' -d '{\"tenantKey\":\"" +
        tenantKey +
        "\",\"chatId\":\"" +
        (chatId || "<chat_id>") +
        "\"}'",
    },
  });
});

router.post("/integrations/messaging/telegram/link", async function (req, res) {
  var authSession = requireAuthenticatedSession(req, res);
  if (!authSession) {
    return;
  }

  var payload = req.body || {};
  var tenantKey = enforceTenantScope(res, authSession, payload.tenantKey);
  if (!tenantKey) {
    return;
  }

  var chatId = String(payload.chatId || "").trim();
  var config = loadTenantIntegrationConfig(tenantKey);

  if (!chatId) {
    var botToken = getTelegramBotToken(config);
    if (!botToken) {
      res.status(400).json({
        accepted: false,
        code: "TELEGRAM_BOT_TOKEN_MISSING",
        message: "Telegram bot token is not configured for this tenant",
      });
      return;
    }

    try {
      var candidates = await fetchTelegramChatCandidates(botToken);
      if (candidates.length === 1) {
        chatId = candidates[0].chatId;
      } else {
        res.status(409).json({
          accepted: false,
          code: "TELEGRAM_CHAT_SELECTION_REQUIRED",
          message: "Provide chatId explicitly or ensure only one candidate chat exists",
          candidates: candidates,
        });
        return;
      }
    } catch (error) {
      res.status(502).json({
        accepted: false,
        code: "TELEGRAM_UPDATES_FETCH_FAILED",
        message: "Unable to fetch Telegram updates",
        detail: error && error.message ? error.message : "Unknown error",
      });
      return;
    }
  }

  var key = toTelegramBindingKey(tenantKey, authSession.subject);
  var bindingRecord = {
    tenantKey: tenantKey,
    subject: authSession.subject,
    role: authSession.role || "",
    provider: authSession.provider || "",
    chatId: chatId,
    updatedAt: new Date().toISOString(),
  };

  telegramUserChatBindings.set(key, bindingRecord);

  var commandMenuSync = {
    accepted: false,
    reason: "bot-token-missing",
  };
  var botTokenForCommandMenu = getTelegramBotToken(config);
  if (botTokenForCommandMenu) {
    try {
      commandMenuSync = await syncTelegramCommandsForRoleChat(
        botTokenForCommandMenu,
        bindingRecord.role,
        chatId
      );
    } catch (menuSyncError) {
      commandMenuSync = {
        accepted: false,
        reason: "menu-sync-failed",
        detail: menuSyncError && menuSyncError.message ? menuSyncError.message : "Unknown error",
      };
    }
  }

  res.status(201).json({
    accepted: true,
    tenantKey: tenantKey,
    subject: authSession.subject,
    role: bindingRecord.role,
    chatId: chatId,
    visibleCommands: buildTelegramCommandDefinitionsForRole(bindingRecord.role),
    commandMenuSync: commandMenuSync,
    updatedAt: bindingRecord.updatedAt,
    detail: "Telegram chat linked for authenticated user",
  });
});

router.post("/integrations/mobile/push/register", function (req, res) {
  var authSession = requireAuthenticatedSession(req, res);
  if (!authSession) {
    return;
  }

  var payload = req.body || {};
  var tenantKey = enforceTenantScope(res, authSession, payload.tenantKey);
  if (!tenantKey) {
    return;
  }

  var expoPushToken = String(payload.expoPushToken || payload.pushToken || "").trim();
  if (!isExpoPushToken(expoPushToken)) {
    res.status(400).json({
      accepted: false,
      message: "A valid Expo push token is required",
      code: "MOBILE_PUSH_TOKEN_INVALID",
    });
    return;
  }

  var key = toPushRegistrationKey(tenantKey, authSession.subject);
  var registration = {
    tenantKey: tenantKey,
    subject: authSession.subject,
    role: authSession.role || "",
    provider: authSession.provider || "",
    expoPushToken: expoPushToken,
    platform:
      String(payload.platform || "android")
        .trim()
        .toLowerCase() || "android",
    updatedAt: new Date().toISOString(),
  };

  mobilePushRegistrations.set(key, registration);

  res.status(201).json({
    accepted: true,
    tenantKey: tenantKey,
    subject: authSession.subject,
    pushTokenMasked: maskPushToken(expoPushToken),
    detail: "Push token registered for authenticated user",
    updatedAt: registration.updatedAt,
  });
});

router.post("/integrations/mobile/push/test", async function (req, res) {
  var authSession = requireAuthenticatedSession(req, res);
  if (!authSession) {
    return;
  }

  var payload = req.body || {};
  var tenantKey = enforceTenantScope(res, authSession, payload.tenantKey);
  if (!tenantKey) {
    return;
  }

  var key = toPushRegistrationKey(tenantKey, authSession.subject);
  var registration = mobilePushRegistrations.get(key);
  if (!registration || !isExpoPushToken(registration.expoPushToken)) {
    res.status(404).json({
      accepted: false,
      message: "No registered push token for authenticated user",
      code: "MOBILE_PUSH_REGISTRATION_NOT_FOUND",
      detail: "Call /api/v1/integrations/mobile/push/register first from this user session",
    });
    return;
  }

  try {
    var response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: registration.expoPushToken,
        title: payload.title || "PulseWard Test Push",
        body: payload.body || "Your authenticated PulseWard device received a push notification.",
        sound: "default",
        data: {
          tenantKey: tenantKey,
          subject: authSession.subject,
          source: "notification-service-authenticated-demo",
        },
      }),
    });

    var responseBody = await response.json().catch(function () {
      return null;
    });

    if (!response.ok) {
      res.status(502).json({
        accepted: false,
        message: "Expo push delivery request failed",
        code: "MOBILE_PUSH_DELIVERY_FAILED",
        detail:
          (responseBody &&
            responseBody.errors &&
            responseBody.errors[0] &&
            responseBody.errors[0].message) ||
          "Push provider returned a non-success response",
      });
      return;
    }

    var ticket =
      responseBody && responseBody.data && responseBody.data[0] ? responseBody.data[0] : null;
    res.json({
      accepted: true,
      tenantKey: tenantKey,
      subject: authSession.subject,
      pushTokenMasked: maskPushToken(registration.expoPushToken),
      ticket: ticket,
      detail: "Push request accepted by Expo",
    });
  } catch (error) {
    res.status(502).json({
      accepted: false,
      message: "Push provider request failed",
      code: "MOBILE_PUSH_DELIVERY_FAILED",
      detail: error && error.message ? error.message : "Unknown push provider failure",
    });
  }
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
      "Optional: set INTEGRATION_TELEGRAM_PUBLIC_API_BASE_URL and INTEGRATION_TELEGRAM_PUBLIC_AUTH_BASE_URL for onboarding links",
      "Optional: set tenant timezone in config.integrations.<tenant>.telegramDefaults.timeZone",
      "Use GET /api/v1/integrations/messaging/telegram/link/bootstrap?tenantKey=<tenant>&chatId=<chatId> for guided link URLs",
      "Call POST /api/v1/integrations/messaging/telegram/commands/setup to publish bot commands",
      "Link each user via POST /api/v1/integrations/messaging/telegram/link",
      "Notification service auto-polls commands when running (manual poll endpoint remains available)",
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
    publishedCommands: buildTelegramCommandDefinitions(),
    linkedUsersCount: getTenantTelegramBindingCount(tenantKey),
    nextPollOffset: Number(
      telegramCommandOffsets.get(normalizeTenantKey(tenantKey, "default")) || 0
    ),
  });
});

router.post("/integrations/messaging/telegram/commands/setup", async function (req, res) {
  var authSession = requireAuthenticatedSession(req, res);
  if (!authSession) {
    return;
  }

  if (["admin", "operations"].indexOf(String(authSession.role || "").toLowerCase()) < 0) {
    res.status(403).json({
      accepted: false,
      code: "TELEGRAM_COMMAND_SETUP_FORBIDDEN",
      message: "Only admin or operations role can publish Telegram commands",
    });
    return;
  }

  var payload = req.body || {};
  var tenantKey = enforceTenantScope(res, authSession, payload.tenantKey);
  if (!tenantKey) {
    return;
  }

  var config = loadTenantIntegrationConfig(tenantKey);
  var botToken = getTelegramBotToken(config);
  if (!botToken) {
    res.status(400).json({
      accepted: false,
      code: "TELEGRAM_BOT_TOKEN_MISSING",
      message: "Telegram bot token is not configured for this tenant",
    });
    return;
  }

  var commands = buildTelegramCommandDefinitions();

  try {
    await setTelegramCommands(botToken, commands);
    telegramCommandSetupApplied.set(normalizeTenantKey(tenantKey, "default"), {
      tokenFingerprint: getTelegramCommandSetupFingerprint(botToken),
      updatedAt: new Date().toISOString(),
      commandCount: commands.length,
    });
    res.json({
      accepted: true,
      tenantKey: tenantKey,
      commands: commands,
      detail: "Telegram commands published successfully",
    });
  } catch (error) {
    res.status(502).json({
      accepted: false,
      code: "TELEGRAM_COMMAND_SETUP_FAILED",
      message: "Unable to publish Telegram commands",
      detail: error && error.message ? error.message : "Unknown Telegram API error",
    });
  }
});

router.get("/integrations/messaging/telegram/commands/status", function (req, res) {
  var authSession = requireAuthenticatedSession(req, res);
  if (!authSession) {
    return;
  }

  var tenantKey = enforceTenantScope(res, authSession, req.query.tenantKey);
  if (!tenantKey) {
    return;
  }

  var normalizedTenant = normalizeTenantKey(tenantKey, "default");
  var config = loadTenantIntegrationConfig(normalizedTenant);
  var botToken = getTelegramBotToken(config);

  res.json({
    tenantKey: normalizedTenant,
    providerEnabled: Boolean(findMessagingProvider(config, "telegram-bot")),
    botConfigured: Boolean(botToken),
    linkedUsersCount: getTenantTelegramBindingCount(normalizedTenant),
    nextPollOffset: Number(telegramCommandOffsets.get(normalizedTenant) || 0),
    commands: buildTelegramCommandDefinitions(),
    visibleCommandsForRequester: buildTelegramCommandDefinitionsForRole(authSession.role),
    autoPoll: getTelegramAutoPollRuntimeState(),
  });
});

router.post("/integrations/messaging/telegram/commands/poll", async function (req, res) {
  var authSession = requireAuthenticatedSession(req, res);
  if (!authSession) {
    return;
  }

  if (["admin", "operations"].indexOf(String(authSession.role || "").toLowerCase()) < 0) {
    res.status(403).json({
      accepted: false,
      code: "TELEGRAM_COMMAND_POLL_FORBIDDEN",
      message: "Only admin or operations role can run Telegram polling",
    });
    return;
  }

  var payload = req.body || {};
  var tenantKey = enforceTenantScope(res, authSession, payload.tenantKey);
  if (!tenantKey) {
    return;
  }

  var normalizedTenant = normalizeTenantKey(tenantKey, "default");
  var config = loadTenantIntegrationConfig(normalizedTenant);
  var botToken = getTelegramBotToken(config);
  if (!botToken) {
    res.status(400).json({
      accepted: false,
      code: "TELEGRAM_BOT_TOKEN_MISSING",
      message: "Telegram bot token is not configured for this tenant",
    });
    return;
  }

  var providedOffset = Number(payload.offset);
  var offset = Number.isFinite(providedOffset)
    ? Math.max(0, Math.floor(providedOffset))
    : Number(telegramCommandOffsets.get(normalizedTenant) || 0);
  var limit = Number(payload.limit);

  try {
    var updates = await fetchTelegramUpdates(botToken, offset, limit);
    var processed = [];
    var nextOffset = offset;

    for (var index = 0; index < updates.length; index += 1) {
      var update = updates[index];
      var updateId = Number(update && update.update_id);
      if (Number.isFinite(updateId) && updateId >= nextOffset) {
        nextOffset = updateId + 1;
      }

      var result = await processTelegramCommandUpdate(normalizedTenant, botToken, update);
      if (result && result.handled) {
        processed.push(result);
      }
    }

    telegramCommandOffsets.set(normalizedTenant, nextOffset);

    res.json({
      accepted: true,
      tenantKey: normalizedTenant,
      fetchedUpdates: updates.length,
      handledCommands: processed.length,
      nextOffset: nextOffset,
      processed: processed,
    });
  } catch (error) {
    res.status(502).json({
      accepted: false,
      code: "TELEGRAM_COMMAND_POLL_FAILED",
      message: "Unable to poll Telegram updates",
      detail: error && error.message ? error.message : "Unknown polling failure",
    });
  }
});

router.post("/integrations/messaging/telegram/commands/webhook", async function (req, res) {
  var payload = req.body || {};
  var tenantKey = normalizeTenantKey(req.query.tenantKey || payload.tenantKey, "default");
  if (!tenantKey) {
    res.status(400).json({
      accepted: false,
      code: "TELEGRAM_TENANT_REQUIRED",
      message: "tenantKey is required in query or payload",
    });
    return;
  }

  var configuredSecret = String(process.env.INTEGRATION_TELEGRAM_WEBHOOK_SECRET || "").trim();
  if (configuredSecret) {
    var receivedSecret = String(req.headers["x-telegram-bot-api-secret-token"] || "").trim();
    if (!receivedSecret || receivedSecret !== configuredSecret) {
      res.status(403).json({
        accepted: false,
        code: "TELEGRAM_WEBHOOK_SECRET_INVALID",
        message: "Telegram webhook secret token is invalid",
      });
      return;
    }
  }

  var config = loadTenantIntegrationConfig(tenantKey);
  var botToken = getTelegramBotToken(config);
  if (!botToken) {
    res.status(400).json({
      accepted: false,
      code: "TELEGRAM_BOT_TOKEN_MISSING",
      message: "Telegram bot token is not configured for this tenant",
    });
    return;
  }

  try {
    var result = await processTelegramCommandUpdate(tenantKey, botToken, payload);

    res.json({
      accepted: true,
      tenantKey: tenantKey,
      handled: Boolean(result && result.handled),
      result: result,
      nextOffset: Number(telegramCommandOffsets.get(tenantKey) || 0),
    });
  } catch (error) {
    res.status(502).json({
      accepted: false,
      code: "TELEGRAM_WEBHOOK_PROCESSING_FAILED",
      message: "Unable to process Telegram webhook update",
      detail: error && error.message ? error.message : "Unknown webhook processing error",
    });
  }
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
      secretStatus.parsed && secretStatus.parsed.accessToken && secretStatus.parsed.phoneNumberId
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
      manifestVerifyEndpoint: "POST /api/v1/integrations/messaging/fault-injection/manifest/verify",
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
      manifestVerifyEndpoint: "POST /api/v1/integrations/messaging/fault-injection/manifest/verify",
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
      manifestVerifyEndpoint: "POST /api/v1/integrations/messaging/fault-injection/manifest/verify",
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
  var nonce = normalizeFaultManifestNonce(req.query.nonce);

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
  var replayDefense = {
    issuedAt: payload.generatedAt,
    nonce: nonce || null,
  };
  var serializedPayload = JSON.stringify(buildFaultManifestDigestPayload(payload, replayDefense));
  var digestHex = crypto.createHash("sha256").update(serializedPayload, "utf8").digest("hex");
  var signing = getFaultEvidenceSigningMaterial();

  var signature = null;
  if (signing.configured) {
    signature =
      "sha256=" +
      crypto.createHmac("sha256", signing.secret).update(digestHex, "utf8").digest("hex");
  }

  res.set("Cache-Control", "no-store");
  res.json({
    manifestId: randomUUID(),
    manifestVersion: faultManifestVersion,
    generatedAt: payload.generatedAt,
    replayDefense: {
      issuedAt: replayDefense.issuedAt,
      nonce: replayDefense.nonce,
      maxAgeSeconds: defaultFaultManifestMaxAgeSeconds,
      allowedClockSkewSeconds: faultManifestAllowedClockSkewSeconds,
    },
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
      verifyEndpoint: "POST /api/v1/integrations/messaging/fault-injection/manifest/verify",
      handoffGuide:
        "Share manifest signature, digest, issuedAt, and optional nonce with incident stakeholders; verify signature and replay defense checks before acceptance",
    },
  });
});

router.post("/integrations/messaging/fault-injection/manifest/verify", function (req, res) {
  var payload = req.body || {};
  var tenantKey = String(payload.tenantKey || "").trim();
  var providerKey = String(payload.providerKey || "")
    .trim()
    .toLowerCase();
  var scenario = String(payload.scenario || "")
    .trim()
    .toLowerCase();
  var limit = parseRetryInt(payload.limit, 100, 1, 1000);
  var expectedManifestVersion = faultManifestVersion;
  var manifestVersion = String(payload.manifestVersion || expectedManifestVersion).trim();
  var issuedAt = String(payload.issuedAt || "").trim();
  var nonce = normalizeFaultManifestNonce(payload.nonce);
  var expectedNonce = normalizeFaultManifestNonce(payload.expectedNonce);
  var maxAgeSeconds = parseRetryInt(
    payload.maxAgeSeconds,
    defaultFaultManifestMaxAgeSeconds,
    30,
    86400
  );
  var providedDigest = normalizeManifestDigestInput(payload.digest);
  var providedSignature = String(payload.signature || "").trim();
  var verificationFingerprint = getFaultManifestVerifyFingerprint({
    tenantKey: tenantKey,
    providerKey: providerKey,
    scenario: scenario,
    limit: limit,
    manifestVersion: manifestVersion,
    issuedAt: issuedAt,
    nonce: nonce,
    expectedNonce: expectedNonce,
    maxAgeSeconds: maxAgeSeconds,
    digest: providedDigest,
    signature: providedSignature,
  });

  if (!issuedAt) {
    res.status(400).json({
      message: "issuedAt is required",
      code: "NOTIFICATION_FAULT_MANIFEST_ISSUED_AT_REQUIRED",
    });
    return;
  }

  if (!providedDigest) {
    res.status(400).json({
      message: "digest is required",
      code: "NOTIFICATION_FAULT_MANIFEST_DIGEST_REQUIRED",
    });
    return;
  }

  var filtered = collectFaultInjectionEvents(tenantKey, providerKey, scenario);
  var items = filtered.slice(-limit);
  var manifestPayload = buildFaultManifestPayload(
    {
      tenantKey: tenantKey,
      providerKey: providerKey,
      scenario: scenario,
      limit: limit,
    },
    items,
    filtered.length
  );
  var freshness = evaluateFaultManifestFreshness(issuedAt, maxAgeSeconds);
  var serializedPayload = JSON.stringify(
    buildFaultManifestDigestPayload(manifestPayload, {
      issuedAt: issuedAt,
      nonce: nonce || null,
    })
  );
  var computedDigest = crypto.createHash("sha256").update(serializedPayload, "utf8").digest("hex");
  var signing = getFaultEvidenceSigningMaterial();
  var expectedSignature = signing.configured
    ? "sha256=" +
      crypto.createHmac("sha256", signing.secret).update(computedDigest, "utf8").digest("hex")
    : null;
  var digestMatch = areFaultManifestDigestsEqual(providedDigest, computedDigest);
  var signatureProvided = Boolean(providedSignature);
  var nonceProvided = Boolean(nonce);
  var expectedNonceProvided = Boolean(expectedNonce);
  var nonceMatch = expectedNonceProvided
    ? nonceProvided && areOpaqueTokensEqual(nonce, expectedNonce)
    : true;
  var signatureMatch = signing.configured
    ? signatureProvided && areWebhookSignaturesEqual(providedSignature, expectedSignature)
    : !signatureProvided;
  var versionMatch = manifestVersion === expectedManifestVersion;
  var valid =
    versionMatch &&
    digestMatch &&
    signatureMatch &&
    signing.configured &&
    freshness.freshnessMatch &&
    nonceMatch;

  var verificationTime = new Date().toISOString();
  var responseBody = {
    verifiedAt: verificationTime,
    valid: valid,
    expectedManifestVersion: expectedManifestVersion,
    providedManifestVersion: manifestVersion,
    checks: {
      versionMatch: versionMatch,
      digestMatch: digestMatch,
      signatureMatch: signatureMatch,
      signingConfigured: signing.configured,
      signatureProvided: signatureProvided,
      signingSecretSource: signing.source,
      issuedAtProvided: freshness.provided,
      issuedAtValidFormat: freshness.validFormat,
      freshnessMatch: freshness.freshnessMatch,
      ageSeconds: freshness.ageSeconds,
      maxAgeSeconds: freshness.maxAgeSeconds,
      nonceProvided: nonceProvided,
      expectedNonceProvided: expectedNonceProvided,
      nonceMatch: nonceMatch,
    },
    provided: {
      digest: providedDigest,
      signature: signatureProvided ? providedSignature : null,
      issuedAt: issuedAt,
      nonce: nonceProvided ? nonce : null,
      expectedNonce: expectedNonceProvided ? expectedNonce : null,
    },
    computed: {
      digest: {
        algorithm: "sha256",
        value: computedDigest,
        payloadBytes: Buffer.byteLength(serializedPayload, "utf8"),
      },
      signature: expectedSignature,
      signatureAlgorithm: signing.configured ? "hmac-sha256" : "unsigned",
    },
    replayDefense: {
      issuedAt: freshness.issuedAt,
      ageSeconds: freshness.ageSeconds,
      maxAgeSeconds: freshness.maxAgeSeconds,
      allowedClockSkewSeconds: faultManifestAllowedClockSkewSeconds,
      freshnessMatch: freshness.freshnessMatch,
      nonce: nonceProvided ? nonce : null,
      expectedNonce: expectedNonceProvided ? expectedNonce : null,
      nonceMatch: nonceMatch,
    },
    evidence: {
      filters: manifestPayload.filters,
      totalMatched: manifestPayload.totalMatched,
      returned: manifestPayload.returned,
      summary: manifestPayload.summary,
      retention: manifestPayload.retention,
      eventIds: manifestPayload.eventDigests.map(function (item) {
        return item.eventId;
      }),
    },
    diagnostics: {
      manifestEndpoint: "GET /api/v1/integrations/messaging/fault-injection/manifest",
      exportEndpoint: "GET /api/v1/integrations/messaging/fault-injection/export",
      retentionEndpoint: "GET /api/v1/integrations/messaging/fault-injection/retention",
      replayAttemptsEndpoint:
        "GET /api/v1/integrations/messaging/fault-injection/manifest/verify/attempts",
      replayAttemptsExportEndpoint:
        "GET /api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/export",
      replayAttemptsRetentionEndpoint:
        "GET /api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/retention",
      replayAttemptsRetentionApplyEndpoint:
        "POST /api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/retention/apply",
      retentionSaturationEndpoint:
        "GET /api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/retention",
      retentionSaturationPath: "telemetry.saturation",
      retentionSaturationTrendEndpoint:
        "GET /api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/retention/saturation-trend",
      retentionSaturationTrendPath: "telemetry.saturationTrend",
      retentionAnomalyTriageEndpointTemplate: faultManifestVerifyAnomalyTriageEndpointTemplate,
      retentionEscalationExportEndpointTemplate: faultManifestVerifyEscalationExportEndpoint,
      handoffGuide:
        "Recompute digest/signature and enforce issuedAt freshness plus optional nonce correlation before accepting external manifest evidence",
    },
  };

  var replayAttempt = storeFaultManifestVerifyAttempt(
    verificationFingerprint,
    responseBody,
    verificationTime
  );

  if (replayAttempt.duplicateSuppressed) {
    var cachedResponse = Object.assign({}, replayAttempt.attempt.responseBody);
    cachedResponse.replayAttempt = buildFaultManifestReplayAttemptMeta(replayAttempt.attempt, true);
    res.json(cachedResponse);
    return;
  }

  responseBody.replayAttempt = buildFaultManifestReplayAttemptMeta(replayAttempt.attempt, false);
  replayAttempt.attempt.responseBody = responseBody;

  res.json(responseBody);
});

router.get("/integrations/messaging/fault-injection/manifest/verify/attempts", function (req, res) {
  var audit = collectFaultManifestVerifyAttemptAudit({
    tenantKey: req.query.tenantKey,
    providerKey: req.query.providerKey,
    scenario: req.query.scenario,
    fingerprint: req.query.fingerprint,
    validFilter: parseOptionalBoolQuery(req.query.valid),
    duplicateSuppressedFilter: parseOptionalBoolQuery(req.query.duplicateSuppressed),
    limit: req.query.limit,
    limitFallback: 50,
    limitMax: 500,
  });

  res.set("Cache-Control", "no-store");
  res.json({
    queriedAt: new Date().toISOString(),
    totalRecorded: audit.totalRecorded,
    totalMatched: audit.totalMatched,
    returned: audit.returned,
    dedupeWindowSeconds: audit.dedupeWindowSeconds,
    dedupeMaxEntries: audit.dedupeMaxEntries,
    summary: audit.summary,
    filters: audit.filters,
    diagnostics: {
      manifestEndpoint: "GET /api/v1/integrations/messaging/fault-injection/manifest",
      verifyEndpoint: "POST /api/v1/integrations/messaging/fault-injection/manifest/verify",
      exportEndpoint: "GET /api/v1/integrations/messaging/fault-injection/export",
      attemptsExportEndpoint:
        "GET /api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/export",
      retentionEndpoint:
        "GET /api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/retention",
      retentionApplyEndpoint:
        "POST /api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/retention/apply",
      retentionSaturationEndpoint:
        "GET /api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/retention",
      retentionSaturationPath: "telemetry.saturation",
      retentionSaturationTrendEndpoint:
        "GET /api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/retention/saturation-trend",
      retentionSaturationTrendPath: "telemetry.saturationTrend",
      retentionAnomalyTriageEndpointTemplate: faultManifestVerifyAnomalyTriageEndpointTemplate,
      retentionEscalationExportEndpointTemplate: faultManifestVerifyEscalationExportEndpoint,
    },
    attempts: audit.attempts,
  });
});

router.get(
  "/integrations/messaging/fault-injection/manifest/verify/attempts/export",
  function (req, res) {
    var format = String(req.query.format || "json")
      .trim()
      .toLowerCase();
    var audit = collectFaultManifestVerifyAttemptAudit({
      tenantKey: req.query.tenantKey,
      providerKey: req.query.providerKey,
      scenario: req.query.scenario,
      fingerprint: req.query.fingerprint,
      validFilter: parseOptionalBoolQuery(req.query.valid),
      duplicateSuppressedFilter: parseOptionalBoolQuery(req.query.duplicateSuppressed),
      limit: req.query.limit,
      limitFallback: 250,
      limitMax: 2000,
    });

    if (format === "csv") {
      var csvBody = buildFaultManifestVerifyAttemptCsv(audit.attempts);
      res.set("Cache-Control", "no-store");
      res.attachment("messaging-fault-manifest-verify-attempts-export.csv");
      res.type("text/csv");
      res.send(csvBody);
      return;
    }

    res.set("Cache-Control", "no-store");
    res.json({
      exportedAt: new Date().toISOString(),
      format: "json",
      totalRecorded: audit.totalRecorded,
      totalMatched: audit.totalMatched,
      returned: audit.returned,
      dedupeWindowSeconds: audit.dedupeWindowSeconds,
      dedupeMaxEntries: audit.dedupeMaxEntries,
      summary: audit.summary,
      filters: audit.filters,
      diagnostics: {
        attemptsEndpoint:
          "GET /api/v1/integrations/messaging/fault-injection/manifest/verify/attempts",
        verifyEndpoint: "POST /api/v1/integrations/messaging/fault-injection/manifest/verify",
        manifestEndpoint: "GET /api/v1/integrations/messaging/fault-injection/manifest",
        faultInjectionExportEndpoint: "GET /api/v1/integrations/messaging/fault-injection/export",
        retentionEndpoint:
          "GET /api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/retention",
        retentionApplyEndpoint:
          "POST /api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/retention/apply",
        retentionSaturationEndpoint:
          "GET /api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/retention",
        retentionSaturationPath: "telemetry.saturation",
        retentionSaturationTrendEndpoint:
          "GET /api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/retention/saturation-trend",
        retentionSaturationTrendPath: "telemetry.saturationTrend",
        retentionEscalationPath: "telemetry.escalation",
        retentionAnomalyTriageEndpointTemplate: faultManifestVerifyAnomalyTriageEndpointTemplate,
        retentionEscalationExportEndpointTemplate: faultManifestVerifyEscalationExportEndpoint,
      },
      attempts: audit.attempts,
    });
  }
);

router.get(
  "/integrations/messaging/fault-injection/manifest/verify/attempts/retention",
  function (req, res) {
    pruneFaultManifestVerifyAttempts(Date.now());
    var telemetry = summarizeFaultManifestVerifyAttemptTelemetry();
    maybeCaptureFaultManifestVerifySaturationTrend("retention-status", telemetry.saturation, true);
    var trend = collectFaultManifestVerifyAttemptSaturationTrend({
      windowMinutes: req.query.windowMinutes,
      limit: req.query.limit,
    });
    telemetry.saturationTrend = {
      summary: trend.summary,
      snapshots: trend.snapshots,
    };
    telemetry.anomalies = trend.summary.anomalies;
    telemetry.highestAnomalySeverity = trend.summary.highestAnomalySeverity;
    telemetry.anomalyTracking = trend.summary.anomalyTracking;
    telemetry.escalation = trend.summary.escalation;
    telemetry.recentlyClosedAnomalies = collectFaultManifestVerifyRecentlyClosedAnomalies();

    res.set("Cache-Control", "no-store");
    res.json({
      retention: {
        dedupeWindowSeconds: faultManifestVerifyDedupeWindowSeconds,
        maxEntries: faultManifestVerifyDedupeMaxEntries,
        minDedupeWindowSeconds: 30,
        maxDedupeWindowSeconds: 86400,
        minMaxEntries: 50,
        maxMaxEntries: 5000,
        source: faultManifestVerifyRetentionSource,
        pruneStrategy: "drop-expired-then-oldest",
        escalationPolicy: getFaultManifestVerifyEscalationPolicy(),
        escalationExportPolicy: getFaultManifestVerifyEscalationExportPolicy(),
        lifecyclePolicy: getFaultManifestVerifyAnomalyLifecyclePolicy(),
      },
      telemetry: telemetry,
      diagnostics: {
        attemptsEndpoint:
          "GET /api/v1/integrations/messaging/fault-injection/manifest/verify/attempts",
        attemptsExportEndpoint:
          "GET /api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/export",
        verifyEndpoint: "POST /api/v1/integrations/messaging/fault-injection/manifest/verify",
        applyEndpoint:
          "POST /api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/retention/apply",
        retentionSaturationEndpoint:
          "GET /api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/retention",
        retentionSaturationPath: "telemetry.saturation",
        retentionSaturationTrendEndpoint:
          "GET /api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/retention/saturation-trend",
        retentionSaturationTrendPath: "telemetry.saturationTrend",
        retentionEscalationPath: "telemetry.escalation",
        retentionAnomalyTriageEndpointTemplate: faultManifestVerifyAnomalyTriageEndpointTemplate,
        retentionEscalationExportEndpointTemplate: faultManifestVerifyEscalationExportEndpoint,
      },
    });
  }
);

router.get(
  "/integrations/messaging/fault-injection/manifest/verify/attempts/retention/saturation-trend",
  function (req, res) {
    pruneFaultManifestVerifyAttempts(Date.now());
    var telemetry = summarizeFaultManifestVerifyAttemptTelemetry();
    maybeCaptureFaultManifestVerifySaturationTrend(
      "retention-saturation-trend",
      telemetry.saturation,
      false
    );
    var trend = collectFaultManifestVerifyAttemptSaturationTrend({
      windowMinutes: req.query.windowMinutes,
      limit: req.query.limit,
    });

    res.set("Cache-Control", "no-store");
    res.json({
      queriedAt: new Date().toISOString(),
      query: {
        windowMinutes: trend.summary.windowMinutes,
        limit: trend.summary.requestedLimit,
      },
      summary: trend.summary,
      snapshots: trend.snapshots,
      latestSaturation: telemetry.saturation,
      diagnostics: {
        retentionEndpoint:
          "GET /api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/retention",
        retentionApplyEndpoint:
          "POST /api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/retention/apply",
        verifyEndpoint: "POST /api/v1/integrations/messaging/fault-injection/manifest/verify",
        retentionSaturationPath: "latestSaturation",
        retentionSaturationTrendPath: "snapshots",
        retentionEscalationPath: "summary.escalation",
        retentionAnomalyTriageEndpointTemplate: faultManifestVerifyAnomalyTriageEndpointTemplate,
        retentionEscalationExportEndpointTemplate: faultManifestVerifyEscalationExportEndpoint,
      },
    });
  }
);

router.get(
  "/integrations/messaging/fault-injection/manifest/verify/attempts/retention/escalations/export",
  function (req, res) {
    var policy = getFaultManifestVerifyEscalationExportPolicy();
    if (!policy.enabled) {
      res.status(403).json({
        message: "escalation export policy is disabled",
        code: "NOTIFICATION_FAULT_MANIFEST_VERIFY_ESCALATION_EXPORT_DISABLED",
      });
      return;
    }

    var parsedFilters = parseFaultManifestVerifyEscalationExportQuery(req.query, policy);
    if (parsedFilters.error) {
      res.status(parsedFilters.error.status).json({
        message: parsedFilters.error.message,
        code: parsedFilters.error.code,
      });
      return;
    }

    var nowMs = Date.now();
    var exported = buildFaultManifestVerifyEscalationExportRows(parsedFilters, nowMs);
    if (parsedFilters.format === "csv") {
      var csvBody = buildFaultManifestVerifyEscalationExportCsv(exported.rows);
      res.set("Cache-Control", "no-store");
      res.attachment("messaging-fault-manifest-verify-escalations-export.csv");
      res.type("text/csv");
      res.send(csvBody);
      return;
    }

    res.set("Cache-Control", "no-store");
    res.json({
      exportedAt: new Date(nowMs).toISOString(),
      format: "json",
      totalTracked: exported.totalTracked,
      totalMatched: exported.totalMatched,
      returned: exported.rows.length,
      policy: policy,
      filters: {
        includeRecentlyClosed: parsedFilters.includeRecentlyClosed,
        state: parsedFilters.stateFilter,
        escalationSeverity: parsedFilters.escalationSeverityFilter,
        acknowledgementSlaStatus: parsedFilters.acknowledgementSlaStatusFilter,
        triageAcknowledged: parsedFilters.triageAcknowledged,
        actionRequired: parsedFilters.actionRequired,
        breached: parsedFilters.breached,
        limit: parsedFilters.limit,
      },
      diagnostics: {
        retentionEndpoint:
          "GET /api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/retention",
        retentionTrendEndpoint:
          "GET /api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/retention/saturation-trend",
        retentionAnomalyTriageEndpointTemplate: faultManifestVerifyAnomalyTriageEndpointTemplate,
        retentionEscalationExportEndpointTemplate: faultManifestVerifyEscalationExportEndpoint,
      },
      escalations: exported.rows,
    });
  }
);

router.post(
  "/integrations/messaging/fault-injection/manifest/verify/attempts/retention/anomalies/:anomalyInstanceId/triage",
  function (req, res) {
    pruneFaultManifestVerifyAnomalyTracking(Date.now());
    var anomalyInstanceId = String(req.params.anomalyInstanceId || "").trim();
    var anomalyInstance = findFaultManifestVerifyAnomalyInstanceById(anomalyInstanceId);

    if (!anomalyInstance) {
      res.status(404).json({
        message: "anomaly instance not found",
        code: "NOTIFICATION_FAULT_MANIFEST_VERIFY_ANOMALY_NOT_FOUND",
      });
      return;
    }

    var triageResult = applyFaultManifestVerifyAnomalyTriage(anomalyInstance, req.body || {});
    if (triageResult.error) {
      res.status(triageResult.error.status).json({
        message: triageResult.error.message,
        code: triageResult.error.code,
      });
      return;
    }

    res.set("Cache-Control", "no-store");
    res.json({
      updatedAt: triageResult.updatedAt,
      anomaly: {
        key: anomalyInstance.key,
        severity: anomalyInstance.severity,
        recommendedAction: anomalyInstance.recommendedAction,
        evidence: anomalyInstance.evidence,
        anomalyInstanceId: anomalyInstance.anomalyInstanceId,
        status: anomalyInstance.status,
        firstDetectedAt: anomalyInstance.firstDetectedAt,
        lastDetectedAt: anomalyInstance.lastDetectedAt,
        triage: buildFaultManifestVerifyAnomalyTriageSnapshot(anomalyInstance),
        closedAt: anomalyInstance.closedAt || null,
        closedReason: anomalyInstance.closedReason || null,
        clearanceEvidence: anomalyInstance.clearanceEvidence || null,
        closureHistory: Array.isArray(anomalyInstance.closureHistory)
          ? anomalyInstance.closureHistory
          : [],
        escalation: buildFaultManifestVerifyAnomalyEscalationSnapshot(anomalyInstance),
      },
      audit: {
        actionId: triageResult.action.actionId,
        actionType: triageResult.action.actionType,
        escalationTransition: triageResult.escalationTransition,
      },
      diagnostics: {
        retentionEndpoint:
          "GET /api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/retention",
        retentionTrendEndpoint:
          "GET /api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/retention/saturation-trend",
        retentionAnomalyTriageEndpointTemplate: faultManifestVerifyAnomalyTriageEndpointTemplate,
        retentionEscalationExportEndpointTemplate: faultManifestVerifyEscalationExportEndpoint,
      },
    });
  }
);

router.post(
  "/integrations/messaging/fault-injection/manifest/verify/attempts/retention/apply",
  function (req, res) {
    var payload = req.body || {};
    var applied = applyFaultManifestVerifyAttemptRetention(payload);

    if (applied && applied.error) {
      res.status(applied.error.status).json({
        message: applied.error.message,
        code: applied.error.code,
      });
      return;
    }

    if (!applied) {
      res.status(400).json({
        message:
          "dedupeWindowSeconds or maxEntries or escalationPolicy or escalationExportPolicy is required",
        code: "NOTIFICATION_FAULT_MANIFEST_VERIFY_ATTEMPT_RETENTION_REQUIRED",
      });
      return;
    }

    if (applied.persisted) {
      maybeCaptureFaultManifestVerifySaturationTrend(
        "retention-apply",
        applied.telemetry.saturation,
        true
      );
    }
    var trend = collectFaultManifestVerifyAttemptSaturationTrend({
      windowMinutes: req.query.windowMinutes,
      limit: req.query.limit,
    });
    applied.telemetry.saturationTrend = {
      summary: trend.summary,
      snapshots: trend.snapshots,
    };
    applied.telemetry.anomalies = trend.summary.anomalies;
    applied.telemetry.highestAnomalySeverity = trend.summary.highestAnomalySeverity;
    applied.telemetry.anomalyTracking = trend.summary.anomalyTracking;
    applied.telemetry.escalation = trend.summary.escalation;
    applied.telemetry.recentlyClosedAnomalies = collectFaultManifestVerifyRecentlyClosedAnomalies();

    res.json({
      appliedAt: new Date().toISOString(),
      retention: {
        executionMode: applied.executionMode,
        persisted: applied.persisted,
        previousDedupeWindowSeconds: applied.previousDedupeWindowSeconds,
        dedupeWindowSeconds: applied.dedupeWindowSeconds,
        previousMaxEntries: applied.previousMaxEntries,
        maxEntries: applied.maxEntries,
        previousEscalationPolicy: applied.previousEscalationPolicy,
        escalationPolicy: applied.escalationPolicy,
        escalationPolicyChanged: applied.escalationPolicyChanged,
        previousEscalationExportPolicy: applied.previousEscalationExportPolicy,
        escalationExportPolicy: applied.escalationExportPolicy,
        escalationExportPolicyChanged: applied.escalationExportPolicyChanged,
        pruneNow: applied.pruneNow,
        prunedByWindow: applied.prunedByWindow,
        prunedByMaxEntries: applied.prunedByMaxEntries,
        prunedCount: applied.prunedCount,
        source: applied.source,
        pruneStrategy: applied.pruneStrategy,
        changeImpact: applied.changeImpact,
      },
      telemetry: applied.telemetry,
      diagnostics: {
        statusEndpoint:
          "GET /api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/retention",
        attemptsEndpoint:
          "GET /api/v1/integrations/messaging/fault-injection/manifest/verify/attempts",
        attemptsExportEndpoint:
          "GET /api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/export",
        verifyEndpoint: "POST /api/v1/integrations/messaging/fault-injection/manifest/verify",
        retentionSaturationEndpoint:
          "GET /api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/retention",
        retentionSaturationPath: "telemetry.saturation",
        retentionSaturationTrendEndpoint:
          "GET /api/v1/integrations/messaging/fault-injection/manifest/verify/attempts/retention/saturation-trend",
        retentionSaturationTrendPath: "telemetry.saturationTrend",
        retentionEscalationPath: "telemetry.escalation",
        retentionAnomalyTriageEndpointTemplate: faultManifestVerifyAnomalyTriageEndpointTemplate,
        retentionEscalationExportEndpointTemplate: faultManifestVerifyEscalationExportEndpoint,
      },
    });
  }
);

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
      manifestVerifyEndpoint: "POST /api/v1/integrations/messaging/fault-injection/manifest/verify",
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
module.exports.startTelegramCommandAutoPolling = startTelegramCommandAutoPolling;
module.exports.getTelegramAutoPollRuntimeState = getTelegramAutoPollRuntimeState;
