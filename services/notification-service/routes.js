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
var faultManifestVerifyRetentionSource =
  faultManifestVerifyRetentionWindowEnvValue || faultManifestVerifyRetentionMaxEntriesEnvValue
    ? "env"
    : "default";
var faultManifestVerifyAttemptCache = [];

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
  };
}

function applyFaultManifestVerifyAttemptRetention(payload) {
  var previousWindow = faultManifestVerifyDedupeWindowSeconds;
  var previousMaxEntries = faultManifestVerifyDedupeMaxEntries;
  var hasWindow = payload.dedupeWindowSeconds !== undefined && payload.dedupeWindowSeconds !== null;
  var hasMaxEntries = payload.maxEntries !== undefined && payload.maxEntries !== null;

  if (!hasWindow && !hasMaxEntries) {
    return null;
  }

  var pruneNow = parseRetryBool(payload.pruneNow, true);

  if (hasWindow) {
    faultManifestVerifyDedupeWindowSeconds = parseRetryInt(
      payload.dedupeWindowSeconds,
      faultManifestVerifyDedupeWindowSeconds,
      30,
      86400
    );
  }

  if (hasMaxEntries) {
    faultManifestVerifyDedupeMaxEntries = parseRetryInt(
      payload.maxEntries,
      faultManifestVerifyDedupeMaxEntries,
      50,
      5000
    );
  }

  faultManifestVerifyRetentionSource = "api";

  var pruneResult = {
    prunedByWindow: 0,
    prunedByMaxEntries: 0,
    prunedCount: 0,
  };
  if (pruneNow) {
    pruneResult = pruneFaultManifestVerifyAttempts(Date.now());
  }

  return {
    previousDedupeWindowSeconds: previousWindow,
    dedupeWindowSeconds: faultManifestVerifyDedupeWindowSeconds,
    previousMaxEntries: previousMaxEntries,
    maxEntries: faultManifestVerifyDedupeMaxEntries,
    pruneNow: pruneNow,
    prunedByWindow: pruneResult.prunedByWindow,
    prunedByMaxEntries: pruneResult.prunedByMaxEntries,
    prunedCount: pruneResult.prunedCount,
    source: faultManifestVerifyRetentionSource,
    pruneStrategy: "drop-expired-then-oldest",
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
      },
      attempts: audit.attempts,
    });
  }
);

router.get(
  "/integrations/messaging/fault-injection/manifest/verify/attempts/retention",
  function (_req, res) {
    pruneFaultManifestVerifyAttempts(Date.now());
    var telemetry = summarizeFaultManifestVerifyAttemptTelemetry();

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
      },
    });
  }
);

router.post(
  "/integrations/messaging/fault-injection/manifest/verify/attempts/retention/apply",
  function (req, res) {
    var payload = req.body || {};
    var applied = applyFaultManifestVerifyAttemptRetention(payload);

    if (!applied) {
      res.status(400).json({
        message: "dedupeWindowSeconds or maxEntries is required",
        code: "NOTIFICATION_FAULT_MANIFEST_VERIFY_ATTEMPT_RETENTION_REQUIRED",
      });
      return;
    }

    res.json({
      appliedAt: new Date().toISOString(),
      retention: {
        previousDedupeWindowSeconds: applied.previousDedupeWindowSeconds,
        dedupeWindowSeconds: applied.dedupeWindowSeconds,
        previousMaxEntries: applied.previousMaxEntries,
        maxEntries: applied.maxEntries,
        pruneNow: applied.pruneNow,
        prunedByWindow: applied.prunedByWindow,
        prunedByMaxEntries: applied.prunedByMaxEntries,
        prunedCount: applied.prunedCount,
        source: applied.source,
        pruneStrategy: applied.pruneStrategy,
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
