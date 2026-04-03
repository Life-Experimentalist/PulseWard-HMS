var express = require("express");
var jwt = require("jsonwebtoken");
var randomUUID = require("crypto").randomUUID;
var domainConfigUtils = require("../../packages/shared-utils/load-domain-config");
var adminSettingsStore = require("./admin-settings-store");
var authPolicySchema = require("./auth-policy-schema");
var loadDomainConfig = domainConfigUtils.loadDomainConfig;
var resolveTenantDomain = domainConfigUtils.resolveTenantDomain;
var isOriginAllowed = domainConfigUtils.isOriginAllowed;
var getTenantSettings = adminSettingsStore.getTenantSettings;
var setTenantSettings = adminSettingsStore.setTenantSettings;
var getStorageMetadata = adminSettingsStore.getStorageMetadata;
var getDefaultAuthPolicy = authPolicySchema.getDefaultAuthPolicy;
var validateAndNormalizeAuthPolicy = authPolicySchema.validateAndNormalizeAuthPolicy;

var router = express.Router();
var users = [];
var otpChallenges = new Map();
var authSessionEvents = [];
var maxAuthSessionEvents = 500;
var abhaHealthCheckEvents = [];
var maxAbhaHealthCheckEvents = 200;
var abhaFallbackDecisionEvents = [];
var maxAbhaFallbackDecisionEvents = 200;
var roles = ["admin", "doctor", "nurse", "patient", "frontdesk", "operations"];
var workflowRoleMatrix = {
  "patient.profile.view": ["admin", "doctor", "nurse", "patient", "frontdesk"],
  "patient.profile.update": ["admin", "doctor", "nurse", "frontdesk"],
  "clinical.ehr.write": ["admin", "doctor", "nurse"],
  "clinical.prescription.write": ["admin", "doctor"],
  "clinical.lab.order": ["admin", "doctor", "nurse"],
  "appointment.manage": ["admin", "doctor", "nurse", "frontdesk", "operations"],
};

function hasRealConfigValue(value) {
  if (!value) {
    return false;
  }

  var normalized = String(value).trim();
  if (!normalized) {
    return false;
  }

  return !/^(your_|<set-|changeme|replace-me|example)/i.test(normalized);
}

function signToken(payload, sessionTtlMinutes) {
  var secret = process.env.JWT_SECRET || "dev-secret";
  var tokenOptions = {};

  if (Number.isFinite(sessionTtlMinutes) && sessionTtlMinutes > 0) {
    tokenOptions.expiresIn = String(Math.trunc(sessionTtlMinutes)) + "m";
  } else {
    tokenOptions.expiresIn = process.env.JWT_EXPIRATION || "1h";
  }

  return jwt.sign(payload, secret, tokenOptions);
}

function normalizeRoleKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function createOtpCode() {
  var value = Math.floor(100000 + Math.random() * 900000);
  return String(value);
}

function recordAuthSessionEvent(entry) {
  var event = {
    eventId: randomUUID(),
    eventType: entry.eventType || "auth.session.event",
    occurredAt: new Date().toISOString(),
    tenantKey: entry.tenantKey || "default",
    role: normalizeRoleKey(entry.role || ""),
    provider: entry.provider || null,
    action: entry.action || null,
    outcome: entry.outcome || "unknown",
    code: entry.code || null,
    details: entry.details || {},
  };

  authSessionEvents.push(event);
  if (authSessionEvents.length > maxAuthSessionEvents) {
    authSessionEvents.shift();
  }

  return event;
}

function recordAbhaHealthCheckEvent(entry) {
  var event = {
    checkId: randomUUID(),
    checkedAt: new Date().toISOString(),
    reachable: Boolean(entry && entry.reachable),
    statusCode: Number(entry && entry.statusCode) || 0,
    checkedUrl: (entry && entry.checkedUrl) || "",
    latencyMs: Number(entry && entry.latencyMs) || 0,
    timeoutMs: Number(entry && entry.timeoutMs) || 0,
    detail: (entry && entry.detail) || "ABHA gateway check completed",
    error: (entry && entry.error) || null,
  };

  abhaHealthCheckEvents.push(event);
  if (abhaHealthCheckEvents.length > maxAbhaHealthCheckEvents) {
    abhaHealthCheckEvents.shift();
  }

  return event;
}

function summarizeAbhaHealthCheckEvents(events) {
  var reachableCount = 0;
  var unreachableCount = 0;

  events.forEach(function (event) {
    if (event.reachable) {
      reachableCount += 1;
    } else {
      unreachableCount += 1;
    }
  });

  return {
    reachableCount: reachableCount,
    unreachableCount: unreachableCount,
    totalCount: events.length,
    lastCheckedAt: events.length > 0 ? events[0].checkedAt : null,
  };
}

function getAbhaConsentScenarioSteps(scenario) {
  if (scenario === "consent-denied") {
    return [
      {
        key: "fetch-consent-request",
        action: "Load pending consent request from ABHA gateway",
        expectedOutcome: "Consent request payload is available",
      },
      {
        key: "display-consent-screen",
        action: "Render consent scope and validity window to patient",
        expectedOutcome: "Patient sees clear data-sharing purpose and duration",
      },
      {
        key: "submit-denial",
        action: "Submit denied consent decision to ABHA gateway",
        expectedOutcome: "Gateway records explicit consent denial",
      },
      {
        key: "close-workflow",
        action: "Close clinical workflow with denial-safe fallback",
        expectedOutcome: "Journey remains in non-ABHA baseline path",
      },
    ];
  }

  if (scenario === "gateway-timeout") {
    return [
      {
        key: "fetch-consent-request",
        action: "Load pending consent request from ABHA gateway",
        expectedOutcome: "Consent request payload is available",
      },
      {
        key: "submit-consent",
        action: "Submit granted consent decision to ABHA gateway",
        expectedOutcome: "Gateway accepts consent payload",
      },
      {
        key: "await-ack",
        action: "Poll gateway acknowledgement for consent status",
        expectedOutcome: "Gateway acknowledgement arrives within timeout",
      },
      {
        key: "incident-evidence",
        action: "Record timeout evidence and raise incident drill artifact",
        expectedOutcome: "Ops evidence links are captured for retry and audit",
      },
    ];
  }

  return [
    {
      key: "fetch-consent-request",
      action: "Load pending consent request from ABHA gateway",
      expectedOutcome: "Consent request payload is available",
    },
    {
      key: "display-consent-screen",
      action: "Render consent scope and validity window to patient",
      expectedOutcome: "Patient sees clear data-sharing purpose and duration",
    },
    {
      key: "submit-consent",
      action: "Submit granted consent decision to ABHA gateway",
      expectedOutcome: "Gateway accepts consent payload",
    },
    {
      key: "record-audit-evidence",
      action: "Persist consent event and ABHA evidence references",
      expectedOutcome: "Audit trace includes consent token and health-check linkage",
    },
  ];
}

