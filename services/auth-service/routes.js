var express = require("express");
var jwt = require("jsonwebtoken");
var randomUUID = require("crypto").randomUUID;
var domainConfigUtils = require("../../packages/shared-utils/load-domain-config");
var loadDomainConfig = domainConfigUtils.loadDomainConfig;
var resolveTenantDomain = domainConfigUtils.resolveTenantDomain;
var isOriginAllowed = domainConfigUtils.isOriginAllowed;

var router = express.Router();
var users = [];
var roles = ["admin", "doctor", "nurse", "patient", "frontdesk", "operations"];

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
