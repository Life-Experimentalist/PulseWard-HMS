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
var roles = ["admin", "doctor", "nurse", "patient", "frontdesk", "operations"];

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

function signToken(payload) {
  var secret = process.env.JWT_SECRET || "dev-secret";
  return jwt.sign(payload, secret, {
    expiresIn: process.env.JWT_EXPIRATION || "1h",
  });
}

router.get("/auth/roles", function (_req, res) {
  res.json({ roles: roles });
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
  if (!payload.email || !payload.password || !payload.role) {
    res.status(400).json({ message: "email, password, and role are required" });
    return;
  }

  if (roles.indexOf(payload.role) === -1) {
    res.status(400).json({ message: "Unsupported role" });
    return;
  }

  var token = signToken({
    sub: payload.email,
    role: payload.role,
    tenantKey: payload.tenantKey || "default",
  });

  res.json({
    token: token,
    role: payload.role,
    tenantKey: payload.tenantKey || "default",
  });
});

router.get("/auth/oauth/providers", function (_req, res) {
  res.json({
    providers: [
      {
        key: "google-oauth",
        enabled: Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID),
        mode: "free",
      },
      {
        key: "clerk",
        enabled: Boolean(process.env.CLERK_PUBLISHABLE_KEY),
        mode: "paid-optional",
      },
    ],
  });
});

router.get("/auth/oauth/google/start", function (req, res) {
  var tenantKey = req.query.tenantKey || "default";
  var role = req.query.role || "patient";
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

  var token = signToken({
    sub: payload.email || "google-user@example.com",
    role: role,
    tenantKey: tenantKey,
    provider: "google-oauth",
  });

  res.json({
    token: token,
    provider: "google-oauth",
    role: role,
    tenantKey: tenantKey,
  });
});

router.get("/auth/oauth/clerk/start", function (req, res) {
  var tenantKey = req.query.tenantKey || "default";
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
    res.status(400).json({
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
    res.status(400).json({
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

    res.json({
      reachable: response.ok,
      statusCode: response.status,
      checkedUrl: checkUrl,
      latencyMs: Date.now() - startedAt,
      timeoutMs: boundedTimeout,
      detail: response.ok
        ? "ABHA gateway responded successfully"
        : "ABHA gateway responded with non-2xx status",
    });
  } catch (error) {
    clearTimeout(timer);
    res.status(502).json({
      reachable: false,
      statusCode: 0,
      checkedUrl: checkUrl,
      latencyMs: Date.now() - startedAt,
      timeoutMs: boundedTimeout,
      detail: "ABHA gateway check failed",
      error: error && error.message ? error.message : "Unknown ABHA health-check error",
    });
  }
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
    routing: persisted.settings && persisted.settings.routing ? persisted.settings.routing : {
      tenantKey: tenantKey,
      authBaseUrl: process.env.AUTH_SERVICE_BASE_URL || "http://localhost:5101",
      notificationBaseUrl: process.env.NOTIFICATION_SERVICE_BASE_URL || "http://localhost:5102",
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