function buildAbhaConsentSimulationSteps(scenario, simulationStatus) {
  var steps = getAbhaConsentScenarioSteps(scenario);

  return steps.map(function (step, index) {
    var status = "pending";

    if (simulationStatus === "disabled") {
      status = "skipped";
    } else if (simulationStatus === "at-risk") {
      status = index === 0 ? "validated" : "blocked";
    } else if (scenario === "gateway-timeout" && step.key === "await-ack") {
      status = "timeout";
    } else if (scenario === "gateway-timeout" && step.key === "incident-evidence") {
      status = "required";
    } else if (scenario === "consent-denied" && step.key === "close-workflow") {
      status = "fallback-required";
    } else {
      status = "validated";
    }

    return {
      stepNumber: index + 1,
      key: step.key,
      action: step.action,
      expectedOutcome: step.expectedOutcome,
      status: status,
    };
  });
}

function buildAbhaFallbackDecision(scenario, enabled, configured, latestHealthEvent) {
  var decision = {
    decisionCode: "ABHA_USE_PRIMARY_PATH",
    shouldFallback: false,
    reason: "ABHA ready for primary path",
    action: {
      switchToBaseline: false,
      triggerIncident: false,
      retryAfterSeconds: 0,
    },
  };

  if (!enabled) {
    decision.decisionCode = "ABHA_DISABLED_USE_BASELINE";
    decision.shouldFallback = true;
    decision.reason = "ABHA feature is disabled";
    decision.action.switchToBaseline = true;
    return decision;
  }

  if (!configured) {
    decision.decisionCode = "ABHA_CONFIG_AT_RISK_USE_BASELINE";
    decision.shouldFallback = true;
    decision.reason = "ABHA is enabled but required config is incomplete";
    decision.action.switchToBaseline = true;
    decision.action.triggerIncident = true;
    decision.action.retryAfterSeconds = 300;
    return decision;
  }

  if (scenario === "consent-denied") {
    decision.decisionCode = "ABHA_CONSENT_DENIED_USE_BASELINE";
    decision.shouldFallback = true;
    decision.reason = "Patient denied ABHA consent";
    decision.action.switchToBaseline = true;
    return decision;
  }

  if (scenario === "gateway-timeout") {
    decision.decisionCode = "ABHA_GATEWAY_TIMEOUT_USE_BASELINE";
    decision.shouldFallback = true;
    decision.reason = "ABHA gateway timeout during workflow";
    decision.action.switchToBaseline = true;
    decision.action.triggerIncident = true;
    decision.action.retryAfterSeconds = 300;
    return decision;
  }

  if (scenario === "health-check-derived" && latestHealthEvent && !latestHealthEvent.reachable) {
    decision.decisionCode = "ABHA_HEALTH_UNREACHABLE_USE_BASELINE";
    decision.shouldFallback = true;
    decision.reason = "Latest ABHA health-check indicates gateway unreachable";
    decision.action.switchToBaseline = true;
    decision.action.triggerIncident = true;
    decision.action.retryAfterSeconds = 300;
    return decision;
  }

  return decision;
}

function recordAbhaFallbackDecisionEvent(entry) {
  var event = {
    eventId: randomUUID(),
    recordedAt: new Date().toISOString(),
    tenantKey: entry.tenantKey || "default",
    scenario: entry.scenario || "health-check-derived",
    decisionCode: entry.decisionCode || "ABHA_USE_PRIMARY_PATH",
    shouldFallback: Boolean(entry.shouldFallback),
    reason: entry.reason || "",
    action: entry.action || {
      switchToBaseline: false,
      triggerIncident: false,
      retryAfterSeconds: 0,
    },
    latestHealthCheck: entry.latestHealthCheck || null,
  };

  abhaFallbackDecisionEvents.push(event);
  if (abhaFallbackDecisionEvents.length > maxAbhaFallbackDecisionEvents) {
    abhaFallbackDecisionEvents.shift();
  }

  return event;
}

function summarizeAbhaFallbackDecisionEvents(events) {
  var fallbackCount = 0;
  var incidentCount = 0;

  events.forEach(function (event) {
    if (event.shouldFallback) {
      fallbackCount += 1;
    }

    if (event.action && event.action.triggerIncident) {
      incidentCount += 1;
    }
  });

  return {
    totalCount: events.length,
    fallbackCount: fallbackCount,
    incidentCount: incidentCount,
    lastRecordedAt: events.length > 0 ? events[events.length - 1].recordedAt : null,
  };
}

function getWorkflowAllowedRoles(workflowKey) {
  return workflowRoleMatrix[String(workflowKey || "").trim()] || null;
}

function getEffectiveAuthPolicy(tenantKey) {
  var persisted = getTenantSettings(tenantKey);
  if (!persisted || !persisted.settings) {
    return getDefaultAuthPolicy();
  }

  var validation = validateAndNormalizeAuthPolicy(persisted.settings.authPolicy);
  return validation.authPolicy;
}

function isProviderEnabledForTenant(tenantKey, providerKey) {
  var policy = getEffectiveAuthPolicy(tenantKey);
  return {
    enabled: policy.enabledProviders.indexOf(providerKey) !== -1,
    policy: policy,
  };
}

function resolveSessionTtlMinutes(policy, roleKey) {
  if (!policy || typeof policy !== "object") {
    return 60;
  }

  var normalizedRole = normalizeRoleKey(roleKey);
  var roleSpecificTtl =
    policy.roleSessionTtlMinutes && Number(policy.roleSessionTtlMinutes[normalizedRole]);

  if (Number.isFinite(roleSpecificTtl) && roleSpecificTtl >= 15 && roleSpecificTtl <= 1440) {
    return Math.trunc(roleSpecificTtl);
  }

  var globalTtl = Number(policy.sessionTtlMinutes);
  if (Number.isFinite(globalTtl) && globalTtl >= 15 && globalTtl <= 1440) {
    return Math.trunc(globalTtl);
  }

  return 60;
}

