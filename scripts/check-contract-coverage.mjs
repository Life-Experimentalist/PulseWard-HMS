import fs from "node:fs";
import path from "node:path";

const HTTP_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD", "TRACE"]);
const STRICT_MODE = process.argv.includes("--strict");

const serviceChecks = [
  {
    service: "api-gateway",
    basePath: "/api",
    runtimeRouteSource: "services/api-gateway/src",
    runtimeRouteFiles: ["services/api-gateway/src"],
    openapiSpecSource: "services/api-gateway/openapi.yaml",
    coverageStatus: "covered",
    parityPractical: true,
    notes:
      "Runtime gateway handlers and OpenAPI operations are aligned for core auth, patient, and appointment routes.",
  },
  {
    service: "auth-service",
    basePath: "/api/v1 (also mounted at /api)",
    runtimeRouteSource: "services/auth-service/routes.js",
    runtimeRouteFiles: ["services/auth-service/routes.js"],
    openapiSpecSource: "services/auth-service/openapi.yaml",
    coverageStatus: "covered",
    parityPractical: true,
    notes: "Runtime route module and OpenAPI spec are both present.",
  },
  {
    service: "appointment-service",
    basePath: "/api/v1 (also mounted at /api)",
    runtimeRouteSource: "services/appointment-service/routes.js",
    runtimeRouteFiles: ["services/appointment-service/routes.js"],
    openapiSpecSource: "services/appointment-service/openapi.yaml",
    coverageStatus: "covered",
    parityPractical: true,
    notes: "Runtime route module and OpenAPI spec are both present.",
  },
  {
    service: "notification-service",
    basePath: "/api/v1 (also mounted at /api)",
    runtimeRouteSource: "services/notification-service/routes.js",
    runtimeRouteFiles: ["services/notification-service/routes.js"],
    openapiSpecSource: "services/notification-service/openapi.yaml",
    coverageStatus: "covered",
    parityPractical: true,
    notes: "Runtime route module and OpenAPI spec are both present.",
  },
  {
    service: "patient-service",
    basePath: "/api/patients",
    runtimeRouteSource: "services/patient-service/src",
    runtimeRouteFiles: ["services/patient-service/src"],
    runtimeOperationPrefix: "/patients",
    openapiSpecSource: "services/patient-service/openapi.yaml",
    coverageStatus: "covered",
    parityPractical: true,
    notes: "Runtime route declarations are inline in src; no dedicated routes.js file.",
  },
  {
    service: "ehr-service",
    basePath: "/ehr/records/{id}",
    runtimeRouteSource: "services/ehr-service/routes.js",
    runtimeRouteFiles: ["services/ehr-service/routes.js"],
    runtimeOperationPrefix: "/ehr",
    openapiSpecSource: "services/ehr-service/openapi.yaml",
    coverageStatus: "covered",
    parityPractical: true,
    notes: "Runtime routes and OpenAPI are reconciled for EHR CRUD and timeline history paths.",
  },
  {
    service: "lab-service",
    basePath: "/lab-tests (mounted at /api)",
    runtimeRouteSource: "services/lab-service/routes.js",
    runtimeRouteFiles: ["services/lab-service/routes.js"],
    openapiSpecSource: "services/lab-service/openapi.yaml",
    coverageStatus: "covered",
    parityPractical: true,
    notes:
      "Runtime route module and OpenAPI spec are reconciled for catalog, order, and result workflows.",
  },
  {
    service: "pharmacy-service",
    basePath: "/api/pharmacy",
    runtimeRouteSource: "services/pharmacy-service/src",
    runtimeRouteFiles: ["services/pharmacy-service/src"],
    openapiSpecSource: "services/pharmacy-service/openapi.yaml",
    coverageStatus: "covered",
    parityPractical: true,
    notes: "Runtime route declarations are inline in src; no dedicated routes.js file.",
  },
  {
    service: "billing-service",
    basePath: "/billing",
    runtimeRouteSource: "services/billing-service/src",
    runtimeRouteFiles: ["services/billing-service/src"],
    openapiSpecSource: "services/billing-service/openapi.yaml",
    coverageStatus: "covered",
    parityPractical: true,
    notes: "Runtime CRUD endpoints and OpenAPI are reconciled for /billing and /billing/{id}.",
  },
];

