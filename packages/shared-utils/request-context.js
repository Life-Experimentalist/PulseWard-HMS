var randomUUID = require("crypto").randomUUID;

function sanitizeContextValue(value) {
  var normalized = String(value || "").trim();
  if (!normalized) {
    return "";
  }

  return normalized.replace(/[^a-zA-Z0-9._:-]/g, "").slice(0, 128);
}

function resolveCorrelationId(req) {
  var headerCorrelation = sanitizeContextValue(req.headers["x-correlation-id"]);
  if (headerCorrelation) {
    return headerCorrelation;
  }

  var headerRequestId = sanitizeContextValue(req.headers["x-request-id"]);
  if (headerRequestId) {
    return headerRequestId;
  }

  var bodyCorrelation =
    req.body && typeof req.body === "object" ? sanitizeContextValue(req.body.correlationId) : "";
  if (bodyCorrelation) {
    return bodyCorrelation;
  }

  var queryCorrelation = sanitizeContextValue(req.query && req.query.correlationId);
  if (queryCorrelation) {
    return queryCorrelation;
  }

  return randomUUID();
}

function withRequestContext(serviceName) {
  var normalizedServiceName = sanitizeContextValue(serviceName) || "unknown-service";

  return function requestContextMiddleware(req, res, next) {
    var startedAt = Date.now();
    var correlationId = resolveCorrelationId(req);
    var requestId = randomUUID();

    req.requestContext = {
      service: normalizedServiceName,
      correlationId: correlationId,
      requestId: requestId,
    };

    res.setHeader("x-correlation-id", correlationId);
    res.setHeader("x-request-id", requestId);

    res.on("finish", function () {
      var event = {
        timestamp: new Date().toISOString(),
        level: "info",
        event: "http_request_completed",
        service: normalizedServiceName,
        correlationId: correlationId,
        requestId: requestId,
        method: req.method,
        path: req.originalUrl || req.url,
        statusCode: res.statusCode,
        durationMs: Date.now() - startedAt,
      };

      console.log(JSON.stringify(event));
    });

    next();
  };
}

module.exports = {
  withRequestContext,
};