function evaluateAuthFlowAccess(tenantKey, providerKey, roleKey) {
  var providerCheck = isProviderEnabledForTenant(tenantKey, providerKey);
  if (!providerCheck.enabled) {
    return {
      allowed: false,
      code: "AUTH_POLICY_PROVIDER_BLOCKED",
      policy: providerCheck.policy,
      roleAllowedProviders: [],
    };
  }

  var normalizedRole = normalizeRoleKey(roleKey);
  var roleOverrides = providerCheck.policy.roleProviderOverrides || {};
  var roleAllowedProviders = roleOverrides[normalizedRole] || [];

  if (roleAllowedProviders.length > 0 && roleAllowedProviders.indexOf(providerKey) === -1) {
    return {
      allowed: false,
      code: "AUTH_POLICY_ROLE_PROVIDER_BLOCKED",
      policy: providerCheck.policy,
      roleAllowedProviders: roleAllowedProviders,
    };
  }

  return {
    allowed: true,
    code: "",
    policy: providerCheck.policy,
    roleAllowedProviders: roleAllowedProviders,
  };
}

function requiresMfaForRole(policy, roleKey) {
  if (!policy || typeof policy !== "object") {
    return false;
  }

  if (policy.mfaRequired === true) {
    return true;
  }

  var normalizedRole = normalizeRoleKey(roleKey);
  var mfaRoles = Array.isArray(policy.mfaRequiredRoles) ? policy.mfaRequiredRoles : [];
  return mfaRoles.indexOf(normalizedRole) !== -1;
}

function verifyOtpVerifiedToken(token, tenantKey, roleKey) {
  if (!token) {
    return false;
  }

  try {
    var secret = process.env.JWT_SECRET || "dev-secret";
    var decoded = jwt.verify(token, secret);
    return (
      decoded &&
      decoded.type === "otp-verified" &&
      decoded.tenantKey === tenantKey &&
      normalizeRoleKey(decoded.role) === normalizeRoleKey(roleKey)
    );
  } catch (_error) {
    return false;
  }
}

function issueOtpVerifiedToken(tenantKey, roleKey) {
  return signToken(
    {
      type: "otp-verified",
      tenantKey: tenantKey,
      role: normalizeRoleKey(roleKey),
      provider: "otp",
    },
    10
  );
}

function sendAuthPolicyBlocked(res, payload) {
  var event = recordAuthSessionEvent({
    eventType: "auth.policy.denied",
    tenantKey: payload.tenantKey,
    role: payload.role,
    provider: payload.provider,
    action: payload.action,
    outcome: "denied",
    code: payload.code || "AUTH_POLICY_PROVIDER_BLOCKED",
    details: {
      enabledProviders: payload.enabledProviders || [],
      roleAllowedProviders: payload.roleAllowedProviders || [],
    },
  });

  res.status(403).json({
    message: "Auth flow blocked by tenant policy",
    code: payload.code || "AUTH_POLICY_PROVIDER_BLOCKED",
    details: {
      tenantKey: payload.tenantKey,
      provider: payload.provider,
      action: payload.action,
      role: payload.role || null,
      enabledProviders: payload.enabledProviders || [],
      roleAllowedProviders: payload.roleAllowedProviders || [],
    },
    audit: {
      eventType: "auth.policy.denied",
      eventId: event.eventId,
      occurredAt: event.occurredAt,
    },
  });
}

router.get("/auth/roles", function (_req, res) {
  res.json({ roles: roles });
});

router.get("/auth/session/events", function (req, res) {
  var tenantKey = (req.query.tenantKey || "").trim();
  var role = normalizeRoleKey(req.query.role || "");
  var action = String(req.query.action || "").trim();
  var outcome = String(req.query.outcome || "").trim();
  var limit = Number(req.query.limit || 50);
  var boundedLimit = Number.isFinite(limit) ? Math.max(1, Math.min(limit, 200)) : 50;

  var filtered = authSessionEvents.filter(function (event) {
    if (tenantKey && event.tenantKey !== tenantKey) {
      return false;
    }

    if (role && event.role !== role) {
      return false;
    }

    if (action && event.action !== action) {
      return false;
    }

    if (outcome && event.outcome !== outcome) {
      return false;
    }

    return true;
  });

  var result = filtered.slice(Math.max(0, filtered.length - boundedLimit));

  res.json({
    events: result,
    total: filtered.length,
    returned: result.length,
    limit: boundedLimit,
  });
});