const parityAllowlist = {};

const criticalSchemaChecks = [
  {
    service: "auth-service",
    specSource: "services/auth-service/openapi.yaml",
    method: "POST",
    path: "/auth/login",
    requireRequestBody: true,
    requiredResponseCodes: ["200", "400", "401", "403"],
  },
  {
    service: "auth-service",
    specSource: "services/auth-service/openapi.yaml",
    method: "POST",
    path: "/auth/otp/request",
    requireRequestBody: true,
    requiredResponseCodes: ["200", "400", "403"],
  },
  {
    service: "auth-service",
    specSource: "services/auth-service/openapi.yaml",
    method: "POST",
    path: "/auth/otp/verify",
    requireRequestBody: true,
    requiredResponseCodes: ["200", "400"],
  },
  {
    service: "auth-service",
    specSource: "services/auth-service/openapi.yaml",
    method: "GET",
    path: "/auth/session/events",
    requireRequestBody: false,
    requiredResponseCodes: ["200"],
  },
  {
    service: "auth-service",
    specSource: "services/auth-service/openapi.yaml",
    method: "POST",
    path: "/auth/workflow-entry/check",
    requireRequestBody: true,
    requiredResponseCodes: ["200", "400", "401", "403"],
  },
  {
    service: "auth-service",
    specSource: "services/auth-service/openapi.yaml",
    method: "PUT",
    path: "/admin/settings",
    requireRequestBody: true,
    requiredResponseCodes: ["200"],
  },
  {
    service: "auth-service",
    specSource: "services/auth-service/openapi.yaml",
    method: "GET",
    path: "/auth/oauth/google/start",
    requireRequestBody: false,
    requiredResponseCodes: ["200", "403"],
  },
  {
    service: "auth-service",
    specSource: "services/auth-service/openapi.yaml",
    method: "POST",
    path: "/auth/oauth/google/callback",
    requireRequestBody: true,
    requiredResponseCodes: ["200", "403"],
  },
  {
    service: "auth-service",
    specSource: "services/auth-service/openapi.yaml",
    method: "GET",
    path: "/auth/oauth/clerk/start",
    requireRequestBody: false,
    requiredResponseCodes: ["200", "403"],
  },
  {
    service: "auth-service",
    specSource: "services/auth-service/openapi.yaml",
    method: "POST",
    path: "/platform/abha/transactions/read",
    requireRequestBody: true,
    requiredResponseCodes: ["200", "202", "403", "502"],
  },
  {
    service: "auth-service",
    specSource: "services/auth-service/openapi.yaml",
    method: "POST",
    path: "/platform/abha/transactions/write",
    requireRequestBody: true,
    requiredResponseCodes: ["200", "202", "403", "502"],
  },
  {
    service: "auth-service",
    specSource: "services/auth-service/openapi.yaml",
    method: "GET",
    path: "/platform/abha/transactions/evidence",
    requireRequestBody: false,
    requiredResponseCodes: ["200"],
  },
  {
    service: "auth-service",
    specSource: "services/auth-service/openapi.yaml",
    method: "POST",
    path: "/platform/domain-config/validate",
    requireRequestBody: true,
    requiredResponseCodes: ["200", "400"],
  },
  {
    service: "auth-service",
    specSource: "services/auth-service/openapi.yaml",
    method: "POST",
    path: "/admin/settings/auth-policy/validate",
    requireRequestBody: true,
    requiredResponseCodes: ["200", "400"],
  },
  {
    service: "ehr-service",
    specSource: "services/ehr-service/openapi.yaml",
    method: "POST",
    path: "/ehr/records",
    requireRequestBody: true,
    requiredResponseCodes: ["201", "400", "409"],
  },
  {
    service: "ehr-service",
    specSource: "services/ehr-service/openapi.yaml",
    method: "PUT",
    path: "/ehr/records/{id}",
    requireRequestBody: true,
    requiredResponseCodes: ["200", "400", "404", "409"],
  },
  {
    service: "ehr-service",
    specSource: "services/ehr-service/openapi.yaml",
    method: "GET",
    path: "/ehr/records/{id}/timeline",
    requireRequestBody: false,
    requiredResponseCodes: ["200", "404"],
  },
  {
    service: "ehr-service",
    specSource: "services/ehr-service/openapi.yaml",
    method: "POST",
    path: "/ehr/records/{id}/prescriptions",
    requireRequestBody: true,
    requiredResponseCodes: ["201", "400", "404"],
  },
  {
    service: "ehr-service",
    specSource: "services/ehr-service/openapi.yaml",
    method: "POST",
    path: "/ehr/records/{id}/prescriptions/{prescriptionId}/handoff",
    requireRequestBody: true,
    requiredResponseCodes: ["200", "400", "404"],
  },
  {
    service: "appointment-service",
    specSource: "services/appointment-service/openapi.yaml",
    method: "POST",
    path: "/appointments",
    requireRequestBody: true,
    requiredResponseCodes: ["201", "400", "403", "409"],
  },
  {
    service: "appointment-service",
    specSource: "services/appointment-service/openapi.yaml",
    method: "PUT",
    path: "/appointments/{id}",
    requireRequestBody: true,
    requiredResponseCodes: ["200", "400", "403", "409"],
  },
  {
    service: "appointment-service",
    specSource: "services/appointment-service/openapi.yaml",
    method: "POST",
    path: "/opd/entries",
    requireRequestBody: true,
    requiredResponseCodes: ["201", "400", "403"],
  },
  {
    service: "notification-service",
    specSource: "services/notification-service/openapi.yaml",
    method: "POST",
    path: "/notifications",
    requireRequestBody: true,
    requiredResponseCodes: ["201"],
  },
  {
    service: "notification-service",
    specSource: "services/notification-service/openapi.yaml",
    method: "POST",
    path: "/integrations/messaging/test",
    requireRequestBody: true,
    requiredResponseCodes: ["200"],
  },
  {
    service: "notification-service",
    specSource: "services/notification-service/openapi.yaml",
    method: "POST",
    path: "/integrations/appointments/events",
    requireRequestBody: true,
    requiredResponseCodes: ["201", "200", "400"],
  },
  {
    service: "pharmacy-service",
    specSource: "services/pharmacy-service/openapi.yaml",
    method: "POST",
    path: "/prescriptions/handoff",
    requireRequestBody: true,
    requiredResponseCodes: ["201", "400", "409"],
  },
  {
    service: "pharmacy-service",
    specSource: "services/pharmacy-service/openapi.yaml",
    method: "PUT",
    path: "/prescriptions/{id}/status",
    requireRequestBody: true,
    requiredResponseCodes: ["200", "400", "404"],
  },
  {
    service: "lab-service",
    specSource: "services/lab-service/openapi.yaml",
    method: "POST",
    path: "/lab-tests/orders",
    requireRequestBody: true,
    requiredResponseCodes: ["201", "400"],
  },
  {
    service: "lab-service",
    specSource: "services/lab-service/openapi.yaml",
    method: "PUT",
    path: "/lab-tests/orders/{id}/status",
    requireRequestBody: true,
    requiredResponseCodes: ["200", "400", "404"],
  },
  {
    service: "lab-service",
    specSource: "services/lab-service/openapi.yaml",
    method: "POST",
    path: "/lab-tests/orders/{id}/result",
    requireRequestBody: true,
    requiredResponseCodes: ["200", "400", "404"],
  },
  {
    service: "lab-service",
    specSource: "services/lab-service/openapi.yaml",
    method: "POST",
    path: "/lab-tests/orders/{id}/report",
    requireRequestBody: true,
    requiredResponseCodes: ["200", "400", "404"],
  },
  {
    service: "billing-service",
    specSource: "services/billing-service/openapi.yaml",
    method: "POST",
    path: "/billing/hooks/clinical-trigger",
    requireRequestBody: true,
    requiredResponseCodes: ["201", "400", "403", "409"],
  },
];

