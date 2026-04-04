import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const repoRoot = process.cwd();
const postmanDir = path.join(repoRoot, "postman");

const services = [
  {
    key: "api-gateway",
    name: "API Gateway",
    openapiPath: "services/api-gateway/openapi.yaml",
    baseVar: "apiGatewayBaseUrl",
    baseDefault: "http://localhost:8080",
  },
  {
    key: "auth-service",
    name: "Auth Service",
    openapiPath: "services/auth-service/openapi.yaml",
    baseVar: "authServiceBaseUrl",
    baseDefault: "http://localhost:5101",
  },
  {
    key: "notification-service",
    name: "Notification Service",
    openapiPath: "services/notification-service/openapi.yaml",
    baseVar: "notificationServiceBaseUrl",
    baseDefault: "http://localhost:5102",
  },
  {
    key: "appointment-service",
    name: "Appointment Service",
    openapiPath: "services/appointment-service/openapi.yaml",
    baseVar: "appointmentServiceBaseUrl",
    baseDefault: "http://localhost:5103",
  },
  {
    key: "patient-service",
    name: "Patient Service",
    openapiPath: "services/patient-service/openapi.yaml",
    baseVar: "patientServiceBaseUrl",
    baseDefault: "http://localhost:8082",
  },
  {
    key: "ehr-service",
    name: "EHR Service",
    openapiPath: "services/ehr-service/openapi.yaml",
    baseVar: "ehrServiceBaseUrl",
    baseDefault: "http://localhost:8084",
  },
  {
    key: "lab-service",
    name: "Lab Service",
    openapiPath: "services/lab-service/openapi.yaml",
    baseVar: "labServiceBaseUrl",
    baseDefault: "http://localhost:8087",
  },
  {
    key: "pharmacy-service",
    name: "Pharmacy Service",
    openapiPath: "services/pharmacy-service/openapi.yaml",
    baseVar: "pharmacyServiceBaseUrl",
    baseDefault: "http://localhost:8086",
  },
  {
    key: "billing-service",
    name: "Billing Service",
    openapiPath: "services/billing-service/openapi.yaml",
    baseVar: "billingServiceBaseUrl",
    baseDefault: "http://localhost:8085",
  },
];

function readOpenApiEndpoints(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  let currentPath = null;
  const endpoints = [];
  const seen = new Set();

  for (const line of lines) {
    const pathMatch = line.match(/^\s{2}(\/[^:]+):\s*$/);
    if (pathMatch) {
      currentPath = pathMatch[1].trim();
      continue;
    }

    const methodMatch = line.match(/^\s{4}(get|post|put|patch|delete|options|head):\s*$/i);
    if (methodMatch && currentPath) {
      const method = methodMatch[1].toUpperCase();
      const key = `${method} ${currentPath}`;
      if (!seen.has(key)) {
        seen.add(key);
        endpoints.push({ method, path: currentPath });
      }
    }
  }

  return endpoints.sort((a, b) => `${a.path}:${a.method}`.localeCompare(`${b.path}:${b.method}`));
}

function toPostmanPath(apiPath) {
  return apiPath.replace(/\{([^}]+)\}/g, ":$1");
}

function extractPathVariables(apiPath) {
  const vars = [];
  const regex = /\{([^}]+)\}/g;
  let match;
  while ((match = regex.exec(apiPath)) !== null) {
    vars.push(match[1]);
  }
  return vars;
}

function buildUrl(baseVar, apiPath) {
  const postmanPath = toPostmanPath(apiPath);
  return {
    raw: `{{${baseVar}}}${postmanPath}`,
    host: [`{{${baseVar}}}`],
    path: postmanPath.split("/").filter(Boolean),
  };
}

function buildRequestHeaders(method) {
  const headers = [
    { key: "Accept", value: "application/json", type: "text" },
    { key: "Authorization", value: "Bearer {{authToken}}", type: "text" },
    { key: "x-tenant-key", value: "{{tenantKey}}", type: "text" },
  ];

  if (["POST", "PUT", "PATCH"].includes(method)) {
    headers.push({ key: "Content-Type", value: "application/json", type: "text" });
  }

  return headers;
}

function buildRequestBody(method) {
  if (!["POST", "PUT", "PATCH"].includes(method)) {
    return undefined;
  }

  return {
    mode: "raw",
    raw: JSON.stringify(
      {
        tenantKey: "{{tenantKey}}",
        note: "Replace this payload with endpoint-specific request data",
      },
      null,
      2
    ),
    options: {
      raw: {
        language: "json",
      },
    },
  };
}