router.post("/auth/workflow-entry/check", function (req, res) {
  var payload = req.body || {};
  var tenantKey = payload.tenantKey || "default";
  var role = payload.role || "";
  var roleKey = normalizeRoleKey(role);
  var provider = payload.provider || "email-password";
  var workflowKey = String(payload.workflowKey || "").trim();

  if (!workflowKey || !role) {
    res.status(400).json({
      message: "workflowKey and role are required",
      code: "WORKFLOW_CHECK_PAYLOAD_INVALID",
    });
    return;
  }

  if (roles.indexOf(roleKey) === -1) {
    res.status(400).json({
      message: "Unsupported role",
      code: "WORKFLOW_CHECK_ROLE_INVALID",
    });
    return;
  }

  var allowedRoles = getWorkflowAllowedRoles(workflowKey);
  if (!allowedRoles) {
    res.status(400).json({
      message: "Unsupported workflowKey",
      code: "WORKFLOW_KEY_UNSUPPORTED",
      details: {
        workflowKey: workflowKey,
      },
    });
    return;
  }

  var policyAccess = evaluateAuthFlowAccess(tenantKey, provider, roleKey);
  if (!policyAccess.allowed) {
    sendAuthPolicyBlocked(res, {
      code: policyAccess.code,
      tenantKey: tenantKey,
      provider: provider,
      action: "auth.workflow.entry.check",
      role: roleKey,
      enabledProviders: policyAccess.policy.enabledProviders,
      roleAllowedProviders: policyAccess.roleAllowedProviders,
    });
    return;
  }

  if (allowedRoles.indexOf(roleKey) === -1) {
    var roleDeniedEvent = recordAuthSessionEvent({
      eventType: "auth.workflow.entry.denied",
      tenantKey: tenantKey,
      role: roleKey,
      provider: provider,
      action: "auth.workflow.entry.check",
      outcome: "denied",
      code: "AUTH_WORKFLOW_ROLE_BLOCKED",
      details: {
        workflowKey: workflowKey,
        allowedRoles: allowedRoles,
      },
    });

    res.status(403).json({
      allowed: false,
      code: "AUTH_WORKFLOW_ROLE_BLOCKED",
      message: "Role is not allowed for workflow",
      details: {
        workflowKey: workflowKey,
        role: roleKey,
        allowedRoles: allowedRoles,
      },
      audit: {
        eventType: roleDeniedEvent.eventType,
        eventId: roleDeniedEvent.eventId,
        occurredAt: roleDeniedEvent.occurredAt,
      },
    });
    return;
  }

  if (requiresMfaForRole(policyAccess.policy, roleKey)) {
    var otpVerifiedToken = payload.otpVerifiedToken;
    if (!verifyOtpVerifiedToken(otpVerifiedToken, tenantKey, roleKey)) {
      var mfaEvent = recordAuthSessionEvent({
        eventType: "auth.workflow.entry.mfa-required",
        tenantKey: tenantKey,
        role: roleKey,
        provider: provider,
        action: "auth.workflow.entry.check",
        outcome: "denied",
        code: "MFA_REQUIRED",
        details: {
          workflowKey: workflowKey,
          requiredProvider: "otp",
        },
      });

      res.status(401).json({
        allowed: false,
        message: "MFA required for this tenant policy",
        code: "MFA_REQUIRED",
        details: {
          tenantKey: tenantKey,
          role: roleKey,
          workflowKey: workflowKey,
          requiredProvider: "otp",
          hint: "Complete /auth/otp/request and /auth/otp/verify before workflow entry",
        },
        audit: {
          eventType: mfaEvent.eventType,
          eventId: mfaEvent.eventId,
          occurredAt: mfaEvent.occurredAt,
        },
      });
      return;
    }
  }

  var ttl = resolveSessionTtlMinutes(policyAccess.policy, roleKey);
  var allowedEvent = recordAuthSessionEvent({
    eventType: "auth.workflow.entry.allowed",
    tenantKey: tenantKey,
    role: roleKey,
    provider: provider,
    action: "auth.workflow.entry.check",
    outcome: "allowed",
    details: {
      workflowKey: workflowKey,
      sessionTtlMinutes: ttl,
    },
  });

  res.json({
    allowed: true,
    tenantKey: tenantKey,
    role: roleKey,
    provider: provider,
    workflowKey: workflowKey,
    session: {
      expiresInMinutes: ttl,
    },
    audit: {
      eventType: allowedEvent.eventType,
      eventId: allowedEvent.eventId,
      occurredAt: allowedEvent.occurredAt,
    },
  });
});

router.post("/auth/otp/request", function (req, res) {
  var payload = req.body || {};
  var tenantKey = payload.tenantKey || "default";
  var roleKey = normalizeRoleKey(payload.role || "patient");

  if (roles.indexOf(roleKey) === -1) {
    res.status(400).json({ message: "Unsupported role" });
    return;
  }

  var policyAccess = evaluateAuthFlowAccess(tenantKey, "otp", roleKey);
  if (!policyAccess.allowed) {
    sendAuthPolicyBlocked(res, {
      code: policyAccess.code,
      tenantKey: tenantKey,
      provider: "otp",
      action: "auth.otp.request",
      role: roleKey,
      enabledProviders: policyAccess.policy.enabledProviders,
      roleAllowedProviders: policyAccess.roleAllowedProviders,
    });
    return;
  }

  var challengeId = randomUUID();
  var otpCode = createOtpCode();
  var expiresInSeconds = 300;
  var expiresAt = Date.now() + expiresInSeconds * 1000;

  otpChallenges.set(challengeId, {
    challengeId: challengeId,
    code: otpCode,
    tenantKey: tenantKey,
    role: roleKey,
    expiresAt: expiresAt,
  });

  res.json({
    challengeId: challengeId,
    tenantKey: tenantKey,
    role: roleKey,
    deliveryChannel: policyAccess.policy.otpChannel,
    expiresInSeconds: expiresInSeconds,
    detail: "OTP challenge generated",
    demoCode: process.env.NODE_ENV === "production" ? undefined : otpCode,
  });

  recordAuthSessionEvent({
    eventType: "auth.otp.requested",
    tenantKey: tenantKey,
    role: roleKey,
    provider: "otp",
    action: "auth.otp.request",
    outcome: "requested",
    details: {
      challengeId: challengeId,
      expiresInSeconds: expiresInSeconds,
    },
  });
});

router.post("/auth/otp/verify", function (req, res) {
  var payload = req.body || {};
  var challengeId = payload.challengeId || "";
  var submittedCode = String(payload.code || "").trim();

  if (!challengeId || !submittedCode) {
    res.status(400).json({ message: "challengeId and code are required" });
    return;
  }

  var challenge = otpChallenges.get(challengeId);
  if (!challenge) {
    res.status(400).json({
      verified: false,
      code: "OTP_CHALLENGE_NOT_FOUND",
      message: "OTP challenge not found",
    });
    return;
  }

  if (Date.now() > challenge.expiresAt) {
    otpChallenges.delete(challengeId);
    res.status(400).json({
      verified: false,
      code: "OTP_CHALLENGE_EXPIRED",
      message: "OTP challenge expired",
    });
    return;
  }

  if (challenge.code !== submittedCode) {
    res.status(400).json({
      verified: false,
      code: "OTP_CODE_INVALID",
      message: "Invalid OTP code",
    });
    return;
  }

  otpChallenges.delete(challengeId);

  res.json({
    verified: true,
    tenantKey: challenge.tenantKey,
    role: challenge.role,
    otpVerifiedToken: issueOtpVerifiedToken(challenge.tenantKey, challenge.role),
    expiresInMinutes: 10,
  });

  recordAuthSessionEvent({
    eventType: "auth.otp.verified",
    tenantKey: challenge.tenantKey,
    role: challenge.role,
    provider: "otp",
    action: "auth.otp.verify",
    outcome: "verified",
    details: {
      challengeId: challenge.challengeId,
    },
  });
});