const specLinesCache = new Map();

function existsInRepo(relativePath) {
  if (!relativePath) {
    return false;
  }

  return fs.existsSync(path.resolve(process.cwd(), relativePath));
}

function pad(value, width) {
  const text = String(value);
  return text.length >= width ? text : text + " ".repeat(width - text.length);
}

function getLeadingIndent(line) {
  const match = String(line || "").match(/^(\s*)/);
  return match ? match[1].length : 0;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getSpecLines(specPath) {
  if (!specLinesCache.has(specPath)) {
    const absolutePath = path.resolve(process.cwd(), specPath);
    const lines = fs.readFileSync(absolutePath, "utf8").split(/\r?\n/);
    specLinesCache.set(specPath, lines);
  }

  return specLinesCache.get(specPath);
}

function findOperationBlock(lines, targetPath, method) {
  let inPaths = false;
  let currentPath = "";
  const methodPattern = new RegExp(
    `^\\s{4}${escapeRegExp(String(method || "").toLowerCase())}:\\s*$`
  );

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (!inPaths) {
      if (/^paths:\s*$/.test(line)) {
        inPaths = true;
      }
      continue;
    }

    if (/^[^\s#]/.test(line)) {
      break;
    }

    const pathMatch = line.match(/^\s{2}(\/[^:]*):\s*$/);
    if (pathMatch) {
      currentPath = pathMatch[1];
      continue;
    }

    if (currentPath !== targetPath) {
      continue;
    }

    if (!methodPattern.test(line)) {
      continue;
    }

    const start = index + 1;
    let end = lines.length;

    for (let cursor = start; cursor < lines.length; cursor += 1) {
      const candidate = lines[cursor];

      if (/^[^\s#]/.test(candidate)) {
        end = cursor;
        break;
      }

      if (/^\s{2}\/[^:]*:\s*$/.test(candidate)) {
        end = cursor;
        break;
      }

      if (/^\s{4}(get|post|put|patch|delete|options|head|trace):\s*$/i.test(candidate)) {
        end = cursor;
        break;
      }
    }

    return lines.slice(start, end);
  }

  return null;
}

function extractIndentedSection(lines, headerMatcher, indentLevel) {
  const matcher =
    headerMatcher instanceof RegExp
      ? headerMatcher
      : new RegExp(`^\\s{${indentLevel}}${escapeRegExp(headerMatcher)}:\\s*$`);

  let start = -1;
  for (let index = 0; index < lines.length; index += 1) {
    if (matcher.test(lines[index])) {
      start = index;
      break;
    }
  }

  if (start < 0) {
    return null;
  }

  let end = lines.length;
  for (let cursor = start + 1; cursor < lines.length; cursor += 1) {
    const line = lines[cursor];
    if (!line.trim()) {
      continue;
    }

    if (getLeadingIndent(line) <= indentLevel) {
      end = cursor;
      break;
    }
  }

  return lines.slice(start, end);
}

function hasJsonSchemaInSection(sectionLines) {
  if (!sectionLines || sectionLines.length === 0) {
    return false;
  }

  let applicationJsonIndent = -1;
  let applicationJsonFound = false;

  for (let index = 0; index < sectionLines.length; index += 1) {
    const line = sectionLines[index];
    if (!applicationJsonFound) {
      if (line.trim() === "application/json:") {
        applicationJsonFound = true;
        applicationJsonIndent = getLeadingIndent(line);
      }
      continue;
    }

    if (!line.trim()) {
      continue;
    }

    const indent = getLeadingIndent(line);
    if (indent <= applicationJsonIndent) {
      return false;
    }

    if (line.trim().startsWith("schema:")) {
      return true;
    }
  }

  return false;
}

function evaluateCriticalSchemaChecks() {
  const results = criticalSchemaChecks.map((check) => {
    const label = `${check.service} ${check.method.toUpperCase()} ${check.path}`;
    const failures = [];

    if (!existsInRepo(check.specSource)) {
      failures.push(`missing spec source: ${check.specSource}`);
      return { ...check, label, pass: false, failures };
    }

    const lines = getSpecLines(check.specSource);
    const operationLines = findOperationBlock(lines, check.path, check.method);

    if (!operationLines) {
      failures.push(`missing operation in spec: ${check.method.toUpperCase()} ${check.path}`);
      return { ...check, label, pass: false, failures };
    }

    if (check.requireRequestBody) {
      const requestBodySection = extractIndentedSection(operationLines, "requestBody", 6);
      if (!requestBodySection) {
        failures.push("missing requestBody section");
      } else {
        const requestText = requestBodySection.join("\n");
        if (!/^\s+required:\s*true\s*$/m.test(requestText)) {
          failures.push("requestBody.required is not true");
        }
        if (!hasJsonSchemaInSection(requestBodySection)) {
          failures.push("requestBody missing application/json schema");
        }
      }
    }

    const responsesSection = extractIndentedSection(operationLines, "responses", 6);
    if (!responsesSection) {
      failures.push("missing responses section");
    } else {
      for (const code of check.requiredResponseCodes || []) {
        const responseSection = extractIndentedSection(
          responsesSection,
          new RegExp(`^\\s{8}["']?${escapeRegExp(code)}["']?:\\s*$`),
          8
        );

        if (!responseSection) {
          failures.push(`missing response ${code}`);
          continue;
        }

        if (!hasJsonSchemaInSection(responseSection)) {
          failures.push(`response ${code} missing application/json schema`);
        }
      }
    }

    return {
      ...check,
      label,
      pass: failures.length === 0,
      failures,
    };
  });

  const failedResults = results.filter((result) => !result.pass);
  return { results, failedResults };
}

function normalizePathSegment(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return "/";
  }

  let normalized = trimmed.replace(/\\/g, "/").replace(/\/+/g, "/");
  if (!normalized.startsWith("/")) {
    normalized = `/${normalized}`;
  }

  if (normalized.length > 1) {
    normalized = normalized.replace(/\/+$/g, "");
  }

  return normalized || "/";
}

function joinPaths(basePath, routePath) {
  const base = normalizePathSegment(basePath || "/");
  const route = normalizePathSegment(routePath || "/");

  if (route === "/") {
    return base;
  }

  return normalizePathSegment(base === "/" ? route : `${base}${route}`);
}

function toOpenApiPath(runtimePath) {
  return normalizePathSegment(runtimePath)
    .replace(/:([A-Za-z0-9_]+)/g, "{$1}")
    .replace(/\{[^}]+\}/g, "{param}");
}

