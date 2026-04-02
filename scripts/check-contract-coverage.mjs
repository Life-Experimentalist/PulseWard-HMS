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
    runtimeRouteSource: "services/ehr-service/src",
    runtimeRouteFiles: ["services/ehr-service/src"],
    runtimeOperationPrefix: "/ehr",
    openapiSpecSource: "services/ehr-service/openapi.yaml",
    coverageStatus: "covered",
    parityPractical: true,
    notes: "Runtime routes and OpenAPI are reconciled on /ehr/records/{id}.",
  },
  {
    service: "lab-service",
    basePath: "/api/lab-tests",
    runtimeRouteSource: "services/lab-service/src",
    runtimeRouteFiles: ["services/lab-service/src"],
    openapiSpecSource: "services/lab-service/openapi.yaml",
    coverageStatus: "covered",
    parityPractical: true,
    notes: "Runtime paths and OpenAPI model are reconciled under /api/lab-tests.",
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

const failedPresenceRows = rows.filter((row) => row.presenceCheck === "FAIL");
const failedParityRows = rows.filter((row) => row.parityCheck === "FAIL");

if (failedPresenceRows.length > 0 || failedParityRows.length > 0) {
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

  process.exit(1);
}

console.log("\nContract check passed: presence and parity checks are within baseline.");