router.post("/auth/register", function (req, res) {
  var payload = req.body || {};
  if (!payload.email || !payload.password || !payload.role) {
    res.status(400).json({ message: "email, password, and role are required" });
    return;
  }

  if (roles.indexOf(payload.role) === -1) {
    res.status(400).json({ message: "Unsupported role" });
    return;
  }

  var user = {
    id: randomUUID(),
    email: payload.email,
    role: payload.role,
    tenantKey: payload.tenantKey || "default",
  };

  users.push(user);
  res.status(201).json({ userId: user.id, message: "User registered" });
});

router.post("/auth/login", function (req, res) {
  var payload = req.body || {};
  var tenantKey = payload.tenantKey || "default";
  var roleKey = normalizeRoleKey(payload.role);

  if (!payload.email || !payload.password || !payload.role) {
    res.status(400).json({ message: "email, password, and role are required" });
    return;
  }

  if (roles.indexOf(payload.role) === -1) {
    res.status(400).json({ message: "Unsupported role" });
    return;
  }

  var policyAccess = evaluateAuthFlowAccess(tenantKey, "email-password", roleKey);
  if (!policyAccess.allowed) {
    sendAuthPolicyBlocked(res, {
      code: policyAccess.code,
      tenantKey: tenantKey,
      provider: "email-password",
      action: "auth.login",
      role: payload.role,
      enabledProviders: policyAccess.policy.enabledProviders,
      roleAllowedProviders: policyAccess.roleAllowedProviders,
    });
    return;
  }

  var sessionTtlMinutes = resolveSessionTtlMinutes(policyAccess.policy, roleKey);

  if (requiresMfaForRole(policyAccess.policy, roleKey)) {
    var otpVerifiedToken = payload.otpVerifiedToken;
    if (!verifyOtpVerifiedToken(otpVerifiedToken, tenantKey, roleKey)) {
      recordAuthSessionEvent({
        eventType: "auth.login.mfa-required",
        tenantKey: tenantKey,
        role: roleKey,
        provider: "email-password",
        action: "auth.login",
        outcome: "denied",
        code: "MFA_REQUIRED",
      });

      res.status(401).json({
        message: "MFA required for this tenant policy",
        code: "MFA_REQUIRED",
        details: {
          tenantKey: tenantKey,
          role: roleKey,
          requiredProvider: "otp",
          hint: "Complete /auth/otp/request and /auth/otp/verify before login",
        },
      });
      return;
    }
  }

  var token = signToken(
    {
      sub: payload.email,
      role: payload.role,
      tenantKey: tenantKey,
      provider: "email-password",
      sessionTtlMinutes: sessionTtlMinutes,
    },
    sessionTtlMinutes
  );

  res.json({
    token: token,
    role: payload.role,
    tenantKey: tenantKey,
    provider: "email-password",
    session: {
      expiresInMinutes: sessionTtlMinutes,
    },
  });

  recordAuthSessionEvent({
    eventType: "auth.login.success",
    tenantKey: tenantKey,
    role: roleKey,
    provider: "email-password",
    action: "auth.login",
    outcome: "allowed",
    details: {
      sessionTtlMinutes: sessionTtlMinutes,
    },
  });
});

router.get("/auth/oauth/providers", function (_req, res) {
  var tenantKey = (_req.query && _req.query.tenantKey) || "default";
  var policy = getEffectiveAuthPolicy(tenantKey);

  res.json({
    providers: [
      {
        key: "google-oauth",
        envEnabled: Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID),
        policyEnabled: policy.enabledProviders.indexOf("google-oauth") !== -1,
        enabled:
          Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID) &&
          policy.enabledProviders.indexOf("google-oauth") !== -1,
        mode: "free",
      },
      {
        key: "clerk",
        envEnabled: Boolean(process.env.CLERK_PUBLISHABLE_KEY),
        policyEnabled: policy.enabledProviders.indexOf("clerk") !== -1,
        enabled:
          Boolean(process.env.CLERK_PUBLISHABLE_KEY) &&
          policy.enabledProviders.indexOf("clerk") !== -1,
        mode: "paid-optional",
      },
    ],
    tenantKey: tenantKey,
    authPolicy: policy,
  });
});

router.get("/auth/oauth/google/start", function (req, res) {
  var tenantKey = req.query.tenantKey || "default";
  var role = req.query.role || "patient";
  var roleKey = normalizeRoleKey(role);
  var policyAccess = evaluateAuthFlowAccess(tenantKey, "google-oauth", roleKey);
  if (!policyAccess.allowed) {
    sendAuthPolicyBlocked(res, {
      code: policyAccess.code,
      tenantKey: tenantKey,
      provider: "google-oauth",
      action: "auth.oauth.google.start",
      role: role,
      enabledProviders: policyAccess.policy.enabledProviders,
      roleAllowedProviders: policyAccess.roleAllowedProviders,
    });
    return;
  }

  var redirectUri =
    process.env.GOOGLE_OAUTH_REDIRECT_URI ||
    "http://localhost:8081/api/v1/auth/oauth/google/callback";
  var clientId = process.env.GOOGLE_OAUTH_CLIENT_ID || "<set-google-client-id>";

  var oauthUrl =
    "https://accounts.google.com/o/oauth2/v2/auth" +
    "?client_id=" +
    encodeURIComponent(clientId) +
    "&redirect_uri=" +
    encodeURIComponent(redirectUri) +
    "&response_type=code" +
    "&scope=openid%20email%20profile" +
    "&state=" +
    encodeURIComponent(tenantKey + "|" + role);

  res.json({
    provider: "google-oauth",
    oauthUrl: oauthUrl,
    note: "Admin must configure Google OAuth client in console.",
  });
});

router.post("/auth/oauth/google/callback", function (req, res) {
  var payload = req.body || {};
  var tenantKey = payload.tenantKey || "default";
  var role = payload.role || "patient";
  var roleKey = normalizeRoleKey(role);
  var policyAccess = evaluateAuthFlowAccess(tenantKey, "google-oauth", roleKey);
  if (!policyAccess.allowed) {
    sendAuthPolicyBlocked(res, {
      code: policyAccess.code,
      tenantKey: tenantKey,
      provider: "google-oauth",
      action: "auth.oauth.google.callback",
      role: role,
      enabledProviders: policyAccess.policy.enabledProviders,
      roleAllowedProviders: policyAccess.roleAllowedProviders,
    });
    return;
  }

  var sessionTtlMinutes = resolveSessionTtlMinutes(policyAccess.policy, roleKey);

  var token = signToken(
    {
      sub: payload.email || "google-user@example.com",
      role: role,
      tenantKey: tenantKey,
      provider: "google-oauth",
      sessionTtlMinutes: sessionTtlMinutes,
    },
    sessionTtlMinutes
  );

  res.json({
    token: token,
    provider: "google-oauth",
    role: role,
    tenantKey: tenantKey,
    session: {
      expiresInMinutes: sessionTtlMinutes,
    },
  });

  recordAuthSessionEvent({
    eventType: "auth.oauth.google.success",
    tenantKey: tenantKey,
    role: roleKey,
    provider: "google-oauth",
    action: "auth.oauth.google.callback",
    outcome: "allowed",
    details: {
      sessionTtlMinutes: sessionTtlMinutes,
    },
  });
});