function parseRuntimeOperations(filePath, runtimeOperationPrefix) {
  const absolutePath = path.resolve(process.cwd(), filePath);
  const source = fs.readFileSync(absolutePath, "utf8");

  const mountByReceiver = new Map();
  const usePattern =
    /([A-Za-z_$][\w$]*)\.use\(\s*["'`]([^"'`]+)["'`]\s*,\s*([A-Za-z_$][\w$]*)\s*\)/g;
  let useMatch = usePattern.exec(source);
  while (useMatch) {
    const mountPath = normalizePathSegment(useMatch[2]);
    const mountReceiver = useMatch[3];
    mountByReceiver.set(mountReceiver, mountPath);
    useMatch = usePattern.exec(source);
  }

  const operations = new Set();
  const routePattern =
    /([A-Za-z_$][\w$]*)\.(get|post|put|patch|delete|options|head|trace)\(\s*["'`]([^"'`]+)["'`]/gi;
  let routeMatch = routePattern.exec(source);
  while (routeMatch) {
    const receiver = routeMatch[1];
    const method = routeMatch[2].toUpperCase();
    const routePath = routeMatch[3];

    if (!HTTP_METHODS.has(method)) {
      routeMatch = routePattern.exec(source);
      continue;
    }

    const mountPrefix = mountByReceiver.get(receiver) || "";
    const effectivePath = toOpenApiPath(joinPaths(mountPrefix, routePath));
    const prefixedPath = runtimeOperationPrefix
      ? toOpenApiPath(joinPaths(runtimeOperationPrefix, effectivePath))
      : effectivePath;
    operations.add(`${method} ${prefixedPath}`);
    routeMatch = routePattern.exec(source);
  }

  return operations;
}

function parseOpenApiOperations(filePath) {
  const absolutePath = path.resolve(process.cwd(), filePath);
  const lines = fs.readFileSync(absolutePath, "utf8").split(/\r?\n/);

  const operations = new Set();
  let inPaths = false;
  let currentPath = "";

  for (const line of lines) {
    if (!inPaths) {
      if (/^paths:\s*$/.test(line)) {
        inPaths = true;
      }
      continue;
    }

    if (/^[^\s#]/.test(line)) {
      break;
    }

    const pathMatch = line.match(/^\s{2}(\/[^:]*):\s*$/);
    if (pathMatch) {
      currentPath = pathMatch[1];
      continue;
    }

    const methodMatch = line.match(/^\s{4}(get|post|put|patch|delete|options|head|trace):\s*$/i);
    if (methodMatch && currentPath) {
      const method = methodMatch[1].toUpperCase();
      operations.add(`${method} ${toOpenApiPath(currentPath)}`);
    }
  }

  return operations;
}

function toSortedArray(setValue) {
  return [...setValue].sort((a, b) => a.localeCompare(b));
}

function toSet(values) {
  return new Set((values || []).map((item) => String(item).trim()).filter(Boolean));
}

function diffOperations(sourceOps, compareOps) {
  const onlyInSource = [];
  for (const op of sourceOps) {
    if (!compareOps.has(op)) {
      onlyInSource.push(op);
    }
  }

  return onlyInSource.sort((a, b) => a.localeCompare(b));
}

function evaluateParity(serviceConfig) {
  const runtimeOps = new Set();
  for (const runtimeFile of serviceConfig.runtimeRouteFiles) {
    if (!existsInRepo(runtimeFile)) {
      continue;
    }

    const parsed = parseRuntimeOperations(runtimeFile, serviceConfig.runtimeOperationPrefix);
    for (const op of parsed) {
      runtimeOps.add(op);
    }
  }

  const specOps = parseOpenApiOperations(serviceConfig.openapiSpecSource);
  const runtimeOnly = diffOperations(runtimeOps, specOps);
  const specOnly = diffOperations(specOps, runtimeOps);

  const baseline = parityAllowlist[serviceConfig.service] || {
    reason: "No documented baseline exceptions.",
    runtimeOnly: [],
    specOnly: [],
  };

  const allowedRuntimeOnly = toSet(baseline.runtimeOnly);
  const allowedSpecOnly = toSet(baseline.specOnly);

  const unexpectedRuntimeOnly = runtimeOnly.filter((op) => !allowedRuntimeOnly.has(op));
  const unexpectedSpecOnly = specOnly.filter((op) => !allowedSpecOnly.has(op));
  const staleAllowedRuntimeOnly = [...allowedRuntimeOnly].filter((op) => !runtimeOnly.includes(op));
  const staleAllowedSpecOnly = [...allowedSpecOnly].filter((op) => !specOnly.includes(op));

  const parityPass = unexpectedRuntimeOnly.length === 0 && unexpectedSpecOnly.length === 0;

  let parityDetail = "semantic parity OK";
  if (!parityPass) {
    parityDetail = [
      unexpectedRuntimeOnly.length > 0
        ? `unexpected runtime-only: ${unexpectedRuntimeOnly.join(", ")}`
        : null,
      unexpectedSpecOnly.length > 0
        ? `unexpected spec-only: ${unexpectedSpecOnly.join(", ")}`
        : null,
    ]
      .filter(Boolean)
      .join("; ");
  }

  const staleAllowlist = [...staleAllowedRuntimeOnly, ...staleAllowedSpecOnly].sort((a, b) =>
    a.localeCompare(b)
  );
  if (STRICT_MODE && staleAllowlist.length > 0) {
    parityDetail =
      parityPass && parityDetail === "semantic parity OK"
        ? `strict mode stale allowlist entries: ${staleAllowlist.join(", ")}`
        : `${parityDetail}; strict mode stale allowlist entries: ${staleAllowlist.join(", ")}`;
  }

  return {
    parityPass: parityPass && (!STRICT_MODE || staleAllowlist.length === 0),
    parityDetail,
    runtimeOps: toSortedArray(runtimeOps),
    specOps: toSortedArray(specOps),
    runtimeOnly,
    specOnly,
    unexpectedRuntimeOnly,
    unexpectedSpecOnly,
    staleAllowedRuntimeOnly: staleAllowedRuntimeOnly.sort((a, b) => a.localeCompare(b)),
    staleAllowedSpecOnly: staleAllowedSpecOnly.sort((a, b) => a.localeCompare(b)),
    baselineReason: baseline.reason,
  };
}

const rows = serviceChecks.map((item) => {
  const runtimeOk = existsInRepo(item.runtimeRouteSource);
  const specOk = existsInRepo(item.openapiSpecSource);
  const presenceCheck = runtimeOk && specOk ? "PASS" : "FAIL";

  const presenceDetail =
    presenceCheck === "PASS"
      ? "ok"
      : [
          runtimeOk ? null : "runtime route source missing",
          specOk ? null : "openapi/spec source missing",
        ]
          .filter(Boolean)
          .join("; ");

  let parityCheck = "SKIP";
  let parityDetail = item.parityPractical
    ? "parity check skipped due to missing runtime/spec source"
    : "known drift; parity not practical for this service in M1.2";
  let parityResult = null;

  if (presenceCheck === "PASS") {
    parityResult = evaluateParity(item);

    if (item.parityPractical) {
      parityCheck = parityResult.parityPass ? "PASS" : "FAIL";
      parityDetail = parityResult.parityDetail;
    } else {
      parityCheck = parityResult.parityPass ? "ALLOWLISTED" : "FAIL";
      parityDetail = parityResult.parityPass
        ? `allowlisted drift (${parityResult.baselineReason})`
        : parityResult.parityDetail;
    }
  }

  return {
    ...item,
    presenceCheck,
    presenceDetail,
    parityCheck,
    parityDetail,
    parityResult,
  };
});

const headers = [
  "service",
  "base path",
  "runtime route source",
  "openapi/spec source",
  "coverage status",
  "presence check",
  "presence detail",
  "parity check",
  "parity detail",
];

const widths = headers.map((header) => header.length);
rows.forEach((row) => {
  const values = [
    row.service,
    row.basePath,
    row.runtimeRouteSource || "MISSING",
    row.openapiSpecSource || "MISSING",
    row.coverageStatus,
    row.presenceCheck,
    row.presenceDetail,
    row.parityCheck,
    row.parityDetail,
  ];

  values.forEach((value, index) => {
    widths[index] = Math.max(widths[index], String(value).length);
  });
});

function makeRow(values) {
  return `| ${values.map((value, index) => pad(value, widths[index])).join(" | ")} |`;
}

const divider = `|-${widths.map((width) => "-".repeat(width)).join("-|-")}-|`;

console.log("PulseWard M1 contract compatibility and parity check");
console.log(`Mode: ${STRICT_MODE ? "strict" : "standard"}`);
console.log(makeRow(headers));
console.log(divider);

rows.forEach((row) => {
  console.log(
    makeRow([
      row.service,
      row.basePath,
      row.runtimeRouteSource || "MISSING",
      row.openapiSpecSource || "MISSING",
      row.coverageStatus,
      row.presenceCheck,
      row.presenceDetail,
      row.parityCheck,
      row.parityDetail,
    ])
  );
});

console.log("\nParity mismatch details by service:");
rows.forEach((row) => {
  if (!row.parityResult) {
    return;
  }

  const details = row.parityResult;
  console.log(`- ${row.service}`);
  console.log(
    `  - runtime-only (${details.runtimeOnly.length}): ${details.runtimeOnly.join(", ") || "none"}`
  );
  console.log(
    `  - spec-only (${details.specOnly.length}): ${details.specOnly.join(", ") || "none"}`
  );
  console.log(
    `  - unexpected runtime-only (${details.unexpectedRuntimeOnly.length}): ${
      details.unexpectedRuntimeOnly.join(", ") || "none"
    }`
  );
  console.log(
    `  - unexpected spec-only (${details.unexpectedSpecOnly.length}): ${
      details.unexpectedSpecOnly.join(", ") || "none"
    }`
  );

  if (details.staleAllowedRuntimeOnly.length > 0 || details.staleAllowedSpecOnly.length > 0) {
    console.log(
      `  - stale allowlist runtime-only (${details.staleAllowedRuntimeOnly.length}): ${
        details.staleAllowedRuntimeOnly.join(", ") || "none"
      }`
    );
    console.log(
      `  - stale allowlist spec-only (${details.staleAllowedSpecOnly.length}): ${
        details.staleAllowedSpecOnly.join(", ") || "none"
      }`
    );
  }
});

const schemaResults = evaluateCriticalSchemaChecks();

console.log("\nCritical endpoint schema checks:");
schemaResults.results.forEach((result) => {
  if (result.pass) {
    console.log(`- PASS: ${result.label}`);
    return;
  }

  console.log(`- FAIL: ${result.label}`);
  result.failures.forEach((failure) => {
    console.log(`  - ${failure}`);
  });
});

const failedPresenceRows = rows.filter((row) => row.presenceCheck === "FAIL");
const failedParityRows = rows.filter((row) => row.parityCheck === "FAIL");
const failedSchemaRows = schemaResults.failedResults;

if (failedPresenceRows.length > 0 || failedParityRows.length > 0 || failedSchemaRows.length > 0) {
  console.error("\nContract check failed.");

  if (failedPresenceRows.length > 0) {
    console.error(`Presence failures (${failedPresenceRows.length}):`);
    failedPresenceRows.forEach((row) => {
      console.error(`- ${row.service}: ${row.presenceDetail}`);
    });
  }

  if (failedParityRows.length > 0) {
    console.error(`Parity failures (${failedParityRows.length}):`);
    failedParityRows.forEach((row) => {
      console.error(`- ${row.service}: ${row.parityDetail}`);
    });
  }

  if (failedSchemaRows.length > 0) {
    console.error(`Schema failures (${failedSchemaRows.length}):`);
    failedSchemaRows.forEach((result) => {
      console.error(`- ${result.label}: ${result.failures.join("; ")}`);
    });
  }

  process.exit(1);
}

console.log("\nSchema check passed: critical request/response schema coverage is present.");
console.log("Contract check passed: presence, parity, and schema checks are within baseline.");