function buildTestScript() {
  return [
    {
      listen: "test",
      script: {
        type: "text/javascript",
        exec: [
          "pm.test('Status code is not 5xx', function () {",
          "  pm.expect(pm.response.code).to.be.below(500);",
          "});",
          "",
          "pm.test('Response time is under 5000ms', function () {",
          "  pm.expect(pm.response.responseTime).to.be.below(5000);",
          "});",
        ],
      },
    },
  ];
}

function buildCollection() {
  const pathVars = new Set(["tenantKey"]);

  const folders = services.map((service) => {
    const endpoints = readOpenApiEndpoints(path.join(repoRoot, service.openapiPath));
    for (const endpoint of endpoints) {
      for (const variable of extractPathVariables(endpoint.path)) {
        pathVars.add(variable);
      }
    }

    const items = endpoints.map((endpoint) => ({
      name: `${endpoint.method} ${endpoint.path}`,
      request: {
        method: endpoint.method,
        header: buildRequestHeaders(endpoint.method),
        url: buildUrl(service.baseVar, endpoint.path),
        body: buildRequestBody(endpoint.method),
        description:
          "Auto-generated from OpenAPI path list. Replace placeholders and request body before live execution.",
      },
      event: buildTestScript(),
      response: [],
    }));

    return {
      name: service.name,
      item: items,
    };
  });

  const variableDefaults = {
    tenantKey: "citycare-hospital",
    authToken: "",
    appointmentId: "apt-1001",
    patientId: "pat-1001",
    clinicianId: "cln-1001",
    prescriptionId: "rx-1001",
    id: "sample-id",
    recordId: "rec-1001",
    orderId: "lab-1001",
    anomalyInstanceId: "anomaly-1001",
  };

  const collectionVariables = [
    ...services.map((service) => ({ key: service.baseVar, value: service.baseDefault })),
    ...Array.from(pathVars)
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({ key: name, value: variableDefaults[name] || `sample-${name}` })),
  ];

  return {
    info: {
      _postman_id: crypto.randomUUID(),
      name: "PulseWard HMS API Suite",
      schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
      description:
        "Comprehensive API suite generated from PulseWard OpenAPI files. Uses variables for base URLs, tenant, auth token, and path parameters.",
    },
    item: folders,
    variable: collectionVariables,
  };
}

function buildEnvironment() {
  const values = [
    ...services.map((service) => ({
      key: service.baseVar,
      value: service.baseDefault,
      enabled: true,
      type: "default",
    })),
    {
      key: "tenantKey",
      value: "citycare-hospital",
      enabled: true,
      type: "default",
    },
    {
      key: "authToken",
      value: "",
      enabled: true,
      type: "secret",
    },
    {
      key: "appointmentId",
      value: "apt-1001",
      enabled: true,
      type: "default",
    },
    {
      key: "patientId",
      value: "pat-1001",
      enabled: true,
      type: "default",
    },
    {
      key: "clinicianId",
      value: "cln-1001",
      enabled: true,
      type: "default",
    },
    {
      key: "prescriptionId",
      value: "rx-1001",
      enabled: true,
      type: "default",
    },
    {
      key: "recordId",
      value: "rec-1001",
      enabled: true,
      type: "default",
    },
    {
      key: "orderId",
      value: "lab-1001",
      enabled: true,
      type: "default",
    },
    {
      key: "anomalyInstanceId",
      value: "anomaly-1001",
      enabled: true,
      type: "default",
    },
  ];

  return {
    id: crypto.randomUUID(),
    name: "PulseWard Local",
    values,
    _postman_variable_scope: "environment",
    _postman_exported_at: new Date().toISOString(),
    _postman_exported_using: "GitHub Copilot GPT-5.3-Codex",
  };
}

fs.mkdirSync(postmanDir, { recursive: true });

const collectionPath = path.join(postmanDir, "PulseWard-HMS.postman_collection.json");
const environmentPath = path.join(postmanDir, "PulseWard-Local.postman_environment.json");

const collection = buildCollection();
const environment = buildEnvironment();

fs.writeFileSync(collectionPath, JSON.stringify(collection, null, 2) + "\n", "utf8");
fs.writeFileSync(environmentPath, JSON.stringify(environment, null, 2) + "\n", "utf8");

const totalRequests = collection.item.reduce((acc, folder) => acc + folder.item.length, 0);
console.log(
  `Generated Postman suite with ${collection.item.length} folders and ${totalRequests} requests.`
);