router.get("/auth/oauth/clerk/start", function (req, res) {
  var tenantKey = req.query.tenantKey || "default";
  var role = req.query.role || "patient";
  var roleKey = normalizeRoleKey(role);
  var policyAccess = evaluateAuthFlowAccess(tenantKey, "clerk", roleKey);
  if (!policyAccess.allowed) {
    sendAuthPolicyBlocked(res, {
      code: policyAccess.code,
      tenantKey: tenantKey,
      provider: "clerk",
      action: "auth.oauth.clerk.start",
      role: role,
      enabledProviders: policyAccess.policy.enabledProviders,
      roleAllowedProviders: policyAccess.roleAllowedProviders,
    });
    return;
  }

  res.json({
    provider: "clerk",
    tenantKey: tenantKey,
    note: "Configure Clerk frontend SDK with tenant context and callback URL.",
    publishableKeyConfigured: Boolean(process.env.CLERK_PUBLISHABLE_KEY),
  });
});

router.get("/auth/oauth/google/config-status", function (_req, res) {
  var hasClientId = hasRealConfigValue(process.env.GOOGLE_OAUTH_CLIENT_ID);
  var hasClientSecret = hasRealConfigValue(process.env.GOOGLE_OAUTH_CLIENT_SECRET);

  res.json({
    provider: "google-oauth",
    configured: hasClientId && hasClientSecret,
    redirectUri: process.env.GOOGLE_OAUTH_REDIRECT_URI || "",
    hasClientId: hasClientId,
    hasClientSecret: hasClientSecret,
  });
});

router.get("/platform/abha/config-status", function (_req, res) {
  var hasClientId = hasRealConfigValue(process.env.ABHA_CLIENT_ID);
  var hasClientSecret = hasRealConfigValue(process.env.ABHA_CLIENT_SECRET);
  var hasGatewayBaseUrl = hasRealConfigValue(process.env.ABHA_GATEWAY_BASE_URL);

  res.json({
    enabled: process.env.ABHA_ENABLED === "true",
    configured: hasClientId && hasClientSecret && hasGatewayBaseUrl,
    hasClientId: hasClientId,
    hasClientSecret: hasClientSecret,
    hasGatewayBaseUrl: hasGatewayBaseUrl,
    gatewayBaseUrl: process.env.ABHA_GATEWAY_BASE_URL || "",
    mode: process.env.ABHA_ENVIRONMENT || "sandbox",
  });
});

router.get("/platform/abha/health-check", async function (req, res) {
  var baseUrl = (process.env.ABHA_GATEWAY_BASE_URL || "").trim();
  var timeoutMs = Number(req.query.timeoutMs || 4000);
  var boundedTimeout = Number.isFinite(timeoutMs)
    ? Math.max(1000, Math.min(timeoutMs, 10000))
    : 4000;

  if (!hasRealConfigValue(baseUrl)) {
    var missingConfigResult = recordAbhaHealthCheckEvent({
      reachable: false,
      checkedUrl: baseUrl,
      timeoutMs: boundedTimeout,
      detail: "ABHA_GATEWAY_BASE_URL is not configured with a real gateway URL",
      error: "ABHA_GATEWAY_BASE_URL_INVALID",
    });

    res.status(400).json({
      checkId: missingConfigResult.checkId,
      reachable: false,
      detail: "ABHA_GATEWAY_BASE_URL is not configured with a real gateway URL",
      checkedUrl: baseUrl,
      timeoutMs: boundedTimeout,
    });
    return;
  }

  var checkUrl = "";
  try {
    checkUrl = new URL("/", baseUrl).toString();
  } catch (_error) {
    var invalidUrlResult = recordAbhaHealthCheckEvent({
      reachable: false,
      checkedUrl: baseUrl,
      timeoutMs: boundedTimeout,
      detail: "ABHA gateway URL is invalid",
      error: "ABHA_GATEWAY_URL_INVALID",
    });

    res.status(400).json({
      checkId: invalidUrlResult.checkId,
      reachable: false,
      detail: "ABHA gateway URL is invalid",
      checkedUrl: baseUrl,
      timeoutMs: boundedTimeout,
    });
    return;
  }

  var startedAt = Date.now();
  var controller = new AbortController();
  var timer = setTimeout(function () {
    controller.abort();
  }, boundedTimeout);

  try {
    var response = await fetch(checkUrl, {
      method: "GET",
      headers: {
        Accept: "application/json,text/plain,*/*",
      },
      signal: controller.signal,
    });
    clearTimeout(timer);

    var successResult = recordAbhaHealthCheckEvent({
      reachable: response.ok,
      statusCode: response.status,
      checkedUrl: checkUrl,
      latencyMs: Date.now() - startedAt,
      timeoutMs: boundedTimeout,
      detail: response.ok
        ? "ABHA gateway responded successfully"
        : "ABHA gateway responded with non-2xx status",
      error: null,
    });

    res.json({
      checkId: successResult.checkId,
      reachable: response.ok,
      statusCode: response.status,
      checkedUrl: checkUrl,
      latencyMs: successResult.latencyMs,
      timeoutMs: boundedTimeout,
      detail: response.ok
        ? "ABHA gateway responded successfully"
        : "ABHA gateway responded with non-2xx status",
    });
  } catch (error) {
    clearTimeout(timer);

    var failedResult = recordAbhaHealthCheckEvent({
      reachable: false,
      statusCode: 0,
      checkedUrl: checkUrl,
      latencyMs: Date.now() - startedAt,
      timeoutMs: boundedTimeout,
      detail: "ABHA gateway check failed",
      error: error && error.message ? error.message : "Unknown ABHA health-check error",
    });

    res.status(502).json({
      checkId: failedResult.checkId,
      reachable: false,
      statusCode: 0,
      checkedUrl: checkUrl,
      latencyMs: failedResult.latencyMs,
      timeoutMs: boundedTimeout,
      detail: "ABHA gateway check failed",
      error: error && error.message ? error.message : "Unknown ABHA health-check error",
    });
  }
});

