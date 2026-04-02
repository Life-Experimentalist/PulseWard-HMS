var allowedProviders = ["email-password", "otp", "google-oauth", "clerk"];
var allowedOtpChannels = ["email", "phone", "both"];

function toBoolean(value, fallback) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    var normalized = value.trim().toLowerCase();
    if (normalized === "true") {
      return true;
    }
    if (normalized === "false") {
      return false;
    }
  }

  return fallback;
}

function toInteger(value, fallback) {
  var parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.trunc(parsed);
}

function uniqueStrings(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  var seen = new Set();
  var result = [];

  values.forEach(function (value) {
    var normalized = String(value || "").trim();
    if (!normalized || seen.has(normalized)) {
      return;
    }

    seen.add(normalized);
    result.push(normalized);
  });

  return result;
}

function getDefaultAuthPolicy() {
  return {
    enabledProviders: ["email-password", "otp", "google-oauth", "clerk"],
    primaryProvider: "email-password",
    otpChannel: "email",
    mfaRequired: false,
    sessionTtlMinutes: 60,
    passwordMinLength: 8,
    allowSelfRegistration: false,
  };
}

function validateAndNormalizeAuthPolicy(rawPolicy) {
  var defaults = getDefaultAuthPolicy();
  var candidate = rawPolicy && typeof rawPolicy === "object" ? rawPolicy : {};
  var errors = [];

  var enabledProviders = uniqueStrings(candidate.enabledProviders);
  var invalidProviders = enabledProviders.filter(function (value) {
    return allowedProviders.indexOf(value) === -1;
  });

  if (invalidProviders.length > 0) {
    errors.push("enabledProviders contains unsupported providers: " + invalidProviders.join(", "));
  }

  var normalizedProviders = enabledProviders.filter(function (value) {
    return allowedProviders.indexOf(value) !== -1;
  });

  if (normalizedProviders.length === 0) {
    normalizedProviders = defaults.enabledProviders.slice();
    if (Array.isArray(candidate.enabledProviders)) {
      errors.push("enabledProviders must include at least one supported provider");
    }
  }

  var primaryProvider =
    typeof candidate.primaryProvider === "string" && candidate.primaryProvider.trim()
      ? candidate.primaryProvider.trim()
      : defaults.primaryProvider;

  if (normalizedProviders.indexOf(primaryProvider) === -1) {
    errors.push("primaryProvider must be one of enabledProviders");
    primaryProvider = normalizedProviders[0];
  }

  var otpChannel =
    typeof candidate.otpChannel === "string" && candidate.otpChannel.trim()
      ? candidate.otpChannel.trim()
      : defaults.otpChannel;

  if (allowedOtpChannels.indexOf(otpChannel) === -1) {
    errors.push("otpChannel must be one of: " + allowedOtpChannels.join(", "));
    otpChannel = defaults.otpChannel;
  }

  var sessionTtlMinutes = toInteger(candidate.sessionTtlMinutes, defaults.sessionTtlMinutes);
  if (sessionTtlMinutes < 15 || sessionTtlMinutes > 1440) {
    errors.push("sessionTtlMinutes must be between 15 and 1440");
    sessionTtlMinutes = defaults.sessionTtlMinutes;
  }

  var passwordMinLength = toInteger(candidate.passwordMinLength, defaults.passwordMinLength);
  if (passwordMinLength < 8 || passwordMinLength > 128) {
    errors.push("passwordMinLength must be between 8 and 128");
    passwordMinLength = defaults.passwordMinLength;
  }

  var normalized = {
    enabledProviders: normalizedProviders,
    primaryProvider: primaryProvider,
    otpChannel: otpChannel,
    mfaRequired: toBoolean(candidate.mfaRequired, defaults.mfaRequired),
    sessionTtlMinutes: sessionTtlMinutes,
    passwordMinLength: passwordMinLength,
    allowSelfRegistration: toBoolean(candidate.allowSelfRegistration, defaults.allowSelfRegistration),
  };

  return {
    valid: errors.length === 0,
    errors: errors,
    authPolicy: normalized,
  };
}

module.exports = {
  getDefaultAuthPolicy: getDefaultAuthPolicy,
  validateAndNormalizeAuthPolicy: validateAndNormalizeAuthPolicy,
};