router.get("/platform/abha/health-check/evidence", function (req, res) {
  var limit = Number(req.query.limit || 20);
  var boundedLimit = Number.isFinite(limit) ? Math.max(1, Math.min(limit, 100)) : 20;
  var outcome = String(req.query.outcome || "all")
    .trim()
    .toLowerCase();

  var filtered = abhaHealthCheckEvents.filter(function (event) {
    if (outcome === "reachable") {
      return event.reachable;
    }

    if (outcome === "unreachable") {
      return !event.reachable;
    }

    return true;
  });

  var items = filtered.slice(-boundedLimit).reverse();

  res.json({
    totalRecorded: abhaHealthCheckEvents.length,
    returned: items.length,
    outcomeFilter: outcome,
    summary: summarizeAbhaHealthCheckEvents(filtered),
    events: items,
    automation: {
      captureHint: "Export this payload into ABHA incident drill evidence artifacts",
      relatedEndpoints: {
        healthCheck: "GET /api/v1/platform/abha/health-check",
        operationalReadiness: "GET /api/v1/platform/abha/operational-readiness",
      },
    },
  });
});

router.get("/platform/abha/consent-flow/simulation", function (req, res) {
  var tenantKey = String(req.query.tenantKey || "default").trim() || "default";
  var scenario = String(req.query.scenario || "happy-path")
    .trim()
    .toLowerCase();
  if (["happy-path", "consent-denied", "gateway-timeout"].indexOf(scenario) < 0) {
    scenario = "happy-path";
  }

  var enabled = process.env.ABHA_ENABLED === "true";
  var configured =
    hasRealConfigValue(process.env.ABHA_CLIENT_ID) &&
    hasRealConfigValue(process.env.ABHA_CLIENT_SECRET) &&
    hasRealConfigValue(process.env.ABHA_GATEWAY_BASE_URL);

  var simulationStatus = "disabled";
  if (enabled && configured) {
    simulationStatus = "ready";
  } else if (enabled && !configured) {
    simulationStatus = "at-risk";
  }

  res.json({
    tenantKey: tenantKey,
    mode: process.env.ABHA_ENVIRONMENT || "sandbox",
    scenario: scenario,
    enabled: enabled,
    configured: configured,
    simulationStatus: simulationStatus,
    steps: buildAbhaConsentSimulationSteps(scenario, simulationStatus),
    evidence: {
      healthCheckEndpoint: "GET /api/v1/platform/abha/health-check",
      healthCheckEvidenceEndpoint: "GET /api/v1/platform/abha/health-check/evidence",
      operationalReadinessEndpoint: "GET /api/v1/platform/abha/operational-readiness",
      runbook: "docs/runbooks/abha-operational-readiness.md",
    },
    automation: {
      recommendation:
        "Capture simulation payload and latest health-check evidence as incident drill attachment",
    },
  });
});

router.get("/platform/abha/fallback-decision/telemetry", function (req, res) {
  var tenantKey = String(req.query.tenantKey || "default").trim() || "default";
  var scenario = String(req.query.scenario || "health-check-derived")
    .trim()
    .toLowerCase();
  if (["health-check-derived", "gateway-timeout", "consent-denied", "happy-path"].indexOf(scenario) < 0) {
    scenario = "health-check-derived";
  }

  var enabled = process.env.ABHA_ENABLED === "true";
  var configured =
    hasRealConfigValue(process.env.ABHA_CLIENT_ID) &&
    hasRealConfigValue(process.env.ABHA_CLIENT_SECRET) &&
    hasRealConfigValue(process.env.ABHA_GATEWAY_BASE_URL);
  var latestHealthEvent =
    abhaHealthCheckEvents.length > 0 ? abhaHealthCheckEvents[abhaHealthCheckEvents.length - 1] : null;
  var decision = buildAbhaFallbackDecision(scenario, enabled, configured, latestHealthEvent);
  var recorded = recordAbhaFallbackDecisionEvent({
    tenantKey: tenantKey,
    scenario: scenario,
    decisionCode: decision.decisionCode,
    shouldFallback: decision.shouldFallback,
    reason: decision.reason,
    action: decision.action,
    latestHealthCheck: latestHealthEvent
      ? {
          checkId: latestHealthEvent.checkId,
          checkedAt: latestHealthEvent.checkedAt,
          reachable: latestHealthEvent.reachable,
          statusCode: latestHealthEvent.statusCode,
        }
      : null,
  });

  var limit = Number(req.query.limit || 20);
  var boundedLimit = Number.isFinite(limit) ? Math.max(1, Math.min(limit, 100)) : 20;
  var items = abhaFallbackDecisionEvents
    .filter(function (event) {
      return event.tenantKey === tenantKey;
    })
    .slice(-boundedLimit)
    .reverse();

  res.json({
    tenantKey: tenantKey,
    mode: process.env.ABHA_ENVIRONMENT || "sandbox",
    scenario: scenario,
    enabled: enabled,
    configured: configured,
    latestDecision: recorded,
    summary: summarizeAbhaFallbackDecisionEvents(items),
    events: items,
    diagnostics: {
      consentSimulationEndpoint: "GET /api/v1/platform/abha/consent-flow/simulation",
      healthCheckEndpoint: "GET /api/v1/platform/abha/health-check",
      healthCheckEvidenceEndpoint: "GET /api/v1/platform/abha/health-check/evidence",
    },
  });
});

router.get("/platform/abha/operational-readiness", function (_req, res) {
  var enabled = process.env.ABHA_ENABLED === "true";
  var hasClientId = hasRealConfigValue(process.env.ABHA_CLIENT_ID);
  var hasClientSecret = hasRealConfigValue(process.env.ABHA_CLIENT_SECRET);
  var hasGatewayBaseUrl = hasRealConfigValue(process.env.ABHA_GATEWAY_BASE_URL);
  var configured = hasClientId && hasClientSecret && hasGatewayBaseUrl;

  var readinessStatus = "disabled";
  if (enabled && configured) {
    readinessStatus = "healthy";
  } else if (enabled && !configured) {
    readinessStatus = "at-risk";
  }

  res.json({
    enabled: enabled,
    configured: configured,
    readinessStatus: readinessStatus,
    mode: process.env.ABHA_ENVIRONMENT || "sandbox",
    checks: {
      hasClientId: hasClientId,
      hasClientSecret: hasClientSecret,
      hasGatewayBaseUrl: hasGatewayBaseUrl,
      gatewayBaseUrl: process.env.ABHA_GATEWAY_BASE_URL || "",
    },
    diagnostics: {
      configStatusEndpoint: "GET /api/v1/platform/abha/config-status",
      gatewayHealthEndpoint: "GET /api/v1/platform/abha/health-check",
      healthCheckEvidenceEndpoint: "GET /api/v1/platform/abha/health-check/evidence",
      consentFlowSimulationEndpoint: "GET /api/v1/platform/abha/consent-flow/simulation",
      fallbackDecisionTelemetryEndpoint: "GET /api/v1/platform/abha/fallback-decision/telemetry",
      healthCheckTimeoutMsDefault: 4000,
    },
    runbook: {
      document: "docs/runbooks/abha-operational-readiness.md",
      setupChecklist: [
        "Enable ABHA integration for tenant and set ABHA_ENABLED=true",
        "Provision ABHA client credentials in secret manager",
        "Set ABHA_GATEWAY_BASE_URL to reachable sandbox or production host",
        "Validate config-status and health-check before enabling live workflows",
      ],
      rollbackChecklist: [
        "Disable ABHA feature flag for affected tenant",
        "Switch to baseline compliance workflow for impacted journeys",
        "Re-run ABHA config and gateway diagnostics after remediation",
      ],
    },
  });
});

router.get("/admin/settings/storage", function (_req, res) {
  res.json(getStorageMetadata());
});

router.get("/admin/settings", function (req, res) {
  var tenantKey = (req.query.tenantKey || "default").trim() || "default";
  var persisted = getTenantSettings(tenantKey);

  if (!persisted) {
    res.json({
      tenantKey: tenantKey,
      settings: {
        routing: {
          tenantKey: tenantKey,
          authBaseUrl: process.env.AUTH_SERVICE_BASE_URL || "http://localhost:5101",
          notificationBaseUrl: process.env.NOTIFICATION_SERVICE_BASE_URL || "http://localhost:5102",
          appointmentBaseUrl: process.env.APPOINTMENT_SERVICE_BASE_URL || "http://localhost:5103",
        },
        ui: {
          lastTab: "overview",
        },
        authPolicy: getDefaultAuthPolicy(),
      },
      storage: getStorageMetadata(),
    });
    return;
  }

  var normalizedPolicy = validateAndNormalizeAuthPolicy(
    persisted.settings ? persisted.settings.authPolicy : null
  );

  var nextSettings = {
    routing:
      persisted.settings && persisted.settings.routing
        ? persisted.settings.routing
        : {
            tenantKey: tenantKey,
            authBaseUrl: process.env.AUTH_SERVICE_BASE_URL || "http://localhost:5101",
            notificationBaseUrl:
              process.env.NOTIFICATION_SERVICE_BASE_URL || "http://localhost:5102",
            appointmentBaseUrl: process.env.APPOINTMENT_SERVICE_BASE_URL || "http://localhost:5103",
          },
    ui:
      persisted.settings && persisted.settings.ui
        ? persisted.settings.ui
        : {
            lastTab: "overview",
          },
    authPolicy: normalizedPolicy.authPolicy,
  };

  res.json({
    tenantKey: tenantKey,
    settings: nextSettings,
    updatedAt: persisted.updatedAt,
    storage: getStorageMetadata(),
  });
});

router.put("/admin/settings", function (req, res) {
  var payload = req.body || {};
  var tenantKey = (payload.tenantKey || "default").trim() || "default";

  if (!payload.settings || typeof payload.settings !== "object") {
    res.status(400).json({ message: "settings object is required" });
    return;
  }

  var routing = payload.settings.routing || {};
  var authPolicyValidation = validateAndNormalizeAuthPolicy(payload.settings.authPolicy);
  if (!authPolicyValidation.valid) {
    res.status(400).json({
      message: "Invalid auth policy settings",
      errors: authPolicyValidation.errors,
      authPolicy: authPolicyValidation.authPolicy,
    });
    return;
  }

  var nextSettings = {
    routing: {
      tenantKey: tenantKey,
      authBaseUrl: routing.authBaseUrl || "http://localhost:5101",
      notificationBaseUrl: routing.notificationBaseUrl || "http://localhost:5102",
      appointmentBaseUrl: routing.appointmentBaseUrl || "http://localhost:5103",
    },
    ui: {
      lastTab:
        payload.settings.ui && payload.settings.ui.lastTab
          ? String(payload.settings.ui.lastTab)
          : "overview",
    },
    authPolicy: authPolicyValidation.authPolicy,
  };

  var saved = setTenantSettings(tenantKey, nextSettings);
  res.json({
    tenantKey: saved.tenantKey,
    settings: saved.settings,
    updatedAt: saved.updatedAt,
    storage: getStorageMetadata(),
  });
});

router.post("/admin/settings/auth-policy/validate", function (req, res) {
  var payload = req.body || {};
  var tenantKey = (payload.tenantKey || "default").trim() || "default";
  var validation = validateAndNormalizeAuthPolicy(payload.authPolicy);

  if (!validation.valid) {
    res.status(400).json({
      valid: false,
      tenantKey: tenantKey,
      authPolicy: validation.authPolicy,
      errors: validation.errors,
    });
    return;
  }

  res.json({
    valid: true,
    tenantKey: tenantKey,
    authPolicy: validation.authPolicy,
    errors: [],
  });
});

router.get("/platform/domain-config", function (req, res) {
  var tenantKey = req.query.tenantKey || "default";
  res.json(resolveTenantDomain(tenantKey));
});

router.post("/platform/domain-config/validate", function (req, res) {
  var payload = req.body || {};
  if (!payload.tenantKey || !payload.origin) {
    res.status(400).json({ message: "tenantKey and origin are required" });
    return;
  }

  res.json({
    allowed: isOriginAllowed(payload.tenantKey, payload.origin),
    tenantKey: payload.tenantKey,
    origin: payload.origin,
  });
});

router.get("/platform/domain-config/all", function (_req, res) {
  res.json(loadDomainConfig());
});

module.exports = router;
